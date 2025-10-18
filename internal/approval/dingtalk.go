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

// DingtalkProvider 钉钉审批提供者
type DingtalkProvider struct {
	appKey      string
	appSecret   string
	processCode string // 审批流程 Code
	baseURL     string
	client      *http.Client
}

// NewDingtalkProvider 创建钉钉审批提供者
func NewDingtalkProvider(appKey, appSecret, processCode string) *DingtalkProvider {
	return &DingtalkProvider{
		appKey:      appKey,
		appSecret:   appSecret,
		processCode: processCode,
		baseURL:     "https://oapi.dingtalk.com",
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// GetName 获取平台名称
func (p *DingtalkProvider) GetName() string {
	return "dingtalk"
}

// getAccessToken 获取访问令牌
func (p *DingtalkProvider) getAccessToken(ctx context.Context) (string, error) {
	url := fmt.Sprintf("%s/gettoken?appkey=%s&appsecret=%s", p.baseURL, p.appKey, p.appSecret)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return "", err
	}

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
		Errcode     int    `json:"errcode"`
		Errmsg      string `json:"errmsg"`
		AccessToken string `json:"access_token"`
	}

	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", err
	}

	if result.Errcode != 0 {
		return "", fmt.Errorf("get access token failed: %s", result.Errmsg)
	}

	return result.AccessToken, nil
}

// CreateApproval 创建审批单
func (p *DingtalkProvider) CreateApproval(ctx context.Context, approval *model.Approval) (string, error) {
	token, err := p.getAccessToken(ctx)
	if err != nil {
		return "", fmt.Errorf("get token failed: %w", err)
	}

	// 构建审批表单
	formValues := p.buildFormValues(approval)

	url := fmt.Sprintf("%s/topapi/processinstance/create?access_token=%s", p.baseURL, token)
	reqBody := map[string]interface{}{
		"process_code":          p.processCode,
		"originator_user_id":    approval.ApplicantID,
		"form_component_values": formValues,
	}

	// 如果有指定审批人
	if len(approval.ApproverIDs) > 0 {
		reqBody["approvers"] = approval.ApproverIDs
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
		Errcode           int    `json:"errcode"`
		Errmsg            string `json:"errmsg"`
		ProcessInstanceId string `json:"process_instance_id"`
	}

	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", err
	}

	if result.Errcode != 0 {
		return "", fmt.Errorf("create approval failed: %s", result.Errmsg)
	}

	return result.ProcessInstanceId, nil
}

// buildFormValues 构建表单值
func (p *DingtalkProvider) buildFormValues(approval *model.Approval) []map[string]interface{} {
	formValues := []map[string]interface{}{
		{
			"name":  "标题",
			"value": approval.Title,
		},
		{
			"name":  "申请理由",
			"value": approval.Reason,
		},
		{
			"name":  "资源类型",
			"value": approval.ResourceType,
		},
		{
			"name":  "权限时长",
			"value": fmt.Sprintf("%d小时", approval.Duration),
		},
	}

	if len(approval.ResourceNames) > 0 {
		resourcesStr := ""
		for _, name := range approval.ResourceNames {
			resourcesStr += name + "\n"
		}
		formValues = append(formValues, map[string]interface{}{
			"name":  "申请资源",
			"value": resourcesStr,
		})
	}

	return formValues
}

// GetApprovalStatus 获取审批单状态
func (p *DingtalkProvider) GetApprovalStatus(ctx context.Context, externalID string) (*ApprovalStatusResponse, error) {
	token, err := p.getAccessToken(ctx)
	if err != nil {
		return nil, err
	}

	url := fmt.Sprintf("%s/topapi/processinstance/get?access_token=%s", p.baseURL, token)
	reqBody := map[string]interface{}{
		"process_instance_id": externalID,
	}

	body, _ := json.Marshal(reqBody)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(body))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")

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
		Errcode         int    `json:"errcode"`
		Errmsg          string `json:"errmsg"`
		ProcessInstance struct {
			Status     string `json:"status"`
			Result     string `json:"result"`
			FinishTime int64  `json:"finish_time"`
		} `json:"process_instance"`
	}

	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, err
	}

	if result.Errcode != 0 {
		return nil, fmt.Errorf("get approval status failed: %s", result.Errmsg)
	}

	status := p.convertStatus(result.ProcessInstance.Status, result.ProcessInstance.Result)

	return &ApprovalStatusResponse{
		Status:     status,
		ApprovedAt: time.Unix(result.ProcessInstance.FinishTime/1000, 0).Format(time.RFC3339),
	}, nil
}

// convertStatus 转换状态
func (p *DingtalkProvider) convertStatus(status, result string) model.ApprovalStatus {
	switch status {
	case "COMPLETED":
		if result == "agree" {
			return model.ApprovalStatusApproved
		}
		return model.ApprovalStatusRejected
	case "TERMINATED":
		return model.ApprovalStatusCanceled
	default:
		return model.ApprovalStatusPending
	}
}

// CancelApproval 取消审批单
func (p *DingtalkProvider) CancelApproval(ctx context.Context, externalID string) error {
	token, err := p.getAccessToken(ctx)
	if err != nil {
		return err
	}

	url := fmt.Sprintf("%s/topapi/processinstance/terminate?access_token=%s", p.baseURL, token)
	reqBody := map[string]interface{}{
		"process_instance_id": externalID,
	}

	body, _ := json.Marshal(reqBody)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(body))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")

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
		Errcode int    `json:"errcode"`
		Errmsg  string `json:"errmsg"`
	}

	if err := json.Unmarshal(respBody, &result); err != nil {
		return err
	}

	if result.Errcode != 0 {
		return fmt.Errorf("cancel approval failed: %s", result.Errmsg)
	}

	return nil
}

// HandleCallback 处理审批回调
func (p *DingtalkProvider) HandleCallback(ctx context.Context, data interface{}) (*CallbackResult, error) {
	// 钉钉回调数据解析
	callbackData, ok := data.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid callback data")
	}

	processInstanceId, _ := callbackData["processInstanceId"].(string)
	result, _ := callbackData["result"].(string)
	status, _ := callbackData["type"].(string)

	return &CallbackResult{
		ApprovalID: processInstanceId,
		Status:     p.convertStatus(status, result),
	}, nil
}

// ValidateConfig 验证配置
func (p *DingtalkProvider) ValidateConfig(config map[string]interface{}) error {
	appKey, ok := config["app_key"].(string)
	if !ok || appKey == "" {
		return fmt.Errorf("app_key is required")
	}

	appSecret, ok := config["app_secret"].(string)
	if !ok || appSecret == "" {
		return fmt.Errorf("app_secret is required")
	}

	processCode, ok := config["process_code"].(string)
	if !ok || processCode == "" {
		return fmt.Errorf("process_code is required")
	}

	return nil
}
