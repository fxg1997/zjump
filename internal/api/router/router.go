package router

import (
	"github.com/fisker/zjump-backend/internal/api/handler"
	"github.com/fisker/zjump-backend/internal/api/middleware"
	"github.com/fisker/zjump-backend/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
)

func Setup(
	hostHandler *handler.HostHandler,
	dashboardHandler *handler.DashboardHandler,
	sessionHandler *handler.SessionHandler,
	proxyHandler *handler.ProxyHandler,
	authHandler *handler.AuthHandler,
	blacklistHandler *handler.BlacklistHandler,
	settingHandler *handler.SettingHandler,
	routingHandler *handler.RoutingHandler,
	connectionHandler *handler.ConnectionHandler,
	hostGroupHandler *handler.HostGroupHandler,
	approvalHandler *handler.ApprovalHandler,
	fileHandler *handler.FileHandler,
	assetSyncHandler *handler.AssetSyncHandler,
	authService *service.AuthService,
	hostMonitorHandler *handler.HostMonitorHandler,
	systemUserHandler *handler.SystemUserHandler,
	userGroupHandler *handler.UserGroupHandler,
	permissionRuleHandler *handler.PermissionRuleHandler,
) *gin.Engine {
	r := gin.Default()

	// 中间件
	r.Use(middleware.CORS())

	// WebSocket 连接入口（统一入口，支持直连和代理）
	r.GET("/ws/connect", connectionHandler.HandleConnection)

	// 公开API（不需要认证）
	api := r.Group("/api")
	{
		// 认证相关（公开）
		auth := api.Group("/auth")
		{
			auth.POST("/register", authHandler.Register)
			auth.POST("/login", authHandler.Login)
			auth.POST("/logout", authHandler.Logout)
			auth.GET("/method", authHandler.GetAuthMethod)     // 获取当前认证方式
			auth.GET("/sso/config", authHandler.GetSSOConfig)  // 获取SSO配置状态
			auth.GET("/sso/initiate", authHandler.InitiateSSO) // 发起 SSO 登录
			auth.GET("/sso/callback", authHandler.SSOCallback) // SSO 回调
		}

		// 公开的系统设置（登录页也需要）
		api.GET("/settings/public", settingHandler.GetPublicSettings)
		api.GET("/auth/methods", settingHandler.GetAuthMethods) // 获取启用的认证方式

		// Proxy 注册和同步（不需要认证，由 Proxy 调用）
		proxy := api.Group("/proxy")
		{
			proxy.POST("/register", proxyHandler.RegisterProxy)
			proxy.POST("/unregister", proxyHandler.Unregister)
			proxy.POST("/heartbeat", proxyHandler.Heartbeat)

			// 实时上报
			proxy.POST("/sessions", proxyHandler.ReportSession) // 实时会话上报
			proxy.POST("/sessions/:session_id/close", proxyHandler.CloseSession)
			proxy.POST("/commands", proxyHandler.ReportCommand) // 实时命令上报

			// 批量同步（定时任务，兼容旧方式）
			proxy.POST("/sessions/batch", proxyHandler.SyncSessions)
			proxy.POST("/commands/batch", proxyHandler.SyncCommands)

			// 黑名单（供 Proxy 获取，不需要认证）
			proxy.GET("/blacklist", blacklistHandler.GetActiveCommands)

			// 令牌验证（供 Proxy 调用）
			proxy.GET("/validate-token", sessionHandler.ValidateToken)
		}
	}

	// 需要认证的API
	authenticated := api.Group("")
	authenticated.Use(middleware.AuthMiddleware(authService))
	{
		// 用户相关
		authenticated.GET("/auth/me", authHandler.GetCurrentUser)
		authenticated.GET("/auth/login-records", authHandler.GetPlatformLoginRecords)

		// 用户列表（用于黑名单选择用户）
		authenticated.GET("/users", authHandler.GetUsers)

		// Dashboard
		dashboard := authenticated.Group("/dashboard")
		{
			dashboard.GET("/stats", dashboardHandler.GetStats)
			dashboard.GET("/recent-logins", dashboardHandler.GetRecentLogins)
			dashboard.GET("/frequent-hosts", dashboardHandler.GetFrequentHosts) // 获取用户常用主机
		}

		// Hosts
		hosts := authenticated.Group("/hosts")
		{
			hosts.GET("", hostHandler.ListHosts)
			hosts.POST("", hostHandler.CreateHost)
			hosts.GET("/:id", hostHandler.GetHost)
			hosts.PUT("/:id", hostHandler.UpdateHost)
			hosts.DELETE("/:id", hostHandler.DeleteHost)
			hosts.POST("/:id/test", hostHandler.TestConnection)
			hosts.POST("/:id/check-status", hostMonitorHandler.CheckHostStatus)     // 手动检查主机状态
			hosts.POST("/check-all-status", hostMonitorHandler.CheckAllHostsStatus) // 检查所有主机状态
			hosts.GET("/:id/groups", hostGroupHandler.GetHostGroups)                // 获取主机所属分组
		}

		// Host Groups (主机分组管理)
		hostGroups := authenticated.Group("/host-groups")
		{
			hostGroups.GET("", hostGroupHandler.ListGroups)                        // 获取所有分组
			hostGroups.POST("", hostGroupHandler.CreateGroup)                      // 创建分组
			hostGroups.GET("/:id", hostGroupHandler.GetGroup)                      // 获取分组详情
			hostGroups.PUT("/:id", hostGroupHandler.UpdateGroup)                   // 更新分组
			hostGroups.DELETE("/:id", hostGroupHandler.DeleteGroup)                // 删除分组
			hostGroups.GET("/:id/hosts", hostGroupHandler.GetGroupHosts)           // 获取分组中的主机
			hostGroups.POST("/:id/hosts", hostGroupHandler.AddHostsToGroup)        // 添加主机到分组
			hostGroups.DELETE("/:id/hosts", hostGroupHandler.RemoveHostsFromGroup) // 从分组移除主机
			hostGroups.GET("/:id/statistics", hostGroupHandler.GetGroupStatistics) // 获取分组统计
			hostGroups.GET("/:id/users", hostGroupHandler.GetGroupUsers)           // 获取分组的授权用户列表
		}

		// Sessions（普通接口）
		sessions := authenticated.Group("/sessions")
		{
			sessions.POST("", sessionHandler.CreateSession)
			sessions.GET("/records", sessionHandler.GetLoginRecords) // 历史记录（用户看自己的，管理员看全部）
		}

		// 文件传输
		files := authenticated.Group("/files")
		{
			files.POST("/upload", fileHandler.UploadFile)         // 上传文件到目标服务器
			files.POST("/download", fileHandler.DownloadFile)     // 从目标服务器下载文件
			files.GET("/transfers", fileHandler.GetFileTransfers) // 获取文件传输记录
		}

		// 会话管理（仅管理员）
		sessionManage := authenticated.Group("/sessions")
		sessionManage.Use(middleware.AdminMiddleware())
		{
			// 会话录制
			sessionManage.GET("/recordings", sessionHandler.GetSessionRecordings)
			sessionManage.GET("/recordings/:sessionId", sessionHandler.GetSessionRecording)
			sessionManage.POST("/recordings", sessionHandler.CreateSessionRecording)

			// 终止会话
			sessionManage.DELETE("/:sessionId/terminate", sessionHandler.TerminateSession)
		}

		// 命令审计（仅管理员）
		commands := authenticated.Group("/commands")
		commands.Use(middleware.AdminMiddleware())
		{
			commands.GET("", sessionHandler.GetCommandRecords)
			commands.POST("", sessionHandler.CreateCommandRecord)
			commands.GET("/session/:sessionId", sessionHandler.GetCommandsBySession)
		}

		// 黑名单管理（仅管理员）
		blacklist := authenticated.Group("/proxy/blacklist")
		blacklist.Use(middleware.AdminMiddleware())
		{
			blacklist.GET("/commands", blacklistHandler.GetCommands)
			blacklist.POST("/commands", blacklistHandler.CreateCommand)
			blacklist.PATCH("/commands/:id", blacklistHandler.UpdateCommand)
			blacklist.DELETE("/commands/:id", blacklistHandler.DeleteCommand)
		}

		// Proxy 管理（需要管理员权限）
		proxyManage := authenticated.Group("/proxy")
		proxyManage.Use(middleware.AdminMiddleware())
		{
			proxyManage.GET("/list", proxyHandler.ListProxies)
			proxyManage.GET("/:proxy_id/stats", proxyHandler.GetProxyStats)
		}

		// SSH密钥管理（用户可以管理自己的密钥，handler内有权限检查）
		userSSHKey := authenticated.Group("/user-management")
		{
			userSSHKey.POST("/users/:id/ssh-key/generate", authHandler.GenerateSSHKey)       // 生成SSH密钥
			userSSHKey.DELETE("/users/:id/ssh-key", authHandler.DeleteSSHKey)                // 删除SSH密钥
			userSSHKey.GET("/users/:id/ssh-key/download", authHandler.DownloadSSHPrivateKey) // 下载私钥
			userSSHKey.PUT("/users/:id/auth-method", authHandler.UpdateUserAuthMethod)       // 更新认证方式
		}

		// 用户管理（需要管理员权限）
		userManage := authenticated.Group("/user-management")
		userManage.Use(middleware.AdminMiddleware())
		{
			userManage.GET("/users", authHandler.GetUsersWithPagination)                    // 分页获取用户列表
			userManage.GET("/users-with-groups", authHandler.GetUsersWithGroups)            // 获取用户及其分组信息
			userManage.GET("/users-with-user-groups", authHandler.GetUsersWithUserGroups)   // 获取用户及其所属用户组
			userManage.POST("/users", authHandler.CreateUserByAdmin)                        // 创建用户
			userManage.GET("/users/:id", authHandler.GetUserWithGroups)                     // 获取用户详情
			userManage.PUT("/users/:id", authHandler.UpdateUserByAdmin)                     // 更新用户信息
			userManage.PUT("/users/:id/role", authHandler.UpdateUserRole)                   // 更新用户角色
			userManage.PUT("/users/:id/status", authHandler.UpdateUserStatus)               // 更新用户状态
			userManage.DELETE("/users/:id", authHandler.DeleteUser)                         // 删除用户
			userManage.POST("/users/:id/reset-password", authHandler.ResetUserPassword)     // 重置密码
			userManage.GET("/users/:id/groups", authHandler.GetUserGroups)                  // 获取用户分组权限
			userManage.POST("/users/:id/groups", authHandler.AssignGroupsToUser)            // 分配分组权限
			userManage.GET("/users/:id/hosts", authHandler.GetUserHosts)                    // 获取用户主机权限
			userManage.POST("/users/:id/hosts", authHandler.AssignHostsToUser)              // 分配主机权限
			userManage.GET("/users/:id/permissions", authHandler.GetUserWithGroupsAndHosts) // 获取用户完整权限
		}

		// 系统设置（仅管理员）
		settings := authenticated.Group("/settings")
		settings.Use(middleware.AdminMiddleware())
		{
			settings.GET("", settingHandler.GetAllSettings)                          // 获取所有设置
			settings.GET("/:category", settingHandler.GetSettingsByCategory)         // 根据分类获取设置
			settings.PUT("", settingHandler.UpdateSettings)                          // 批量更新设置
			settings.PUT("/item", settingHandler.UpdateSetting)                      // 更新单个设置
			settings.DELETE("/:key", settingHandler.DeleteSetting)                   // 删除设置
			settings.POST("/test-ldap", settingHandler.TestLDAPConnection)           // 测试 LDAP 连接
			settings.POST("/test-sso", settingHandler.TestSSOConnection)             // 测试 SSO 配置
			settings.POST("/test-feishu", settingHandler.TestFeishuNotification)     // 测试飞书通知
			settings.POST("/test-dingtalk", settingHandler.TestDingtalkNotification) // 测试钉钉通知
			settings.POST("/test-wechat", settingHandler.TestWechatNotification)     // 测试企业微信通知
		}

		// 路由决策（基于标签）
		routing := authenticated.Group("/routing")
		{
			// 路由配置管理（基于标签）
			routing.GET("/config", routingHandler.GetRoutingConfig)     // 获取路由配置
			routing.PUT("/config", routingHandler.UpdateRoutingConfig)  // 更新路由配置
			routing.GET("/proxies", routingHandler.GetAvailableProxies) // 获取可用代理列表

			// 旧的路由规则API（已废弃，仅为兼容性保留）
			routing.GET("/rules", routingHandler.ListRoutingRules)               // Deprecated
			routing.GET("/rules/:id", routingHandler.GetRoutingRule)             // Deprecated
			routing.POST("/rules", routingHandler.CreateRoutingRule)             // Deprecated
			routing.PUT("/rules/:id", routingHandler.UpdateRoutingRule)          // Deprecated
			routing.DELETE("/rules/:id", routingHandler.DeleteRoutingRule)       // Deprecated
			routing.PATCH("/rules/:id/toggle", routingHandler.ToggleRoutingRule) // Deprecated
		}

		// 主机路由决策（需要认证）
		authenticated.GET("/hosts/:id/route", routingHandler.GetRoutingDecision) // 获取主机的路由决策

		// 审批管理（工单系统）
		approvals := authenticated.Group("/approvals")
		{
			approvals.GET("", approvalHandler.ListApprovals)            // 获取审批列表（支持筛选：我的申请、待我审批、全部）
			approvals.POST("", approvalHandler.CreateApproval)          // 创建审批申请
			approvals.GET("/stats", approvalHandler.GetApprovalStats)   // 获取审批统计
			approvals.GET("/config", approvalHandler.GetApprovalConfig) // 获取审批配置（所有用户可读）
			// 注意：搜索路由必须在 /:id 之前，否则会被动态路由匹配
			approvals.GET("/search/users", approvalHandler.SearchUsers) // 搜索用户（审批人选择）
			approvals.GET("/search/hosts", approvalHandler.SearchHosts) // 搜索主机（资源选择）
			// 动态路由放在后面
			approvals.GET("/:id", approvalHandler.GetApproval)              // 获取审批详情
			approvals.POST("/:id/approve", approvalHandler.ApproveApproval) // 批准审批
			approvals.POST("/:id/reject", approvalHandler.RejectApproval)   // 拒绝审批
			approvals.POST("/:id/cancel", approvalHandler.CancelApproval)   // 取消审批
			approvals.POST("/:id/comments", approvalHandler.AddComment)     // 添加评论
		}

		// 审批配置管理（仅管理员可修改）
		approvalConfig := authenticated.Group("/approvals/config")
		approvalConfig.Use(middleware.AdminMiddleware())
		{
			approvalConfig.POST("", approvalHandler.UpdateApprovalConfig)       // 创建审批配置
			approvalConfig.PUT("/:id", approvalHandler.UpdateApprovalConfig)    // 更新审批配置
			approvalConfig.DELETE("/:id", approvalHandler.DeleteApprovalConfig) // 删除审批配置
		}

		// 资产同步（仅管理员）
		assetSync := authenticated.Group("/asset-sync")
		assetSync.Use(middleware.AdminMiddleware())
		{
			assetSync.GET("/configs", assetSyncHandler.ListConfigs)              // 获取所有同步配置
			assetSync.POST("/configs", assetSyncHandler.CreateConfig)            // 创建同步配置
			assetSync.PUT("/configs/:id", assetSyncHandler.UpdateConfig)         // 更新同步配置
			assetSync.DELETE("/configs/:id", assetSyncHandler.DeleteConfig)      // 删除同步配置
			assetSync.POST("/configs/:id/toggle", assetSyncHandler.ToggleConfig) // 启用/禁用配置
			assetSync.POST("/configs/:id/sync", assetSyncHandler.SyncNow)        // 立即同步
			assetSync.GET("/logs", assetSyncHandler.GetLogs)                     // 获取同步日志
		}

		// 系统用户管理
		systemUsers := authenticated.Group("/system-users")
		{
			systemUsers.GET("", systemUserHandler.ListSystemUsers)                                       // 获取系统用户列表
			systemUsers.GET("/available", systemUserHandler.GetAvailableSystemUsers)                     // 获取用户可用的系统用户（用于登录前选择）
			systemUsers.GET("/check-permission", systemUserHandler.CheckPermission)                      // 检查权限
			systemUsers.GET("/:id", systemUserHandler.GetSystemUser)                                     // 获取单个系统用户
			systemUsers.POST("", middleware.AdminMiddleware(), systemUserHandler.CreateSystemUser)       // 创建系统用户（管理员）
			systemUsers.PUT("/:id", middleware.AdminMiddleware(), systemUserHandler.UpdateSystemUser)    // 更新系统用户（管理员）
			systemUsers.DELETE("/:id", middleware.AdminMiddleware(), systemUserHandler.DeleteSystemUser) // 删除系统用户（管理员）
		}

		// 用户组管理
		userGroups := authenticated.Group("/user-groups")
		{
			userGroups.GET("", userGroupHandler.ListUserGroups)                                                             // 获取用户组列表
			userGroups.GET("/by-user", userGroupHandler.GetUserGroups)                                                      // 获取用户所在的用户组
			userGroups.GET("/:id", userGroupHandler.GetUserGroup)                                                           // 获取单个用户组
			userGroups.GET("/:id/members", userGroupHandler.GetUserGroupMembers)                                            // 获取用户组成员
			userGroups.POST("", middleware.AdminMiddleware(), userGroupHandler.CreateUserGroup)                             // 创建用户组（管理员）
			userGroups.PUT("/:id", middleware.AdminMiddleware(), userGroupHandler.UpdateUserGroup)                          // 更新用户组（管理员）
			userGroups.DELETE("/:id", middleware.AdminMiddleware(), userGroupHandler.DeleteUserGroup)                       // 删除用户组（管理员）
			userGroups.POST("/:id/members", middleware.AdminMiddleware(), userGroupHandler.AddUserGroupMember)              // 添加成员（管理员）
			userGroups.DELETE("/:id/members/:userId", middleware.AdminMiddleware(), userGroupHandler.RemoveUserGroupMember) // 移除成员（管理员）
			userGroups.POST("/:id/members/batch", middleware.AdminMiddleware(), userGroupHandler.BatchAddMembers)           // 批量添加成员（管理员）
		}

		// 授权规则管理（仅管理员）
		permissionRules := authenticated.Group("/permission-rules")
		permissionRules.Use(middleware.AdminMiddleware())
		{
			permissionRules.GET("", permissionRuleHandler.ListPermissionRules)                         // 获取授权规则列表
			permissionRules.GET("/:id", permissionRuleHandler.GetPermissionRule)                       // 获取单个授权规则
			permissionRules.POST("", permissionRuleHandler.CreatePermissionRule)                       // 创建授权规则
			permissionRules.PUT("/:id", permissionRuleHandler.UpdatePermissionRule)                    // 更新授权规则
			permissionRules.DELETE("/:id", permissionRuleHandler.DeletePermissionRule)                 // 删除授权规则
			permissionRules.GET("/by-user-group", permissionRuleHandler.GetPermissionRulesByUserGroup) // 根据用户组查询
			permissionRules.GET("/by-host-group", permissionRuleHandler.GetPermissionRulesByHostGroup) // 根据主机组查询
		}
	}
	// authenticated路由组结束

	// 第三方审批平台回调（不需要认证）
	api.POST("/approvals/callback/:platform", approvalHandler.HandleCallback)

	// Prometheus Metrics
	r.GET("/metrics", gin.WrapH(promhttp.Handler()))

	// Health check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status": "ok",
			"type":   "api-server",
		})
	})

	// Swagger API documentation
	r.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))

	return r
}
