package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/fisker/zjump-backend/internal/bastion/blacklist"
	"github.com/fisker/zjump-backend/internal/bastion/parser"
	"github.com/fisker/zjump-backend/internal/bastion/recorder"
	"github.com/fisker/zjump-backend/internal/bastion/storage"
	"github.com/fisker/zjump-backend/internal/model"
	"github.com/fisker/zjump-backend/internal/notification"
	"github.com/fisker/zjump-backend/internal/repository"
	"github.com/fisker/zjump-backend/internal/router"
	"github.com/fisker/zjump-backend/internal/service"
	"github.com/fisker/zjump-backend/pkg/database"
	"github.com/fisker/zjump-backend/pkg/sshclient"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"golang.org/x/crypto/ssh"
	"gorm.io/gorm"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024 * 32,
	WriteBufferSize: 1024 * 32,
	CheckOrigin: func(r *http.Request) bool {
		return true // 在生产环境应该验证 Origin
	},
}

// ConnectionHandler 连接处理器 - 统一入口（支持直连和代理）
type ConnectionHandler struct {
	router         *router.ConnectionRouter
	hostRepo       *repository.HostRepository
	authService    *service.AuthService
	storage        storage.Storage
	blacklistMgr   *blacklist.Manager
	systemUserRepo *repository.SystemUserRepository
}

// NewConnectionHandler 创建连接处理器
func NewConnectionHandler(
	r *router.ConnectionRouter,
	hostRepo *repository.HostRepository,
	authService *service.AuthService,
	st storage.Storage,
	db *gorm.DB,
	notificationMgr *notification.NotificationManager,
	systemUserRepo *repository.SystemUserRepository,
) *ConnectionHandler {
	// 初始化黑名单管理器（从数据库读取，带高级检测防绕过）
	blacklistMgr := blacklist.NewManagerFromDB(db)
	blacklistMgr.Start() // 启动定期刷新

	// 连接通知管理器到黑名单管理器（使用传入的共享实例）
	if notificationMgr != nil {
		blacklistMgr.SetNotificationManager(notificationMgr)
	}

	return &ConnectionHandler{
		router:         r,
		hostRepo:       hostRepo,
		authService:    authService,
		storage:        st,
		blacklistMgr:   blacklistMgr,
		systemUserRepo: systemUserRepo,
	}
}

// HandleConnection 处理 WebSocket 连接（统一入口）
func (h *ConnectionHandler) HandleConnection(c *gin.Context) {
	// 1. 获取参数
	hostID := c.Query("hostId")
	token := c.Query("token")
	systemUserID := c.Query("systemUserId") // 系统用户ID（可选）

	if hostID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing hostId parameter"})
		return
	}

	if token == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Missing token parameter"})
		return
	}

	// 2. 验证 Token 获取用户信息
	userInfo, err := h.validateToken(token)
	if err != nil {
		log.Printf("[Connection] Token validation failed: %v", err)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired token"})
		return
	}

	log.Printf("[Connection] User %s requesting connection to host %s", userInfo.Username, hostID)

	// 2.1 检查并获取系统用户
	var systemUser *model.SystemUser
	if systemUserID != "" {
		// 如果指定了系统用户ID，验证权限并获取
		hasPermission, err := h.systemUserRepo.CheckUserHasPermission(userInfo.UserID, hostID, systemUserID)
		if err != nil {
			log.Printf("[Connection] Failed to check permission: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check permission"})
			return
		}
		if !hasPermission {
			log.Printf("[Connection] User %s has no permission to use system user %s", userInfo.Username, systemUserID)
			c.JSON(http.StatusForbidden, gin.H{"error": "No permission to use this system user"})
			return
		}

		systemUser, err = h.systemUserRepo.FindByID(systemUserID)
		if err != nil {
			log.Printf("[Connection] System user not found: %v", err)
			c.JSON(http.StatusNotFound, gin.H{"error": "System user not found"})
			return
		}
	} else {
		// 如果未指定系统用户，获取可用的系统用户列表
		availableSystemUsers, err := h.systemUserRepo.GetAvailableSystemUsersForUser(userInfo.UserID, hostID)
		if err != nil {
			log.Printf("[Connection] Failed to get available system users: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get available system users"})
			return
		}

		if len(availableSystemUsers) == 0 {
			// 没有可用的系统用户，返回错误
			log.Printf("[Connection] No available system users for user %s on host %s", userInfo.Username, hostID)
			c.JSON(http.StatusForbidden, gin.H{"error": "No available system users for this host"})
			return
		} else if len(availableSystemUsers) == 1 {
			// 只有一个系统用户，直接使用
			systemUser = &availableSystemUsers[0]
			log.Printf("[Connection] Auto-selected system user: %s", systemUser.Name)
		} else {
			// 有多个系统用户，需要前端选择
			log.Printf("[Connection] Multiple system users available (%d), need user selection", len(availableSystemUsers))
			c.JSON(http.StatusOK, gin.H{
				"needSelection": true,
				"systemUsers":   availableSystemUsers,
			})
			return
		}
	}

	log.Printf("[Connection] Using system user: %s (%s)", systemUser.Name, systemUser.Username)

	// 3. 路由决策
	decision, err := h.router.MakeRoutingDecision(hostID, userInfo.UserID, userInfo.Username)
	if err != nil {
		log.Printf("[Connection] Routing decision failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Routing failed: %v", err)})
		return
	}

	log.Printf("[Connection] Routing decision: mode=%s, reason=%s", decision.Mode, decision.Reason)

	// 4. 升级到 WebSocket
	ws, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("[Connection] Failed to upgrade to WebSocket: %v", err)
		return
	}
	defer ws.Close()

	// 生成会话ID
	sessionID := uuid.New().String()

	// 5. 根据决策模式建立连接
	if decision.Mode == model.ConnectionModeDirect {
		log.Printf("[Connection] Using DIRECT mode for session %s", sessionID)
		h.handleDirectConnection(ws, hostID, sessionID, userInfo, systemUser)
	} else {
		log.Printf("[Connection] Using PROXY mode for session %s (proxy: %s)", sessionID, decision.ProxyID)
		h.handleProxyConnection(ws, hostID, sessionID, userInfo, decision, systemUser)
	}
}

// handleDirectConnection 处理直连模式
func (h *ConnectionHandler) handleDirectConnection(ws *websocket.Conn, hostID string, sessionID string, userInfo *UserInfo, systemUser *model.SystemUser) {
	// 获取主机信息
	host, err := h.hostRepo.FindByID(hostID)
	if err != nil {
		log.Printf("[Connection] Host not found: %v", err)
		ws.WriteJSON(map[string]interface{}{
			"type":    "error",
			"message": "Host not found",
		})
		return
	}

	log.Printf("[Connection] Connecting directly to %s (%s:%d) as %s", host.Name, host.IP, host.Port, systemUser.Username)

	// 发送连接开始消息
	ws.WriteJSON(map[string]interface{}{
		"type":    "info",
		"message": fmt.Sprintf("正在直连到 %s (%s:%d)...", host.Name, host.IP, host.Port),
	})

	// 创建会话录制器
	rec := recorder.NewRecorder(sessionID, 120, 30)
	connectionSuccess := false // 标记连接是否成功
	startTime := time.Now()

	// 先创建登录记录（无论连接成功与否都需要记录）- 使用model包
	loginRecord := &model.LoginRecord{
		ID:        sessionID,
		SessionID: sessionID,
		UserID:    userInfo.UserID,
		HostID:    host.ID,
		HostName:  host.Name, // 添加主机名
		HostIP:    host.IP,
		Username:  userInfo.Username,
		LoginTime: startTime,
		Status:    "connecting", // 初始状态为连接中
	}
	if err := database.DB.Create(loginRecord).Error; err != nil {
		log.Printf("[Connection] Failed to create login record: %v", err)
	}
	log.Printf("[Connection] Login record created: session=%s, host=%s(%s), user=%s",
		sessionID, host.Name, host.IP, userInfo.Username)

	defer func() {
		rec.Close()
		recording, _ := rec.ToAsciinema()
		logoutTime := time.Now()
		diff := logoutTime.Sub(startTime)
		durationSec := int(diff.Seconds())

		log.Printf("[Connection] Session %s ending: success=%v, duration=%ds, host=%s",
			sessionID, connectionSuccess, durationSec, host.Name)

		if connectionSuccess {
			// 连接成功，更新会话录制记录和登录记录
			// 1. 更新会话录制记录（添加录像数据）
			minutes := int(diff.Minutes())
			seconds := int(diff.Seconds()) % 60
			duration := fmt.Sprintf("%dm %ds", minutes, seconds)

			result := database.DB.Model(&model.SessionRecording{}).
				Where("session_id = ?", sessionID).
				Updates(map[string]interface{}{
					"end_time":  logoutTime,
					"status":    "closed",
					"duration":  duration,
					"recording": recording,
				})
			if result.Error != nil {
				log.Printf("[Connection]  Failed to update session recording: %v", result.Error)
			} else {
				log.Printf("[Connection]  Session recording updated: session=%s, affected_rows=%d",
					sessionID, result.RowsAffected)
			}

			// 2. 更新登录记录为完成状态
			result = database.DB.Model(&model.LoginRecord{}).
				Where("session_id = ?", sessionID).
				Updates(map[string]interface{}{
					"logout_time": logoutTime,
					"status":      "completed",
					"duration":    durationSec,
				})
			if result.Error != nil {
				log.Printf("[Connection]  Failed to update login record to completed: %v", result.Error)
			} else {
				log.Printf("[Connection]  Login record updated to completed: session=%s, affected_rows=%d",
					sessionID, result.RowsAffected)
			}

			log.Printf("[Connection]  Session %s closed successfully (duration: %v)", sessionID, duration)
		} else {
			// 连接失败，只更新登录记录
			result := database.DB.Model(&model.LoginRecord{}).
				Where("session_id = ?", sessionID).
				Updates(map[string]interface{}{
					"logout_time": logoutTime,
					"status":      "failed",
					"duration":    durationSec,
				})
			if result.Error != nil {
				log.Printf("[Connection]  Failed to update login record to failed: %v", result.Error)
			} else {
				log.Printf("[Connection]  Login record updated to failed: session=%s, duration=%ds, affected_rows=%d",
					sessionID, durationSec, result.RowsAffected)
			}

			log.Printf("[Connection]  Session %s failed (duration: %ds)", sessionID, durationSec)
		}
	}()

	// 创建命令解析器（只记录命令，不通知）
	cmdParser := parser.NewCommandExtractor(func(command string) {
		// 检查是否为危险命令（只检测，不通知）
		isBlocked := false
		reason := ""
		if h.blacklistMgr != nil && h.blacklistMgr.IsBlocked(command, userInfo.Username) {
			reason = h.blacklistMgr.GetBlockReason(command, userInfo.Username)
			isBlocked = true
		}

		// 保存命令记录
		cmdRecord := &storage.CommandRecord{
			ProxyID:    "api-server-direct",
			SessionID:  sessionID,
			HostID:     host.ID,
			UserID:     userInfo.UserID,
			Username:   userInfo.Username,
			HostIP:     host.IP,
			Command:    command,
			ExecutedAt: time.Now(),
		}

		if isBlocked {
			cmdRecord.Output = fmt.Sprintf("[BLOCKED] %s", reason)
			cmdRecord.ExitCode = -1
		}

		if err := h.storage.SaveCommand(cmdRecord); err != nil {
			log.Printf("[Connection] Failed to save command: %v", err)
		}
	})

	// 建立SSH连接并转发（带超时倒计时）
	if err := h.proxySSHConnectionWithTimeout(ws, host, systemUser, sessionID, rec, cmdParser, userInfo, &connectionSuccess, startTime); err != nil {
		log.Printf("[Connection] SSH connection error: %v", err)

		// 根据错误类型显示不同的消息
		var errorMsg string
		if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
			errorMsg = fmt.Sprintf("\r\n\033[1;31m连接超时！\033[0m\r\n无法连接到 %s:%d\r\n请检查：\r\n1. 主机是否在线\r\n2. 网络是否可达\r\n3. SSH服务是否正常运行\r\n4. 防火墙是否允许连接\r\n", host.IP, host.Port)
		} else {
			errorMsg = fmt.Sprintf("\r\n\033[1;31m连接失败！\033[0m\r\n错误：%v\r\n", err)
		}

		ws.WriteJSON(map[string]interface{}{
			"type":    "error",
			"message": errorMsg,
		})
		// connectionSuccess 保持 false，defer 中会标记为 failed
	} else {
		// 连接函数正常返回（注意：connectionSuccess 已在Shell启动时设置）
		log.Printf("[Connection] SSH connection function returned normally for session %s", sessionID)
	}
}

// handleProxyConnection 处理代理模式
func (h *ConnectionHandler) handleProxyConnection(ws *websocket.Conn, hostID string, sessionID string, userInfo *UserInfo, decision *model.RoutingDecision, systemUser *model.SystemUser) {
	host, err := h.hostRepo.FindByID(hostID)
	if err != nil {
		ws.WriteJSON(map[string]interface{}{
			"type":    "error",
			"message": "Host not found",
		})
		return
	}

	log.Printf("[Connection] Connecting via proxy %s to %s as %s", decision.ProxyID, host.Name, systemUser.Username)

	// 增加登录次数
	if err := h.hostRepo.IncrementLoginCount(host.ID); err != nil {
		log.Printf("[Connection] Failed to increment login count: %v", err)
	}
	if err := h.hostRepo.UpdateLastLoginTime(host.ID); err != nil {
		log.Printf("[Connection] Failed to update last login time: %v", err)
	}

	// 发送连接消息
	ws.WriteJSON(map[string]interface{}{
		"type":    "info",
		"message": fmt.Sprintf("正在通过代理 %s 连接到 %s...", decision.ProxyID, host.Name),
	})

	// 生成 Proxy Token（用于 Proxy Server 验证）
	proxyToken := h.generateProxyToken(hostID, userInfo)

	// 连接到 Proxy Server
	proxyURL := fmt.Sprintf("%s?token=%s&hostId=%s", decision.ProxyURL, proxyToken, hostID)
	log.Printf("[Connection] Dialing proxy: %s", proxyURL)

	proxyWS, _, err := websocket.DefaultDialer.Dial(proxyURL, nil)
	if err != nil {
		log.Printf("[Connection] Failed to connect to proxy: %v", err)
		ws.WriteJSON(map[string]interface{}{
			"type":    "error",
			"message": fmt.Sprintf("无法连接到代理服务器: %v", err),
		})
		return
	}
	defer proxyWS.Close()

	log.Printf("[Connection] Successfully connected to proxy, starting bidirectional forwarding...")

	// 双向转发 WebSocket 数据
	errChan := make(chan error, 2)

	// 客户端 -> 代理
	go func() {
		for {
			messageType, message, err := ws.ReadMessage()
			if err != nil {
				errChan <- err
				return
			}
			if err := proxyWS.WriteMessage(messageType, message); err != nil {
				errChan <- err
				return
			}
		}
	}()

	// 代理 -> 客户端
	go func() {
		for {
			messageType, message, err := proxyWS.ReadMessage()
			if err != nil {
				errChan <- err
				return
			}
			if err := ws.WriteMessage(messageType, message); err != nil {
				errChan <- err
				return
			}
		}
	}()

	// 等待任一方向发生错误
	err = <-errChan
	if err != nil && !websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
		log.Printf("[Connection] Proxy forwarding error: %v", err)
	}

	log.Printf("[Connection] Session %s closed (proxy mode)", sessionID)
}

// proxySSHConnectionWithTimeout 代理 SSH 连接（带超时倒计时）
func (h *ConnectionHandler) proxySSHConnectionWithTimeout(ws *websocket.Conn, host *model.Host, systemUser *model.SystemUser, sessionID string, rec *recorder.Recorder, cmdParser *parser.CommandExtractor, userInfo *UserInfo, connectionSuccess *bool, startTime time.Time) error {
	// 创建超时上下文（改为10秒）
	timeout := 10 * time.Second
	deadline := time.Now().Add(timeout)

	// 创建用于取消倒计时的通道
	stopCountdown := make(chan struct{})

	// 用于记录是否显示过倒计时
	countdownShown := false

	// 启动倒计时显示
	go func() {
		ticker := time.NewTicker(1 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-stopCountdown:
				// 连接成功，只在显示过倒计时时才清除
				if countdownShown {
					ws.WriteJSON(map[string]interface{}{
						"type": "data",
						"data": "\r\033[K", // 清除当前行
					})
				}
				log.Printf("[Connection] Countdown stopped for session %s", sessionID)
				return
			case <-ticker.C:
				remaining := time.Until(deadline)
				if remaining > 0 {
					countdownShown = true
					ws.WriteJSON(map[string]interface{}{
						"type": "data",
						"data": fmt.Sprintf("\r\033[33m正在连接... 剩余时间: %d 秒\033[0m", int(remaining.Seconds())),
					})
				}
			}
		}
	}()

	// 执行实际的SSH连接，传递stopCountdown通道、connectionSuccess指针和startTime
	return h.proxySSHConnection(ws, host, systemUser, sessionID, rec, cmdParser, userInfo, stopCountdown, connectionSuccess, startTime)
}

// proxySSHConnection 代理 SSH 连接（直连模式）
func (h *ConnectionHandler) proxySSHConnection(ws *websocket.Conn, host *model.Host, systemUser *model.SystemUser, sessionID string, rec *recorder.Recorder, cmdParser *parser.CommandExtractor, userInfo *UserInfo, stopCountdown chan struct{}, connectionSuccess *bool, startTime time.Time) error {
	// 使用系统用户的认证信息
	// 注意：Host 已不再包含认证字段，必须通过 SystemUser 提供
	username := systemUser.Username
	password := systemUser.Password
	privateKey := systemUser.PrivateKey
	passphrase := systemUser.Passphrase
	authType := systemUser.AuthType

	// 验证系统用户必须配置了对应认证类型的认证信息
	if authType == "password" && password == "" {
		return fmt.Errorf("系统用户 %s 配置为密码认证，但未提供密码", systemUser.Name)
	}
	if authType == "key" && privateKey == "" {
		return fmt.Errorf("系统用户 %s 配置为密钥认证，但未提供私钥", systemUser.Name)
	}

	cfg := sshclient.SSHConfig{
		Host:       host.IP,
		Port:       host.Port,
		Username:   username,
		Password:   password,
		PrivateKey: privateKey,
		Passphrase: passphrase,
		AuthType:   authType,
		Timeout:    10 * time.Second,
	}

	client, err := sshclient.NewSSHClient(cfg)
	if err != nil {
		return fmt.Errorf("failed to connect: %w", err)
	}
	defer client.Close()

	// 创建 SSH session
	session, err := client.NewSession()
	if err != nil {
		return fmt.Errorf("failed to create session: %w", err)
	}
	defer session.Close()

	// 设置终端模式
	modes := ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}

	// 请求 PTY
	if err := session.RequestPty("xterm-256color", 30, 120, modes); err != nil {
		return fmt.Errorf("failed to request pty: %w", err)
	}

	// 获取输入输出管道
	stdin, _ := session.StdinPipe()
	stdout, _ := session.StdoutPipe()
	stderr, _ := session.StderrPipe()

	// 启动 shell
	if err := session.Shell(); err != nil {
		return fmt.Errorf("failed to start shell: %w", err)
	}

	// Shell 启动成功！停止倒计时 + 标记连接成功
	if stopCountdown != nil {
		close(stopCountdown)
		log.Printf("[Connection]  Shell started successfully, countdown stopped for session %s", sessionID)
	}

	// 标记连接成功（非常重要：即使后面WebSocket断开，也要记录这次成功的连接）
	if connectionSuccess != nil {
		*connectionSuccess = true
		log.Printf("[Connection]  Connection marked as successful for session %s", sessionID)

		// 立即创建会话录制记录（和SSH客户端保持一致）
		recording := &model.SessionRecording{
			ID:             uuid.New().String(),
			SessionID:      sessionID,
			ConnectionType: "webshell",
			UserID:         userInfo.UserID,
			HostID:         host.ID,
			HostName:       host.Name,
			HostIP:         host.IP,
			Username:       userInfo.Username,
			StartTime:      startTime, // 使用与LoginRecord相同的时间
			Status:         "active",
			Duration:       "进行中",
			TerminalCols:   120,
			TerminalRows:   30,
		}

		if err := database.DB.Create(recording).Error; err != nil {
			log.Printf("[Connection]  Failed to create session recording: %v", err)
		} else {
			log.Printf("[Connection]  Session recording created: id=%s, session=%s, host=%s",
				recording.ID, sessionID, host.Name)
		}

		// 更新登录记录状态为 active
		if err := database.DB.Model(&model.LoginRecord{}).
			Where("session_id = ?", sessionID).
			Update("status", "active").Error; err != nil {
			log.Printf("[Connection] Failed to update login record status: %v", err)
		}

		// 更新主机统计信息
		if err := h.hostRepo.IncrementLoginCount(host.ID); err != nil {
			log.Printf("[Connection] Failed to increment login count: %v", err)
		}
		if err := h.hostRepo.UpdateLastLoginTime(host.ID); err != nil {
			log.Printf("[Connection] Failed to update last login time: %v", err)
		}
	}

	errChan := make(chan error, 2)

	// WebSocket -> SSH stdin（带命令拦截）
	go func() {
		defer stdin.Close()

		// 命令输入缓冲区（用于在回车前检测完整命令）
		var commandBuffer strings.Builder

		for {
			_, message, err := ws.ReadMessage()
			if err != nil {
				errChan <- err
				return
			}

			// 解析消息
			var msg map[string]interface{}
			if err := json.Unmarshal(message, &msg); err != nil {
				stdin.Write(message)
				continue
			}

			msgType, ok := msg["type"].(string)
			if !ok {
				continue
			}

			switch msgType {
			case "resize":
				if cols, ok := msg["cols"].(float64); ok {
					if rows, ok := msg["rows"].(float64); ok {
						session.WindowChange(int(rows), int(cols))
					}
				}
			case "input":
				if data, ok := msg["data"].(string); ok {
					rec.RecordInput(data)

					// 检查是否是回车键（命令执行）
					if data == "\r" || data == "\n" {
						// 获取完整命令
						command := strings.TrimSpace(commandBuffer.String())
						commandLen := len(commandBuffer.String())

						// 检查黑名单（在命令执行前，带通知功能）
						if command != "" && h.blacklistMgr != nil && h.blacklistMgr.IsBlockedWithNotify(command, userInfo.Username, host.IP) {
							reason := h.blacklistMgr.GetBlockReason(command, userInfo.Username)

							// 记录被阻止的命令
							blockedRecord := &storage.CommandRecord{
								ProxyID:    "api-server-direct",
								SessionID:  sessionID,
								HostID:     host.ID,
								UserID:     userInfo.UserID,
								Username:   userInfo.Username,
								HostIP:     host.IP,
								Command:    command,
								Output:     fmt.Sprintf("[BLOCKED] %s", reason),
								ExitCode:   -1,
								ExecutedAt: time.Now(),
							}
							h.storage.SaveCommand(blockedRecord)

							// 清空缓冲区
							commandBuffer.Reset()

							// 发送退格键清除已输入的命令
							for i := 0; i < commandLen; i++ {
								stdin.Write([]byte{0x7f})
							}

							// 发送回车让 shell 显示新提示符（用户不需要再手动按回车）
							stdin.Write([]byte("\r"))

							// 发送阻止警告给客户端
							blockMsg := fmt.Sprintf("\r\n\033[1;31m🛡️ [安全策略阻止] %s\033[0m\r\n", reason)
							ws.WriteJSON(map[string]interface{}{
								"type": "output",
								"data": blockMsg,
							})

							continue
						}

						// 清空缓冲区
						commandBuffer.Reset()

						// 命令安全，正常执行
						stdin.Write([]byte(data))
					} else if data == "\x03" { // Ctrl+C
						// 清空缓冲区
						commandBuffer.Reset()
						stdin.Write([]byte(data))
					} else if data == "\x7f" || data == "\b" { // 退格
						// 从缓冲区删除最后一个字符
						s := commandBuffer.String()
						if len(s) > 0 {
							commandBuffer.Reset()
							commandBuffer.WriteString(s[:len(s)-1])
						}
						stdin.Write([]byte(data))
					} else {
						// 累积到命令缓冲区
						commandBuffer.WriteString(data)
						stdin.Write([]byte(data))
					}
				}
			}
		}
	}()

	// SSH stdout -> WebSocket
	go func() {
		buf := make([]byte, 32*1024)
		for {
			n, err := stdout.Read(buf)
			if err != nil {
				if err != io.EOF {
					errChan <- err
				}
				return
			}
			if n > 0 {
				data := string(buf[:n])
				rec.RecordOutput(data)
				// 喂给命令解析器解析命令
				cmdParser.Feed(data)
				ws.WriteJSON(map[string]interface{}{
					"type": "output",
					"data": data,
				})
			}
		}
	}()

	// SSH stderr -> WebSocket
	go func() {
		buf := make([]byte, 32*1024)
		for {
			n, err := stderr.Read(buf)
			if err != nil {
				return
			}
			if n > 0 {
				data := string(buf[:n])
				rec.RecordOutput(data)
				// stderr 也可能包含命令提示符
				cmdParser.Feed(data)
				ws.WriteJSON(map[string]interface{}{
					"type": "output",
					"data": data,
				})
			}
		}
	}()

	// 等待连接结束
	return <-errChan
}

// validateToken 验证 Token（使用JWT Token，24小时有效期）
func (h *ConnectionHandler) validateToken(token string) (*UserInfo, error) {
	// 验证 JWT Token（用户登录token，24小时有效期）
	claims, err := h.authService.ValidateToken(token)
	if err != nil {
		// 兼容旧的SessionToken方式（可选）
		if tokenInfo, err := service.ValidateSessionToken(token); err == nil {
			return &UserInfo{
				UserID:   tokenInfo.UserID,
				Username: tokenInfo.Username,
			}, nil
		}
		return nil, fmt.Errorf("invalid or expired token: %w", err)
	}

	return &UserInfo{
		UserID:   claims.UserID,
		Username: claims.Username,
	}, nil
}

// generateProxyToken 生成给 Proxy Server 的 Token
func (h *ConnectionHandler) generateProxyToken(hostID string, userInfo *UserInfo) string {
	// TODO: 实现真实的 token 生成
	// 这里简化处理，实际应该生成 JWT
	return "proxy-token-" + hostID + "-" + userInfo.UserID
}

// UserInfo 用户信息
type UserInfo struct {
	UserID   string
	Username string
}
