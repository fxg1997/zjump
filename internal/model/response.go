package model

type Response struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

func Success(data interface{}) Response {
	return Response{
		Code:    0,
		Message: "success",
		Data:    data,
	}
}

func Error(code int, message string) Response {
	return Response{
		Code:    code,
		Message: message,
	}
}

// ErrorResponse 错误响应
type ErrorResponse struct {
	Error string `json:"error"`
}

// SuccessResponse 成功响应
type SuccessResponse struct {
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

type DashboardStats struct {
	TotalHosts   int `json:"totalHosts"`
	OnlineHosts  int `json:"onlineHosts"`
	OfflineHosts int `json:"offlineHosts"`
	RecentLogins int `json:"recentLogins"`
}

type HostsResponse struct {
	Hosts []Host `json:"hosts"`
	Total int64  `json:"total"`
}

type SessionResponse struct {
	SessionID string `json:"sessionId"`
	WSUrl     string `json:"wsUrl"`
	Token     string `json:"token"` // 临时令牌，用于 Proxy 验证
}

type TestConnectionResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}
