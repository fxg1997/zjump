package repository

import (
	"github.com/fisker/zjump-backend/internal/model"
	"gorm.io/gorm"
)

type UserGroupRepository struct {
	db *gorm.DB
}

func NewUserGroupRepository(db *gorm.DB) *UserGroupRepository {
	return &UserGroupRepository{db: db}
}

// Create 创建用户组
func (r *UserGroupRepository) Create(group *model.UserGroup) error {
	return r.db.Create(group).Error
}

// Update 更新用户组
func (r *UserGroupRepository) Update(group *model.UserGroup) error {
	// 使用 Updates 并排除 created_at 和 created_by 字段，避免零值覆盖
	return r.db.Model(&model.UserGroup{}).
		Where("id = ?", group.ID).
		Omit("created_at", "created_by").
		Updates(group).Error
}

// Delete 删除用户组
func (r *UserGroupRepository) Delete(id string) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		// 删除用户组成员关系
		if err := tx.Delete(&model.UserGroupMember{}, "user_group_id = ?", id).Error; err != nil {
			return err
		}
		// 删除用户组
		return tx.Delete(&model.UserGroup{}, "id = ?", id).Error
	})
}

// FindByID 根据ID查找用户组
func (r *UserGroupRepository) FindByID(id string) (*model.UserGroup, error) {
	var group model.UserGroup
	err := r.db.Where("id = ?", id).First(&group).Error
	if err != nil {
		return nil, err
	}
	return &group, nil
}

// FindAll 查找所有用户组
func (r *UserGroupRepository) FindAll() ([]model.UserGroup, error) {
	var groups []model.UserGroup
	err := r.db.Order("priority DESC, created_at DESC").Find(&groups).Error
	return groups, err
}

// FindByStatus 根据状态查找用户组
func (r *UserGroupRepository) FindByStatus(status string) ([]model.UserGroup, error) {
	var groups []model.UserGroup
	err := r.db.Where("status = ?", status).Order("priority DESC, created_at DESC").Find(&groups).Error
	return groups, err
}

// FindAllWithMembers 查找所有用户组及其成员数
func (r *UserGroupRepository) FindAllWithMembers() ([]model.UserGroupWithMembers, error) {
	var groups []model.UserGroupWithMembers

	err := r.db.Table("user_groups").
		Select(`
			user_groups.*,
			COUNT(DISTINCT user_group_members.user_id) as member_count
		`).
		Joins("LEFT JOIN user_group_members ON user_group_members.user_group_id = user_groups.id").
		Group("user_groups.id").
		Order("user_groups.priority DESC, user_groups.created_at DESC").
		Scan(&groups).Error

	return groups, err
}

// FindByIDWithMembers 根据ID查找用户组及其成员
func (r *UserGroupRepository) FindByIDWithMembers(id string) (*model.UserGroupWithMembers, error) {
	var group model.UserGroupWithMembers

	// 查找用户组
	err := r.db.Where("id = ?", id).First(&group.UserGroup).Error
	if err != nil {
		return nil, err
	}

	// 查找成员
	err = r.db.Table("users").
		Select("users.*").
		Joins("INNER JOIN user_group_members ON user_group_members.user_id = users.id").
		Where("user_group_members.user_group_id = ?", id).
		Order("users.username").
		Scan(&group.Members).Error
	if err != nil {
		return nil, err
	}

	group.MemberCount = len(group.Members)
	return &group, nil
}

// AddMember 添加成员到用户组
func (r *UserGroupRepository) AddMember(userGroupID, userID, addedBy string) error {
	member := &model.UserGroupMember{
		UserGroupID: userGroupID,
		UserID:      userID,
		AddedBy:     addedBy,
	}
	return r.db.Create(member).Error
}

// RemoveMember 从用户组移除成员
func (r *UserGroupRepository) RemoveMember(userGroupID, userID string) error {
	return r.db.Delete(&model.UserGroupMember{}, "user_group_id = ? AND user_id = ?", userGroupID, userID).Error
}

// GetMembersByGroupID 获取用户组的所有成员
func (r *UserGroupRepository) GetMembersByGroupID(groupID string) ([]model.User, error) {
	var users []model.User

	err := r.db.Table("users").
		Select("users.*").
		Joins("INNER JOIN user_group_members ON user_group_members.user_id = users.id").
		Where("user_group_members.user_group_id = ?", groupID).
		Order("users.username").
		Find(&users).Error

	return users, err
}

// GetGroupsByUserID 获取用户所在的所有用户组
func (r *UserGroupRepository) GetGroupsByUserID(userID string) ([]model.UserGroup, error) {
	var groups []model.UserGroup

	err := r.db.Table("user_groups").
		Select("user_groups.*").
		Joins("INNER JOIN user_group_members ON user_group_members.user_group_id = user_groups.id").
		Where("user_group_members.user_id = ?", userID).
		Where("user_groups.status = ?", "active").
		Order("user_groups.priority DESC, user_groups.created_at DESC").
		Find(&groups).Error

	return groups, err
}

// IsMember 检查用户是否是用户组成员
func (r *UserGroupRepository) IsMember(userGroupID, userID string) (bool, error) {
	var count int64
	err := r.db.Table("user_group_members").
		Where("user_group_id = ? AND user_id = ?", userGroupID, userID).
		Count(&count).Error
	return count > 0, err
}

// BatchAddMembers 批量添加成员
func (r *UserGroupRepository) BatchAddMembers(userGroupID string, userIDs []string, addedBy string) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		for _, userID := range userIDs {
			member := &model.UserGroupMember{
				UserGroupID: userGroupID,
				UserID:      userID,
				AddedBy:     addedBy,
			}
			if err := tx.Create(member).Error; err != nil {
				// 忽略重复键错误
				if err.Error() != "UNIQUE constraint failed" {
					return err
				}
			}
		}
		return nil
	})
}

// BatchRemoveMembers 批量移除成员
func (r *UserGroupRepository) BatchRemoveMembers(userGroupID string, userIDs []string) error {
	return r.db.Delete(&model.UserGroupMember{}, "user_group_id = ? AND user_id IN ?", userGroupID, userIDs).Error
}
