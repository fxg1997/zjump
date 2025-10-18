package approval

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/fisker/zjump-backend/internal/model"
)

// FeishuProvider 飞书审批提供者
type FeishuProvider struct {
	appID        string
	appSecret    string
	approvalCode string // 审批定义 Code
	baseURL      string
	client       *http.Client
}

// NewFeishuProvider 创建飞书审批提供者
func NewFeishuProvider(appID, appSecret, approvalCode string) *FeishuProvider {
	return &FeishuProvider{
		appID:        appID,
		appSecret:    appSecret,
		approvalCode: approvalCode,
		baseURL:      "https://open.feishu.cn/open-apis",
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// GetName 获取平台名称
func (p *FeishuProvider) GetName() string {
	return "feishu"
}

// getTenantAccessToken 获取租户访问令牌
func (p *FeishuProvider) getTenantAccessToken(ctx context.Context) (string, error) {
	url := fmt.Sprintf("%s/auth/v3/tenant_access_token/internal", p.baseURL)

	reqBody := map[string]string{
		"app_id":     p.appID,
		"app_secret": p.appSecret,
	}

	body, _ := json.Marshal(reqBody)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(body))
	if err != nil {
		return "", err
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := p.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	var result struct {
		Code              int    `json:"code"`
		Msg               string `json:"msg"`
		TenantAccessToken string `json:"tenant_access_token"`
	}

	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", err
	}

	if result.Code != 0 {
		return "", fmt.Errorf("get tenant access token failed: %s", result.Msg)
	}

	return result.TenantAccessToken, nil
}

// CreateApproval 创建审批单
func (p *FeishuProvider) CreateApproval(ctx context.Context, approval *model.Approval) (string, error) {
	token, err := p.getTenantAccessToken(ctx)
	if err != nil {
		return "", fmt.Errorf("get token failed: %w", err)
	}

	// 构建审批表单
	formContent := p.buildFormContent(approval)

	url := fmt.Sprintf("%s/approval/v4/instances", p.baseURL)
	reqBody := map[string]interface{}{
		"approval_code": p.approvalCode,
		"user_id":       approval.ApplicantID,
		"form":          formContent,
	}

	body, _ := json.Marshal(reqBody)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(body))
	if err != nil {
		return "", err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))

	resp, err := p.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	var result struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
		Data struct {
			InstanceCode string `json:"instance_code"`
		} `json:"data"`
	}

	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", err
	}

	if result.Code != 0 {
		return "", fmt.Errorf("create approval failed: %s", result.Msg)
	}

	return result.Data.InstanceCode, nil
}

// buildFormContent 构建表单内容
func (p *FeishuProvider) buildFormContent(approval *model.Approval) string {
	formData := []map[string]interface{}{
		{
			"id":    "title",
			"type":  "input",
			"value": approval.Title,
		},
		{
			"id":    "reason",
			"type":  "textarea",
			"value": approval.Reason,
		},
		{
			"id":    "resource_type",
			"type":  "input",
			"value": approval.ResourceType,
		},
		{
			"id":    "duration",
			"type":  "input",
			"value": fmt.Sprintf("%d小时", approval.Duration),
		},
	}

	if len(approval.ResourceNames) > 0 {
		formData = append(formData, map[string]interface{}{
			"id":    "resources",
			"type":  "textarea",
			"value": fmt.Sprintf("%v", approval.ResourceNames),
		})
	}

	content, _ := json.Marshal(formData)
	return string(content)
}

// GetApprovalStatus 获取审批单状态
func (p *FeishuProvider) GetApprovalStatus(ctx context.Context, externalID string) (*ApprovalStatusResponse, error) {
	token, err := p.getTenantAccessToken(ctx)
	if err != nil {
		return nil, err
	}

	url := fmt.Sprintf("%s/approval/v4/instances/%s", p.baseURL, externalID)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var result struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
		Data struct {
			Status       string `json:"status"`
			ApproverName string `json:"approver_name"`
			UpdateTime   int64  `json:"update_time"`
		} `json:"data"`
	}

	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, err
	}

	if result.Code != 0 {
		return nil, fmt.Errorf("get approval status failed: %s", result.Msg)
	}

	status := p.convertStatus(result.Data.Status)

	return &ApprovalStatusResponse{
		Status:       status,
		ApproverName: result.Data.ApproverName,
		ApprovedAt:   time.Unix(result.Data.UpdateTime, 0).Format(time.RFC3339),
	}, nil
}

// convertStatus 转换状态
func (p *FeishuProvider) convertStatus(feishuStatus string) model.ApprovalStatus {
	switch feishuStatus {
	case "APPROVED":
		return model.ApprovalStatusApproved
	case "REJECTED":
		return model.ApprovalStatusRejected
	case "CANCELED":
		return model.ApprovalStatusCanceled
	case "DELETED":
		return model.ApprovalStatusCanceled
	default:
		return model.ApprovalStatusPending
	}
}

// CancelApproval 取消审批单
func (p *FeishuProvider) CancelApproval(ctx context.Context, externalID string) error {
	token, err := p.getTenantAccessToken(ctx)
	if err != nil {
		return err
	}

	url := fmt.Sprintf("%s/approval/v4/instances/%s/cancel", p.baseURL, externalID)
	req, err := http.NewRequestWithContext(ctx, "POST", url, nil)
	if err != nil {
		return err
	}

	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))

	resp, err := p.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	var result struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
	}

	if err := json.Unmarshal(respBody, &result); err != nil {
		return err
	}

	if result.Code != 0 {
		return fmt.Errorf("cancel approval failed: %s", result.Msg)
	}

	return nil
}

// HandleCallback 处理审批回调
func (p *FeishuProvider) HandleCallback(ctx context.Context, data interface{}) (*CallbackResult, error) {
	// 飞书回调数据解析
	callbackData, ok := data.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid callback data")
	}

	instanceCode, _ := callbackData["instance_code"].(string)
	status, _ := callbackData["status"].(string)
	approverName, _ := callbackData["approver_name"].(string)
	comment, _ := callbackData["comment"].(string)

	return &CallbackResult{
		ApprovalID:   instanceCode,
		Status:       p.convertStatus(status),
		ApproverName: approverName,
		Comment:      comment,
	}, nil
}

// ValidateConfig 验证配置
func (p *FeishuProvider) ValidateConfig(config map[string]interface{}) error {
	appID, ok := config["app_id"].(string)
	if !ok || appID == "" {
		return fmt.Errorf("app_id is required")
	}

	appSecret, ok := config["app_secret"].(string)
	if !ok || appSecret == "" {
		return fmt.Errorf("app_secret is required")
	}

	approvalCode, ok := config["approval_code"].(string)
	if !ok || approvalCode == "" {
		return fmt.Errorf("approval_code is required")
	}

	return nil
}
