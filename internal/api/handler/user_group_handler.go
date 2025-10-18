package handler

import (
	"net/http"

	"github.com/fisker/zjump-backend/internal/model"
	"github.com/fisker/zjump-backend/internal/repository"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type UserGroupHandler struct {
	repo *repository.UserGroupRepository
}

func NewUserGroupHandler(repo *repository.UserGroupRepository) *UserGroupHandler {
	return &UserGroupHandler{repo: repo}
}

// ListUserGroups 获取用户组列表
// @Summary 获取用户组列表
// @Tags user-groups
// @Produce json
// @Param withMembers query boolean false "Include members"
// @Success 200 {object} model.Response
// @Router /api/user-groups [get]
func (h *UserGroupHandler) ListUserGroups(c *gin.Context) {
	withMembers := c.Query("withMembers") == "true"

	if withMembers {
		groups, err := h.repo.FindAllWithMembers()
		if err != nil {
			c.JSON(http.StatusInternalServerError, model.Response{
				Code:    http.StatusInternalServerError,
				Message: "Failed to fetch user groups",
				Data:    nil,
			})
			return
		}

		c.JSON(http.StatusOK, model.Response{
			Code:    http.StatusOK,
			Message: "Success",
			Data:    groups,
		})
	} else {
		groups, err := h.repo.FindAll()
		if err != nil {
			c.JSON(http.StatusInternalServerError, model.Response{
				Code:    http.StatusInternalServerError,
				Message: "Failed to fetch user groups",
				Data:    nil,
			})
			return
		}

		c.JSON(http.StatusOK, model.Response{
			Code:    http.StatusOK,
			Message: "Success",
			Data:    groups,
		})
	}
}

// GetUserGroup 获取单个用户组
// @Summary 获取单个用户组
// @Tags user-groups
// @Produce json
// @Param id path string true "User Group ID"
// @Param withMembers query boolean false "Include members"
// @Success 200 {object} model.Response
// @Router /api/user-groups/{id} [get]
func (h *UserGroupHandler) GetUserGroup(c *gin.Context) {
	id := c.Param("id")
	withMembers := c.Query("withMembers") == "true"

	if withMembers {
		group, err := h.repo.FindByIDWithMembers(id)
		if err != nil {
			c.JSON(http.StatusNotFound, model.Response{
				Code:    http.StatusNotFound,
				Message: "User group not found",
				Data:    nil,
			})
			return
		}

		c.JSON(http.StatusOK, model.Response{
			Code:    http.StatusOK,
			Message: "Success",
			Data:    group,
		})
	} else {
		group, err := h.repo.FindByID(id)
		if err != nil {
			c.JSON(http.StatusNotFound, model.Response{
				Code:    http.StatusNotFound,
				Message: "User group not found",
				Data:    nil,
			})
			return
		}

		c.JSON(http.StatusOK, model.Response{
			Code:    http.StatusOK,
			Message: "Success",
			Data:    group,
		})
	}
}

// CreateUserGroup 创建用户组
// @Summary 创建用户组
// @Tags user-groups
// @Accept json
// @Produce json
// @Param group body model.UserGroup true "User Group"
// @Success 200 {object} model.Response
// @Router /api/user-groups [post]
func (h *UserGroupHandler) CreateUserGroup(c *gin.Context) {
	var group model.UserGroup
	if err := c.ShouldBindJSON(&group); err != nil {
		c.JSON(http.StatusBadRequest, model.Response{
			Code:    http.StatusBadRequest,
			Message: "Invalid request body",
			Data:    nil,
		})
		return
	}

	// 生成ID
	group.ID = uuid.New().String()

	// 获取当前用户ID
	if userID, exists := c.Get("userID"); exists {
		group.CreatedBy = userID.(string)
	}

	if err := h.repo.Create(&group); err != nil {
		c.JSON(http.StatusInternalServerError, model.Response{
			Code:    http.StatusInternalServerError,
			Message: "Failed to create user group",
			Data:    nil,
		})
		return
	}

	c.JSON(http.StatusOK, model.Response{
		Code:    http.StatusOK,
		Message: "User group created successfully",
		Data:    group,
	})
}

// UpdateUserGroup 更新用户组
// @Summary 更新用户组
// @Tags user-groups
// @Accept json
// @Produce json
// @Param id path string true "User Group ID"
// @Param group body model.UserGroup true "User Group"
// @Success 200 {object} model.Response
// @Router /api/user-groups/{id} [put]
func (h *UserGroupHandler) UpdateUserGroup(c *gin.Context) {
	id := c.Param("id")

	var group model.UserGroup
	if err := c.ShouldBindJSON(&group); err != nil {
		c.JSON(http.StatusBadRequest, model.Response{
			Code:    http.StatusBadRequest,
			Message: "Invalid request body",
			Data:    nil,
		})
		return
	}

	group.ID = id

	if err := h.repo.Update(&group); err != nil {
		c.JSON(http.StatusInternalServerError, model.Response{
			Code:    http.StatusInternalServerError,
			Message: "Failed to update user group",
			Data:    nil,
		})
		return
	}

	c.JSON(http.StatusOK, model.Response{
		Code:    http.StatusOK,
		Message: "User group updated successfully",
		Data:    group,
	})
}

// DeleteUserGroup 删除用户组
// @Summary 删除用户组
// @Tags user-groups
// @Produce json
// @Param id path string true "User Group ID"
// @Success 200 {object} model.Response
// @Router /api/user-groups/{id} [delete]
func (h *UserGroupHandler) DeleteUserGroup(c *gin.Context) {
	id := c.Param("id")

	if err := h.repo.Delete(id); err != nil {
		c.JSON(http.StatusInternalServerError, model.Response{
			Code:    http.StatusInternalServerError,
			Message: "Failed to delete user group",
			Data:    nil,
		})
		return
	}

	c.JSON(http.StatusOK, model.Response{
		Code:    http.StatusOK,
		Message: "User group deleted successfully",
		Data:    nil,
	})
}

// GetUserGroupMembers 获取用户组成员
// @Summary 获取用户组成员
// @Tags user-groups
// @Produce json
// @Param id path string true "User Group ID"
// @Success 200 {object} model.Response
// @Router /api/user-groups/{id}/members [get]
func (h *UserGroupHandler) GetUserGroupMembers(c *gin.Context) {
	id := c.Param("id")

	members, err := h.repo.GetMembersByGroupID(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.Response{
			Code:    http.StatusInternalServerError,
			Message: "Failed to fetch members",
			Data:    nil,
		})
		return
	}

	c.JSON(http.StatusOK, model.Response{
		Code:    http.StatusOK,
		Message: "Success",
		Data:    members,
	})
}

// AddUserGroupMember 添加用户到用户组
// @Summary 添加用户到用户组
// @Tags user-groups
// @Accept json
// @Produce json
// @Param id path string true "User Group ID"
// @Param request body map[string]string true "Request body with userId"
// @Success 200 {object} model.Response
// @Router /api/user-groups/{id}/members [post]
func (h *UserGroupHandler) AddUserGroupMember(c *gin.Context) {
	id := c.Param("id")

	var req struct {
		UserID string `json:"userId" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, model.Response{
			Code:    http.StatusBadRequest,
			Message: "Invalid request body",
			Data:    nil,
		})
		return
	}

	// 获取当前用户ID（作为操作人）
	addedBy := ""
	if userID, exists := c.Get("userID"); exists {
		addedBy = userID.(string)
	}

	if err := h.repo.AddMember(id, req.UserID, addedBy); err != nil {
		c.JSON(http.StatusInternalServerError, model.Response{
			Code:    http.StatusInternalServerError,
			Message: "Failed to add member",
			Data:    nil,
		})
		return
	}

	c.JSON(http.StatusOK, model.Response{
		Code:    http.StatusOK,
		Message: "Member added successfully",
		Data:    nil,
	})
}

// RemoveUserGroupMember 从用户组移除用户
// @Summary 从用户组移除用户
// @Tags user-groups
// @Produce json
// @Param id path string true "User Group ID"
// @Param userId path string true "User ID"
// @Success 200 {object} model.Response
// @Router /api/user-groups/{id}/members/{userId} [delete]
func (h *UserGroupHandler) RemoveUserGroupMember(c *gin.Context) {
	id := c.Param("id")
	userID := c.Param("userId")

	if err := h.repo.RemoveMember(id, userID); err != nil {
		c.JSON(http.StatusInternalServerError, model.Response{
			Code:    http.StatusInternalServerError,
			Message: "Failed to remove member",
			Data:    nil,
		})
		return
	}

	c.JSON(http.StatusOK, model.Response{
		Code:    http.StatusOK,
		Message: "Member removed successfully",
		Data:    nil,
	})
}

// BatchAddMembers 批量添加成员
// @Summary 批量添加成员
// @Tags user-groups
// @Accept json
// @Produce json
// @Param id path string true "User Group ID"
// @Param request body map[string][]string true "Request body with userIds"
// @Success 200 {object} model.Response
// @Router /api/user-groups/{id}/members/batch [post]
func (h *UserGroupHandler) BatchAddMembers(c *gin.Context) {
	id := c.Param("id")

	var req struct {
		UserIDs []string `json:"userIds" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, model.Response{
			Code:    http.StatusBadRequest,
			Message: "Invalid request body",
			Data:    nil,
		})
		return
	}

	// 获取当前用户ID（作为操作人）
	addedBy := ""
	if userID, exists := c.Get("userID"); exists {
		addedBy = userID.(string)
	}

	if err := h.repo.BatchAddMembers(id, req.UserIDs, addedBy); err != nil {
		c.JSON(http.StatusInternalServerError, model.Response{
			Code:    http.StatusInternalServerError,
			Message: "Failed to add members",
			Data:    nil,
		})
		return
	}

	c.JSON(http.StatusOK, model.Response{
		Code:    http.StatusOK,
		Message: "Members added successfully",
		Data:    nil,
	})
}

// GetUserGroups 获取用户所在的所有用户组
// @Summary 获取用户所在的所有用户组
// @Tags user-groups
// @Produce json
// @Param userId query string true "User ID"
// @Success 200 {object} model.Response
// @Router /api/user-groups/by-user [get]
func (h *UserGroupHandler) GetUserGroups(c *gin.Context) {
	userID := c.Query("userId")
	if userID == "" {
		c.JSON(http.StatusBadRequest, model.Response{
			Code:    http.StatusBadRequest,
			Message: "Missing userId parameter",
			Data:    nil,
		})
		return
	}

	groups, err := h.repo.GetGroupsByUserID(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.Response{
			Code:    http.StatusInternalServerError,
			Message: "Failed to fetch user groups",
			Data:    nil,
		})
		return
	}

	c.JSON(http.StatusOK, model.Response{
		Code:    http.StatusOK,
		Message: "Success",
		Data:    groups,
	})
}
