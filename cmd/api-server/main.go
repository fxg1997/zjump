package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/fisker/zjump-backend/internal/api/handler"
	"github.com/fisker/zjump-backend/internal/api/router"
	"github.com/fisker/zjump-backend/internal/approval"
	"github.com/fisker/zjump-backend/internal/audit"
	"github.com/fisker/zjump-backend/internal/bastion/blacklist"
	"github.com/fisker/zjump-backend/internal/bastion/storage"
	"github.com/fisker/zjump-backend/internal/notification"
	"github.com/fisker/zjump-backend/internal/repository"
	connrouter "github.com/fisker/zjump-backend/internal/router"
	"github.com/fisker/zjump-backend/internal/service"
	"github.com/fisker/zjump-backend/internal/sshserver/auth"
	"github.com/fisker/zjump-backend/internal/sshserver/recorder"
	"github.com/fisker/zjump-backend/internal/sshserver/server"
	"github.com/fisker/zjump-backend/internal/sshserver/terminal"
	"github.com/fisker/zjump-backend/pkg/config"
	"github.com/fisker/zjump-backend/pkg/database"
	"github.com/fisker/zjump-backend/pkg/logger"
	pkgredis "github.com/fisker/zjump-backend/pkg/redis"

	_ "github.com/fisker/zjump-backend/docs" // swagger docs
)

// @title           ZJump API
// @version         2.0
// @description     ZJump 堡垒机系统 API 文档
// @termsOfService  http://swagger.io/terms/

// @contact.name   API Support
// @contact.email  support@zjump.com

// @license.name  Apache 2.0
// @license.url   http://www.apache.org/licenses/LICENSE-2.0.html

// @host      localhost:8080
// @BasePath  /api

// @securityDefinitions.apikey Bearer
// @in header
// @name Authorization
// @description Type "Bearer" followed by a space and JWT token.

func main() {
	cfg, err := config.Load("config/config.yaml")
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	if err := logger.Init(&cfg.Logging); err != nil {
		log.Fatalf("Failed to initialize logger: %v", err)
	}

	if err := database.Init(&cfg.Database); err != nil {
		logger.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.Close()

	logger.Infof("Database initialized successfully")

	// Initialize Redis (optional, for distributed features)
	if err := pkgredis.Init(&cfg.Redis); err != nil {
		logger.Warnf("Failed to initialize Redis: %v (continuing without Redis)", err)
	} else if cfg.Redis.Enabled {
		defer pkgredis.Close()
		logger.Infof("Redis initialized successfully - distributed features enabled")
	}

	// Initialize repositories
	hostRepo := repository.NewHostRepository(database.DB)
	sessionRepo := repository.NewSessionRepository(database.DB)
	userRepo := repository.NewUserRepository(database.DB)
	settingRepo := repository.NewSettingRepository(database.DB)
	proxyRepo := repository.NewProxyRepository(database.DB)

	// Initialize services
	hostService := service.NewHostService(hostRepo)
	sessionService := service.NewSessionService(sessionRepo, hostRepo)
	authService := service.NewAuthService(userRepo, settingRepo)

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// Initialize Unified Audit Service (for both SSH Gateway and WebShell)
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	unifiedAuditor := audit.NewDatabaseAuditor(database.DB)
	logger.Infof("Unified Audit Service initialized")
	logger.Infof("   Supports: SSH Gateway + WebShell")

	// Create adapters for backward compatibility
	st := audit.NewWebShellStorageAdapter(unifiedAuditor)
	logger.Infof("WebShell Storage Adapter created")

	connectionRouter := connrouter.NewConnectionRouter(
		hostRepo,
		proxyRepo,
		settingRepo,
	)

	// Initialize notification manager first (needed by settingHandler and connectionHandler)
	notificationMgr := notification.InitFromDatabase(database.DB)

	// Initialize user group repository first (needed by authHandler)
	userGroupRepo := repository.NewUserGroupRepository(database.DB)

	// Initialize handlers
	hostHandler := handler.NewHostHandler(hostService)
	dashboardHandler := handler.NewDashboardHandler(hostService, sessionService)
	sessionHandler := handler.NewSessionHandler(sessionService)
	proxyHandler := handler.NewProxyHandler(database.DB)
	authHandler := handler.NewAuthHandler(authService, settingRepo, userGroupRepo)
	blacklistHandler := handler.NewBlacklistHandler(database.DB)
	settingHandler := handler.NewSettingHandler(settingRepo, notificationMgr)
	routingHandler := handler.NewRoutingHandler(connectionRouter, settingRepo, hostRepo, proxyRepo)

	// Initialize system user repository first (needed by connectionHandler)
	systemUserRepo := repository.NewSystemUserRepository(database.DB)

	connectionHandler := handler.NewConnectionHandler(connectionRouter, hostRepo, authService, st, database.DB, notificationMgr, systemUserRepo)

	// Host Group Handler
	hostGroupRepo := repository.NewHostGroupRepository(database.DB)
	hostGroupHandler := handler.NewHostGroupHandler(hostGroupRepo, hostRepo, userRepo)

	// Initialize Approval Factory and Providers (Third-party only)
	approvalFactory := approval.NewFactory()
	// Note: External providers (Feishu, Dingtalk) should be initialized with config
	// approvalFactory.Register(model.ApprovalPlatformFeishu, approval.NewFeishuProvider(appID, appSecret, approvalCode))
	// approvalFactory.Register(model.ApprovalPlatformDingtalk, approval.NewDingtalkProvider(appKey, appSecret, processCode))

	approvalHandler := handler.NewApprovalHandler(database.DB, approvalFactory)
	fileHandler := handler.NewFileHandler(database.DB, hostRepo)

	// Initialize Asset Sync
	assetSyncRepo := repository.NewAssetSyncRepository(database.DB)
	assetSyncService := service.NewAssetSyncService(assetSyncRepo, hostRepo)
	assetSyncHandler := handler.NewAssetSyncHandler(assetSyncRepo, assetSyncService)

	// Start asset sync scheduler
	assetSyncService.StartScheduler()
	logger.Infof("Asset sync scheduler started")

	// Start host status monitor (check every 5 minutes)
	hostMonitor := service.NewHostMonitorService(hostRepo, settingRepo, 5)
	hostMonitor.Start()
	logger.Infof("Host status monitor started (interval: 5 minutes)")

	// Initialize host monitor handler
	hostMonitorHandler := handler.NewHostMonitorHandler(hostMonitor)

	// Set hostMonitor to settingHandler so it can reload config
	settingHandler.SetHostMonitor(hostMonitor)

	// Initialize permission rule repository and handlers
	permissionRuleRepo := repository.NewPermissionRuleRepository(database.DB)

	systemUserHandler := handler.NewSystemUserHandler(systemUserRepo)
	userGroupHandler := handler.NewUserGroupHandler(userGroupRepo)
	permissionRuleHandler := handler.NewPermissionRuleHandler(permissionRuleRepo)

	// Start proxy monitor
	proxyMonitor := service.NewProxyMonitor(database.DB, service.MonitorConfig{
		CheckInterval:    1 * time.Minute,
		HeartbeatTimeout: 2 * time.Minute,
	})
	go proxyMonitor.Start()

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// Initialize SSH Gateway Server (integrated in API Server)
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	var sshServer *server.Server
	if cfg.Server.SSHPort > 0 {
		logger.Infof("")
		logger.Infof("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
		logger.Infof("Initializing SSH Gateway Server...")
		logger.Infof("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

		// Use new AuthManager with handler architecture
		sshAuthenticator := auth.NewAuthManager(authService)
		// Use unified auditor through adapter
		sshAuditor := audit.NewSSHGatewayAuditorAdapter(unifiedAuditor)

		// Create temporary storage for recorder (will be unified later)
		tempStorage := storage.NewDatabaseStorage(database.DB)
		sshRecorder := recorder.NewAdapterRecorder(tempStorage)

		// 使用新权限架构的主机选择器（V2）
		hostSelector := terminal.NewHostSelectorV2(hostRepo, hostGroupRepo, userRepo, systemUserRepo)
		blacklistMgr := blacklist.NewManagerFromDB(database.DB)

		// 连接通知管理器到黑名单管理器
		blacklistMgr.SetNotificationManager(notificationMgr)

		// 使用新权限架构的终端处理器（V2）
		terminalHandler := terminal.NewProxyHandlerV2(hostSelector, sshAuditor, sshRecorder, blacklistMgr, systemUserRepo)

		// 获取实例ID（用于日志显示）
		instanceID := cfg.Server.ProxyID
		if instanceID == "" {
			// 如果没有配置proxy_id，使用hostname
			if hostname, err := os.Hostname(); err == nil {
				instanceID = hostname
			} else {
				instanceID = "default"
			}
		}

		logger.Infof("   Instance ID:    %s", instanceID)
		logger.Infof("   Host Key Mode:  Database Shared (multi-instance)")
		logger.Infof("   Storage:        ssh_host_keys table")
		logger.Infof("   Note: No local files will be generated")

		sshConfig := &server.Config{
			ListenAddress:    fmt.Sprintf(":%d", cfg.Server.SSHPort),
			MaxSessions:      getMaxSessions(cfg),
			SessionTimeout:   24 * time.Hour,
			IdleTimeout:      30 * time.Minute,
			ServerVersion:    "SSH-2.0-ZJump_1.0",
			HostKeyPath:      "", // 不使用本地文件（使用数据库共享模式）
			EnablePassword:   true,
			EnablePublicKey:  true,        // 启用公钥认证
			DB:               database.DB, // 数据库连接
			UseSharedHostKey: true,        // 启用数据库共享密钥（多实例部署推荐）
		}

		var err error
		sshServer, err = server.NewServer(sshConfig, sshAuthenticator, terminalHandler)
		if err != nil {
			logger.Infof("Warning: Failed to create SSH server: %v", err)
			logger.Infof("   Continuing without SSH Gateway...")
		} else {
			go func() {
				if err := sshServer.Start(); err != nil {
					logger.Infof("SSH Server failed to start: %v", err)
				}
			}()

			logger.Infof("")
			logger.Infof("SSH Gateway Server initialized")
			logger.Infof("   Listen Address: :%d", cfg.Server.SSHPort)
			logger.Infof("   Max Sessions:   %d", getMaxSessions(cfg))
			logger.Infof("   Authentication: Password, PublicKey")
			logger.Infof("")
			logger.Infof("Usage: ssh <username>@<server-ip> -p %d", cfg.Server.SSHPort)
			logger.Infof("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
			logger.Infof("")
		}
	}

	r := router.Setup(hostHandler, dashboardHandler, sessionHandler, proxyHandler, authHandler, blacklistHandler, settingHandler, routingHandler, connectionHandler, hostGroupHandler, approvalHandler, fileHandler, assetSyncHandler, authService, hostMonitorHandler, systemUserHandler, userGroupHandler, permissionRuleHandler)

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// Initialize and Start Expiration Service
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	expirationService := service.NewExpirationService(database.DB)
	ctx := context.Background()
	go func() {
		if err := expirationService.Start(ctx); err != nil {
			logger.Warnf("Failed to start expiration service: %v", err)
		}
	}()
	logger.Infof("Expiration Service started")
	logger.Infof("   Checking for expired users and permissions")
	logger.Infof("")

	addr := fmt.Sprintf(":%d", cfg.Server.APIPort)
	httpServer := &http.Server{
		Addr:    addr,
		Handler: r,
	}

	// Print startup banner
	logger.Infof("")
	logger.Infof("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	logger.Infof("ZJump Unified Server v2.0 - Intelligent Routing Architecture")
	logger.Infof("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	logger.Infof("")
	logger.Infof("Features:")
	logger.Infof("   • Authentication & Authorization")
	logger.Infof("   • Intelligent Routing - Auto path selection")
	logger.Infof("   • Direct Connection - Default mode, low latency")
	logger.Infof("   • Proxy Forwarding - Use Proxy Agent in isolated networks")
	logger.Infof("   • Full Audit Trail - Complete operation logs")
	if cfg.Server.SSHPort > 0 {
		logger.Infof("   • SSH Gateway - CLI login with full audit")
	}
	logger.Infof("")
	logger.Infof("🔀 Connection Modes:")
	logger.Infof("   • Web Mode   - Browser access (:%d)", cfg.Server.APIPort)
	if cfg.Server.SSHPort > 0 {
		logger.Infof("   • SSH Mode   - SSH client (:%d)", cfg.Server.SSHPort)
	}
	logger.Infof("   • Direct     - API Server connects to target directly")
	logger.Infof("   • Proxy      - Via Proxy Agent (8022) for isolated networks")
	logger.Infof("")
	logger.Infof("Tips:")
	logger.Infof("   Start only this service for both Web and SSH access")
	logger.Infof("   Proxy Agent is optional, needed only for isolated networks")
	logger.Infof("")
	logger.Infof("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	logger.Infof("")

	// Start HTTP server in goroutine
	go func() {
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start HTTP server: %v", err)
		}
	}()

	// Wait for interrupt signal
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	<-sigChan

	logger.Infof("\nShutting down gracefully...")

	// Create shutdown context with 10s timeout
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	// 1. Shutdown HTTP server (stop accepting requests, wait for existing ones)
	logger.Infof("  → Stopping HTTP server...")
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		logger.Infof("  Warning: HTTP server shutdown error: %v", err)
	} else {
		logger.Infof("  ✓ HTTP server stopped")
	}

	// 2. Stop Expiration Service
	logger.Infof("  → Stopping expiration service...")
	expirationService.Stop()
	logger.Infof("  ✓ Expiration service stopped")

	// 3. Stop SSH Server
	if sshServer != nil {
		logger.Infof("  → Stopping SSH server...")
		if err := sshServer.Stop(); err != nil {
			logger.Infof("  Warning: SSH server shutdown error: %v", err)
		} else {
			logger.Infof("  ✓ SSH server stopped")
		}
	}

	// 3. Stop proxy monitor
	logger.Infof("  → Stopping proxy monitor...")
	proxyMonitor.Stop()
	logger.Infof("  ✓ Proxy monitor stopped")

	// 4. Close storage (wait for async writes)
	logger.Infof("  → Closing storage...")
	if err := st.Close(); err != nil {
		logger.Infof("  Warning: Storage close error: %v", err)
	} else {
		logger.Infof("  ✓ Storage closed")
	}

	// 5. Close database
	logger.Infof("  → Closing database...")
	database.Close()
	logger.Infof("  ✓ Database closed")

	logger.Infof("")
	logger.Infof("Shutdown complete")
	logger.Infof("")
}

// getMaxSessions returns max SSH sessions from config or default
func getMaxSessions(cfg *config.Config) int {
	if cfg.SSH.MaxSessions > 0 {
		return cfg.SSH.MaxSessions
	}
	return 100
}
