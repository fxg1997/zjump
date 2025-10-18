package terminal

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/fisker/zjump-backend/internal/bastion/blacklist"
	"github.com/fisker/zjump-backend/internal/repository"
	"github.com/fisker/zjump-backend/internal/sshserver/types"
	"github.com/google/uuid"
	"golang.org/x/crypto/ssh"
)

// ProxyHandler 终端代理处理器（Proxy Pattern）
type ProxyHandler struct {
	selector       types.HostSelector
	auditor        types.Auditor
	recorder       types.SessionRecorder
	blacklistMgr   *blacklist.Manager               // 黑名单管理器
	systemUserRepo *repository.SystemUserRepository // 系统用户仓库（用于新权限架构）
}

// NewProxyHandler 创建代理处理器
func NewProxyHandler(
	selector types.HostSelector,
	auditor types.Auditor,
	recorder types.SessionRecorder,
	blacklistMgr *blacklist.Manager,
) types.TerminalHandler {
	return &ProxyHandler{
		selector:       selector,
		auditor:        auditor,
		recorder:       recorder,
		blacklistMgr:   blacklistMgr,
		systemUserRepo: nil, // 旧接口兼容性
	}
}

// NewProxyHandlerV2 创建使用新权限架构的代理处理器
func NewProxyHandlerV2(
	selector types.HostSelector,
	auditor types.Auditor,
	recorder types.SessionRecorder,
	blacklistMgr *blacklist.Manager,
	systemUserRepo *repository.SystemUserRepository,
) types.TerminalHandler {
	return &ProxyHandler{
		selector:       selector,
		auditor:        auditor,
		recorder:       recorder,
		blacklistMgr:   blacklistMgr,
		systemUserRepo: systemUserRepo,
	}
}

// HandleTerminal 处理终端会话 - 循环菜单模式
func (h *ProxyHandler) HandleTerminal(ctx context.Context, channel ssh.Channel, session *types.SessionInfo) error {
	// 注意：不要在这里关闭 channel，它由 SSH server 管理
	// defer channel.Close()

	// Recover from panic
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[TerminalHandler] Panic recovered: %v", r)
		}
	}()

	// 创建新版菜单（支持分组）
	menu := NewMenuV2(h.selector, channel)

	// 显示欢迎信息（只显示一次）
	menu.ShowWelcome(session.Username)

	// 主循环：允许用户连接多个主机
	for {
		// 交互式命令菜单（新版分组菜单）
		selectedHost, shouldExit := menu.InteractiveMenuV2(session.UserID)

		if shouldExit {
			// 用户选择退出
			menu.ShowGoodbye()
			return nil
		}

		if selectedHost == nil {
			// 没有选择主机（取消或其他），继续循环
			continue
		}

		// 用户选择了主机，开始连接
		log.Printf("[TerminalHandler] User selected host: %s (%s)", selectedHost.Name, selectedHost.IP)

		// 连接并处理主机会话
		if err := h.handleHostConnection(ctx, channel, session, selectedHost, menu); err != nil {
			// 连接失败，显示错误后返回菜单
			menu.ShowError(fmt.Sprintf("Connection failed: %v", err))
			menu.PromptPressToContinue()
			continue
		}

		// 主机会话正常结束，自动返回菜单（不需要按回车）
		log.Printf("[TerminalHandler] Host session ended, returning to menu")
		menu.ShowReturnToMenu()
		// 继续循环，显示菜单
	}
}

// handleHostConnection 处理单个主机连接会话
func (h *ProxyHandler) handleHostConnection(ctx context.Context, channel ssh.Channel, session *types.SessionInfo, selectedHost *types.HostInfo, menu *MenuV2) error {
	// 为每个主机连接生成新的子会话ID（避免session复用问题）
	// 保存原始的SSH连接session ID
	originalSessionID := session.SessionID
	hostSessionID := fmt.Sprintf("%s-%s", originalSessionID, uuid.New().String()[:8])

	// 创建主机会话的副本，使用新的sessionID
	hostSession := &types.SessionInfo{
		SessionID:    hostSessionID, // 新的子会话ID
		UserID:       session.UserID,
		Username:     session.Username,
		ClientIP:     session.ClientIP,
		HostID:       selectedHost.ID,
		HostName:     selectedHost.Name, // 添加主机名称
		HostIP:       selectedHost.IP,
		HostPort:     selectedHost.Port,
		HostUsername: selectedHost.Username,
		StartTime:    time.Now(), // 新的开始时间
		Status:       "connecting",
		TerminalCols: session.TerminalCols,
		TerminalRows: session.TerminalRows,
	}

	log.Printf("[TerminalHandler] Created new host session: %s (SSH session: %s, Target: %s@%s)",
		hostSessionID, originalSessionID, selectedHost.Username, selectedHost.IP)

	// 显示连接信息
	menu.ShowConnectionInfo(selectedHost)

	// ========== 新权限架构：系统用户选择 ==========
	// 如果启用了新权限架构（systemUserRepo 可用），让用户选择系统用户
	if h.systemUserRepo != nil {
		// 获取该主机可用的系统用户
		availableSystemUsers, err := h.systemUserRepo.GetAvailableSystemUsersForUser(session.UserID, selectedHost.ID)
		if err != nil {
			log.Printf("[TerminalHandler] Failed to get available system users: %v", err)
			return fmt.Errorf("failed to get available system users: %v", err)
		}

		if len(availableSystemUsers) == 0 {
			menu.ShowError("No available system users for this host")
			return fmt.Errorf("no available system users")
		} else if len(availableSystemUsers) == 1 {
			// 只有一个系统用户，自动使用
			systemUser := &availableSystemUsers[0]
			log.Printf("[TerminalHandler] Auto-selected system user: %s", systemUser.Name)
			hostSession.HostUsername = systemUser.Username
			// 更新 selectedHost 的认证信息（目前只支持密码）
			if systemUser.Password != "" {
				selectedHost.Password = systemUser.Password
			}
			// TODO: 支持私钥认证
		} else {
			// 有多个系统用户，让用户选择
			channel.Write([]byte(fmt.Sprintf("\r\n📋 Available system users for %s:\r\n", selectedHost.Name)))
			for i, su := range availableSystemUsers {
				channel.Write([]byte(fmt.Sprintf("  [%d] %s (%s)\r\n", i+1, su.Name, su.Username)))
			}
			channel.Write([]byte("\r\n"))

			// 读取用户选择
			channel.Write([]byte("Select system user (1-" + fmt.Sprintf("%d", len(availableSystemUsers)) + "): "))
			buf := make([]byte, 32)
			n, err := channel.Read(buf)
			if err != nil || n == 0 {
				return fmt.Errorf("failed to read system user selection")
			}

			// 解析选择
			choice := strings.TrimSpace(string(buf[:n]))
			var selected int
			if _, err := fmt.Sscanf(choice, "%d", &selected); err != nil || selected < 1 || selected > len(availableSystemUsers) {
				menu.ShowError("Invalid selection")
				return fmt.Errorf("invalid system user selection")
			}

			systemUser := &availableSystemUsers[selected-1]
			log.Printf("[TerminalHandler] User selected system user: %s", systemUser.Name)
			hostSession.HostUsername = systemUser.Username
			// 更新 selectedHost 的认证信息（目前只支持密码）
			if systemUser.Password != "" {
				selectedHost.Password = systemUser.Password
			}
			// TODO: 支持私钥认证
			channel.Write([]byte("\r\n"))
		}
	}
	// ========== 系统用户选择结束 ==========

	// 1. 先记录登录尝试（status: connecting）
	if err := h.auditor.AuditLoginStart(ctx, hostSession); err != nil {
		log.Printf("[TerminalHandler] Failed to audit login start: %v", err)
	}

	// 2. 使用channel在连接成功后通知
	connSuccessChan := make(chan error, 1)

	// 3. 连接到目标主机（在主线程，会阻塞直到用户logout）
	err := h.connectToHostWithSuccessCallback(ctx, channel, hostSession, selectedHost, func(connErr error) {
		// 这个回调会在连接尝试完成后立即调用（成功或失败）
		if connErr != nil {
			// 连接失败
			endTime := time.Now()
			hostSession.Status = "failed"

			// 审计登录失败（只更新登录记录为failed，不创建会话审计）
			if err2 := h.auditor.AuditSessionFailed(ctx, hostSession.SessionID, endTime, connErr.Error()); err2 != nil {
				log.Printf("[TerminalHandler] Failed to audit login failure: %v", err2)
			}
			log.Printf("[TerminalHandler] Host connection failed: %v", connErr)
		} else {
			// 连接成功！创建会话审计 + 更新登录记录为active
			if err2 := h.auditor.AuditConnectionSuccess(ctx, hostSession); err2 != nil {
				log.Printf("[TerminalHandler] Failed to audit connection success: %v", err2)
			}

			// 开始录制（只有连接成功才录制）
			h.recorder.RecordStart(hostSession)

			log.Printf("[TerminalHandler] Host connection successful, session recording started: %s", hostSession.SessionID)
		}

		// 通知主线程连接结果
		connSuccessChan <- connErr
	})

	// 4. 等待连接结果（阻塞）
	connErr := <-connSuccessChan
	if connErr != nil {
		return connErr
	}

	// 5. 连接成功，函数继续阻塞，等待用户logout
	// （connectToHost内部会一直运行直到用户logout）

	// 6. 用户logout后，connectToHost返回，更新审计记录
	endTime := time.Now()
	hostSession.EndTime = &endTime
	hostSession.Status = "closed"

	// 审计会话结束
	if err2 := h.auditor.AuditSessionEnd(ctx, hostSession.SessionID, endTime); err2 != nil {
		log.Printf("[TerminalHandler] Failed to audit session end: %v", err2)
	}

	// 结束录制
	h.recorder.RecordEnd(hostSession.SessionID, endTime)

	log.Printf("[TerminalHandler] Host session completed: %s (duration: %v)",
		hostSession.SessionID, endTime.Sub(hostSession.StartTime))

	return err
}

// connectToHostWithSuccessCallback 连接到目标主机（带成功回调）
func (h *ProxyHandler) connectToHostWithSuccessCallback(
	ctx context.Context,
	clientChannel ssh.Channel,
	session *types.SessionInfo,
	host *types.HostInfo,
	onConnected func(error),
) error {
	// TODO: host.Username 已移除，需要从 SystemUser 获取
	log.Printf("[TerminalHandler] Connecting to host %s:%d",
		host.IP, host.Port)

	// TODO: 配置SSH客户端 - 需要从 SystemUser 获取认证信息
	// 当前实现不可用，需要重构以支持系统用户
	// SSH Gateway 直连模式已重构完成，但 SSH 终端模式尚未重构
	// 请使用 Web 终端或 SSH Gateway 直连模式
	return fmt.Errorf("SSH终端功能需要重构以支持系统用户认证")
}

// 以下是注释掉的旧代码，等待重构
// 该函数需要重构以支持系统用户认证，临时禁用
/*
func (h *ProxyHandler) connectToHostWithSuccessCallbackOLD() error {
	// 旧代码已删除
	return nil
}
*/

// 临时保留但不使用的代码片段
func _unusedCodeForReference() {
	// 以下是旧的实现逻辑，保留作为参考
	/*
		if err != nil {
			if onConnected != nil {
				onConnected(err)
			}
			return fmt.Errorf("failed to get stdout: %w", err)
		}

		stderr, err := sshSession.StderrPipe()
		if err != nil {
			if onConnected != nil {
				onConnected(err)
			}
			return fmt.Errorf("failed to get stderr: %w", err)
		}

		// 启动shell
		if err := sshSession.Shell(); err != nil {
			// Shell启动失败，通知回调
			if onConnected != nil {
				onConnected(err)
			}
			return fmt.Errorf("failed to start shell: %w", err)
		}

		// 更新会话状态
		session.Status = "active"

		// Shell启动成功！通知回调（连接成功）
		if onConnected != nil {
			onConnected(nil) // nil表示成功
		}

		// 创建命令解析器（用于审计从输出中检测到的命令）
		// 注意：主要的拦截已经在输入时完成，这里只是补充审计通过其他方式执行的命令
		cmdParser := parser.NewCommandExtractor(func(command string) {
			log.Printf("[TerminalHandler] Command detected from output: %s", command)

			// 审计命令（记录所有检测到的命令）
			cmdInfo := &types.CommandInfo{
				SessionID:  session.SessionID,
				HostID:     session.HostID,
				HostIP:     session.HostIP,
				UserID:     session.UserID,
				Username:   session.Username,
				Command:    command,
				ExecutedAt: time.Now(),
			}

			if err := h.auditor.AuditCommand(ctx, cmdInfo); err != nil {
				log.Printf("[TerminalHandler] Failed to audit command: %v", err)
			}
		})

		// 双向数据转发
		var wg sync.WaitGroup
		errChan := make(chan error, 3)

		// 客户端 -> 目标主机（输入，带命令拦截）
		wg.Add(1)
		go func() {
			defer wg.Done()
			buf := make([]byte, 1) // 一次读取一个字节，用于命令拦截
			var commandBuffer strings.Builder

			for {
				n, err := clientChannel.Read(buf)
				if n > 0 {
					ch := buf[0]
					data := buf[:n]

					// 检查是否是回车键（命令执行前拦截）
					if ch == '\r' || ch == '\n' {
						// 获取完整命令
						command := strings.TrimSpace(commandBuffer.String())
						commandBuffer.Reset()

						// 检查黑名单（在命令执行前，带通知功能）
						if command != "" && h.blacklistMgr != nil && h.blacklistMgr.IsBlockedWithNotify(command, session.Username, session.HostIP) {
							reason := h.blacklistMgr.GetBlockReason(command, session.Username)
							log.Printf("[TerminalHandler] ⛔ BLOCKING command for user %s on %s: %s - %s", session.Username, session.HostIP, command, reason)

							// 审计被阻止的命令
							cmdInfo := &types.CommandInfo{
								SessionID:  session.SessionID,
								HostID:     session.HostID,
								HostIP:     session.HostIP,
								UserID:     session.UserID,
								Username:   session.Username,
								Command:    fmt.Sprintf("[BLOCKED] %s", command),
								ExecutedAt: time.Now(),
							}
							h.auditor.AuditCommand(ctx, cmdInfo)

							//  重要：不向目标主机发送任何内容，阻止命令执行
							// 发送 Ctrl+C 到目标主机，中断当前输入
							stdin.Write([]byte{0x03})
							// 等待一小段时间让 Ctrl+C 生效
							time.Sleep(10 * time.Millisecond)

							// 发送阻止警告给客户端（红色警告 + 换行）
							blockMsg := fmt.Sprintf("\r\n\033[1;31m🛡️  [安全策略阻止] %s\033[0m\r\n", reason)
							clientChannel.Write([]byte(blockMsg))

							// 记录被阻止的命令
							h.recorder.RecordData(session.SessionID, "blocked", []byte(fmt.Sprintf("BLOCKED: %s - %s\n", command, reason)))

							// 清空命令缓冲区
							commandBuffer.Reset()

							// 命令已被阻止，不继续执行
							continue
						}

						// 命令安全，正常执行
						if _, err := stdin.Write(data); err != nil {
							log.Printf("[TerminalHandler] Failed to write to host: %v", err)
							errChan <- err
							return
						}
					} else if ch == 0x03 { // Ctrl+C
						// 清空缓冲区
						commandBuffer.Reset()
						if _, err := stdin.Write(data); err != nil {
							errChan <- err
							return
						}
					} else if ch == 0x7f || ch == 0x08 { // 退格
						// 从缓冲区删除最后一个字符
						s := commandBuffer.String()
						if len(s) > 0 {
							commandBuffer.Reset()
							commandBuffer.WriteString(s[:len(s)-1])
						}
						if _, err := stdin.Write(data); err != nil {
							errChan <- err
							return
						}
					} else if ch >= 32 && ch < 127 { // 可打印字符
						// 累积到命令缓冲区
						commandBuffer.WriteByte(ch)
						if _, err := stdin.Write(data); err != nil {
							errChan <- err
							return
						}
					} else {
						// 其他控制字符直接转发
						if _, err := stdin.Write(data); err != nil {
							errChan <- err
							return
						}
					}

					// 记录输入数据
					session.BytesIn += int64(n)
					h.recorder.RecordData(session.SessionID, "in", data)
					h.auditor.AuditData(ctx, session.SessionID, "in", data)
				}

				if err != nil {
					if err != io.EOF {
						log.Printf("[TerminalHandler] Client read error: %v", err)
					}
					return
				}
			}
		}()

		// 目标主机 -> 客户端（输出）
		wg.Add(1)
		go func() {
			defer wg.Done()
			buf := make([]byte, 32*1024)
			for {
				n, err := stdout.Read(buf)
				if n > 0 {
					data := buf[:n]

					// 写入客户端
					if _, err := clientChannel.Write(data); err != nil {
						log.Printf("[TerminalHandler] Failed to write to client: %v", err)
						errChan <- err
						return
					}

					// 记录输出数据
					session.BytesOut += int64(n)
					h.recorder.RecordData(session.SessionID, "out", data)
					h.auditor.AuditData(ctx, session.SessionID, "out", data)

					// 解析命令
					cmdParser.Feed(string(data))
				}

				if err != nil {
					if err != io.EOF {
						log.Printf("[TerminalHandler] Host stdout read error: %v", err)
					}
					return
				}
			}
		}()

		// 目标主机stderr -> 客户端
		wg.Add(1)
		go func() {
			defer wg.Done()
			buf := make([]byte, 32*1024)
			for {
				n, err := stderr.Read(buf)
				if n > 0 {
					data := buf[:n]

					// 写入客户端
					if _, err := clientChannel.Write(data); err != nil {
						log.Printf("[TerminalHandler] Failed to write stderr to client: %v", err)
						errChan <- err
						return
					}

					// 记录输出数据
					session.BytesOut += int64(n)
					h.recorder.RecordData(session.SessionID, "out", data)
				}

				if err != nil {
					if err != io.EOF {
						log.Printf("[TerminalHandler] Host stderr read error: %v", err)
					}
					return
				}
			}
		}()

		// 等待任一goroutine结束
		done := make(chan struct{})
		go func() {
			wg.Wait()
			close(done)
		}()

		select {
		case <-done:
			log.Printf("[TerminalHandler] Session ended normally")
		case err := <-errChan:
			log.Printf("[TerminalHandler] Session ended with error: %v", err)
		case <-ctx.Done():
			log.Printf("[TerminalHandler] Session cancelled by context")
		}

		// 等待SSH会话结束
		sshSession.Wait()

		log.Printf("[TerminalHandler] Connection closed (bytes in: %d, bytes out: %d)",
			session.BytesIn, session.BytesOut)

		return nil
	*/
}

// dialWithCountdown 带倒计时显示的SSH连接
func (h *ProxyHandler) dialWithCountdown(channel ssh.Channel, addr string, config *ssh.ClientConfig) (*ssh.Client, error) {
	// 创建结果通道
	type dialResult struct {
		client *ssh.Client
		err    error
	}
	resultChan := make(chan dialResult, 1)

	// 启动连接
	go func() {
		client, err := ssh.Dial("tcp", addr, config)
		resultChan <- dialResult{client: client, err: err}
	}()

	// 倒计时显示（改为10秒）
	timeout := 10 * time.Second
	deadline := time.Now().Add(timeout)
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	// 清除行的ANSI转义序列
	clearLine := "\r\033[K"

	// 记录是否显示过倒计时
	countdownShown := false

	for {
		select {
		case result := <-resultChan:
			// 连接完成，只在显示过倒计时时才清除
			if countdownShown {
				channel.Write([]byte(clearLine))
			}
			return result.client, result.err

		case <-ticker.C:
			remaining := time.Until(deadline)
			if remaining <= 0 {
				// 超时
				if countdownShown {
					channel.Write([]byte(clearLine))
				}
				return nil, fmt.Errorf("connection timeout after 10 seconds")
			}

			// 显示倒计时
			countdownShown = true
			countdown := fmt.Sprintf("%sConnecting... %d seconds remaining%s",
				"\033[33m", // 黄色
				int(remaining.Seconds()),
				"\033[0m") // 重置
			channel.Write([]byte(clearLine + countdown))
		}
	}
}

// truncateString 截断字符串到指定长度
func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	if maxLen <= 3 {
		return s[:maxLen]
	}
	return s[:maxLen-3] + "..."
}
