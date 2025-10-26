package protocol

import (
	"bufio"
	"bytes"
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/binary"
	"fmt"
	"io"
	"net"
	"strings"
	"sync"
	"time"

	"github.com/fisker/zjump-backend/internal/repository"
	"github.com/fisker/zjump-backend/internal/service"
	"github.com/fisker/zjump-backend/internal/sshserver/auth"
	"github.com/fisker/zjump-backend/internal/sshserver/types"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// CustomSSHServer 自定义SSH服务器
type CustomSSHServer struct {
	config          *Config
	authenticator   types.Authenticator
	terminalHandler types.TerminalHandler
	listener        net.Listener
	sessions        map[string]*Session
	sessionsMu      sync.RWMutex
	wg              sync.WaitGroup
	ctx             context.Context
	cancel          context.CancelFunc
	db              *gorm.DB
	settingRepo     *repository.SettingRepository
	hostKey         *rsa.PrivateKey
}

// Config 自定义SSH服务器配置
type Config struct {
	ListenAddress    string        // 监听地址，如 ":2222"
	MaxSessions      int           // 最大并发会话数
	SessionTimeout   time.Duration // 会话超时时间
	IdleTimeout      time.Duration // 空闲超时时间
	BannerMessage    string        // 欢迎横幅
	ServerVersion    string        // 服务器版本
	HostKeyPath      string        // 主机密钥路径
	EnablePublicKey  bool          // 是否启用公钥认证
	EnablePassword   bool          // 是否启用密码认证
	DB               *gorm.DB      // 数据库连接
	UseSharedHostKey bool          // 是否使用数据库共享密钥
	CustomDomain     string        // 自定义域名，用于登录提示
}

// Session 自定义SSH会话
type Session struct {
	ID          string
	Conn        net.Conn
	SessionInfo *types.SessionInfo
	StartTime   time.Time
	LastActive  time.Time
	ctx         context.Context
	cancel      context.CancelFunc
	// 协议状态
	versionNegotiated bool
	authenticated     bool
	username          string
	userID            string
	// 加密状态
	encrypted         bool
	clientToServerKey []byte
	serverToClientKey []byte
	// 通道管理
	channels   map[uint32]*Channel
	channelsMu sync.RWMutex
}

// Channel SSH通道
type Channel struct {
	ID           uint32
	Type         string
	WindowSize   uint32
	PacketSize   uint32
	LocalWindow  uint32
	RemoteWindow uint32
	Data         chan []byte
	CloseChan    chan bool
	Closed       bool
}

// SSH协议常量
const (
	SSH_MSG_DISCONNECT                = 1
	SSH_MSG_IGNORE                    = 2
	SSH_MSG_UNIMPLEMENTED             = 3
	SSH_MSG_DEBUG                     = 4
	SSH_MSG_SERVICE_REQUEST           = 5
	SSH_MSG_SERVICE_ACCEPT            = 6
	SSH_MSG_KEXINIT                   = 20
	SSH_MSG_NEWKEYS                   = 21
	SSH_MSG_USERAUTH_REQUEST          = 50
	SSH_MSG_USERAUTH_FAILURE          = 51
	SSH_MSG_USERAUTH_SUCCESS          = 52
	SSH_MSG_USERAUTH_BANNER           = 53
	SSH_MSG_USERAUTH_INFO_REQUEST     = 60
	SSH_MSG_USERAUTH_INFO_RESPONSE    = 61
	SSH_MSG_GLOBAL_REQUEST            = 80
	SSH_MSG_REQUEST_SUCCESS           = 81
	SSH_MSG_REQUEST_FAILURE           = 82
	SSH_MSG_CHANNEL_OPEN              = 90
	SSH_MSG_CHANNEL_OPEN_CONFIRMATION = 91
	SSH_MSG_CHANNEL_OPEN_FAILURE      = 92
	SSH_MSG_CHANNEL_WINDOW_ADJUST     = 93
	SSH_MSG_CHANNEL_DATA              = 94
	SSH_MSG_CHANNEL_EXTENDED_DATA     = 95
	SSH_MSG_CHANNEL_EOF               = 96
	SSH_MSG_CHANNEL_CLOSE             = 97
	SSH_MSG_CHANNEL_REQUEST           = 98
	SSH_MSG_CHANNEL_SUCCESS           = 99
	SSH_MSG_CHANNEL_FAILURE           = 100
)

// NewCustomSSHServer 创建自定义SSH服务器
func NewCustomSSHServer(
	config *Config,
	authenticator types.Authenticator,
	terminalHandler types.TerminalHandler,
) (*CustomSSHServer, error) {
	ctx, cancel := context.WithCancel(context.Background())

	server := &CustomSSHServer{
		config:          config,
		authenticator:   authenticator,
		terminalHandler: terminalHandler,
		sessions:        make(map[string]*Session),
		ctx:             ctx,
		cancel:          cancel,
		db:              config.DB,
		settingRepo:     repository.NewSettingRepository(config.DB),
	}

	// 生成或加载主机密钥
	if err := server.setupHostKey(); err != nil {
		cancel()
		return nil, fmt.Errorf("failed to setup host key: %w", err)
	}

	return server, nil
}

// setupHostKey 设置主机密钥
func (s *CustomSSHServer) setupHostKey() error {
	// 生成RSA密钥
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return fmt.Errorf("failed to generate RSA key: %w", err)
	}
	s.hostKey = privateKey
	return nil
}

// Start 启动自定义SSH服务器
func (s *CustomSSHServer) Start() error {
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
func (s *CustomSSHServer) acceptConnections() {
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
				if r := recover(); r != nil {
					// 记录panic但不崩溃服务器
				}
			}()
			s.handleConnection(c)
		}(conn)
	}
}

// handleConnection 处理连接
func (s *CustomSSHServer) handleConnection(conn net.Conn) {
	defer conn.Close()

	// 创建会话
	sessionID := uuid.New().String()
	sessionCtx, sessionCancel := context.WithCancel(s.ctx)

	session := &Session{
		ID:         sessionID,
		Conn:       conn,
		StartTime:  time.Now(),
		LastActive: time.Now(),
		ctx:        sessionCtx,
		cancel:     sessionCancel,
		channels:   make(map[uint32]*Channel),
		SessionInfo: &types.SessionInfo{
			SessionID: sessionID,
			ClientIP:  conn.RemoteAddr().String(),
			StartTime: time.Now(),
			Status:    "connecting",
		},
	}

	// 注册会话
	s.registerSession(session)
	defer s.unregisterSession(sessionID)

	// 处理SSH协议握手
	if err := s.handleSSHHandshake(session); err != nil {
		return
	}

	// 处理SSH消息循环
	s.handleSSHMessages(session)
}

// handleSSHHandshake 处理SSH握手
func (s *CustomSSHServer) handleSSHHandshake(session *Session) error {
	// 1. 版本协商
	if err := s.handleVersionNegotiation(session); err != nil {
		return err
	}

	// 2. 密钥交换（简化版）
	if err := s.handleKeyExchange(session); err != nil {
		return err
	}

	// 3. 认证
	if err := s.handleAuthentication(session); err != nil {
		return err
	}

	return nil
}

// handleVersionNegotiation 处理版本协商
func (s *CustomSSHServer) handleVersionNegotiation(session *Session) error {
	// 发送SSH版本字符串
	versionString := fmt.Sprintf("SSH-2.0-%s\r\n", s.config.ServerVersion)
	if _, err := session.Conn.Write([]byte(versionString)); err != nil {
		return fmt.Errorf("failed to send version: %w", err)
	}

	// 读取客户端版本
	reader := bufio.NewReader(session.Conn)
	clientVersion, err := reader.ReadString('\n')
	if err != nil {
		return fmt.Errorf("failed to read client version: %w", err)
	}

	// 解析客户端版本
	clientVersion = strings.TrimSpace(clientVersion)
	if !strings.HasPrefix(clientVersion, "SSH-2.0") {
		return fmt.Errorf("unsupported SSH version: %s", clientVersion)
	}

	session.versionNegotiated = true
	return nil
}

// handleKeyExchange 处理密钥交换（简化版）
func (s *CustomSSHServer) handleKeyExchange(session *Session) error {
	// 这里实现简化的密钥交换
	// 在实际生产环境中，应该实现完整的SSH密钥交换协议

	// 生成会话密钥（简化版）
	sessionKey := make([]byte, 32)
	if _, err := rand.Read(sessionKey); err != nil {
		return fmt.Errorf("failed to generate session key: %w", err)
	}

	// 设置加密密钥
	session.clientToServerKey = sessionKey
	session.serverToClientKey = sessionKey
	session.encrypted = true

	return nil
}

// handleAuthentication 处理认证
func (s *CustomSSHServer) handleAuthentication(session *Session) error {
	// 发送认证横幅
	if s.config.BannerMessage != "" {
		banner := s.config.BannerMessage
		if !strings.HasSuffix(banner, "\n") {
			banner += "\n"
		}
		if err := s.sendUserAuthBanner(session, banner); err != nil {
			return err
		}
	}

	// 处理认证请求
	for {
		select {
		case <-session.ctx.Done():
			return fmt.Errorf("session cancelled")
		default:
		}

		// 读取认证请求
		msg, err := s.readSSHMessage(session)
		if err != nil {
			return fmt.Errorf("failed to read auth message: %w", err)
		}

		if msg.Type == SSH_MSG_USERAUTH_REQUEST {
			if err := s.handleUserAuthRequest(session, msg); err != nil {
				// 发送认证失败消息
				s.sendUserAuthFailure(session)
				continue
			} else {
				// 认证成功
				s.sendUserAuthSuccess(session)
				session.authenticated = true
				return nil
			}
		}
	}
}

// handleUserAuthRequest 处理用户认证请求
func (s *CustomSSHServer) handleUserAuthRequest(session *Session, msg *SSHMessage) error {
	// 解析认证请求
	reader := bytes.NewReader(msg.Payload)

	// 读取用户名
	username, err := s.readString(reader)
	if err != nil {
		return fmt.Errorf("failed to read username: %w", err)
	}

	// 读取服务名
	_, err = s.readString(reader) // service
	if err != nil {
		return fmt.Errorf("failed to read service: %w", err)
	}

	// 读取方法名
	method, err := s.readString(reader)
	if err != nil {
		return fmt.Errorf("failed to read method: %w", err)
	}

	session.username = username

	// 处理不同的认证方法
	switch method {
	case "password":
		return s.handlePasswordAuth(session, reader)
	case "keyboard-interactive":
		return s.handleKeyboardInteractiveAuth(session, reader)
	default:
		return fmt.Errorf("unsupported auth method: %s", method)
	}
}

// handlePasswordAuth 处理密码认证
func (s *CustomSSHServer) handlePasswordAuth(session *Session, reader *bytes.Reader) error {
	// 读取密码
	password, err := s.readString(reader)
	if err != nil {
		return fmt.Errorf("failed to read password: %w", err)
	}

	// 获取认证服务
	authService := s.getAuthService()
	if authService == nil {
		return fmt.Errorf("authentication service not available")
	}

	// 获取用户信息
	user, err := authService.GetUserByUsername(session.username)
	if err != nil {
		return fmt.Errorf("user not found")
	}

	// 验证密码
	if err := authService.ValidatePassword(user, password); err != nil {
		return fmt.Errorf("authentication failed")
	}

	// 检查是否需要MFA
	if user.TwoFactorEnabled {
		// 发送MFA提示
		domain := s.getSystemDomain()
		mfaPrompt := fmt.Sprintf("%s@%s's MFA code: ", session.username, domain)
		if err := s.sendUserAuthInfoRequest(session, "MFA Verification", mfaPrompt); err != nil {
			return err
		}

		// 读取MFA响应
		msg, err := s.readSSHMessage(session)
		if err != nil {
			return fmt.Errorf("failed to read MFA response: %w", err)
		}

		if msg.Type == SSH_MSG_USERAUTH_INFO_RESPONSE {
			// 解析MFA代码
			reader := bytes.NewReader(msg.Payload)
			numResponses, err := s.readUint32(reader)
			if err != nil || numResponses != 1 {
				return fmt.Errorf("invalid MFA response")
			}

			mfaCode, err := s.readString(reader)
			if err != nil {
				return fmt.Errorf("failed to read MFA code: %w", err)
			}

			// 验证MFA代码
			if !authService.ValidateTwoFactorCode(user, mfaCode, "") {
				return fmt.Errorf("MFA verification failed")
			}
		} else {
			return fmt.Errorf("expected MFA response")
		}
	}

	// 更新会话信息
	session.userID = user.ID
	session.SessionInfo.UserID = user.ID
	session.SessionInfo.Username = session.username
	session.SessionInfo.Status = "authenticated"

	return nil
}

// handleKeyboardInteractiveAuth 处理键盘交互认证
func (s *CustomSSHServer) handleKeyboardInteractiveAuth(session *Session, reader *bytes.Reader) error {
	// 获取认证服务
	authService := s.getAuthService()
	if authService == nil {
		return fmt.Errorf("authentication service not available")
	}

	// 获取用户信息
	user, err := authService.GetUserByUsername(session.username)
	if err != nil {
		return fmt.Errorf("user not found")
	}

	// 发送密码提示
	domain := s.getSystemDomain()
	passwordPrompt := fmt.Sprintf("%s@%s's password: ", session.username, domain)
	if err := s.sendUserAuthInfoRequest(session, "Password Authentication", passwordPrompt); err != nil {
		return err
	}

	// 读取密码响应
	msg, err := s.readSSHMessage(session)
	if err != nil {
		return fmt.Errorf("failed to read password response: %w", err)
	}

	if msg.Type != SSH_MSG_USERAUTH_INFO_RESPONSE {
		return fmt.Errorf("expected password response")
	}

	// 解析密码
	reader = bytes.NewReader(msg.Payload)
	numResponses, err := s.readUint32(reader)
	if err != nil || numResponses != 1 {
		return fmt.Errorf("invalid password response")
	}

	password, err := s.readString(reader)
	if err != nil {
		return fmt.Errorf("failed to read password: %w", err)
	}

	// 验证密码
	if err := authService.ValidatePassword(user, password); err != nil {
		return fmt.Errorf("authentication failed")
	}

	// 检查是否需要MFA
	if user.TwoFactorEnabled {
		// 发送MFA提示
		mfaPrompt := fmt.Sprintf("%s@%s's MFA code: ", session.username, domain)
		if err := s.sendUserAuthInfoRequest(session, "MFA Verification", mfaPrompt); err != nil {
			return err
		}

		// 读取MFA响应
		msg, err := s.readSSHMessage(session)
		if err != nil {
			return fmt.Errorf("failed to read MFA response: %w", err)
		}

		if msg.Type == SSH_MSG_USERAUTH_INFO_RESPONSE {
			// 解析MFA代码
			reader = bytes.NewReader(msg.Payload)
			numResponses, err := s.readUint32(reader)
			if err != nil || numResponses != 1 {
				return fmt.Errorf("invalid MFA response")
			}

			mfaCode, err := s.readString(reader)
			if err != nil {
				return fmt.Errorf("failed to read MFA code: %w", err)
			}

			// 验证MFA代码
			if !authService.ValidateTwoFactorCode(user, mfaCode, "") {
				return fmt.Errorf("MFA verification failed")
			}
		} else {
			return fmt.Errorf("expected MFA response")
		}
	}

	// 更新会话信息
	session.userID = user.ID
	session.SessionInfo.UserID = user.ID
	session.SessionInfo.Username = session.username
	session.SessionInfo.Status = "authenticated"

	return nil
}

// getSystemDomain 获取系统域名配置
func (s *CustomSSHServer) getSystemDomain() string {
	if s.config.CustomDomain != "" {
		return s.config.CustomDomain
	}

	domain, err := s.settingRepo.Get("domain")
	if err != nil || domain == "" {
		return "jump.xx.com" // 默认域名
	}
	return domain
}

// getAuthService 获取认证服务
func (s *CustomSSHServer) getAuthService() *service.AuthService {
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

// SSHMessage SSH消息结构
type SSHMessage struct {
	Type    uint8
	Payload []byte
}

// readSSHMessage 读取SSH消息
func (s *CustomSSHServer) readSSHMessage(session *Session) (*SSHMessage, error) {
	// 读取消息长度（4字节）
	lengthBytes := make([]byte, 4)
	if _, err := io.ReadFull(session.Conn, lengthBytes); err != nil {
		return nil, err
	}

	length := binary.BigEndian.Uint32(lengthBytes)
	if length > 32768 { // 限制消息大小
		return nil, fmt.Errorf("message too large: %d", length)
	}

	// 读取消息类型（1字节）
	typeByte := make([]byte, 1)
	if _, err := io.ReadFull(session.Conn, typeByte); err != nil {
		return nil, err
	}

	// 读取消息载荷
	payload := make([]byte, length-1)
	if _, err := io.ReadFull(session.Conn, payload); err != nil {
		return nil, err
	}

	return &SSHMessage{
		Type:    typeByte[0],
		Payload: payload,
	}, nil
}

// sendSSHMessage 发送SSH消息
func (s *CustomSSHServer) sendSSHMessage(session *Session, msgType uint8, payload []byte) error {
	// 构建消息
	message := make([]byte, 5+len(payload))

	// 消息长度（不包括长度字段本身）
	length := uint32(1 + len(payload))
	binary.BigEndian.PutUint32(message[0:4], length)

	// 消息类型
	message[4] = msgType

	// 载荷
	copy(message[5:], payload)

	// 发送消息
	_, err := session.Conn.Write(message)
	return err
}

// 辅助函数：读取字符串
func (s *CustomSSHServer) readString(reader *bytes.Reader) (string, error) {
	// 读取长度
	lengthBytes := make([]byte, 4)
	if _, err := reader.Read(lengthBytes); err != nil {
		return "", err
	}
	length := binary.BigEndian.Uint32(lengthBytes)

	// 读取字符串
	strBytes := make([]byte, length)
	if _, err := reader.Read(strBytes); err != nil {
		return "", err
	}

	return string(strBytes), nil
}

// 辅助函数：读取uint32
func (s *CustomSSHServer) readUint32(reader *bytes.Reader) (uint32, error) {
	bytes := make([]byte, 4)
	if _, err := reader.Read(bytes); err != nil {
		return 0, err
	}
	return binary.BigEndian.Uint32(bytes), nil
}

// 发送各种SSH消息的方法
func (s *CustomSSHServer) sendUserAuthBanner(session *Session, banner string) error {
	// 构建横幅消息
	payload := make([]byte, 0)
	payload = append(payload, s.encodeString(banner)...)
	payload = append(payload, s.encodeString("en")...) // 语言标签

	return s.sendSSHMessage(session, SSH_MSG_USERAUTH_BANNER, payload)
}

func (s *CustomSSHServer) sendUserAuthFailure(session *Session) error {
	// 构建失败消息
	payload := make([]byte, 0)
	payload = append(payload, s.encodeString("password,keyboard-interactive")...) // 支持的认证方法
	payload = append(payload, s.encodeBool(false)...)                             // 部分成功标志

	return s.sendSSHMessage(session, SSH_MSG_USERAUTH_FAILURE, payload)
}

func (s *CustomSSHServer) sendUserAuthSuccess(session *Session) error {
	return s.sendSSHMessage(session, SSH_MSG_USERAUTH_SUCCESS, nil)
}

func (s *CustomSSHServer) sendUserAuthInfoRequest(session *Session, name, instruction string) error {
	// 构建信息请求消息
	payload := make([]byte, 0)
	payload = append(payload, s.encodeString(name)...)
	payload = append(payload, s.encodeString(instruction)...)
	payload = append(payload, s.encodeString("")...)  // 语言标签
	payload = append(payload, s.encodeUint32(1)...)   // 提示数量
	payload = append(payload, s.encodeString("")...)  // 提示文本
	payload = append(payload, s.encodeBool(false)...) // 不回显

	return s.sendSSHMessage(session, SSH_MSG_USERAUTH_INFO_REQUEST, payload)
}

// 编码辅助函数
func (s *CustomSSHServer) encodeString(str string) []byte {
	bytes := make([]byte, 4+len(str))
	binary.BigEndian.PutUint32(bytes[0:4], uint32(len(str)))
	copy(bytes[4:], str)
	return bytes
}

func (s *CustomSSHServer) encodeUint32(value uint32) []byte {
	bytes := make([]byte, 4)
	binary.BigEndian.PutUint32(bytes, value)
	return bytes
}

func (s *CustomSSHServer) encodeBool(value bool) []byte {
	if value {
		return []byte{1}
	}
	return []byte{0}
}

// 会话管理方法
func (s *CustomSSHServer) registerSession(session *Session) {
	s.sessionsMu.Lock()
	defer s.sessionsMu.Unlock()
	s.sessions[session.ID] = session
}

func (s *CustomSSHServer) unregisterSession(sessionID string) {
	s.sessionsMu.Lock()
	defer s.sessionsMu.Unlock()
	if session, exists := s.sessions[sessionID]; exists {
		session.cancel()
		delete(s.sessions, sessionID)
	}
}

func (s *CustomSSHServer) getSessionCount() int {
	s.sessionsMu.RLock()
	defer s.sessionsMu.RUnlock()
	return len(s.sessions)
}

func (s *CustomSSHServer) monitorSessions() {
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

func (s *CustomSSHServer) checkIdleSessions() {
	s.sessionsMu.Lock()
	defer s.sessionsMu.Unlock()

	now := time.Now()
	for sessionID, session := range s.sessions {
		// 检查空闲超时
		if s.config.IdleTimeout > 0 && now.Sub(session.LastActive) > s.config.IdleTimeout {
			session.Conn.Close()
			session.cancel()
			delete(s.sessions, sessionID)
		}

		// 检查会话超时
		if s.config.SessionTimeout > 0 && now.Sub(session.StartTime) > s.config.SessionTimeout {
			session.Conn.Close()
			session.cancel()
			delete(s.sessions, sessionID)
		}
	}
}

// Stop 停止服务器
func (s *CustomSSHServer) Stop() error {
	s.cancel()
	if s.listener != nil {
		s.listener.Close()
	}
	s.closeAllSessions()

	done := make(chan struct{})
	go func() {
		s.wg.Wait()
		close(done)
	}()

	timeout := time.After(5 * time.Second)
	select {
	case <-done:
	case <-timeout:
		s.forceCloseAllSessions()
	}

	return nil
}

func (s *CustomSSHServer) closeAllSessions() {
	s.sessionsMu.Lock()
	defer s.sessionsMu.Unlock()

	for _, session := range s.sessions {
		session.cancel()
		session.Conn.Close()
	}
}

func (s *CustomSSHServer) forceCloseAllSessions() {
	s.sessionsMu.Lock()
	defer s.sessionsMu.Unlock()

	for _, session := range s.sessions {
		session.Conn.Close()
		session.cancel()
	}
	s.sessions = make(map[string]*Session)
}

// GetActiveSessions 获取活动会话列表
func (s *CustomSSHServer) GetActiveSessions() []*types.SessionInfo {
	s.sessionsMu.RLock()
	defer s.sessionsMu.RUnlock()

	sessions := make([]*types.SessionInfo, 0, len(s.sessions))
	for _, session := range s.sessions {
		sessions = append(sessions, session.SessionInfo)
	}

	return sessions
}

// handleSSHMessages 处理SSH消息循环
func (s *CustomSSHServer) handleSSHMessages(session *Session) {
	channelHandler := NewChannelHandler(s)

	for {
		select {
		case <-session.ctx.Done():
			return
		default:
		}

		// 读取SSH消息
		msg, err := s.readSSHMessage(session)
		if err != nil {
			return
		}

		// 处理不同类型的消息
		switch msg.Type {
		case SSH_MSG_CHANNEL_OPEN:
			// 处理通道打开请求
			if err := channelHandler.handleChannelOpen(session, msg); err != nil {
				// 记录错误但不崩溃
			}
		case SSH_MSG_CHANNEL_REQUEST:
			// 处理通道请求
			if err := channelHandler.handleChannelRequest(session, msg); err != nil {
				// 记录错误但不崩溃
			}
		case SSH_MSG_GLOBAL_REQUEST:
			// 处理全局请求
			s.handleGlobalRequest(session, msg)
		case SSH_MSG_CHANNEL_DATA:
			// 处理通道数据
			s.handleChannelData(session, msg)
		case SSH_MSG_CHANNEL_CLOSE:
			// 处理通道关闭
			s.handleChannelClose(session, msg)
		default:
			// 发送未实现消息
			s.sendSSHMessage(session, SSH_MSG_UNIMPLEMENTED, nil)
		}
	}
}

// handleGlobalRequest 处理全局请求
func (s *CustomSSHServer) handleGlobalRequest(session *Session, msg *SSHMessage) {
	// 默认拒绝全局请求
	s.sendSSHMessage(session, SSH_MSG_REQUEST_FAILURE, nil)
}

// handleChannelData 处理通道数据
func (s *CustomSSHServer) handleChannelData(session *Session, msg *SSHMessage) {
	reader := bytes.NewReader(msg.Payload)

	// 读取通道ID
	channelID, err := s.readUint32(reader)
	if err != nil {
		return
	}

	// 获取通道
	session.channelsMu.RLock()
	channel, exists := session.channels[channelID]
	session.channelsMu.RUnlock()

	if !exists {
		return
	}

	// 读取数据
	data := make([]byte, reader.Len())
	if _, err := reader.Read(data); err != nil {
		return
	}

	// 发送到通道
	select {
	case channel.Data <- data:
	default:
		// 通道已满，丢弃数据
	}
}

// handleChannelClose 处理通道关闭
func (s *CustomSSHServer) handleChannelClose(session *Session, msg *SSHMessage) {
	reader := bytes.NewReader(msg.Payload)

	// 读取通道ID
	channelID, err := s.readUint32(reader)
	if err != nil {
		return
	}

	// 关闭通道
	session.channelsMu.Lock()
	if channel, exists := session.channels[channelID]; exists {
		channel.Closed = true
		close(channel.Data)
		close(channel.CloseChan)
		delete(session.channels, channelID)
	}
	session.channelsMu.Unlock()
}
