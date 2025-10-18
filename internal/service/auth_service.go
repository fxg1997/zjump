package service

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/fisker/zjump-backend/internal/model"
	"github.com/fisker/zjump-backend/internal/repository"
	"github.com/fisker/zjump-backend/pkg/sshkey"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// JWT 密钥（生产环境应该从配置文件读取）
var jwtSecret = []byte("zjump-secret-key-change-in-production")

// AES 加密密钥（32字节用于AES-256，生产环境应该从配置文件读取）
var aesKey = []byte("zjump-aes-key-32bytes-needed!!!!") // 必须是32字节

// JWT Claims
type Claims struct {
	UserID   string `json:"userId"`
	Username string `json:"username"`
	Role     string `json:"role"`
	jwt.RegisteredClaims
}

type AuthService struct {
	repo        *repository.UserRepository
	settingRepo *repository.SettingRepository
}

func NewAuthService(repo *repository.UserRepository, settingRepo *repository.SettingRepository) *AuthService {
	return &AuthService{
		repo:        repo,
		settingRepo: settingRepo,
	}
}

// Register 用户注册
func (s *AuthService) Register(req *model.RegisterRequest) (*model.User, error) {
	// 检查用户名是否已存在
	if _, err := s.repo.FindUserByUsername(req.Username); err == nil {
		return nil, errors.New("用户名已存在")
	}

	// 检查邮箱是否已存在
	if req.Email != "" {
		if _, err := s.repo.FindUserByEmail(req.Email); err == nil {
			return nil, errors.New("邮箱已被使用")
		}
	}

	// 加密密码
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("密码加密失败: %w", err)
	}

	// 创建用户
	user := &model.User{
		ID:       uuid.New().String(),
		Username: req.Username,
		Password: string(hashedPassword),
		Email:    req.Email,
		FullName: req.FullName,
		Role:     "user", // 默认角色
		Status:   "active",
	}

	if err := s.repo.CreateUser(user); err != nil {
		return nil, fmt.Errorf("创建用户失败: %w", err)
	}

	return user, nil
}

// Login 用户登录（支持账户密码、LDAP、SSO）
func (s *AuthService) Login(req *model.LoginRequest, loginIP, userAgent string) (*model.LoginResponse, error) {
	// 获取认证配置（从auth category读取）
	authSettings, _ := s.settingRepo.GetByCategory("auth")

	// 获取authMethod配置，默认为password
	authMethod := s.getSettingValue(authSettings, "authMethod", "password")

	var user *model.User
	var err error

	// 根据配置选择认证方式
	switch authMethod {
	case "ldap":
		// LDAP 认证
		user, err = s.authenticateWithLDAP(req.Username, req.Password, authSettings)
		if err != nil {
			return nil, fmt.Errorf("LDAP认证失败: %w", err)
		}
	case "sso":
		// SSO 认证（不支持密码登录，需要通过 OAuth2 流程）
		return nil, errors.New("SSO认证需要通过授权流程，请使用SSO登录按钮")
	default:
		// 默认：账户密码认证
		user, err = s.authenticateWithPassword(req.Username, req.Password)
		if err != nil {
			return nil, err
		}
	}

	// 检查用户是否过期
	if user.ExpiresAt != nil && user.ExpiresAt.Before(time.Now()) {
		return nil, errors.New("账号已过期，请联系管理员")
	}

	// 生成 JWT Token
	token, err := s.GenerateToken(user)
	if err != nil {
		return nil, fmt.Errorf("生成Token失败: %w", err)
	}

	// 更新最后登录时间和IP
	now := time.Now()
	if err := s.repo.UpdateUserLastLogin(user.ID, now, loginIP); err != nil {
		// 记录错误但不影响登录
		fmt.Printf("更新最后登录时间失败: %v\n", err)
	}

	// 创建平台登录记录（记录用户登录堡垒机平台，不是连接虚拟机）
	loginRecord := &model.PlatformLoginRecord{
		ID:        uuid.New().String(),
		UserID:    user.ID,
		Username:  user.Username,
		LoginIP:   loginIP,
		UserAgent: userAgent,
		LoginTime: now,
		Status:    "active",
	}
	if err := s.repo.CreatePlatformLoginRecord(loginRecord); err != nil {
		// 记录错误但不影响登录
		fmt.Printf(" [Login] 创建平台登录记录失败: %v\n", err)
	}

	return &model.LoginResponse{
		Token: token,
		User:  *user,
	}, nil
}

// authenticateWithPassword 使用密码认证（默认方式）
func (s *AuthService) authenticateWithPassword(username, password string) (*model.User, error) {
	// 查找用户
	user, err := s.repo.FindUserByUsername(username)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("用户名或密码错误")
		}
		return nil, fmt.Errorf("查询用户失败: %w", err)
	}

	// 检查用户状态
	if user.Status != "active" {
		return nil, errors.New("用户已被禁用")
	}

	// 验证密码
	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(password)); err != nil {
		return nil, errors.New("用户名或密码错误")
	}

	return user, nil
}

// authenticateWithLDAP 使用 LDAP 认证
func (s *AuthService) authenticateWithLDAP(username, password string, settings []model.Setting) (*model.User, error) {
	// 获取LDAP配置
	ldapServer := s.getSettingValue(settings, "ldapServer", "")
	ldapPort := s.getSettingValue(settings, "ldapPort", "389")
	bindDn := s.getSettingValue(settings, "ldapBindDn", "")
	bindPassword := s.getSettingValue(settings, "ldapBindPassword", "")
	baseDn := s.getSettingValue(settings, "ldapBaseDn", "")
	userFilter := s.getSettingValue(settings, "ldapUserFilter", "(uid={username})")
	useTLS := s.getSettingValue(settings, "ldapUseTLS", "false")

	if ldapServer == "" || bindDn == "" || baseDn == "" || bindPassword == "" {
		return nil, errors.New("LDAP配置不完整，请在系统设置中完成LDAP配置")
	}

	// TODO: 使用 go-ldap 库实现完整的LDAP认证
	// 这里提供实现框架：
	//
	// import "github.com/go-ldap/ldap/v3"
	//
	// 1. 连接LDAP服务器
	//    l, err := ldap.Dial("tcp", fmt.Sprintf("%s:%s", ldapServer, ldapPort))
	//    if useTLS == "true" {
	//        err := l.StartTLS(&tls.Config{InsecureSkipVerify: true})
	//    }
	//
	// 2. 管理员绑定
	//    err = l.Bind(bindDn, bindPassword)
	//
	// 3. 搜索用户
	//    filter := strings.ReplaceAll(userFilter, "{username}", username)
	//    searchRequest := ldap.NewSearchRequest(baseDn, ldap.ScopeWholeSubtree, ...)
	//    sr, err := l.Search(searchRequest)
	//
	// 4. 验证用户密码
	//    userDN := sr.Entries[0].DN
	//    err = l.Bind(userDN, password)
	//
	// 5. 认证成功后，在本地数据库创建或更新用户

	// 暂时返回错误，提示需要安装go-ldap库
	fmt.Printf("[LDAP] 认证配置: server=%s, port=%s, bindDn=%s, baseDn=%s, filter=%s, useTLS=%s (password configured)\n",
		ldapServer, ldapPort, bindDn, baseDn, userFilter, useTLS)

	return nil, errors.New("LDAP认证功能需要安装 go-ldap 依赖库，请运行: go get github.com/go-ldap/ldap/v3")
}

// getSettingValue 获取配置值，支持默认值
func (s *AuthService) getSettingValue(settings []model.Setting, key, defaultValue string) string {
	for _, setting := range settings {
		if setting.Key == key {
			return setting.Value
		}
	}
	return defaultValue
}

// isAuthMethodEnabled 检查认证方式是否启用（已废弃，保留兼容性）
func (s *AuthService) isAuthMethodEnabled(settings []model.Setting, key string) bool {
	for _, setting := range settings {
		if setting.Key == key {
			return setting.Value == "true"
		}
	}
	return false
}

// Logout 用户登出
func (s *AuthService) Logout(userID string) error {
	return s.repo.UpdatePlatformLoginRecordLogoutByUser(userID)
}

// GenerateToken 生成 JWT Token
func (s *AuthService) GenerateToken(user *model.User) (string, error) {
	// 设置过期时间为7天（168小时），适合堡垒机场景
	// 用户一般需要长时间操作服务器，不应频繁重新登录
	expirationTime := time.Now().Add(7 * 24 * time.Hour)

	claims := &Claims{
		UserID:   user.ID,
		Username: user.Username,
		Role:     user.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "zjump",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret)
}

// ValidateToken 验证 JWT Token
func (s *AuthService) ValidateToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		return jwtSecret, nil
	})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return claims, nil
	}

	return nil, errors.New("无效的Token")
}

// GetPlatformLoginRecords 获取平台登录记录
func (s *AuthService) GetPlatformLoginRecords(page, pageSize int, userID string) ([]model.PlatformLoginRecord, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 10
	}
	return s.repo.FindPlatformLoginRecords(page, pageSize, userID)
}

// GetUserByID 根据ID获取用户
func (s *AuthService) GetUserByID(userID string) (*model.User, error) {
	return s.repo.FindUserByID(userID)
}

// GetUserByUsername 根据用户名获取用户
func (s *AuthService) GetUserByUsername(username string) (*model.User, error) {
	return s.repo.FindUserByUsername(username)
}

// GetAllUsers 获取所有用户列表（用于黑名单选择）
func (s *AuthService) GetAllUsers() ([]model.User, error) {
	return s.repo.FindAllUsers()
}

// ===== User Management Methods =====

// GetUsersWithPagination 分页获取用户列表
func (s *AuthService) GetUsersWithPagination(page, pageSize int, keyword string) ([]model.User, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 10
	}
	return s.repo.FindAllUsersWithPagination(page, pageSize, keyword)
}

// CreateUser 创建新用户（管理员功能）
func (s *AuthService) CreateUser(req *model.RegisterRequest, role string, authMethod string) (*model.User, error) {
	// 检查用户名是否已存在
	if _, err := s.repo.FindUserByUsername(req.Username); err == nil {
		return nil, errors.New("用户名已存在")
	}

	// 检查邮箱是否已存在
	if req.Email != "" {
		if _, err := s.repo.FindUserByEmail(req.Email); err == nil {
			return nil, errors.New("邮箱已被使用")
		}
	}

	// 加密密码
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("密码加密失败: %w", err)
	}

	// 验证角色
	if role != "admin" && role != "user" {
		role = "user"
	}

	// 验证认证方式
	if authMethod == "" || (authMethod != "password" && authMethod != "publickey") {
		authMethod = "password"
	}

	// 创建用户
	user := &model.User{
		ID:         uuid.New().String(),
		Username:   req.Username,
		Password:   string(hashedPassword),
		Email:      req.Email,
		FullName:   req.FullName,
		Role:       role,
		Status:     "active",
		AuthMethod: authMethod,
	}

	if err := s.repo.CreateUser(user); err != nil {
		return nil, fmt.Errorf("创建用户失败: %w", err)
	}

	return user, nil
}

// UpdateUserInfo 更新用户信息（管理员功能）
func (s *AuthService) UpdateUserInfo(userID string, fullName, email string) error {
	user, err := s.repo.FindUserByID(userID)
	if err != nil {
		return errors.New("用户不存在")
	}

	// 检查邮箱是否被其他用户使用
	if email != "" && email != user.Email {
		if existingUser, err := s.repo.FindUserByEmail(email); err == nil && existingUser.ID != userID {
			return errors.New("邮箱已被使用")
		}
	}

	user.FullName = fullName
	user.Email = email

	return s.repo.UpdateUser(user)
}

// UpdateUserExpiration 更新用户过期信息（管理员功能）
func (s *AuthService) UpdateUserExpiration(userID string, expiresAt *string, autoDisableOnExpiry *bool) error {
	user, err := s.repo.FindUserByID(userID)
	if err != nil {
		return errors.New("用户不存在")
	}

	// 更新过期时间
	if expiresAt != nil {
		if *expiresAt == "" {
			// 空字符串表示永不过期
			user.ExpiresAt = nil
			user.ExpirationWarningSent = false // 重置警告标记
		} else {
			// 解析时间字符串
			t, err := time.Parse(time.RFC3339, *expiresAt)
			if err != nil {
				return fmt.Errorf("无效的时间格式: %v", err)
			}
			user.ExpiresAt = &t
			user.ExpirationWarningSent = false // 重置警告标记
		}
	}

	// 更新自动禁用设置
	if autoDisableOnExpiry != nil {
		user.AutoDisableOnExpiry = *autoDisableOnExpiry
	}

	return s.repo.UpdateUser(user)
}

// UpdateUserRole 更新用户角色（管理员功能）
func (s *AuthService) UpdateUserRole(userID, role string) error {
	// 验证角色
	if role != "admin" && role != "user" {
		return errors.New("无效的角色")
	}

	// 检查用户是否存在
	if _, err := s.repo.FindUserByID(userID); err != nil {
		return errors.New("用户不存在")
	}

	return s.repo.UpdateUserRole(userID, role)
}

// UpdateUserStatus 更新用户状态（管理员功能）
func (s *AuthService) UpdateUserStatus(userID, status string) error {
	// 验证状态
	if status != "active" && status != "inactive" {
		return errors.New("无效的状态")
	}

	// 检查用户是否存在
	if _, err := s.repo.FindUserByID(userID); err != nil {
		return errors.New("用户不存在")
	}

	return s.repo.UpdateUserStatus(userID, status)
}

// DeleteUser 删除用户（管理员功能）
func (s *AuthService) DeleteUser(userID string) error {
	// 检查用户是否存在
	if _, err := s.repo.FindUserByID(userID); err != nil {
		return errors.New("用户不存在")
	}

	return s.repo.DeleteUser(userID)
}

// ResetUserPassword 重置用户密码（管理员功能）
func (s *AuthService) ResetUserPassword(userID, newPassword string) error {
	user, err := s.repo.FindUserByID(userID)
	if err != nil {
		return errors.New("用户不存在")
	}

	// 加密密码
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("密码加密失败: %w", err)
	}

	user.Password = string(hashedPassword)
	return s.repo.UpdateUser(user)
}

// ===== User-Group Permission Methods =====

// AssignGroupsToUser 给用户分配分组权限
func (s *AuthService) AssignGroupsToUser(userID string, groupIDs []string, createdBy string) error {
	// 检查用户是否存在
	if _, err := s.repo.FindUserByID(userID); err != nil {
		return errors.New("用户不存在")
	}

	return s.repo.AssignGroupsToUser(userID, groupIDs, createdBy)
}

// GetUserGroups 获取用户有权限访问的分组ID列表
func (s *AuthService) GetUserGroups(userID string) ([]string, error) {
	return s.repo.GetUserGroups(userID)
}

// GetUserWithGroups 获取用户及其分组信息
func (s *AuthService) GetUserWithGroups(userID string) (*model.UserWithGroups, error) {
	return s.repo.GetUserWithGroups(userID)
}

// GetUsersWithGroups 获取所有用户及其分组信息（分页）
func (s *AuthService) GetUsersWithGroups(page, pageSize int, keyword string) ([]model.UserWithGroups, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 10
	}
	return s.repo.FindAllUsersWithGroups(page, pageSize, keyword)
}

// ===== User-Host Permission Methods =====

// AssignHostsToUser 给用户分配单个主机权限
func (s *AuthService) AssignHostsToUser(userID string, hostIDs []string, createdBy string) error {
	// 检查用户是否存在
	if _, err := s.repo.FindUserByID(userID); err != nil {
		return errors.New("用户不存在")
	}

	return s.repo.AssignHostsToUser(userID, hostIDs, createdBy)
}

// GetUserHosts 获取用户有权限访问的主机ID列表
func (s *AuthService) GetUserHosts(userID string) ([]string, error) {
	return s.repo.GetUserHosts(userID)
}

// GetUserWithGroupsAndHosts 获取用户及其分组和主机权限信息
func (s *AuthService) GetUserWithGroupsAndHosts(userID string) (*model.UserWithGroups, error) {
	return s.repo.GetUserWithGroupsAndHosts(userID)
}

// GetUsersWithGroupsAndHosts 获取所有用户及其分组和主机信息（分页）
func (s *AuthService) GetUsersWithGroupsAndHosts(page, pageSize int, keyword string) ([]model.UserWithGroups, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 10
	}
	return s.repo.FindAllUsersWithGroupsAndHosts(page, pageSize, keyword)
}

// ===== SSO OAuth2 Methods =====

// SSOUserInfo SSO 用户信息结构（通用格式）
type SSOUserInfo struct {
	Sub       string `json:"sub"`        // 用户唯一标识
	Email     string `json:"email"`      // 邮箱
	Name      string `json:"name"`       // 姓名
	Username  string `json:"username"`   // 用户名
	OpenID    string `json:"open_id"`    // 飞书 OpenID
	UnionID   string `json:"union_id"`   // 飞书 UnionID
	Mobile    string `json:"mobile"`     // 手机号
	AvatarURL string `json:"avatar_url"` // 头像
}

// FeishuTokenResponse 飞书令牌响应
type FeishuTokenResponse struct {
	Code int              `json:"code"`
	Msg  string           `json:"msg"`
	Data *FeishuTokenData `json:"data"`
}

type FeishuTokenData struct {
	AccessToken      string `json:"access_token"`
	TokenType        string `json:"token_type"`
	ExpiresIn        int    `json:"expires_in"`
	RefreshToken     string `json:"refresh_token"`
	RefreshExpiresIn int    `json:"refresh_expires_in"`
	Scope            string `json:"scope"`
}

// FeishuUserInfoResponse 飞书用户信息响应
type FeishuUserInfoResponse struct {
	Code int             `json:"code"`
	Msg  string          `json:"msg"`
	Data *FeishuUserData `json:"data"`
}

type FeishuUserData struct {
	Sub         string `json:"sub"`
	Name        string `json:"name"`
	Picture     string `json:"picture"`
	OpenID      string `json:"open_id"`
	UnionID     string `json:"union_id"`
	EnName      string `json:"en_name"`
	TenantKey   string `json:"tenant_key"`
	AvatarURL   string `json:"avatar_url"`
	AvatarThumb string `json:"avatar_thumb"`
	AvatarBig   string `json:"avatar_big"`
	Email       string `json:"email"`
	Mobile      string `json:"mobile"`
}

// ExchangeCodeForToken 使用授权码换取访问令牌
func (s *AuthService) ExchangeCodeForToken(code, provider, clientID, clientSecret, tokenURL, redirectURL string) (string, error) {
	fmt.Printf(" [SSO] 开始换取 Token: provider=%s, tokenURL=%s\n", provider, tokenURL)

	// 根据不同的服务提供商构造请求
	if strings.Contains(strings.ToLower(provider), "feishu") || strings.Contains(strings.ToLower(provider), "lark") {
		return s.exchangeFeishuToken(code, clientID, clientSecret, tokenURL)
	}

	// 标准 OAuth2 Token Exchange（适用于大多数服务提供商）
	data := url.Values{}
	data.Set("grant_type", "authorization_code")
	data.Set("code", code)
	data.Set("client_id", clientID)
	data.Set("client_secret", clientSecret)
	data.Set("redirect_uri", redirectURL)

	req, err := http.NewRequest("POST", tokenURL, strings.NewReader(data.Encode()))
	if err != nil {
		return "", fmt.Errorf("创建请求失败: %w", err)
	}

	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("请求失败: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("读取响应失败: %w", err)
	}

	fmt.Printf("📥 [SSO] Token Response: %s\n", string(body))

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("获取token失败 (HTTP %d): %s", resp.StatusCode, string(body))
	}

	// 解析响应
	var tokenResp struct {
		AccessToken string `json:"access_token"`
		TokenType   string `json:"token_type"`
		ExpiresIn   int    `json:"expires_in"`
		Error       string `json:"error"`
		ErrorDesc   string `json:"error_description"`
	}

	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return "", fmt.Errorf("解析token响应失败: %w", err)
	}

	if tokenResp.Error != "" {
		return "", fmt.Errorf("获取token失败: %s - %s", tokenResp.Error, tokenResp.ErrorDesc)
	}

	if tokenResp.AccessToken == "" {
		return "", errors.New("响应中未包含access_token")
	}

	fmt.Printf(" [SSO] Token 获取成功\n")
	return tokenResp.AccessToken, nil
}

// exchangeFeishuToken 飞书专用的 Token Exchange
func (s *AuthService) exchangeFeishuToken(code, appID, appSecret, tokenURL string) (string, error) {
	requestBody := map[string]interface{}{
		"grant_type": "authorization_code",
		"code":       code,
	}

	bodyBytes, err := json.Marshal(requestBody)
	if err != nil {
		return "", fmt.Errorf("构造请求体失败: %w", err)
	}

	req, err := http.NewRequest("POST", tokenURL, bytes.NewBuffer(bodyBytes))
	if err != nil {
		return "", fmt.Errorf("创建请求失败: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Basic %s", encodeBasicAuth(appID, appSecret)))

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("请求失败: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("读取响应失败: %w", err)
	}

	fmt.Printf("📥 [Feishu SSO] Token Response: %s\n", string(body))

	var tokenResp FeishuTokenResponse
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return "", fmt.Errorf("解析飞书token响应失败: %w", err)
	}

	if tokenResp.Code != 0 {
		return "", fmt.Errorf("飞书返回错误 (code: %d): %s", tokenResp.Code, tokenResp.Msg)
	}

	if tokenResp.Data == nil || tokenResp.Data.AccessToken == "" {
		return "", errors.New("飞书响应中未包含access_token")
	}

	fmt.Printf(" [Feishu SSO] Token 获取成功\n")
	return tokenResp.Data.AccessToken, nil
}

// encodeBasicAuth 编码 Basic Auth（使用 Base64）
func encodeBasicAuth(username, password string) string {
	auth := username + ":" + password
	return base64.StdEncoding.EncodeToString([]byte(auth))
}

// GetSSOUserInfo 获取 SSO 用户信息
func (s *AuthService) GetSSOUserInfo(accessToken, provider, userInfoURL string) (*SSOUserInfo, error) {
	fmt.Printf(" [SSO] 获取用户信息: provider=%s, userInfoURL=%s\n", provider, userInfoURL)

	// 根据不同的服务提供商处理
	if strings.Contains(strings.ToLower(provider), "feishu") || strings.Contains(strings.ToLower(provider), "lark") {
		return s.getFeishuUserInfo(accessToken, userInfoURL)
	}

	// 标准 OAuth2 UserInfo 请求
	req, err := http.NewRequest("GET", userInfoURL, nil)
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+accessToken)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("请求失败: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取响应失败: %w", err)
	}

	fmt.Printf("📥 [SSO] UserInfo Response: %s\n", string(body))

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("获取用户信息失败 (HTTP %d): %s", resp.StatusCode, string(body))
	}

	// 解析标准 OIDC UserInfo
	var userInfo SSOUserInfo
	if err := json.Unmarshal(body, &userInfo); err != nil {
		return nil, fmt.Errorf("解析用户信息失败: %w", err)
	}

	if userInfo.Sub == "" && userInfo.Email == "" {
		return nil, errors.New("用户信息中缺少必要字段（sub或email）")
	}

	fmt.Printf(" [SSO] 用户信息获取成功: email=%s, name=%s\n", userInfo.Email, userInfo.Name)
	return &userInfo, nil
}

// getFeishuUserInfo 获取飞书用户信息
func (s *AuthService) getFeishuUserInfo(accessToken, userInfoURL string) (*SSOUserInfo, error) {
	req, err := http.NewRequest("GET", userInfoURL, nil)
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+accessToken)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("请求失败: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取响应失败: %w", err)
	}

	fmt.Printf("📥 [Feishu SSO] UserInfo Response: %s\n", string(body))

	var userInfoResp FeishuUserInfoResponse
	if err := json.Unmarshal(body, &userInfoResp); err != nil {
		return nil, fmt.Errorf("解析飞书用户信息失败: %w", err)
	}

	if userInfoResp.Code != 0 {
		return nil, fmt.Errorf("飞书返回错误 (code: %d): %s", userInfoResp.Code, userInfoResp.Msg)
	}

	if userInfoResp.Data == nil {
		return nil, errors.New("飞书响应中未包含用户数据")
	}

	// 转换为通用格式
	userData := userInfoResp.Data
	userInfo := &SSOUserInfo{
		Sub:       userData.Sub,
		OpenID:    userData.OpenID,
		UnionID:   userData.UnionID,
		Email:     userData.Email,
		Name:      userData.Name,
		Mobile:    userData.Mobile,
		AvatarURL: userData.AvatarURL,
	}

	// 生成用户名：优先使用邮箱前缀，其次使用 OpenID
	if userInfo.Email != "" {
		parts := strings.Split(userInfo.Email, "@")
		userInfo.Username = parts[0]
	} else if userInfo.OpenID != "" {
		userInfo.Username = "feishu_" + userInfo.OpenID
	} else {
		userInfo.Username = "sso_" + uuid.New().String()[:8]
	}

	fmt.Printf(" [Feishu SSO] 用户信息获取成功: email=%s, name=%s, openid=%s\n",
		userInfo.Email, userInfo.Name, userInfo.OpenID)

	return userInfo, nil
}

// CreateOrUpdateSSOUser 创建或更新 SSO 用户
func (s *AuthService) CreateOrUpdateSSOUser(ssoUserInfo *SSOUserInfo) (*model.User, error) {
	fmt.Printf(" [SSO] 创建或更新用户: username=%s, email=%s\n", ssoUserInfo.Username, ssoUserInfo.Email)

	var user *model.User
	var err error

	// 优先通过邮箱查找用户
	if ssoUserInfo.Email != "" {
		user, err = s.repo.FindUserByEmail(ssoUserInfo.Email)
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("查询用户失败: %w", err)
		}
	}

	// 如果通过邮箱没找到，尝试通过用户名查找
	if user == nil && ssoUserInfo.Username != "" {
		user, err = s.repo.FindUserByUsername(ssoUserInfo.Username)
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("查询用户失败: %w", err)
		}
	}

	// 用户存在，更新信息
	if user != nil {
		fmt.Printf(" [SSO] 用户已存在，更新信息: userID=%s\n", user.ID)

		// 更新用户信息
		if ssoUserInfo.Name != "" {
			user.FullName = ssoUserInfo.Name
		}
		if ssoUserInfo.Email != "" && user.Email == "" {
			user.Email = ssoUserInfo.Email
		}

		if err := s.repo.UpdateUser(user); err != nil {
			return nil, fmt.Errorf("更新用户失败: %w", err)
		}

		return user, nil
	}

	// 用户不存在，创建新用户
	fmt.Printf(" [SSO] 创建新用户\n")

	// 生成随机密码（SSO用户不使用密码登录）
	randomPassword := uuid.New().String()
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(randomPassword), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("密码加密失败: %w", err)
	}

	user = &model.User{
		ID:       uuid.New().String(),
		Username: ssoUserInfo.Username,
		Password: string(hashedPassword),
		Email:    ssoUserInfo.Email,
		FullName: ssoUserInfo.Name,
		Role:     "user", // 默认角色
		Status:   "active",
	}

	if err := s.repo.CreateUser(user); err != nil {
		return nil, fmt.Errorf("创建用户失败: %w", err)
	}

	fmt.Printf(" [SSO] 新用户创建成功: userID=%s, username=%s\n", user.ID, user.Username)
	return user, nil
}

// LoginWithSSO SSO 登录主流程
func (s *AuthService) LoginWithSSO(code, loginIP, userAgent string) (*model.LoginResponse, error) {
	fmt.Printf(" [SSO] 开始 SSO 登录流程\n")

	// 获取 SSO 配置（从 auth category 读取）
	authSettings, err := s.settingRepo.GetByCategory("auth")
	if err != nil {
		return nil, fmt.Errorf("获取SSO配置失败: %w", err)
	}

	// 解析配置（字段名有 sso 前缀）
	provider := s.getSettingValue(authSettings, "ssoProvider", "")
	clientID := s.getSettingValue(authSettings, "ssoClientId", "")
	clientSecret := s.getSettingValue(authSettings, "ssoClientSecret", "")
	tokenURL := s.getSettingValue(authSettings, "ssoTokenUrl", "")
	userInfoURL := s.getSettingValue(authSettings, "ssoUserInfoUrl", "")
	redirectURL := s.getSettingValue(authSettings, "ssoRedirectUrl", "")

	if provider == "" || clientID == "" || clientSecret == "" || tokenURL == "" || userInfoURL == "" {
		return nil, errors.New("SSO配置不完整")
	}

	// 1. 使用授权码换取访问令牌
	accessToken, err := s.ExchangeCodeForToken(code, provider, clientID, clientSecret, tokenURL, redirectURL)
	if err != nil {
		return nil, fmt.Errorf("获取访问令牌失败: %w", err)
	}

	// 2. 使用访问令牌获取用户信息
	ssoUserInfo, err := s.GetSSOUserInfo(accessToken, provider, userInfoURL)
	if err != nil {
		return nil, fmt.Errorf("获取用户信息失败: %w", err)
	}

	// 3. 创建或更新本地用户
	user, err := s.CreateOrUpdateSSOUser(ssoUserInfo)
	if err != nil {
		return nil, fmt.Errorf("创建或更新用户失败: %w", err)
	}

	// 检查用户是否过期
	if user.ExpiresAt != nil && user.ExpiresAt.Before(time.Now()) {
		return nil, errors.New("账号已过期，请联系管理员")
	}

	// 4. 生成 JWT Token
	token, err := s.GenerateToken(user)
	if err != nil {
		return nil, fmt.Errorf("生成Token失败: %w", err)
	}

	// 5. 更新最后登录时间
	now := time.Now()
	if err := s.repo.UpdateUserLastLogin(user.ID, now, loginIP); err != nil {
		fmt.Printf(" [SSO] 更新最后登录时间失败: %v\n", err)
	}

	// 6. 创建平台登录记录
	loginRecord := &model.PlatformLoginRecord{
		ID:        uuid.New().String(),
		UserID:    user.ID,
		Username:  user.Username,
		LoginIP:   loginIP,
		UserAgent: userAgent,
		LoginTime: now,
		Status:    "active",
	}
	if err := s.repo.CreatePlatformLoginRecord(loginRecord); err != nil {
		fmt.Printf(" [SSO] 创建平台登录记录失败: %v\n", err)
	}

	fmt.Printf(" [SSO] 登录成功: userID=%s, username=%s\n", user.ID, user.Username)

	return &model.LoginResponse{
		Token: token,
		User:  *user,
	}, nil
}

// ===== SSH Key Management =====

// GenerateSSHKey 为用户生成SSH密钥对
func (s *AuthService) GenerateSSHKey(userID string) error {
	user, err := s.repo.FindUserByID(userID)
	if err != nil {
		return fmt.Errorf("用户不存在: %w", err)
	}

	// 使用sshkey包生成密钥对
	keyPair, err := generateSSHKeyPair(2048)
	if err != nil {
		return fmt.Errorf("生成SSH密钥失败: %w", err)
	}

	// 加密私钥（使用AES加密）
	encryptedPrivateKey, err := encryptPrivateKey(keyPair.PrivateKey)
	if err != nil {
		return fmt.Errorf("加密私钥失败: %w", err)
	}

	// 更新用户记录
	now := time.Now()
	user.SSHPublicKey = keyPair.PublicKey
	user.SSHPrivateKeyEncrypted = encryptedPrivateKey
	user.SSHKeyFingerprint = keyPair.Fingerprint
	user.SSHKeyGeneratedAt = &now

	if err := s.repo.UpdateUser(user); err != nil {
		return fmt.Errorf("更新用户SSH密钥失败: %w", err)
	}

	return nil
}

// DeleteSSHKey 删除用户的SSH密钥
func (s *AuthService) DeleteSSHKey(userID string) error {
	user, err := s.repo.FindUserByID(userID)
	if err != nil {
		return fmt.Errorf("用户不存在: %w", err)
	}

	// 清空SSH密钥相关字段
	user.SSHPublicKey = ""
	user.SSHPrivateKeyEncrypted = ""
	user.SSHKeyFingerprint = ""
	user.SSHKeyGeneratedAt = nil

	// 如果认证方式是publickey，改回password
	if user.AuthMethod == "publickey" {
		user.AuthMethod = "password"
	}

	if err := s.repo.UpdateUser(user); err != nil {
		return fmt.Errorf("删除SSH密钥失败: %w", err)
	}

	return nil
}

// GetSSHPrivateKey 获取用户的SSH私钥（解密后）
func (s *AuthService) GetSSHPrivateKey(userID string) (string, string, error) {
	user, err := s.repo.FindUserByID(userID)
	if err != nil {
		return "", "", fmt.Errorf("用户不存在: %w", err)
	}

	if user.SSHPrivateKeyEncrypted == "" {
		return "", "", errors.New("用户没有SSH私钥")
	}

	// 解密私钥
	privateKey, err := decryptPrivateKey(user.SSHPrivateKeyEncrypted)
	if err != nil {
		return "", "", fmt.Errorf("解密私钥失败: %w", err)
	}

	return privateKey, user.Username, nil
}

// UpdateUserAuthMethod 更新用户的认证方式
func (s *AuthService) UpdateUserAuthMethod(userID, authMethod string) error {
	user, err := s.repo.FindUserByID(userID)
	if err != nil {
		return fmt.Errorf("用户不存在: %w", err)
	}

	// 如果选择publickey，但没有密钥，返回错误
	if authMethod == "publickey" && user.SSHPublicKey == "" {
		return errors.New("请先生成SSH密钥")
	}

	// 验证认证方式
	if authMethod != "password" && authMethod != "publickey" {
		return errors.New("认证方式必须是: password 或 publickey")
	}

	user.AuthMethod = authMethod

	if err := s.repo.UpdateUser(user); err != nil {
		return fmt.Errorf("更新认证方式失败: %w", err)
	}

	return nil
}

// GetUserPublicKey 获取用户的公钥（用于SSH认证）
func (s *AuthService) GetUserPublicKey(username string) (string, error) {
	user, err := s.repo.FindUserByUsername(username)
	if err != nil {
		return "", fmt.Errorf("用户不存在: %w", err)
	}

	if user.SSHPublicKey == "" {
		return "", errors.New("用户没有配置SSH公钥")
	}

	// 检查认证方式
	if user.AuthMethod != "publickey" && user.AuthMethod != "both" {
		return "", errors.New("用户未启用公钥认证")
	}

	return user.SSHPublicKey, nil
}

// ===== Helper Functions =====

// generateSSHKeyPair 生成SSH密钥对
func generateSSHKeyPair(bitSize int) (*sshkey.KeyPair, error) {
	return sshkey.GenerateRSAKeyPair(bitSize)
}

// encryptPrivateKey 加密私钥
func encryptPrivateKey(privateKey string) (string, error) {
	block, err := aes.NewCipher(aesKey)
	if err != nil {
		return "", err
	}

	// 使用GCM模式
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	// 生成nonce
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}

	// 加密
	ciphertext := gcm.Seal(nonce, nonce, []byte(privateKey), nil)

	// Base64编码
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// decryptPrivateKey 解密私钥
func decryptPrivateKey(encryptedKey string) (string, error) {
	// Base64解码
	ciphertext, err := base64.StdEncoding.DecodeString(encryptedKey)
	if err != nil {
		return "", err
	}

	block, err := aes.NewCipher(aesKey)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return "", errors.New("ciphertext too short")
	}

	nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", err
	}

	return string(plaintext), nil
}
