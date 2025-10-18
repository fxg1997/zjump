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
	}

	// 配置SSH服务器
	if err := server.setupSSHConfig(); err != nil {
		cancel()
		return nil, fmt.Errorf("failed to setup SSH config: %w", err)
	}

	return server, nil
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
		// 设置最大认证尝试次数
		MaxAuthTries: 3,
	}

	// 配置认证方式
	if s.config.EnablePassword {
		s.sshConfig.PasswordCallback = func(c ssh.ConnMetadata, pass []byte) (*ssh.Permissions, error) {
			log.Printf("[SSH Server] PasswordCallback invoked for user: %s", c.User())

			result, err := s.authenticator.AuthenticatePassword(c.User(), string(pass), c.RemoteAddr().String())
			if err != nil || !result.Success {
				log.Printf("[SSH Server] Password authentication failed: %v", err)
				return nil, fmt.Errorf("authentication failed")
			}
			log.Printf("[SSH Server] Password authentication successful for: %s", c.User())
			return &ssh.Permissions{
				Extensions: map[string]string{
					"user_id":  result.UserID,
					"username": c.User(),
				},
			}, nil
		}
		log.Println("[SSH Server] Password authentication enabled")
	}

	if s.config.EnablePublicKey {
		s.sshConfig.PublicKeyCallback = func(c ssh.ConnMetadata, key ssh.PublicKey) (*ssh.Permissions, error) {
			log.Printf("[SSH Server] PublicKeyCallback invoked for user: %s", c.User())
			result, err := s.authenticator.AuthenticatePublicKey(c.User(), key, c.RemoteAddr().String())
			if err != nil || !result.Success {
				log.Printf("[SSH Server] Public key authentication failed: %v", err)
				return nil, fmt.Errorf("authentication failed")
			}
			log.Printf("[SSH Server] Public key authentication successful for: %s", c.User())
			return &ssh.Permissions{
				Extensions: map[string]string{
					"user_id":  result.UserID,
					"username": c.User(),
				},
			}, nil
		}
		log.Println("[SSH Server] Public key authentication enabled")
	}

	// 加载或生成主机密钥
	if err := s.setupHostKey(); err != nil {
		return fmt.Errorf("failed to setup host key: %w", err)
	}

	return nil
}

// setupHostKey 配置主机密钥
func (s *Server) setupHostKey() error {
	// 优先级1: 如果启用了数据库共享密钥，从数据库加载（多实例部署推荐）
	if s.config.UseSharedHostKey && s.config.DB != nil {
		log.Println("[SSH Server] 🔑 Using shared host key from database (multi-instance mode)...")
		signer, err := sshkey.GetOrGenerateSharedHostKey(s.config.DB, "rsa", "default")
		if err != nil {
			// 如果没有配置备用文件路径，则直接返回错误
			if s.config.HostKeyPath == "" {
				return fmt.Errorf("failed to get shared host key from database and no fallback path configured: %w", err)
			}
			log.Printf("[SSH Server]   Failed to get shared host key from database: %v", err)
			log.Printf("[SSH Server] Falling back to local file key...")
		} else {
			fingerprint := ssh.FingerprintSHA256(signer.PublicKey())
			s.sshConfig.AddHostKey(signer)
			log.Printf("[SSH Server]  Loaded shared host key from database")
			log.Printf("[SSH Server]  Key fingerprint: %s", fingerprint)
			log.Printf("[SSH Server]  All instances share the same key - clients only trust once")
			return nil
		}
	}

	// 优先级2: 如果提供了路径，从文件加载或生成持久化密钥
	if s.config.HostKeyPath != "" {
		return s.loadOrGenerateHostKey(s.config.HostKeyPath)
	}

	// 优先级3: 如果没有提供路径，生成临时RSA密钥（不推荐）
	log.Println("[SSH Server]   Generating temporary RSA host key (not persistent)...")
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
	log.Println("[SSH Server]   Temporary host key configured (will change on restart)")

	return nil
}

// loadOrGenerateHostKey 从文件加载或生成新的持久化密钥
func (s *Server) loadOrGenerateHostKey(path string) error {
	log.Printf("[SSH Server] 🔑 Host key path: %s", path)

	// 尝试从文件加载
	privateKeyBytes, err := os.ReadFile(path)
	if err == nil {
		// 文件存在，加载密钥
		signer, err := ssh.ParsePrivateKey(privateKeyBytes)
		if err != nil {
			return fmt.Errorf("failed to parse host key from %s: %w", path, err)
		}

		// 获取公钥指纹用于日志
		fingerprint := ssh.FingerprintSHA256(signer.PublicKey())

		s.sshConfig.AddHostKey(signer)
		log.Printf("[SSH Server]  Loaded persistent host key from: %s", path)
		log.Printf("[SSH Server]  Key fingerprint: %s", fingerprint)
		log.Printf("[SSH Server]  This key will persist across restarts - clients only need to trust once")
		return nil
	}

	// 文件不存在，生成新密钥并保存
	if !os.IsNotExist(err) {
		return fmt.Errorf("failed to read host key file %s: %w", path, err)
	}

	log.Printf("[SSH Server]   Host key file not found, generating new key...")

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
		log.Printf("[SSH Server] Creating directory: %s", dir)
		if err := os.MkdirAll(dir, 0700); err != nil {
			return fmt.Errorf("failed to create directory %s: %w", dir, err)
		}
	}

	// 保存到文件（权限 0600 - 只有owner可读写）
	log.Printf("[SSH Server] Saving host key to: %s (permissions: 0600)", path)
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
	fingerprint := ssh.FingerprintSHA256(signer.PublicKey())

	s.sshConfig.AddHostKey(signer)
	log.Printf("[SSH Server]  Generated and saved persistent host key to: %s", path)
	log.Printf("[SSH Server]  Key fingerprint: %s", fingerprint)
	log.Printf("[SSH Server]  This key is now persistent - future restarts will use the same key")
	log.Printf("[SSH Server]  Clients will only need to trust this fingerprint once")

	return nil
}

// Start 启动SSH服务器
func (s *Server) Start() error {
	listener, err := net.Listen("tcp", s.config.ListenAddress)
	if err != nil {
		return fmt.Errorf("failed to listen: %w", err)
	}

	s.listener = listener
	log.Printf("[SSH Server] Listening on %s", s.config.ListenAddress)

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
			log.Printf("[SSH Server] Error accepting connection: %v", err)
			continue
		}

		// 检查会话数限制
		if s.getSessionCount() >= s.config.MaxSessions {
			log.Printf("[SSH Server] Max sessions reached, rejecting connection from %s", conn.RemoteAddr())
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
					log.Printf("[SSH Server] Panic recovered in connection handler: %v", r)
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
			log.Printf("[SSH Server] Panic in handleConnection: %v", r)
		}
	}()

	clientAddr := conn.RemoteAddr().String()
	log.Printf("[SSH Server] New connection from %s", clientAddr)
	log.Printf("[SSH Server] Global auth callbacks enabled - Password: %v, PublicKey: %v",
		s.sshConfig.PasswordCallback != nil, s.sshConfig.PublicKeyCallback != nil)
	log.Printf("[SSH Server]  Actual auth method will be determined by user's configuration (auth_method)")

	// SSH握手
	sshConn, channels, requests, err := ssh.NewServerConn(conn, s.sshConfig)
	if err != nil {
		// 检查是否是因为认证方式不匹配导致的失败
		// 如果authenticator记录了被拒绝的认证尝试，打印更友好的日志
		log.Printf("[SSH Server] Failed to establish SSH connection from %s: %v", clientAddr, err)
		return
	}
	defer sshConn.Close()

	// 获取用户信息
	userID := sshConn.Permissions.Extensions["user_id"]
	username := sshConn.Permissions.Extensions["username"]

	log.Printf("[SSH Server] User authenticated: %s (ID: %s) from %s",
		username, userID, sshConn.RemoteAddr())

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

	// 处理全局请求（在goroutine中，并加入waitgroup）
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		s.handleGlobalRequests(requests, session)
	}()

	// 处理通道
	s.handleChannels(channels, session)

	log.Printf("[SSH Server] Connection closed for user %s (session: %s)", username, sessionID)
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
			log.Printf("[SSH Server] Global request: %s (want reply: %v)", req.Type, req.WantReply)

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
						log.Printf("[SSH Server] Panic in handleChannel: %v", r)
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
		log.Printf("[SSH Server] Rejecting channel type: %s", newChannel.ChannelType())
		newChannel.Reject(ssh.UnknownChannelType, "unsupported channel type")
		return
	}

	// 接受通道
	channel, requests, err := newChannel.Accept()
	if err != nil {
		log.Printf("[SSH Server] Failed to accept channel: %v", err)
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
				log.Printf("[SSH Server] Failed to handle pty-req: %v", err)
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
							log.Printf("[SSH Server] Failed to handle window-change: %v", err)
						}
					default:
						log.Printf("[SSH Server] Ignoring request type during shell: %s", req.Type)
						if req.WantReply {
							req.Reply(false, nil)
						}
					}
				}
			}()

			// 注意：这里会阻塞直到 shell 会话结束
			s.handleShell(channel, session)
			// shell 结束后，退出循环
			return

		case "window-change":
			// 处理窗口大小变更
			if err := s.handleWindowChange(req, session); err != nil {
				log.Printf("[SSH Server] Failed to handle window-change: %v", err)
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
			log.Printf("[SSH Server] Unknown request type: %s", req.Type)
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

	log.Printf("[SSH Server] PTY request: term=%s, cols=%d, rows=%d",
		ptyRequest.Term, ptyRequest.Cols, ptyRequest.Rows)

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

	log.Printf("[SSH Server] Window change: cols=%d, rows=%d", winChange.Cols, winChange.Rows)

	// 更新会话信息
	session.SessionInfo.TerminalCols = int(winChange.Cols)
	session.SessionInfo.TerminalRows = int(winChange.Rows)

	return nil
}

// handleShell 处理shell会话
func (s *Server) handleShell(channel ssh.Channel, session *Session) {
	log.Printf("[SSH Server] Starting shell for session: %s", session.ID)

	// 调用终端处理器
	if err := s.terminalHandler.HandleTerminal(session.ctx, channel, session.SessionInfo); err != nil {
		log.Printf("[SSH Server] Terminal handler error: %v", err)
	}
}

// registerSession 注册会话
func (s *Server) registerSession(session *Session) {
	s.sessionsMu.Lock()
	defer s.sessionsMu.Unlock()

	s.sessions[session.ID] = session
	log.Printf("[SSH Server] Session registered: %s (total: %d)", session.ID, len(s.sessions))
}

// unregisterSession 注销会话
func (s *Server) unregisterSession(sessionID string) {
	s.sessionsMu.Lock()
	defer s.sessionsMu.Unlock()

	if session, exists := s.sessions[sessionID]; exists {
		session.cancel()
		delete(s.sessions, sessionID)
		log.Printf("[SSH Server] Session unregistered: %s (total: %d)", sessionID, len(s.sessions))
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
		// 检查空闲超时
		if s.config.IdleTimeout > 0 && now.Sub(session.LastActive) > s.config.IdleTimeout {
			log.Printf("[SSH Server] Session %s idle timeout, closing", sessionID)
			session.Conn.Close()
			session.cancel()
			delete(s.sessions, sessionID)
		}

		// 检查会话超时
		if s.config.SessionTimeout > 0 && now.Sub(session.StartTime) > s.config.SessionTimeout {
			log.Printf("[SSH Server] Session %s timeout, closing", sessionID)
			session.Conn.Close()
			session.cancel()
			delete(s.sessions, sessionID)
		}
	}
}

// Stop 停止SSH服务器
func (s *Server) Stop() error {
	log.Println("[SSH Server] Stopping...")

	// 1. 先取消上下文，通知所有goroutine开始关闭流程
	s.cancel()

	// 2. 关闭监听器，停止接受新连接
	if s.listener != nil {
		log.Println("[SSH Server] Closing listener...")
		s.listener.Close()
	}

	// 3. 主动关闭所有活动的SSH会话
	log.Printf("[SSH Server] Closing %d active sessions...", s.getSessionCount())
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
		log.Println("[SSH Server] All sessions closed gracefully")
	case <-timeout:
		log.Println("[SSH Server]   Timeout waiting for sessions to close, forcing shutdown")
		// 超时后强制关闭
		s.forceCloseAllSessions()
	}

	log.Println("[SSH Server] Stopped")
	return nil
}

// closeAllSessions 关闭所有会话（优雅关闭）
func (s *Server) closeAllSessions() {
	s.sessionsMu.Lock()
	defer s.sessionsMu.Unlock()

	for sessionID, session := range s.sessions {
		log.Printf("[SSH Server] Closing session: %s (user: %s)", sessionID, session.SessionInfo.Username)

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

	for sessionID, session := range s.sessions {
		log.Printf("[SSH Server] Force closing session: %s", sessionID)
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
