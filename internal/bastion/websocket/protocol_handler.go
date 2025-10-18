package websocket

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/fisker/zjump-backend/internal/bastion/protocol"
	"github.com/fisker/zjump-backend/internal/bastion/recorder"
	"github.com/fisker/zjump-backend/internal/bastion/storage"
	"github.com/fisker/zjump-backend/internal/model"
	"github.com/fisker/zjump-backend/internal/repository"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// ProtocolHandler 统一协议处理器
type ProtocolHandler struct {
	hostRepo       *repository.HostRepository
	storage        storage.Storage
	proxyID        string
	sessionManager *SessionManager
	factory        *protocol.Factory
}

// NewProtocolHandler 创建统一协议处理器
func NewProtocolHandler(hostRepo *repository.HostRepository, st storage.Storage, proxyID string, sm *SessionManager) *ProtocolHandler {
	return &ProtocolHandler{
		hostRepo:       hostRepo,
		storage:        st,
		proxyID:        proxyID,
		sessionManager: sm,
		factory:        protocol.GetFactory(),
	}
}

// HandleConnection 处理各种协议的连接
func (h *ProtocolHandler) HandleConnection(c *gin.Context) {
	// 获取协议类型
	protocolStr := c.Query("protocol")
	if protocolStr == "" {
		protocolStr = "ssh" // 默认 SSH
	}

	protocolType := protocol.ProtocolType(protocolStr)

	// 检查协议是否支持
	if !h.factory.IsSupported(protocolType) {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":     fmt.Sprintf("Unsupported protocol: %s", protocolStr),
			"supported": h.factory.SupportedProtocols(),
		})
		return
	}

	// 获取主机信息
	host, err := h.getHostInfo(c)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	// 升级到 WebSocket
	ws, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("Failed to upgrade to websocket: %v", err)
		return
	}
	defer ws.Close()

	// 生成会话 ID
	sessionID := uuid.New().String()
	log.Printf("[%s] New connection for host %s (%s), session: %s",
		protocolType, host.Name, host.IP, sessionID)

	// 创建录制器
	rec := recorder.NewRecorder(sessionID, 120, 30)
	defer rec.Close()

	// 创建录制器适配器
	recorderAdapter := recorder.NewRecorderAdapter(rec)

	// 创建协议处理器
	handler, err := h.factory.Create(protocolType, recorderAdapter)
	if err != nil {
		log.Printf("Failed to create protocol handler: %v", err)
		ws.WriteJSON(map[string]string{"error": err.Error()})
		return
	}
	defer handler.Close()

	// 添加到会话管理器
	h.sessionManager.AddSession(sessionID, ws)
	defer h.sessionManager.RemoveSession(sessionID)

	// 先创建登录记录（无论连接成功与否都需要记录）
	startTime := time.Now()
	userID := c.Query("userId")
	username := c.Query("username")

	loginRecord := &storage.LoginRecord{
		SessionID: sessionID,
		UserID:    userID,
		HostID:    host.ID,
		HostName:  host.Name,
		HostIP:    host.IP,
		Username:  username,
		LoginTime: startTime,
		Status:    "connecting",
	}
	h.storage.SaveLoginRecord(loginRecord)

	connectionSuccess := false // 标记连接是否成功

	defer func() {
		// 获取录制内容
		recording, _ := rec.ToAsciinema()

		if connectionSuccess {
			// 连接成功，关闭会话并更新登录记录为完成状态
			if err := h.storage.CloseSession(sessionID, recording); err != nil {
				log.Printf("Failed to close session: %v", err)
			}
			h.storage.UpdateLoginRecordStatus(sessionID, "completed", time.Now())
		} else {
			// 连接失败，不创建会话录制记录，只更新登录记录为失败状态
			h.storage.UpdateLoginRecordStatus(sessionID, "failed", time.Time{})
		}

		log.Printf("[%s] Session %s closed (success: %v)", protocolType, sessionID, connectionSuccess)
	}()

	// 连接配置
	config := &protocol.ConnectionConfig{
		HostID:     host.ID,
		HostIP:     host.IP,
		HostPort:   host.Port,
		Username:   "", // TODO: 从 SystemUser 获取
		Password:   "", // TODO: 从 SystemUser 获取
		PrivateKey: "", // TODO: 从 SystemUser 获取
		Protocol:   protocolType,
		SessionID:  sessionID,
		UserID:     userID,
		ProxyID:    h.proxyID,
		Timeout:    30 * time.Second,
	}

	// 连接到目标主机
	ctx := context.Background()
	if err := handler.Connect(ctx, config); err != nil {
		log.Printf("Failed to connect: %v", err)
		ws.WriteJSON(map[string]string{"error": err.Error()})
		// connectionSuccess 保持 false，defer 中会标记为 failed
		return
	}

	// 连接成功，创建会话录制记录
	connectionSuccess = true
	sessionRecord := &storage.SessionRecord{
		ProxyID:      h.proxyID,
		SessionID:    sessionID,
		UserID:       userID,
		Username:     username,
		HostID:       host.ID,
		HostName:     host.Name,
		HostIP:       host.IP,
		StartTime:    startTime,
		Status:       "active",
		TerminalCols: 120,
		TerminalRows: 30,
	}

	if err := h.storage.SaveSession(sessionRecord); err != nil {
		log.Printf("Failed to save session: %v", err)
	}

	// 处理 WebSocket 连接
	if err := handler.HandleWebSocket(ws); err != nil {
		log.Printf("WebSocket handler error: %v", err)
	}

	log.Printf("[%s] Session completed: %s", protocolType, sessionID)
}

// getHostInfo 获取主机信息（支持多种方式）
func (h *ProtocolHandler) getHostInfo(c *gin.Context) (*model.Host, error) {
	// 方式1：通过 hostId
	if hostID := c.Query("hostId"); hostID != "" {
		return h.hostRepo.FindByID(hostID)
	}

	// 方式2：通过 IP 地址
	if hostIP := c.Query("ip"); hostIP != "" {
		return h.hostRepo.FindByIP(hostIP)
	}

	// 方式3：通过主机名
	if hostName := c.Query("hostname"); hostName != "" {
		hosts, _, err := h.hostRepo.FindAll(1, 1, hostName, nil)
		if err != nil || len(hosts) == 0 {
			return nil, fmt.Errorf("host not found: %s", hostName)
		}
		return &hosts[0], nil
	}

	return nil, fmt.Errorf("hostId, ip or hostname is required")
}

// HandleSSH 处理 SSH 连接（保持向后兼容）
func (h *ProtocolHandler) HandleSSH(c *gin.Context) {
	c.Request.URL.RawQuery = c.Request.URL.RawQuery + "&protocol=ssh"
	h.HandleConnection(c)
}

// HandleRDP 处理 RDP 连接
func (h *ProtocolHandler) HandleRDP(c *gin.Context) {
	c.Request.URL.RawQuery = c.Request.URL.RawQuery + "&protocol=rdp"
	h.HandleConnection(c)
}
