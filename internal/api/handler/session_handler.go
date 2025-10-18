package handler

import (
	"net/http"
	"strconv"

	"github.com/fisker/zjump-backend/internal/model"
	"github.com/fisker/zjump-backend/internal/service"
	"github.com/gin-gonic/gin"
)

type SessionHandler struct {
	service *service.SessionService
}

func NewSessionHandler(service *service.SessionService) *SessionHandler {
	return &SessionHandler{service: service}
}

// ValidateToken 验证会话令牌（供 Proxy 调用）
func (h *SessionHandler) ValidateToken(c *gin.Context) {
	token := c.Query("token")
	if token == "" {
		c.JSON(http.StatusBadRequest, model.Error(400, "Missing token"))
		return
	}

	tokenInfo, err := service.ValidateSessionToken(token)
	if err != nil {
		c.JSON(http.StatusUnauthorized, model.Error(401, err.Error()))
		return
	}

	c.JSON(http.StatusOK, model.Success(gin.H{
		"hostId":   tokenInfo.HostID,
		"userId":   tokenInfo.UserID,
		"username": tokenInfo.Username,
	}))
}

func (h *SessionHandler) CreateSession(c *gin.Context) {
	var req struct {
		HostID string `json:"hostId" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, model.Error(400, err.Error()))
		return
	}

	// 从上下文获取用户ID（由认证中间件设置）
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, model.Error(401, "未找到用户信息"))
		return
	}

	resp, err := h.service.CreateSession(req.HostID, userID.(string))
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.Error(500, err.Error()))
		return
	}

	c.JSON(http.StatusOK, model.Success(resp))
}

func (h *SessionHandler) GetLoginRecords(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "10"))
	hostID := c.Query("hostId")

	// 获取当前用户信息
	userID, _ := c.Get("userID")

	// 所有用户（包括管理员）只能看自己的登录记录
	filterUserID := userID.(string)

	// 查询虚拟机登录记录（login_records 表，包括成功和失败的登录）
	records, total, err := h.service.GetLoginRecordsByUser(page, pageSize, hostID, filterUserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.Error(500, err.Error()))
		return
	}

	c.JSON(http.StatusOK, model.Success(gin.H{
		"records": records,
		"total":   total,
	}))
}

// ===== Session Recording Handlers =====

func (h *SessionHandler) GetSessionRecordings(c *gin.Context) {
	// 获取当前用户角色
	role, exists := c.Get("role")
	if !exists || role != "admin" {
		c.JSON(http.StatusForbidden, model.Error(403, "权限不足，仅管理员可访问会话审计"))
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "10"))
	search := c.Query("search")

	sessions, total, err := h.service.GetSessionRecordings(page, pageSize, search)
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.Error(500, err.Error()))
		return
	}

	c.JSON(http.StatusOK, model.Success(model.SessionRecordingsResponse{
		Sessions: sessions,
		Total:    total,
	}))
}

func (h *SessionHandler) GetSessionRecording(c *gin.Context) {
	sessionID := c.Param("sessionId")

	recording, err := h.service.GetSessionRecording(sessionID)
	if err != nil {
		c.JSON(http.StatusNotFound, model.Error(404, "会话录制不存在"))
		return
	}

	c.JSON(http.StatusOK, model.Success(recording))
}

func (h *SessionHandler) CreateSessionRecording(c *gin.Context) {
	var recording model.SessionRecording
	if err := c.ShouldBindJSON(&recording); err != nil {
		c.JSON(http.StatusBadRequest, model.Error(400, err.Error()))
		return
	}

	if err := h.service.CreateSessionRecording(&recording); err != nil {
		c.JSON(http.StatusInternalServerError, model.Error(500, err.Error()))
		return
	}

	c.JSON(http.StatusOK, model.Success(recording))
}

// ===== Command Record Handlers =====
// 使用 command_histories 表（从 linux-proxy 同步的数据）

func (h *SessionHandler) GetCommandRecords(c *gin.Context) {
	// 获取当前用户角色
	role, exists := c.Get("role")
	if !exists || role != "admin" {
		c.JSON(http.StatusForbidden, model.Error(403, "权限不足，仅管理员可访问命令审计"))
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "10"))
	search := c.Query("search")
	hostFilter := c.DefaultQuery("host", "all")

	commands, total, err := h.service.GetCommandRecords(page, pageSize, search, hostFilter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.Error(500, err.Error()))
		return
	}

	c.JSON(http.StatusOK, model.Success(model.CommandRecordsResponse{
		Commands: commands,
		Total:    total,
	}))
}

func (h *SessionHandler) CreateCommandRecord(c *gin.Context) {
	var record model.CommandRecord
	if err := c.ShouldBindJSON(&record); err != nil {
		c.JSON(http.StatusBadRequest, model.Error(400, err.Error()))
		return
	}

	if err := h.service.CreateCommandRecord(&record); err != nil {
		c.JSON(http.StatusInternalServerError, model.Error(500, err.Error()))
		return
	}

	c.JSON(http.StatusOK, model.Success(record))
}

func (h *SessionHandler) GetCommandsBySession(c *gin.Context) {
	sessionID := c.Param("sessionId")

	commands, err := h.service.GetCommandsBySession(sessionID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.Error(500, err.Error()))
		return
	}

	c.JSON(http.StatusOK, model.Success(commands))
}

// TerminateSession 终止会话
func (h *SessionHandler) TerminateSession(c *gin.Context) {
	sessionID := c.Param("sessionId")

	if err := h.service.TerminateSession(sessionID); err != nil {
		c.JSON(http.StatusInternalServerError, model.Error(500, err.Error()))
		return
	}

	c.JSON(http.StatusOK, model.Success(gin.H{
		"message": "会话已成功终止",
	}))
}
