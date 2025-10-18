package handler

import (
	"net/http"
	"strconv"

	"github.com/fisker/zjump-backend/internal/model"
	"github.com/fisker/zjump-backend/internal/service"
	"github.com/gin-gonic/gin"
)

type DashboardHandler struct {
	hostService    *service.HostService
	sessionService *service.SessionService
}

func NewDashboardHandler(hostService *service.HostService, sessionService *service.SessionService) *DashboardHandler {
	return &DashboardHandler{
		hostService:    hostService,
		sessionService: sessionService,
	}
}

// GetFrequentHosts 获取用户的常用主机
func (h *DashboardHandler) GetFrequentHosts(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "5"))

	// 获取当前用户信息
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, model.Error(401, "未授权"))
		return
	}

	// 获取用户最常用的主机
	hosts, err := h.hostService.GetUserFrequentHosts(userID.(string), limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.Error(500, err.Error()))
		return
	}

	// Note: Host 模型已不再包含敏感认证信息（Password, PrivateKey）
	// 这些字段已移至 SystemUser，由权限系统管理

	c.JSON(http.StatusOK, model.Success(hosts))
}

func (h *DashboardHandler) GetStats(c *gin.Context) {
	// 获取当前用户信息
	userID, _ := c.Get("userID")
	role, _ := c.Get("role")

	var stats *model.DashboardStats
	var err error

	// 管理员查看全部数据，普通用户只查看自己的数据
	if role == "admin" {
		stats, err = h.hostService.GetDashboardStats()
	} else {
		stats, err = h.hostService.GetUserDashboardStats(userID.(string))
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, model.Error(500, err.Error()))
		return
	}

	// 获取最近24小时的登录次数（所有用户只看自己的）
	recentLogins, err := h.sessionService.GetRecentLoginsCount(24, userID.(string))
	if err == nil {
		stats.RecentLogins = int(recentLogins)
	}

	c.JSON(http.StatusOK, model.Success(stats))
}

func (h *DashboardHandler) GetRecentLogins(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))

	// 获取当前用户信息
	userID, _ := c.Get("userID")

	// 所有用户（包括管理员）只能看自己的登录记录
	records, err := h.sessionService.GetRecentLogins(limit, userID.(string))

	if err != nil {
		c.JSON(http.StatusInternalServerError, model.Error(500, err.Error()))
		return
	}

	c.JSON(http.StatusOK, model.Success(records))
}
