package repository

import (
	"fmt"
	"time"

	"github.com/fisker/zjump-backend/internal/model"
	"gorm.io/gorm"
)

type UserRepository struct {
	db *gorm.DB
}

func NewUserRepository(db *gorm.DB) *UserRepository {
	return &UserRepository{db: db}
}

// ===== User Methods =====

func (r *UserRepository) CreateUser(user *model.User) error {
	return r.db.Create(user).Error
}

func (r *UserRepository) FindUserByUsername(username string) (*model.User, error) {
	var users []model.User
	result := r.db.Where("username = ?", username).Find(&users)
	if result.Error != nil {
		return nil, result.Error
	}
	if len(users) == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return &users[0], nil
}

func (r *UserRepository) FindUserByEmail(email string) (*model.User, error) {
	var users []model.User
	result := r.db.Where("email = ?", email).Find(&users)
	if result.Error != nil {
		return nil, result.Error
	}
	if len(users) == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return &users[0], nil
}

func (r *UserRepository) FindUserByID(id string) (*model.User, error) {
	var user model.User
	err := r.db.Where("id = ?", id).First(&user).Error
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *UserRepository) UpdateUser(user *model.User) error {
	return r.db.Save(user).Error
}

func (r *UserRepository) UpdateUserLastLogin(userID string, loginTime time.Time, loginIP string) error {
	return r.db.Model(&model.User{}).
		Where("id = ?", userID).
		Updates(map[string]interface{}{
			"last_login_time": loginTime,
			"last_login_ip":   loginIP,
		}).Error
}

func (r *UserRepository) FindAllUsers() ([]model.User, error) {
	var users []model.User
	err := r.db.Select("id, username, email, full_name, role, status, created_at").
		Where("status = ?", "active").
		Order("username ASC").
		Find(&users).Error
	if err != nil {
		return nil, err
	}
	return users, nil
}

// ===== Platform Login Record Methods =====

func (r *UserRepository) CreatePlatformLoginRecord(record *model.PlatformLoginRecord) error {
	return r.db.Create(record).Error
}

func (r *UserRepository) FindPlatformLoginRecords(page, pageSize int, userID string) ([]model.PlatformLoginRecord, int64, error) {
	var records []model.PlatformLoginRecord
	var total int64

	query := r.db.Model(&model.PlatformLoginRecord{})

	if userID != "" {
		query = query.Where("user_id = ?", userID)
	}

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * pageSize
	err := query.Offset(offset).Limit(pageSize).Order("login_time DESC").Find(&records).Error

	return records, total, err
}

func (r *UserRepository) UpdatePlatformLoginRecordLogout(recordID string) error {
	return r.db.Model(&model.PlatformLoginRecord{}).
		Where("id = ? AND status = ?", recordID, "active").
		Updates(map[string]interface{}{
			"status": "logged_out",
		}).Error
}

func (r *UserRepository) UpdatePlatformLoginRecordLogoutByUser(userID string) error {
	// 更新该用户最近的活跃登录记录
	return r.db.Model(&model.PlatformLoginRecord{}).
		Where("user_id = ? AND status = ?", userID, "active").
		Order("login_time DESC").
		Limit(1).
		Updates(map[string]interface{}{
			"status": "logged_out",
		}).Error
}

func (r *UserRepository) GetDB() *gorm.DB {
	return r.db
}

// ===== User Management Methods =====

// FindAllUsersWithPagination 分页获取所有用户
func (r *UserRepository) FindAllUsersWithPagination(page, pageSize int, keyword string) ([]model.User, int64, error) {
	var users []model.User
	var total int64

	query := r.db.Model(&model.User{})

	// 关键字搜索
	if keyword != "" {
		query = query.Where("username LIKE ? OR email LIKE ? OR full_name LIKE ?",
			"%"+keyword+"%", "%"+keyword+"%", "%"+keyword+"%")
	}

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * pageSize
	err := query.Offset(offset).Limit(pageSize).
		Order("created_at DESC").
		Find(&users).Error

	return users, total, err
}

// DeleteUser 删除用户（软删除，设置status为inactive）
func (r *UserRepository) DeleteUser(userID string) error {
	return r.db.Model(&model.User{}).
		Where("id = ?", userID).
		Update("status", "inactive").Error
}

// UpdateUserRole 更新用户角色
func (r *UserRepository) UpdateUserRole(userID, role string) error {
	return r.db.Model(&model.User{}).
		Where("id = ?", userID).
		Update("role", role).Error
}

// UpdateUserStatus 更新用户状态
func (r *UserRepository) UpdateUserStatus(userID, status string) error {
	return r.db.Model(&model.User{}).
		Where("id = ?", userID).
		Update("status", status).Error
}

// ===== User-Group Permission Methods =====

// AssignGroupsToUser 给用户分配分组权限
func (r *UserRepository) AssignGroupsToUser(userID string, groupIDs []string, createdBy string) error {
	// 新架构：用户与用户组关系存储在 user_group_members
	if err := r.db.Where("user_id = ?", userID).Delete(&model.UserGroupMember{}).Error; err != nil {
		return err
	}

	// 如果没有分组要分配，直接返回
	if len(groupIDs) == 0 {
		return nil
	}

	// 批量插入新成员关系
	members := make([]model.UserGroupMember, 0, len(groupIDs))
	for _, groupID := range groupIDs {
		members = append(members, model.UserGroupMember{
			UserID:      userID,
			UserGroupID: groupID,
			AddedBy:     createdBy,
		})
	}

	return r.db.Create(&members).Error
}

// GetUserGroups 获取用户有权限访问的分组ID列表
func (r *UserRepository) GetUserGroups(userID string) ([]string, error) {
	var members []model.UserGroupMember
	err := r.db.Where("user_id = ?", userID).Find(&members).Error
	if err != nil {
		return nil, err
	}

	groupIDs := make([]string, 0, len(members))
	for _, m := range members {
		groupIDs = append(groupIDs, m.UserGroupID)
	}

	return groupIDs, nil
}

// GetUserWithGroups 获取用户及其分组信息
func (r *UserRepository) GetUserWithGroups(userID string) (*model.UserWithGroups, error) {
	// 获取用户信息
	user, err := r.FindUserByID(userID)
	if err != nil {
		return nil, err
	}

	// 获取用户分组
	groupIDs, err := r.GetUserGroups(userID)
	if err != nil {
		return nil, err
	}

	return &model.UserWithGroups{
		User:     *user,
		GroupIDs: groupIDs,
	}, nil
}

// FindAllUsersWithGroups 获取所有用户及其分组信息（分页）
func (r *UserRepository) FindAllUsersWithGroups(page, pageSize int, keyword string) ([]model.UserWithGroups, int64, error) {
	// 获取用户列表
	users, total, err := r.FindAllUsersWithPagination(page, pageSize, keyword)
	if err != nil {
		return nil, 0, err
	}

	// 获取所有用户的分组信息
	usersWithGroups := make([]model.UserWithGroups, 0, len(users))
	for _, user := range users {
		groupIDs, err := r.GetUserGroups(user.ID)
		if err != nil {
			return nil, 0, err
		}

		usersWithGroups = append(usersWithGroups, model.UserWithGroups{
			User:     user,
			GroupIDs: groupIDs,
		})
	}

	return usersWithGroups, total, nil
}

// RemoveUserFromGroup 从分组中移除用户
func (r *UserRepository) RemoveUserFromGroup(userID, groupID string) error {
	return r.db.Where("user_id = ? AND user_group_id = ?", userID, groupID).
		Delete(&model.UserGroupMember{}).Error
}

// AddUserToGroup 将用户添加到分组
func (r *UserRepository) AddUserToGroup(userID, groupID, createdBy string) error {
	member := model.UserGroupMember{
		UserID:      userID,
		UserGroupID: groupID,
		AddedBy:     createdBy,
	}
	return r.db.Create(&member).Error
}

// GetUsersInGroup 获取有权限访问某个分组的所有用户
func (r *UserRepository) GetUsersInGroup(groupID string) ([]model.User, error) {
	// 新架构：
	// host_group -> permission_rules -> user_group_members -> users
	var users []model.User
	err := r.db.
		Distinct("users.*").
		Joins("JOIN user_group_members ugm ON users.id = ugm.user_id").
		Joins("JOIN permission_rules pr ON pr.user_group_id = ugm.user_group_id").
		Joins("JOIN permission_rule_host_groups prhg ON pr.id = prhg.permission_rule_id").
		Where("prhg.host_group_id = ?", groupID).
		Where("pr.enabled = ?", true).
		Find(&users).Error
	return users, err
}

// ===== User-Host Permission Methods =====

// AssignHostsToUser 给用户分配单个主机权限
func (r *UserRepository) AssignHostsToUser(userID string, hostIDs []string, createdBy string) error {
	// 旧表 user_host_permissions 已废弃，不再写入。
	_ = userID
	_ = hostIDs
	_ = createdBy
	return nil
}

// GetUserHosts 获取用户有权限访问的主机ID列表（单独授权的）
func (r *UserRepository) GetUserHosts(userID string) ([]string, error) {
	// 旧表 user_host_permissions 已废弃，单主机直授不再使用。
	_ = userID
	return []string{}, nil
}

// GetUserHostGroupIDs 获取用户通过授权规则有权限访问的主机组ID列表
func (r *UserRepository) GetUserHostGroupIDs(userID string) ([]string, error) {
	// 1. 获取用户所属的用户组ID列表
	var userGroupMembers []model.UserGroupMember
	err := r.db.Where("user_id = ?", userID).Find(&userGroupMembers).Error
	if err != nil {
		return nil, fmt.Errorf("failed to get user groups: %w", err)
	}

	if len(userGroupMembers) == 0 {
		return []string{}, nil
	}

	// 提取用户组ID
	userGroupIDs := make([]string, 0, len(userGroupMembers))
	for _, member := range userGroupMembers {
		userGroupIDs = append(userGroupIDs, member.UserGroupID)
	}

	// 2. 根据用户组ID查询有效的授权规则
	var permissionRules []struct {
		ID string `gorm:"column:id"`
	}
	now := time.Now()

	err = r.db.Table("permission_rules").
		Select("id").
		Where("user_group_id IN (?) AND enabled = ?", userGroupIDs, true).
		Where("(valid_from IS NULL OR valid_from <= ?) AND (valid_to IS NULL OR valid_to >= ?)", now, now).
		Find(&permissionRules).Error
	if err != nil {
		return nil, fmt.Errorf("failed to get permission rules: %w", err)
	}

	if len(permissionRules) == 0 {
		return []string{}, nil
	}

	// 提取授权规则ID
	ruleIDs := make([]string, 0, len(permissionRules))
	for _, rule := range permissionRules {
		ruleIDs = append(ruleIDs, rule.ID)
	}

	// 3. 从 permission_rule_host_groups 关联表中查询主机组ID
	var hostGroupRelations []struct {
		HostGroupID string `gorm:"column:host_group_id"`
	}
	err = r.db.Table("permission_rule_host_groups").
		Select("DISTINCT host_group_id").
		Where("permission_rule_id IN (?)", ruleIDs).
		Find(&hostGroupRelations).Error
	if err != nil {
		return nil, fmt.Errorf("failed to get host groups from rules: %w", err)
	}

	// 提取主机组ID（去重）
	hostGroupIDMap := make(map[string]bool)
	for _, rel := range hostGroupRelations {
		hostGroupIDMap[rel.HostGroupID] = true
	}

	hostGroupIDs := make([]string, 0, len(hostGroupIDMap))
	for id := range hostGroupIDMap {
		hostGroupIDs = append(hostGroupIDs, id)
	}

	return hostGroupIDs, nil
}

// AddUserToHost 将用户添加到单个主机权限
func (r *UserRepository) AddUserToHost(userID, hostID, createdBy string) error {
	_ = userID
	_ = hostID
	_ = createdBy
	return nil
}

// RemoveUserFromHost 从主机移除用户权限
func (r *UserRepository) RemoveUserFromHost(userID, hostID string) error {
	_ = userID
	_ = hostID
	return nil
}

// GetUserWithGroupsAndHosts 获取用户及其分组和主机权限信息
func (r *UserRepository) GetUserWithGroupsAndHosts(userID string) (*model.UserWithGroups, error) {
	// 获取用户信息
	user, err := r.FindUserByID(userID)
	if err != nil {
		return nil, err
	}

	// 获取用户分组
	groupIDs, err := r.GetUserGroups(userID)
	if err != nil {
		return nil, err
	}

	// 获取用户单独授权的主机
	hostIDs, err := r.GetUserHosts(userID)
	if err != nil {
		return nil, err
	}

	return &model.UserWithGroups{
		User:     *user,
		GroupIDs: groupIDs,
		HostIDs:  hostIDs,
	}, nil
}

// FindAllUsersWithGroupsAndHosts 获取所有用户及其分组和主机信息（分页）
func (r *UserRepository) FindAllUsersWithGroupsAndHosts(page, pageSize int, keyword string) ([]model.UserWithGroups, int64, error) {
	// 获取用户列表
	users, total, err := r.FindAllUsersWithPagination(page, pageSize, keyword)
	if err != nil {
		return nil, 0, err
	}

	// 获取所有用户的分组和主机信息
	usersWithPermissions := make([]model.UserWithGroups, 0, len(users))
	for _, user := range users {
		groupIDs, err := r.GetUserGroups(user.ID)
		if err != nil {
			return nil, 0, err
		}

		hostIDs, err := r.GetUserHosts(user.ID)
		if err != nil {
			return nil, 0, err
		}

		usersWithPermissions = append(usersWithPermissions, model.UserWithGroups{
			User:     user,
			GroupIDs: groupIDs,
			HostIDs:  hostIDs,
		})
	}

	return usersWithPermissions, total, nil
}
