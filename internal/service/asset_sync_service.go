package service

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/fisker/zjump-backend/internal/model"
	"github.com/fisker/zjump-backend/internal/repository"
	"github.com/google/uuid"
)

type AssetSyncService struct {
	repo     *repository.AssetSyncRepository
	hostRepo *repository.HostRepository
}

func NewAssetSyncService(repo *repository.AssetSyncRepository, hostRepo *repository.HostRepository) *AssetSyncService {
	return &AssetSyncService{
		repo:     repo,
		hostRepo: hostRepo,
	}
}

// SyncNow 立即执行同步
func (s *AssetSyncService) SyncNow(configID string) error {
	config, err := s.repo.GetByID(configID)
	if err != nil {
		return fmt.Errorf("配置不存在: %w", err)
	}

	if !config.Enabled {
		return fmt.Errorf("同步配置已禁用")
	}

	return s.executeSync(config)
}

// executeSync 执行同步
func (s *AssetSyncService) executeSync(config *model.AssetSyncConfig) error {
	startTime := time.Now()
	log.Printf("[AssetSync] Starting sync for config: %s (%s)", config.Name, config.Type)

	var syncedCount int
	var err error

	switch config.Type {
	case "prometheus":
		syncedCount, err = s.syncFromPrometheus(config)
	case "zabbix":
		syncedCount, err = s.syncFromZabbix(config)
	case "cmdb":
		syncedCount, err = s.syncFromCMDB(config)
	case "custom":
		syncedCount, err = s.syncFromCustomAPI(config)
	default:
		err = fmt.Errorf("unsupported sync type: %s", config.Type)
	}

	duration := int(time.Since(startTime).Seconds())
	status := "success"
	errorMsg := ""

	if err != nil {
		status = "failed"
		errorMsg = err.Error()
		log.Printf("[AssetSync]  Sync failed for %s: %v", config.Name, err)
	} else {
		log.Printf("[AssetSync]  Sync completed for %s: %d hosts synced", config.Name, syncedCount)
	}

	// 更新同步状态
	now := time.Now()
	config.LastSyncTime = &now
	config.LastSyncStatus = status
	config.SyncedCount = syncedCount
	config.ErrorMessage = errorMsg
	s.repo.Update(config)

	// 创建同步日志
	logEntry := &model.AssetSyncLog{
		ID:           uuid.New().String(),
		ConfigID:     config.ID,
		Status:       status,
		SyncedCount:  syncedCount,
		ErrorMessage: errorMsg,
		Duration:     duration,
	}
	s.repo.CreateLog(logEntry)

	return err
}

// syncFromPrometheus 从Prometheus同步
func (s *AssetSyncService) syncFromPrometheus(config *model.AssetSyncConfig) (int, error) {
	// 解析自定义配置
	var promConfig struct {
		Query string `json:"query"` // 自定义PromQL查询
	}

	// 从Config字段读取配置
	query := "up" // 默认查询
	if config.Config != "" {
		if err := json.Unmarshal([]byte(config.Config), &promConfig); err == nil {
			if promConfig.Query != "" {
				query = promConfig.Query
			}
		}
	}

	log.Printf("[AssetSync] Using Prometheus query: %s", query)

	// 使用query API查询
	queryURL := fmt.Sprintf("%s/api/v1/query?query=%s", config.URL, url.QueryEscape(query))

	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequest("GET", queryURL, nil)
	if err != nil {
		return 0, err
	}

	// 添加认证
	if config.AuthType == "basic" {
		req.SetBasicAuth(config.Username, config.Password)
	} else if config.AuthType == "token" {
		req.Header.Set("Authorization", "Bearer "+config.Token)
	}

	resp, err := client.Do(req)
	if err != nil {
		return 0, fmt.Errorf("failed to query Prometheus: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("Prometheus returned status: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return 0, err
	}

	var result struct {
		Status string `json:"status"`
		Data   struct {
			ResultType string `json:"resultType"`
			Result     []struct {
				Metric map[string]string `json:"metric"`
				Value  []interface{}     `json:"value"` // [timestamp, "value"]
			} `json:"result"`
		} `json:"data"`
	}

	if err := json.Unmarshal(body, &result); err != nil {
		return 0, fmt.Errorf("failed to parse response: %w", err)
	}

	// 用于去重的map（key为IP地址）
	ipMap := make(map[string]struct {
		job    string
		status string
	})

	// 处理结果，过滤和去重
	for _, item := range result.Data.Result {
		instance, ok := item.Metric["instance"]
		if !ok || instance == "" {
			continue
		}

		// 提取IP地址（去掉端口）
		ip := s.extractIP(instance)
		if ip == "" {
			log.Printf("[AssetSync] Skipping invalid instance: %s", instance)
			continue
		}

		// 只保留IP地址格式（过滤掉域名）
		if !s.isValidIP(ip) {
			log.Printf("[AssetSync] Skipping domain name: %s", instance)
			continue
		}

		// 解析value（0=离线，1=在线）
		status := "offline"
		if len(item.Value) >= 2 {
			if valueStr, ok := item.Value[1].(string); ok {
				if valueStr == "1" {
					status = "online"
				}
			}
		}

		// 获取job标签
		job := item.Metric["job"]
		if job == "" {
			job = "unknown"
		}

		// IP去重：同一个IP只保留第一个或状态为online的
		if existing, exists := ipMap[ip]; exists {
			// 如果新的是online，替换旧的
			if status == "online" && existing.status == "offline" {
				ipMap[ip] = struct {
					job    string
					status string
				}{job: job, status: status}
			}
			continue
		}

		// 添加到map
		ipMap[ip] = struct {
			job    string
			status string
		}{job: job, status: status}
	}

	log.Printf("[AssetSync] Found %d unique IP addresses after filtering", len(ipMap))

	// 处理每个唯一的IP（增量策略：存在就更新状态，不存在就新增）
	syncedCount := 0
	updatedCount := 0
	createdCount := 0
	skippedCount := 0

	for ip, info := range ipMap {
		// 检查主机是否已存在（以IP为唯一key）
		existing, _ := s.hostRepo.FindByIP(ip)
		if existing != nil {
			// 主机已存在，判断状态是否需要更新
			if existing.Status != info.status {
				if err := s.hostRepo.UpdateStatus(existing.ID, info.status); err != nil {
					log.Printf("[AssetSync]  Failed to update status for %s: %v", ip, err)
				} else {
					log.Printf("[AssetSync] 🔄 Updated: %s (%s) [%s → %s]",
						existing.Name, ip, existing.Status, info.status)
					updatedCount++
				}
			} else {
				// 状态未变，跳过
				skippedCount++
			}
			continue
		}

		// 不存在，创建新主机
		tags := fmt.Sprintf(`["prometheus","%s"]`, info.job)
		newHost := &model.Host{
			ID:         uuid.New().String(),
			Name:       fmt.Sprintf("prometheus-%s-%s", info.job, ip),
			IP:         ip,
			Port:       22, // 默认SSH端口
			DeviceType: "linux",
			Status:     info.status,
			Tags:       tags,
			// 注意：认证信息和协议请通过系统用户配置
		}

		if err := s.hostRepo.Create(newHost); err != nil {
			log.Printf("[AssetSync]  Failed to create host %s: %v", ip, err)
			continue
		}

		log.Printf("[AssetSync]  Created: %s (%s) [%s]", newHost.Name, ip, info.status)
		createdCount++
	}

	syncedCount = updatedCount + createdCount
	log.Printf("[AssetSync]  Sync summary: %d total IPs | %d created | %d updated | %d skipped (no change)",
		len(ipMap), createdCount, updatedCount, skippedCount)

	return syncedCount, nil
}

// syncFromZabbix 从Zabbix同步
func (s *AssetSyncService) syncFromZabbix(config *model.AssetSyncConfig) (int, error) {
	// Zabbix API调用
	// zabbixURL := fmt.Sprintf("%s/api_jsonrpc.php", config.URL)

	// 1. 先登录获取token (如果需要)
	// 2. 查询hosts
	// 3. 解析并创建主机

	// 这里是简化实现，实际需要根据Zabbix API文档完整实现
	return 0, fmt.Errorf("Zabbix integration not fully implemented yet")
}

// syncFromCMDB 从CMDB同步
func (s *AssetSyncService) syncFromCMDB(config *model.AssetSyncConfig) (int, error) {
	// 从CMDB API获取资产列表
	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequest("GET", config.URL, nil)
	if err != nil {
		return 0, err
	}

	// 添加认证
	if config.AuthType == "token" {
		req.Header.Set("Authorization", "Bearer "+config.Token)
	}

	resp, err := client.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("CMDB returned status: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return 0, err
	}

	// 解析CMDB响应（格式需要根据实际CMDB系统调整）
	var hosts []struct {
		Hostname string   `json:"hostname"`
		IP       string   `json:"ip"`
		Port     int      `json:"port"`
		OS       string   `json:"os"`
		Tags     []string `json:"tags"`
	}

	if err := json.Unmarshal(body, &hosts); err != nil {
		return 0, err
	}

	syncedCount := 0
	for _, h := range hosts {
		existing, _ := s.hostRepo.FindByIP(h.IP)
		if existing != nil {
			continue
		}

		// 合并tags并转为JSON字符串
		allTags := append(h.Tags, "cmdb")
		tagsJSON, _ := json.Marshal(allTags)

		newHost := &model.Host{
			ID:         uuid.New().String(),
			Name:       h.Hostname,
			IP:         h.IP,
			Port:       h.Port,
			DeviceType: "linux",
			OS:         h.OS,
			Tags:       string(tagsJSON),
			// 注意：认证信息和协议请通过系统用户配置
		}

		if err := s.hostRepo.Create(newHost); err != nil {
			log.Printf("[AssetSync] Failed to create host %s: %v", h.IP, err)
			continue
		}

		syncedCount++
	}

	return syncedCount, nil
}

// syncFromCustomAPI 从自定义API同步
func (s *AssetSyncService) syncFromCustomAPI(config *model.AssetSyncConfig) (int, error) {
	// 通用HTTP API调用
	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequest("GET", config.URL, nil)
	if err != nil {
		return 0, err
	}

	if config.AuthType == "token" {
		req.Header.Set("Authorization", "Bearer "+config.Token)
	}

	resp, err := client.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	// 简化实现
	return 0, fmt.Errorf("Custom API integration requires specific implementation")
}

// StartScheduler 启动定时同步调度器（不会立即执行同步）
func (s *AssetSyncService) StartScheduler() {
	log.Println("[AssetSync] 📅 Scheduler started (interval: 5 minutes)")
	log.Println("[AssetSync]   Auto-sync will only run for ENABLED configurations")

	ticker := time.NewTicker(5 * time.Minute) // 每5分钟检查一次
	go func() {
		for range ticker.C {
			s.checkAndSync()
		}
	}()
}

// checkAndSync 检查并执行需要同步的配置
func (s *AssetSyncService) checkAndSync() {
	// 只获取已启用的配置
	configs, err := s.repo.GetEnabledConfigs()
	if err != nil {
		log.Printf("[AssetSync]  Failed to get enabled configs: %v", err)
		return
	}

	if len(configs) == 0 {
		// 没有启用的配置，不输出日志，保持安静
		return
	}

	log.Printf("[AssetSync]  Checking %d enabled sync configuration(s)...", len(configs))

	for _, config := range configs {
		// 检查是否到了同步时间
		if config.LastSyncTime != nil {
			nextSync := config.LastSyncTime.Add(time.Duration(config.SyncInterval) * time.Minute)
			if time.Now().Before(nextSync) {
				continue // 还没到同步时间
			}
		}

		// 异步执行同步
		log.Printf("[AssetSync] ▶️  Triggering sync for: %s (%s)", config.Name, config.Type)
		go func(cfg model.AssetSyncConfig) {
			if err := s.executeSync(&cfg); err != nil {
				log.Printf("[AssetSync]  Sync failed for %s: %v", cfg.Name, err)
			}
		}(config)
	}
}

// extractIP 从instance中提取IP地址（去掉端口）
// 例如: "192.168.1.100:9100" -> "192.168.1.100"
//
//	"192.168.1.100" -> "192.168.1.100"
func (s *AssetSyncService) extractIP(instance string) string {
	// 如果包含端口，分割并取第一部分
	if strings.Contains(instance, ":") {
		parts := strings.Split(instance, ":")
		if len(parts) > 0 {
			return parts[0]
		}
	}
	return instance
}

// isValidIP 验证是否为有效的IP地址格式（排除域名）
func (s *AssetSyncService) isValidIP(ip string) bool {
	// 使用net.ParseIP验证
	parsedIP := net.ParseIP(ip)
	if parsedIP == nil {
		return false
	}
	// 只接受IPv4地址
	if parsedIP.To4() != nil {
		return true
	}
	// 也可以接受IPv6，根据需要启用
	// return true
	return false
}
