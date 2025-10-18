package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/fisker/zjump-backend/internal/approval"
	"github.com/fisker/zjump-backend/internal/model"
)

// ApprovalHandler 审批处理器
type ApprovalHandler struct {
	db      *gorm.DB
	factory *approval.Factory
}

// NewApprovalHandler 创建审批处理器
func NewApprovalHandler(db *gorm.DB, factory *approval.Factory) *ApprovalHandler {
	return &ApprovalHandler{
		db:      db,
		factory: factory,
	}
}

// ListApprovals 获取审批列表
func (h *ApprovalHandler) ListApprovals(c *gin.Context) {
	userID := c.Query("user_id")
	status := c.Query("status")
	approvalType := c.Query("type")
	role := c.Query("role") // my: 我的申请, approve: 待我审批, all: 全部

	query := h.db.Model(&model.Approval{})

	// 根据角色过滤
	if role == "my" && userID != "" {
		query = query.Where("applicant_id = ?", userID)
	} else if role == "approve" && userID != "" {
		// 查询待当前用户审批的工单 (MySQL兼容方式)
		// approver_ids 存储为 JSON 数组格式，如: ["id1","id2"]
		query = query.Where("status = ? AND JSON_CONTAINS(approver_ids, ?)", model.ApprovalStatusPending, fmt.Sprintf(`"%s"`, userID))
	}

	if status != "" {
		query = query.Where("status = ?", status)
	}

	if approvalType != "" {
		query = query.Where("type = ?", approvalType)
	}

	var approvals []model.Approval
	if err := query.Order("created_at DESC").Preload("Applicant").Find(&approvals).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "获取审批列表失败",
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "success",
		"data": gin.H{
			"approvals": approvals,
			"total":     len(approvals),
		},
	})
}

// GetApproval 获取审批详情
func (h *ApprovalHandler) GetApproval(c *gin.Context) {
	id := c.Param("id")

	var approval model.Approval
	if err := h.db.Preload("Applicant").First(&approval, "id = ?", id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{
				"code":    404,
				"message": "审批不存在",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "获取审批详情失败",
			"error":   err.Error(),
		})
		return
	}

	// 获取审批历史
	var comments []model.ApprovalComment
	h.db.Where("approval_id = ?", id).Order("created_at ASC").Find(&comments)

	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "success",
		"data": gin.H{
			"approval": approval,
			"comments": comments,
		},
	})
}

// CreateApproval 创建审批
func (h *ApprovalHandler) CreateApproval(c *gin.Context) {
	var req model.Approval

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "请求参数错误",
			"error":   err.Error(),
		})
		return
	}

	// 验证必填字段
	if req.Title == "" || req.Type == "" || req.ApplicantID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "标题、类型、申请人不能为空",
		})
		return
	}

	// 生成ID和时间戳
	req.ID = uuid.New().String()
	now := time.Now()
	req.CreatedAt = now
	req.UpdatedAt = now
	req.Status = model.ApprovalStatusPending

	// 验证必须使用第三方审批平台
	if req.Platform == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "必须选择第三方审批平台（飞书、钉钉、企业微信等）",
		})
		return
	}

	// 计算过期时间
	if req.Duration > 0 {
		expiresAt := now.Add(time.Duration(req.Duration) * time.Hour)
		req.ExpiresAt = &expiresAt
	}

	// 创建第三方审批单
	provider, ok := h.factory.GetProvider(req.Platform)
	if !ok {
		// 第三方审批平台功能开发中
		var platformName string
		switch req.Platform {
		case model.ApprovalPlatformFeishu:
			platformName = "飞书"
		case model.ApprovalPlatformDingtalk:
			platformName = "钉钉"
		case model.ApprovalPlatformWeChat:
			platformName = "企业微信"
		default:
			platformName = string(req.Platform)
		}

		c.JSON(http.StatusNotImplemented, gin.H{
			"code":    501,
			"message": fmt.Sprintf("%s审批集成功能开发中，敬请期待！", platformName),
			"detail":  fmt.Sprintf("目前 %s 审批平台的集成功能正在开发中，请联系管理员或等待后续版本更新", platformName),
		})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	externalID, err := provider.CreateApproval(ctx, &req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "创建外部审批单失败",
			"error":   err.Error(),
		})
		return
	}

	req.ExternalID = externalID
	// 构建外部链接
	switch req.Platform {
	case model.ApprovalPlatformFeishu:
		req.ExternalURL = fmt.Sprintf("https://www.feishu.cn/approval/instance/%s", externalID)
	case model.ApprovalPlatformDingtalk:
		req.ExternalURL = fmt.Sprintf("https://aflow.dingtalk.com/dingtalk/mobile/homepage.htm?corpid=&lwp_as=1&procInstId=%s", externalID)
	}

	// 保存到数据库
	if err := h.db.Create(&req).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "创建审批失败",
			"error":   err.Error(),
		})
		return
	}

	// 添加提交记录
	comment := model.ApprovalComment{
		ID:         uuid.New().String(),
		ApprovalID: req.ID,
		UserID:     req.ApplicantID,
		UserName:   req.ApplicantName,
		Action:     "submit",
		Comment:    "提交审批申请",
		CreatedAt:  now,
	}
	h.db.Create(&comment)

	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "创建成功",
		"data":    req,
	})
}

// ApproveApproval 批准审批
func (h *ApprovalHandler) ApproveApproval(c *gin.Context) {
	id := c.Param("id")

	var req struct {
		ApproverID   string `json:"approver_id" binding:"required"`
		ApproverName string `json:"approver_name"`
		Comment      string `json:"comment"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "请求参数错误",
			"error":   err.Error(),
		})
		return
	}

	var approval model.Approval
	if err := h.db.First(&approval, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    404,
			"message": "审批不存在",
		})
		return
	}

	if approval.Status != model.ApprovalStatusPending {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "审批已处理，无法再次批准",
		})
		return
	}

	// 更新审批状态
	now := time.Now()
	approval.Status = model.ApprovalStatusApproved
	approval.ApprovedAt = &now
	approval.ApprovalNote = req.Comment
	approval.CurrentApprover = req.ApproverName
	approval.UpdatedAt = now

	if err := h.db.Save(&approval).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "批准失败",
			"error":   err.Error(),
		})
		return
	}

	// 添加批准记录
	comment := model.ApprovalComment{
		ID:         uuid.New().String(),
		ApprovalID: approval.ID,
		UserID:     req.ApproverID,
		UserName:   req.ApproverName,
		Action:     "approve",
		Comment:    req.Comment,
		CreatedAt:  now,
	}
	h.db.Create(&comment)

	// TODO: 执行权限授予操作
	// h.grantPermissions(&approval)

	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "批准成功",
		"data":    approval,
	})
}

// RejectApproval 拒绝审批
func (h *ApprovalHandler) RejectApproval(c *gin.Context) {
	id := c.Param("id")

	var req struct {
		ApproverID   string `json:"approver_id" binding:"required"`
		ApproverName string `json:"approver_name"`
		Reason       string `json:"reason" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "请求参数错误",
			"error":   err.Error(),
		})
		return
	}

	var approval model.Approval
	if err := h.db.First(&approval, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    404,
			"message": "审批不存在",
		})
		return
	}

	if approval.Status != model.ApprovalStatusPending {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "审批已处理，无法再次拒绝",
		})
		return
	}

	// 更新审批状态
	now := time.Now()
	approval.Status = model.ApprovalStatusRejected
	approval.RejectedAt = &now
	approval.RejectReason = req.Reason
	approval.CurrentApprover = req.ApproverName
	approval.UpdatedAt = now

	if err := h.db.Save(&approval).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "拒绝失败",
			"error":   err.Error(),
		})
		return
	}

	// 添加拒绝记录
	comment := model.ApprovalComment{
		ID:         uuid.New().String(),
		ApprovalID: approval.ID,
		UserID:     req.ApproverID,
		UserName:   req.ApproverName,
		Action:     "reject",
		Comment:    req.Reason,
		CreatedAt:  now,
	}
	h.db.Create(&comment)

	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "已拒绝",
		"data":    approval,
	})
}

// CancelApproval 取消审批
func (h *ApprovalHandler) CancelApproval(c *gin.Context) {
	id := c.Param("id")

	var req struct {
		UserID string `json:"user_id" binding:"required"`
		Reason string `json:"reason"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "请求参数错误",
			"error":   err.Error(),
		})
		return
	}

	var approval model.Approval
	if err := h.db.First(&approval, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    404,
			"message": "审批不存在",
		})
		return
	}

	// 只有申请人可以取消
	if approval.ApplicantID != req.UserID {
		c.JSON(http.StatusForbidden, gin.H{
			"code":    403,
			"message": "无权取消此审批",
		})
		return
	}

	if approval.Status != model.ApprovalStatusPending {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "只能取消待审批的工单",
		})
		return
	}

	// 取消第三方审批工单
	if approval.ExternalID != "" {
		provider, ok := h.factory.GetProvider(approval.Platform)
		if ok {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			provider.CancelApproval(ctx, approval.ExternalID)
		}
	}

	// 更新状态
	now := time.Now()
	approval.Status = model.ApprovalStatusCanceled
	approval.UpdatedAt = now

	if err := h.db.Save(&approval).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "取消失败",
			"error":   err.Error(),
		})
		return
	}

	// 添加取消记录
	comment := model.ApprovalComment{
		ID:         uuid.New().String(),
		ApprovalID: approval.ID,
		UserID:     req.UserID,
		Action:     "cancel",
		Comment:    req.Reason,
		CreatedAt:  now,
	}
	h.db.Create(&comment)

	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "已取消",
		"data":    approval,
	})
}

// AddComment 添加评论
func (h *ApprovalHandler) AddComment(c *gin.Context) {
	id := c.Param("id")

	var req struct {
		UserID   string `json:"user_id" binding:"required"`
		UserName string `json:"user_name"`
		Comment  string `json:"comment" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "请求参数错误",
			"error":   err.Error(),
		})
		return
	}

	// 检查审批是否存在
	var approval model.Approval
	if err := h.db.First(&approval, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    404,
			"message": "审批不存在",
		})
		return
	}

	// 添加评论
	comment := model.ApprovalComment{
		ID:         uuid.New().String(),
		ApprovalID: id,
		UserID:     req.UserID,
		UserName:   req.UserName,
		Action:     "comment",
		Comment:    req.Comment,
		CreatedAt:  time.Now(),
	}

	if err := h.db.Create(&comment).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "添加评论失败",
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "评论成功",
		"data":    comment,
	})
}

// SearchUsers 搜索用户（用于审批人选择）
func (h *ApprovalHandler) SearchUsers(c *gin.Context) {
	keyword := c.Query("keyword")

	// 允许空关键字，返回空列表
	if keyword == "" {
		c.JSON(http.StatusOK, gin.H{
			"code":    0,
			"message": "success",
			"data": gin.H{
				"users": []model.User{},
			},
		})
		return
	}

	var users []model.User
	query := h.db.Model(&model.User{}).Where("status = ?", "active")

	// 搜索用户名、邮箱、全名
	keyword = "%" + keyword + "%"
	query = query.Where("username LIKE ? OR email LIKE ? OR full_name LIKE ?",
		keyword, keyword, keyword)

	// 限制返回数量，按用户名排序
	query = query.Order("username ASC").Limit(50)

	if err := query.Find(&users).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "搜索用户失败",
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "success",
		"data": gin.H{
			"users": users,
		},
	})
}

// SearchHosts 搜索主机（用于资源选择）
func (h *ApprovalHandler) SearchHosts(c *gin.Context) {
	keyword := c.Query("keyword")

	// 允许空关键字，返回空列表
	if keyword == "" {
		c.JSON(http.StatusOK, gin.H{
			"code":    0,
			"message": "success",
			"data": gin.H{
				"hosts": []model.Host{},
			},
		})
		return
	}

	var hosts []model.Host
	query := h.db.Model(&model.Host{})

	// 搜索主机名或IP地址
	keyword = "%" + keyword + "%"
	query = query.Where("name LIKE ? OR ip LIKE ?", keyword, keyword)

	// 限制返回数量，按名称排序
	query = query.Order("name ASC").Limit(50)

	if err := query.Find(&hosts).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "搜索主机失败",
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "success",
		"data": gin.H{
			"hosts": hosts,
		},
	})
}

// GetApprovalStats 获取审批统计
func (h *ApprovalHandler) GetApprovalStats(c *gin.Context) {
	userID := c.Query("user_id")

	stats := gin.H{}

	// 我的申请统计
	if userID != "" {
		var myStats struct {
			Total    int64
			Pending  int64
			Approved int64
			Rejected int64
		}

		h.db.Model(&model.Approval{}).Where("applicant_id = ?", userID).Count(&myStats.Total)
		h.db.Model(&model.Approval{}).Where("applicant_id = ? AND status = ?", userID, model.ApprovalStatusPending).Count(&myStats.Pending)
		h.db.Model(&model.Approval{}).Where("applicant_id = ? AND status = ?", userID, model.ApprovalStatusApproved).Count(&myStats.Approved)
		h.db.Model(&model.Approval{}).Where("applicant_id = ? AND status = ?", userID, model.ApprovalStatusRejected).Count(&myStats.Rejected)

		stats["my_approvals"] = myStats

		// 待我审批统计 (MySQL兼容方式)
		var pendingCount int64
		h.db.Model(&model.Approval{}).Where("status = ? AND JSON_CONTAINS(approver_ids, ?)", model.ApprovalStatusPending, fmt.Sprintf(`"%s"`, userID)).Count(&pendingCount)
		stats["pending_approvals"] = pendingCount
	}

	// 全局统计（管理员）
	var globalStats struct {
		Total    int64
		Pending  int64
		Approved int64
		Rejected int64
	}

	h.db.Model(&model.Approval{}).Count(&globalStats.Total)
	h.db.Model(&model.Approval{}).Where("status = ?", model.ApprovalStatusPending).Count(&globalStats.Pending)
	h.db.Model(&model.Approval{}).Where("status = ?", model.ApprovalStatusApproved).Count(&globalStats.Approved)
	h.db.Model(&model.Approval{}).Where("status = ?", model.ApprovalStatusRejected).Count(&globalStats.Rejected)

	stats["global"] = globalStats

	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "success",
		"data":    stats,
	})
}

// HandleCallback 处理第三方平台回调
func (h *ApprovalHandler) HandleCallback(c *gin.Context) {
	platform := c.Param("platform")

	provider, ok := h.factory.GetProvider(model.ApprovalPlatform(platform))
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "不支持的审批平台",
		})
		return
	}

	var callbackData map[string]interface{}
	if err := c.ShouldBindJSON(&callbackData); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "回调数据格式错误",
			"error":   err.Error(),
		})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	result, err := provider.HandleCallback(ctx, callbackData)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "处理回调失败",
			"error":   err.Error(),
		})
		return
	}

	// 更新审批状态
	var approval model.Approval
	if err := h.db.Where("external_id = ?", result.ApprovalID).First(&approval).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    404,
			"message": "审批不存在",
		})
		return
	}

	now := time.Now()
	approval.Status = result.Status
	approval.CurrentApprover = result.ApproverName
	approval.UpdatedAt = now

	if result.Status == model.ApprovalStatusApproved {
		approval.ApprovedAt = &now
		approval.ApprovalNote = result.Comment
	} else if result.Status == model.ApprovalStatusRejected {
		approval.RejectedAt = &now
		approval.RejectReason = result.Comment
	}

	h.db.Save(&approval)

	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "处理成功",
	})
}

// GetApprovalConfig 获取审批配置
func (h *ApprovalHandler) GetApprovalConfig(c *gin.Context) {
	var configs []model.ApprovalConfig

	if err := h.db.Order("created_at DESC").Find(&configs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "获取配置失败",
			"error":   err.Error(),
		})
		return
	}

	// 支持的平台列表
	platforms := []string{"feishu", "dingtalk", "wechat"}

	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "success",
		"data": gin.H{
			"configs":   configs,
			"platforms": platforms,
		},
	})
}

// UpdateApprovalConfig 更新审批配置
func (h *ApprovalHandler) UpdateApprovalConfig(c *gin.Context) {
	id := c.Param("id")

	var req model.ApprovalConfig
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "请求参数错误",
			"error":   err.Error(),
		})
		return
	}

	// 验证必填字段
	if req.Name == "" || req.Type == "" || req.AppID == "" || req.AppSecret == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "配置名称、平台类型、应用ID和应用密钥不能为空",
		})
		return
	}

	// 验证平台类型
	if req.Type != "feishu" && req.Type != "dingtalk" && req.Type != "wechat" {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "不支持的平台类型",
		})
		return
	}

	// 验证表单字段格式
	if req.FormFields != "" {
		var fields interface{}
		if err := json.Unmarshal([]byte(req.FormFields), &fields); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"code":    400,
				"message": "表单字段格式错误，必须是有效的JSON",
				"error":   err.Error(),
			})
			return
		}
	}

	if id == "" {
		// 创建新配置
		req.ID = uuid.New().String()
		req.CreatedAt = time.Now()
		req.UpdatedAt = time.Now()

		if err := h.db.Create(&req).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"code":    500,
				"message": "创建配置失败",
				"error":   err.Error(),
			})
			return
		}
	} else {
		// 更新配置
		req.UpdatedAt = time.Now()
		// 使用 Save 而不是 Updates，以确保所有字段都被更新（包括零值字段）
		req.ID = id
		if err := h.db.Save(&req).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"code":    500,
				"message": "更新配置失败",
				"error":   err.Error(),
			})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "保存成功",
		"data":    req,
	})
}

// DeleteApprovalConfig 删除审批配置
func (h *ApprovalHandler) DeleteApprovalConfig(c *gin.Context) {
	id := c.Param("id")

	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    400,
			"message": "配置ID不能为空",
		})
		return
	}

	// 检查配置是否存在
	var config model.ApprovalConfig
	if err := h.db.First(&config, "id = ?", id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{
				"code":    404,
				"message": "配置不存在",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "查询配置失败",
			"error":   err.Error(),
		})
		return
	}

	// 删除配置
	if err := h.db.Delete(&model.ApprovalConfig{}, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "删除配置失败",
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "删除成功",
	})
}
