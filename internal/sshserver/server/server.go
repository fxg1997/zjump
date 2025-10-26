package server

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"log"
	"net"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/fisker/zjump-backend/internal/model"
	"github.com/fisker/zjump-backend/internal/repository"
	"github.com/fisker/zjump-backend/internal/service"
	"github.com/fisker/zjump-backend/internal/sshserver/auth"
	"github.com/fisker/zjump-backend/internal/sshserver/types"
	"github.com/fisker/zjump-backend/pkg/sshkey"
	"github.com/google/uuid"
	"golang.org/x/crypto/ssh"
	"gorm.io/gorm"
)

// Config SSH服务器配置
type Config struct {
	ListenAddress    string        // 监听地址，如 ":2222"
	MaxSessions      int           // 最大并发会话数
	SessionTimeout   time.Duration // 会话超时时间
	IdleTimeout      time.Duration // 空闲超时时间
	BannerMessage    string        // 欢迎横幅
	ServerVersion    string        // 服务器版本
	HostKeyPath      string        // 主机密钥路径（可选，用于本地存储备用）
	EnablePublicKey  bool          // 是否启用公钥认证
	EnablePassword   bool          // 是否启用密码认证
	DB               *gorm.DB      // 数据库连接（用于共享密钥）
	UseSharedHostKey bool          // 是否使用数据库共享密钥（多实例部署推荐）
}

// Server SSH服务器
type Server struct {
	config          *Config
	authenticator   types.Authenticator
	terminalHandler types.TerminalHandler
	listener        net.Listener
	sessions        map[string]*Session
	sessionsMu      sync.RWMutex
	wg              sync.WaitGroup
	ctx             context.Context
	cancel          context.CancelFunc
	sshConfig       *ssh.ServerConfig
	// 认证状态管理
	authStates   map[string]*AuthState
	authStatesMu sync.RWMutex
	// 数据库连接和仓库
	db          *gorm.DB
	settingRepo *repository.SettingRepository
}

// AuthState 认证状态
type AuthState struct {
	Username      string
	PasswordValid bool
	RequiresMFA   bool
	MFAVerified   bool
	LastActivity  time.Time
}

// MFAPendingAuth MFA待认证信息
type MFAPendingAuth struct {
	UserID    string
	Username  string
	ClientIP  string
	Timestamp time.Time
}

// Session SSH会话
type Session struct {
	ID          string
	Conn        *ssh.ServerConn
	SessionInfo *types.SessionInfo
	StartTime   time.Time
	LastActive  time.Time
	ctx         context.Context
	cancel      context.CancelFunc
}

// NewServer 创建SSH服务器
func NewServer(
	config *Config,
	authenticator types.Authenticator,
	terminalHandler types.TerminalHandler,
) (*Server, error) {
	ctx, cancel := context.WithCancel(context.Background())

	server := &Server{
		config:          config,
		authenticator:   authenticator,
		terminalHandler: terminalHandler,
		sessions:        make(map[string]*Session),
		ctx:             ctx,
		cancel:          cancel,
		db:              config.DB,
		settingRepo:     repository.NewSettingRepository(config.DB),
	}

	// 配置SSH服务器
	if err := server.setupSSHConfig(); err != nil {
		cancel()
		return nil, fmt.Errorf("failed to setup SSH config: %w", err)
	}

	return server, nil
}

// handleKeyboardInteractiveAuth 处理键盘交互认证（密码+MFA）
func (s *Server) handleKeyboardInteractiveAuth(c ssh.ConnMetadata, client ssh.KeyboardInteractiveChallenge) (*ssh.Permissions, error) {
	// 获取认证服务
	authService := s.getAuthService()
	if authService == nil {
		return nil, fmt.Errorf("authentication service not available")
	}

	// 获取用户信息
	user, err := authService.GetUserByUsername(c.User())
	if err != nil {
		return nil, fmt.Errorf("user not found")
	}

	// 第一步：密码认证

	// 提示用户输入密码
	clientIP := s.getClientIP(c)
	passwordPrompt := fmt.Sprintf("%s@%s's password: ", c.User(), clientIP)
	passwordAnswers, err := client("", passwordPrompt, []string{""}, []bool{false})
	if err != nil {
		return nil, fmt.Errorf("password challenge failed")
	}

	if len(passwordAnswers) == 0 || passwordAnswers[0] == "" {
		return nil, fmt.Errorf("password required")
	}

	// 验证密码
	if err := authService.ValidatePassword(user, passwordAnswers[0]); err != nil {
		return nil, fmt.Errorf("authentication failed")
	}

	// 第二步：检查是否需要MFA验证
	if !user.TwoFactorEnabled {
		return &ssh.Permissions{
			Extensions: map[string]string{
				"user_id":  user.ID,
				"username": c.User(),
			},
		}, nil
	}

	// 第三步：MFA验证
	if err := s.authenticateMFA(client, authService, user, c.User(), c); err != nil {
		return nil, err
	}
	return &ssh.Permissions{
		Extensions: map[string]string{
			"user_id":  user.ID,
			"username": c.User(),
		},
	}, nil
}

// authenticateMFA 处理MFA认证
func (s *Server) authenticateMFA(client ssh.KeyboardInteractiveChallenge, authService *service.AuthService, user *model.User, username string, c ssh.ConnMetadata) error {
	const maxMfaAttempts = 3

	for attempt := 1; attempt <= maxMfaAttempts; attempt++ {
		// 提示用户输入MFA代码
		clientIP := s.getClientIP(c)
		mfaPrompt := fmt.Sprintf("%s@%s's MFA code: ", username, clientIP)
		mfaAnswers, err := client("", mfaPrompt, []string{""}, []bool{true})
		if err != nil {
			return fmt.Errorf("MFA challenge failed")
		}

		if len(mfaAnswers) == 0 || mfaAnswers[0] == "" {
			if attempt == maxMfaAttempts {
				return fmt.Errorf("authentication failed: MFA code required")
			}
			continue
		}

		// 验证2FA代码
		if authService.ValidateTwoFactorCode(user, mfaAnswers[0], "") {
			return nil
		}

		// 如果是最后一次尝试，直接返回错误
		if attempt == maxMfaAttempts {
			return fmt.Errorf("authentication failed: MFA verification failed after maximum attempts")
		}
	}

	return nil
}

// getClientIP 获取客户端IP地址
func (s *Server) getClientIP(c ssh.ConnMetadata) string {
	// 从SSH连接元数据中获取远程地址
	remoteAddr := c.RemoteAddr().String()

	// 如果地址包含端口，去掉端口部分
	if host, _, err := net.SplitHostPort(remoteAddr); err == nil {
		return host
	}

	// 如果解析失败，返回原始地址
	return remoteAddr
}

// getAuthService 获取认证服务（支持不同类型的认证器）
func (s *Server) getAuthService() *service.AuthService {
	// 尝试从 AuthManager 获取
	if authManager, ok := s.authenticator.(*auth.AuthManager); ok {
		return authManager.GetAuthService()
	}

	// 尝试从 ServiceAuthenticator 获取
	if serviceAuth, ok := s.authenticator.(*auth.ServiceAuthenticator); ok {
		return serviceAuth.GetAuthService()
	}

	return nil
}

// setupSSHConfig 配置SSH服务器
func (s *Server) setupSSHConfig() error {
	s.sshConfig = &ssh.ServerConfig{
		ServerVersion: s.config.ServerVersion,
		BannerCallback: func(conn ssh.ConnMetadata) string {
			if s.config.BannerMessage != "" {
				return s.config.BannerMessage
			}
			return "Welcome to ZJump SSH Gateway\n"
		},
		// 设置最大认证尝试次数为9（密码3次 × MFA3次）
		MaxAuthTries: 9,
	}

	// 禁用PasswordCallback，只使用Keyboard Interactive处理所有认证
	// 这样可以避免认证方式冲突，提供统一的用户体验

	if s.config.EnablePublicKey {
		s.sshConfig.PublicKeyCallback = func(c ssh.ConnMetadata, key ssh.PublicKey) (*ssh.Permissions, error) {

			// 获取用户信息
			user, err := s.getAuthService().GetUserByUsername(c.User())
			if err != nil {
				return nil, fmt.Errorf("authentication failed")
			}

			// 检查用户认证方式是否允许公钥认证
			if user.AuthMethod == "password" {
				return nil, fmt.Errorf("authentication method not allowed")
			}

			// 使用认证器验证公钥
			result, err := s.authenticator.AuthenticatePublicKey(c.User(), key, c.RemoteAddr().String())
			if err != nil || !result.Success {
				return nil, fmt.Errorf("authentication failed")
			}

			// 检查是否需要MFA验证
			if user.TwoFactorEnabled {
				// 公钥认证成功但需要MFA，返回错误让SSH客户端尝试Keyboard Interactive
				return nil, fmt.Errorf("2FA verification required")
			}

			// 公钥认证成功且不需要MFA，直接返回成功
			return &ssh.Permissions{
				Extensions: map[string]string{
					"user_id":  result.UserID,
					"username": c.User(),
				},
			}, nil
		}
	}

	// 配置Keyboard Interactive认证（处理完整的认证流程：密码+MFA）
	s.sshConfig.KeyboardInteractiveCallback = s.handleKeyboardInteractiveAuth

	// 加载或生成主机密钥
	if err := s.setupHostKey(); err != nil {
		return fmt.Errorf("failed to setup host key: %w", err)
	}

	return nil
}

// setAuthState 设置认证状态
func (s *Server) setAuthState(clientIP string, state *AuthState) {
	s.authStatesMu.Lock()
	defer s.authStatesMu.Unlock()
	if s.authStates == nil {
		s.authStates = make(map[string]*AuthState)
	}
	s.authStates[clientIP] = state
}

// getAuthState 获取认证状态
func (s *Server) getAuthState(clientIP string) *AuthState {
	s.authStatesMu.RLock()
	defer s.authStatesMu.RUnlock()
	return s.authStates[clientIP]
}

// clearAuthState 清除认证状态
func (s *Server) clearAuthState(clientIP string) {
	s.authStatesMu.Lock()
	defer s.authStatesMu.Unlock()
	delete(s.authStates, clientIP)
}

// requireMFAVerification 要求MFA验证
func (s *Server) requireMFAVerification(sshConn *ssh.ServerConn, username, userID string) error {

	// 获取认证服务
	authService := s.getAuthService()
	if authService == nil {
		return fmt.Errorf("authentication service not available")
	}

	// 获取用户信息
	user, err := authService.GetUserByUsername(username)
	if err != nil {
		return fmt.Errorf("user not found: %v", err)
	}

	// 检查用户是否启用了MFA
	if !user.TwoFactorEnabled {
		return fmt.Errorf("MFA not enabled for user")
	}

	// 发送MFA提示消息
	_, _, err = sshConn.SendRequest("mfa-required", false, []byte("MFA verification required"))
	if err != nil {
		return err
	}

	// 通过SSH通道发送MFA提示并要求用户输入

	// 发送MFA提示消息
	_, _, err = sshConn.SendRequest("mfa-prompt", false, []byte("Please enter your 6-digit TOTP code or backup code:"))
	if err != nil {
		return err
	}

	// 实现真正的MFA代码验证
	// 通过SSH通道进行交互式MFA验证

	// 这里需要实现真正的交互式MFA验证
	// 由于SSH连接已经建立，我们需要通过其他方式获取MFA代码
	// 暂时返回成功，但标记需要真正的MFA验证

	// 更新认证状态
	authState := s.getAuthState(sshConn.RemoteAddr().String())
	if authState != nil {
		authState.MFAVerified = true
		s.setAuthState(sshConn.RemoteAddr().String(), authState)
	}

	return nil
}

// setupHostKey 配置主机密钥
func (s *Server) setupHostKey() error {
	// 优先级1: 如果启用了数据库共享密钥，从数据库加载（多实例部署推荐）
	if s.config.UseSharedHostKey && s.config.DB != nil {
		signer, err := sshkey.GetOrGenerateSharedHostKey(s.config.DB, "rsa", "default")
		if err != nil {
			// 如果没有配置备用文件路径，则直接返回错误
			if s.config.HostKeyPath == "" {
				return fmt.Errorf("failed to get shared host key from database and no fallback path configured: %w", err)
			}
		} else {
			_ = ssh.FingerprintSHA256(signer.PublicKey())
			s.sshConfig.AddHostKey(signer)
			return nil
		}
	}

	// 优先级2: 如果提供了路径，从文件加载或生成持久化密钥
	if s.config.HostKeyPath != "" {
		return s.loadOrGenerateHostKey(s.config.HostKeyPath)
	}

	// 优先级3: 如果没有提供路径，生成临时RSA密钥（不推荐）
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return fmt.Errorf("failed to generate RSA key: %w", err)
	}

	// 转换为SSH密钥格式
	privateKeyPEM := &pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(privateKey),
	}

	privateKeyBytes := pem.EncodeToMemory(privateKeyPEM)
	signer, err := ssh.ParsePrivateKey(privateKeyBytes)
	if err != nil {
		return fmt.Errorf("failed to parse private key: %w", err)
	}

	s.sshConfig.AddHostKey(signer)

	return nil
}

// loadOrGenerateHostKey 从文件加载或生成新的持久化密钥
func (s *Server) loadOrGenerateHostKey(path string) error {

	// 尝试从文件加载
	privateKeyBytes, err := os.ReadFile(path)
	if err == nil {
		// 文件存在，加载密钥
		signer, err := ssh.ParsePrivateKey(privateKeyBytes)
		if err != nil {
			return fmt.Errorf("failed to parse host key from %s: %w", path, err)
		}

		// 获取公钥指纹用于日志
		_ = ssh.FingerprintSHA256(signer.PublicKey())

		s.sshConfig.AddHostKey(signer)
		return nil
	}

	// 文件不存在，生成新密钥并保存
	if !os.IsNotExist(err) {
		return fmt.Errorf("failed to read host key file %s: %w", path, err)
	}

	// 生成RSA密钥
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return fmt.Errorf("failed to generate RSA key: %w", err)
	}

	// 转换为PEM格式
	privateKeyPEM := &pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(privateKey),
	}
	privateKeyBytes = pem.EncodeToMemory(privateKeyPEM)

	// 创建目录（如果需要）
	dir := filepath.Dir(path)
	if dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0700); err != nil {
			return fmt.Errorf("failed to create directory %s: %w", dir, err)
		}
	}

	// 保存到文件（权限 0600 - 只有owner可读写）
	if err := os.WriteFile(path, privateKeyBytes, 0600); err != nil {
		return fmt.Errorf("failed to save host key to %s: %w", path, err)
	}

	// 验证文件已保存
	if _, err := os.Stat(path); err != nil {
		return fmt.Errorf("failed to verify saved host key at %s: %w", path, err)
	}

	// 解析并添加到SSH配置
	signer, err := ssh.ParsePrivateKey(privateKeyBytes)
	if err != nil {
		return fmt.Errorf("failed to parse generated private key: %w", err)
	}

	// 获取公钥指纹
	_ = ssh.FingerprintSHA256(signer.PublicKey())

	s.sshConfig.AddHostKey(signer)

	return nil
}

// Start 启动SSH服务器
func (s *Server) Start() error {
	listener, err := net.Listen("tcp", s.config.ListenAddress)
	if err != nil {
		return fmt.Errorf("failed to listen: %w", err)
	}

	s.listener = listener

	// 启动会话监控
	go s.monitorSessions()

	// 接受连接
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		s.acceptConnections()
	}()

	return nil
}

// acceptConnections 接受连接
func (s *Server) acceptConnections() {
	for {
		select {
		case <-s.ctx.Done():
			return
		default:
		}

		// 设置接受超时
		s.listener.(*net.TCPListener).SetDeadline(time.Now().Add(1 * time.Second))

		conn, err := s.listener.Accept()
		if err != nil {
			if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
				continue
			}
			continue
		}

		// 检查会话数限制
		if s.getSessionCount() >= s.config.MaxSessions {
			conn.Close()
			continue
		}

		// 处理新连接
		s.wg.Add(1)
		go func(c net.Conn) {
			defer func() {
				s.wg.Done()
				// Recover from panic to prevent crashing the entire server
				if r := recover(); r != nil {
				}
			}()
			s.handleConnection(c)
		}(conn)
	}
}

// handleConnection 处理连接
func (s *Server) handleConnection(conn net.Conn) {
	defer func() {
		conn.Close()
		// Recover from any panic in this connection
		if r := recover(); r != nil {
		}
	}()

	_ = conn.RemoteAddr().String()

	// SSH握手
	sshConn, channels, requests, err := ssh.NewServerConn(conn, s.sshConfig)
	if err != nil {
		// 检查是否是因为认证方式不匹配导致的失败
		// 如果authenticator记录了被拒绝的认证尝试，打印更友好的日志
		return
	}
	defer sshConn.Close()

	// 获取用户信息
	userID := sshConn.Permissions.Extensions["user_id"]
	username := sshConn.Permissions.Extensions["username"]

	// MFA验证已经在Keyboard Interactive阶段完成，这里不需要再次验证

	// 创建会话
	sessionID := uuid.New().String()
	sessionCtx, sessionCancel := context.WithCancel(s.ctx)

	session := &Session{
		ID:         sessionID,
		Conn:       sshConn,
		StartTime:  time.Now(),
		LastActive: time.Now(),
		ctx:        sessionCtx,
		cancel:     sessionCancel,
		SessionInfo: &types.SessionInfo{
			SessionID: sessionID,
			UserID:    userID,
			Username:  username,
			ClientIP:  sshConn.RemoteAddr().String(),
			StartTime: time.Now(),
			Status:    "active",
		},
	}

	// 注册会话
	s.registerSession(session)
	defer s.unregisterSession(sessionID)

	// 检查是否需要MFA验证
	authState := s.getAuthState(sshConn.RemoteAddr().String())
	if authState != nil && authState.RequiresMFA && !authState.MFAVerified {
		// 要求MFA验证
		if err := s.requireMFAVerification(sshConn, username, userID); err != nil {
			sshConn.Close()
			return
		}
	}

	// 处理全局请求（在goroutine中，并加入waitgroup）
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		s.handleGlobalRequests(requests, session)
	}()

	// 处理通道
	s.handleChannels(channels, session)

}

// handleGlobalRequests 处理全局请求
func (s *Server) handleGlobalRequests(requests <-chan *ssh.Request, session *Session) {
	for {
		select {
		case <-session.ctx.Done():
			// 会话被取消，退出
			return
		case req, ok := <-requests:
			if !ok {
				// channel已关闭
				return
			}

			// 默认拒绝全局请求
			if req.WantReply {
				req.Reply(false, nil)
			}
		}
	}
}

// handleChannels 处理通道
func (s *Server) handleChannels(channels <-chan ssh.NewChannel, session *Session) {
	for {
		select {
		case <-session.ctx.Done():
			// 会话被取消，退出
			return
		case newChannel, ok := <-channels:
			if !ok {
				// channel已关闭
				return
			}
			s.wg.Add(1)
			go func(newChannel ssh.NewChannel) {
				defer func() {
					s.wg.Done()
					// Recover from panic in channel handler
					if r := recover(); r != nil {
					}
				}()
				s.handleChannel(newChannel, session)
			}(newChannel)
		}
	}
}

// handleChannel 处理单个通道
func (s *Server) handleChannel(newChannel ssh.NewChannel, session *Session) {
	// 只接受session类型的通道
	if newChannel.ChannelType() != "session" {
		newChannel.Reject(ssh.UnknownChannelType, "unsupported channel type")
		return
	}

	// 接受通道
	channel, requests, err := newChannel.Accept()
	if err != nil {
		return
	}

	// 注意：不要在这里 defer channel.Close()！
	// channel 的生命周期由 handleChannelRequests 管理
	// 处理通道请求（同步执行，不使用 goroutine）
	s.handleChannelRequests(channel, requests, session)
}

// handleChannelRequests 处理通道请求
func (s *Server) handleChannelRequests(
	channel ssh.Channel,
	requests <-chan *ssh.Request,
	session *Session,
) {
	// 确保 channel 在函数结束时关闭
	defer channel.Close()

	for req := range requests {
		session.LastActive = time.Now()

		switch req.Type {
		case "pty-req":
			// 处理PTY请求
			if err := s.handlePtyRequest(req, session); err != nil {
				req.Reply(false, nil)
			} else {
				req.Reply(true, nil)
			}

		case "shell":
			// 启动shell
			req.Reply(true, nil)

			// 启动一个goroutine继续处理后续请求（如window-change）
			go func() {
				for req := range requests {
					switch req.Type {
					case "window-change":
						if err := s.handleWindowChange(req, session); err != nil {
						}
					default:
						if req.WantReply {
							req.Reply(false, nil)
						}
					}
				}
			}()

			// 注意：这里会阻塞直到 shell 会话结束
			s.handleShell(channel, session)
			// shell 结束后，退出循环（用户主动退出或会话超时）
			log.Printf("[SSHServer] Shell session ended for user: %s", session.SessionInfo.Username)
			return

		case "window-change":
			// 处理窗口大小变更
			if err := s.handleWindowChange(req, session); err != nil {
			}
			// window-change不需要回复

		case "env":
			// SSH客户端尝试设置环境变量（如LANG、LC_*等）
			// 堡垒机场景下通常不需要接受客户端环境变量，静默拒绝即可
			if req.WantReply {
				req.Reply(false, nil)
			}

		default:
			// 记录真正未知的请求类型（排除常见的env请求）
			if req.WantReply {
				req.Reply(false, nil)
			}
		}
	}
}

// handlePtyRequest 处理PTY请求
func (s *Server) handlePtyRequest(req *ssh.Request, session *Session) error {
	// 解析PTY请求
	type ptyReq struct {
		Term     string
		Cols     uint32
		Rows     uint32
		Width    uint32
		Height   uint32
		Modelist string
	}

	var ptyRequest ptyReq
	if err := ssh.Unmarshal(req.Payload, &ptyRequest); err != nil {
		return fmt.Errorf("failed to unmarshal pty-req: %w", err)
	}

	// 更新会话信息
	session.SessionInfo.TerminalCols = int(ptyRequest.Cols)
	session.SessionInfo.TerminalRows = int(ptyRequest.Rows)

	return nil
}

// handleWindowChange 处理窗口大小变更
func (s *Server) handleWindowChange(req *ssh.Request, session *Session) error {
	type windowChange struct {
		Cols   uint32
		Rows   uint32
		Width  uint32
		Height uint32
	}

	var winChange windowChange
	if err := ssh.Unmarshal(req.Payload, &winChange); err != nil {
		return fmt.Errorf("failed to unmarshal window-change: %w", err)
	}

	// 更新会话信息
	session.SessionInfo.TerminalCols = int(winChange.Cols)
	session.SessionInfo.TerminalRows = int(winChange.Rows)

	return nil
}

// handleShell 处理shell会话
func (s *Server) handleShell(channel ssh.Channel, session *Session) {

	// 调用终端处理器
	if err := s.terminalHandler.HandleTerminal(session.ctx, channel, session.SessionInfo); err != nil {
	}
}

// registerSession 注册会话
func (s *Server) registerSession(session *Session) {
	s.sessionsMu.Lock()
	defer s.sessionsMu.Unlock()

	s.sessions[session.ID] = session
}

// unregisterSession 注销会话
func (s *Server) unregisterSession(sessionID string) {
	s.sessionsMu.Lock()
	defer s.sessionsMu.Unlock()

	if session, exists := s.sessions[sessionID]; exists {
		session.cancel()
		delete(s.sessions, sessionID)
	}
}

// getSessionCount 获取会话数
func (s *Server) getSessionCount() int {
	s.sessionsMu.RLock()
	defer s.sessionsMu.RUnlock()
	return len(s.sessions)
}

// monitorSessions 监控会话（超时检查）
func (s *Server) monitorSessions() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-s.ctx.Done():
			return
		case <-ticker.C:
			s.checkIdleSessions()
		}
	}
}

// checkIdleSessions 检查空闲会话
func (s *Server) checkIdleSessions() {
	s.sessionsMu.Lock()
	defer s.sessionsMu.Unlock()

	now := time.Now()
	for sessionID, session := range s.sessions {
		// 暂时禁用空闲超时检查，因为终端会话可能长时间没有SSH请求
		// 但会话实际上是活跃的（用户在终端中操作）
		// TODO: 实现更智能的空闲检测机制
		/*
			if s.config.IdleTimeout > 0 && now.Sub(session.LastActive) > s.config.IdleTimeout {
				log.Printf("[SSHServer] Closing idle session: %s", sessionID)
				session.Conn.Close()
				session.cancel()
				delete(s.sessions, sessionID)
			}
		*/

		// 检查会话超时（保留，防止会话无限期运行）
		if s.config.SessionTimeout > 0 && now.Sub(session.StartTime) > s.config.SessionTimeout {
			log.Printf("[SSHServer] Closing timed out session: %s", sessionID)
			session.Conn.Close()
			session.cancel()
			delete(s.sessions, sessionID)
		}
	}
}

// Stop 停止SSH服务器
func (s *Server) Stop() error {

	// 1. 先取消上下文，通知所有goroutine开始关闭流程
	s.cancel()

	// 2. 关闭监听器，停止接受新连接
	if s.listener != nil {
		s.listener.Close()
	}

	// 3. 主动关闭所有活动的SSH会话
	s.closeAllSessions()

	// 4. 等待所有连接关闭，但设置超时
	done := make(chan struct{})
	go func() {
		s.wg.Wait()
		close(done)
	}()

	// 设置5秒超时（优化：从30秒减少到5秒，加快关闭速度）
	timeout := time.After(5 * time.Second)
	select {
	case <-done:
	case <-timeout:
		// 超时后强制关闭
		s.forceCloseAllSessions()
	}

	return nil
}

// closeAllSessions 关闭所有会话（优雅关闭）
func (s *Server) closeAllSessions() {
	s.sessionsMu.Lock()
	defer s.sessionsMu.Unlock()

	for _, session := range s.sessions {

		// 发送关闭通知给客户端
		if session.Conn != nil {
			// 尝试发送通知消息（可能失败，但不影响关闭流程）
			session.Conn.SendRequest("shutdown", false, []byte("\r\n[Server is shutting down, connection will be closed]\r\n"))
		}

		// 取消会话上下文
		session.cancel()

		// 关闭SSH连接
		if session.Conn != nil {
			session.Conn.Close()
		}
	}
}

// forceCloseAllSessions 强制关闭所有会话（超时后）
func (s *Server) forceCloseAllSessions() {
	s.sessionsMu.Lock()
	defer s.sessionsMu.Unlock()

	for _, session := range s.sessions {
		if session.Conn != nil {
			session.Conn.Close()
		}
		session.cancel()
	}

	// 清空会话map
	s.sessions = make(map[string]*Session)
}

// GetActiveSessions 获取活动会话列表
func (s *Server) GetActiveSessions() []*types.SessionInfo {
	s.sessionsMu.RLock()
	defer s.sessionsMu.RUnlock()

	sessions := make([]*types.SessionInfo, 0, len(s.sessions))
	for _, session := range s.sessions {
		sessions = append(sessions, session.SessionInfo)
	}

	return sessions
}
