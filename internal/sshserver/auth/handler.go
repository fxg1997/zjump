package auth

import (
	"bytes"
	"fmt"
	"log"

	"github.com/fisker/zjump-backend/internal/model"
	"github.com/fisker/zjump-backend/internal/service"
	"github.com/fisker/zjump-backend/internal/sshserver/types"
	"golang.org/x/crypto/ssh"
)

// AuthHandler 认证处理器接口
type AuthHandler interface {
	// GetName 获取处理器名称
	GetName() string

	// CanHandle 判断是否可以处理该用户的认证
	CanHandle(username string) (bool, error)

	// Authenticate 执行认证
	Authenticate(username string, credential interface{}, clientIP string) (*types.AuthResult, error)
}

// PasswordHandler 密码认证处理器
type PasswordHandler struct {
	authService *service.AuthService
}

// NewPasswordHandler 创建密码认证处理器
func NewPasswordHandler(authService *service.AuthService) *PasswordHandler {
	return &PasswordHandler{
		authService: authService,
	}
}

func (h *PasswordHandler) GetName() string {
	return "password"
}

func (h *PasswordHandler) CanHandle(username string) (bool, error) {
	user, err := h.authService.GetUserByUsername(username)
	if err != nil {
		return false, fmt.Errorf("user not found: %w", err)
	}

	// 只有配置了 password 或 all 认证方式的用户才能使用密码认证
	return user.AuthMethod == "password" || user.AuthMethod == "all", nil
}

func (h *PasswordHandler) Authenticate(username string, credential interface{}, clientIP string) (*types.AuthResult, error) {
	password, ok := credential.(string)
	if !ok {
		return nil, fmt.Errorf("invalid credential type for password authentication")
	}

	log.Printf("[Password Handler] Authenticating user: %s from IP: %s", username, clientIP)

	loginReq := &model.LoginRequest{
		Username: username,
		Password: password,
	}

	loginResp, err := h.authService.Login(loginReq, clientIP, "SSH-Client")
	if err != nil {
		log.Printf("[Password Handler] Authentication failed for user %s: %v", username, err)
		return nil, fmt.Errorf("password authentication failed")
	}

	log.Printf("[Password Handler] Authentication successful for user: %s (ID: %s)", username, loginResp.User.ID)

	return &types.AuthResult{
		Success: true,
		UserID:  loginResp.User.ID,
		Message: "Password authentication successful",
	}, nil
}

// PublicKeyHandler 公钥认证处理器
type PublicKeyHandler struct {
	authService *service.AuthService
}

// NewPublicKeyHandler 创建公钥认证处理器
func NewPublicKeyHandler(authService *service.AuthService) *PublicKeyHandler {
	return &PublicKeyHandler{
		authService: authService,
	}
}

func (h *PublicKeyHandler) GetName() string {
	return "publickey"
}

func (h *PublicKeyHandler) CanHandle(username string) (bool, error) {
	user, err := h.authService.GetUserByUsername(username)
	if err != nil {
		return false, fmt.Errorf("user not found: %w", err)
	}

	// 只有配置了 publickey 或 all 认证方式的用户才能使用公钥认证
	return user.AuthMethod == "publickey" || user.AuthMethod == "all", nil
}

func (h *PublicKeyHandler) Authenticate(username string, credential interface{}, clientIP string) (*types.AuthResult, error) {
	publicKey, ok := credential.(ssh.PublicKey)
	if !ok {
		return nil, fmt.Errorf("invalid credential type for publickey authentication")
	}

	log.Printf("[PublicKey Handler] Authenticating user: %s from IP: %s", username, clientIP)
	log.Printf("[PublicKey Handler] Client key fingerprint: %s", ssh.FingerprintSHA256(publicKey))

	// 获取用户的公钥
	user, err := h.authService.GetUserByUsername(username)
	if err != nil {
		return nil, fmt.Errorf("user not found")
	}

	userPublicKeyStr, err := h.authService.GetUserPublicKey(username)
	if err != nil {
		log.Printf("[PublicKey Handler] Failed to get user public key: %v", err)
		return nil, fmt.Errorf("failed to get user public key")
	}

	// 解析用户的公钥
	userPublicKey, _, _, _, err := ssh.ParseAuthorizedKey([]byte(userPublicKeyStr))
	if err != nil {
		log.Printf("[PublicKey Handler] Failed to parse user public key: %v", err)
		return nil, fmt.Errorf("invalid public key format")
	}

	log.Printf("[PublicKey Handler] User stored key fingerprint: %s", ssh.FingerprintSHA256(userPublicKey))

	// 比对公钥
	if !bytes.Equal(publicKey.Marshal(), userPublicKey.Marshal()) {
		log.Printf("[PublicKey Handler] Public key mismatch for user: %s", username)
		log.Printf("[PublicKey Handler]   Client fingerprint: %s", ssh.FingerprintSHA256(publicKey))
		log.Printf("[PublicKey Handler]   Server fingerprint: %s", ssh.FingerprintSHA256(userPublicKey))
		return nil, fmt.Errorf("public key does not match")
	}

	// 检查用户状态
	if user.Status != "active" {
		log.Printf("[PublicKey Handler] User account is not active: %s", username)
		return nil, fmt.Errorf("user account is not active")
	}

	log.Printf("[PublicKey Handler] Authentication successful for user: %s (ID: %s)", username, user.ID)

	return &types.AuthResult{
		Success: true,
		UserID:  user.ID,
		Message: "PublicKey authentication successful",
	}, nil
}

// MFAHandler MFA 多因素认证处理器（预留接口）
type MFAHandler struct {
	authService *service.AuthService
	// 可以添加 TOTP、短信验证等配置
}

// NewMFAHandler 创建 MFA 认证处理器
func NewMFAHandler(authService *service.AuthService) *MFAHandler {
	return &MFAHandler{
		authService: authService,
	}
}

func (h *MFAHandler) GetName() string {
	return "mfa"
}

func (h *MFAHandler) CanHandle(username string) (bool, error) {
	user, err := h.authService.GetUserByUsername(username)
	if err != nil {
		return false, fmt.Errorf("user not found: %w", err)
	}

	// 检查用户是否启用了 MFA（预留字段）
	// return user.MFAEnabled, nil

	// 目前默认不启用
	_ = user
	return false, nil
}

func (h *MFAHandler) Authenticate(username string, credential interface{}, clientIP string) (*types.AuthResult, error) {
	// TODO: 实现 MFA 认证逻辑
	// 可以支持 TOTP、短信验证码、邮箱验证码等
	log.Printf("[MFA Handler] MFA authentication not implemented yet")
	return nil, fmt.Errorf("MFA authentication not implemented")
}
