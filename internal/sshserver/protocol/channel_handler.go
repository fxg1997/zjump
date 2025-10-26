package protocol

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"io"
	"time"
)

// ChannelHandler 通道处理器
type ChannelHandler struct {
	server *CustomSSHServer
}

// NewChannelHandler 创建通道处理器
func NewChannelHandler(server *CustomSSHServer) *ChannelHandler {
	return &ChannelHandler{
		server: server,
	}
}

// handleChannelOpen 处理通道打开请求
func (h *ChannelHandler) handleChannelOpen(session *Session, msg *SSHMessage) error {
	reader := bytes.NewReader(msg.Payload)

	// 读取通道类型
	channelType, err := h.readString(reader)
	if err != nil {
		return fmt.Errorf("failed to read channel type: %w", err)
	}

	// 读取发送方通道ID
	senderChannel, err := h.readUint32(reader)
	if err != nil {
		return fmt.Errorf("failed to read sender channel: %w", err)
	}

	// 读取初始窗口大小
	initialWindowSize, err := h.readUint32(reader)
	if err != nil {
		return fmt.Errorf("failed to read initial window size: %w", err)
	}

	// 读取最大数据包大小
	maxPacketSize, err := h.readUint32(reader)
	if err != nil {
		return fmt.Errorf("failed to read max packet size: %w", err)
	}

	// 只支持session类型的通道
	if channelType != "session" {
		return h.sendChannelOpenFailure(session, senderChannel, SSH_OPEN_UNKNOWN_CHANNEL_TYPE, "unsupported channel type")
	}

	// 创建新通道
	channel := &Channel{
		ID:           senderChannel,
		Type:         channelType,
		WindowSize:   initialWindowSize,
		PacketSize:   maxPacketSize,
		LocalWindow:  initialWindowSize,
		RemoteWindow: 32768, // 默认远程窗口大小
		Data:         make(chan []byte, 100),
		CloseChan:    make(chan bool, 1),
		Closed:       false,
	}

	// 注册通道
	session.channelsMu.Lock()
	session.channels[senderChannel] = channel
	session.channelsMu.Unlock()

	// 发送通道打开确认
	return h.sendChannelOpenConfirmation(session, senderChannel, senderChannel, initialWindowSize, maxPacketSize)
}

// handleChannelRequest 处理通道请求
func (h *ChannelHandler) handleChannelRequest(session *Session, msg *SSHMessage) error {
	reader := bytes.NewReader(msg.Payload)

	// 读取接收方通道ID
	recipientChannel, err := h.readUint32(reader)
	if err != nil {
		return fmt.Errorf("failed to read recipient channel: %w", err)
	}

	// 读取请求类型
	requestType, err := h.readString(reader)
	if err != nil {
		return fmt.Errorf("failed to read request type: %w", err)
	}

	// 读取是否想要回复
	wantReply, err := h.readBool(reader)
	if err != nil {
		return fmt.Errorf("failed to read want reply: %w", err)
	}

	// 获取通道
	session.channelsMu.RLock()
	channel, exists := session.channels[recipientChannel]
	session.channelsMu.RUnlock()

	if !exists {
		if wantReply {
			h.sendChannelFailure(session, recipientChannel)
		}
		return fmt.Errorf("channel not found: %d", recipientChannel)
	}

	// 处理不同类型的请求
	switch requestType {
	case "pty-req":
		return h.handlePtyRequest(session, channel, reader, wantReply)
	case "shell":
		return h.handleShellRequest(session, channel, reader, wantReply)
	case "window-change":
		return h.handleWindowChange(session, channel, reader, wantReply)
	case "env":
		// 拒绝环境变量设置
		if wantReply {
			h.sendChannelFailure(session, recipientChannel)
		}
		return nil
	default:
		// 拒绝未知请求
		if wantReply {
			h.sendChannelFailure(session, recipientChannel)
		}
		return nil
	}
}

// handlePtyRequest 处理PTY请求
func (h *ChannelHandler) handlePtyRequest(session *Session, channel *Channel, reader *bytes.Reader, wantReply bool) error {
	// 解析PTY请求
	_, err := h.readString(reader) // term
	if err != nil {
		return fmt.Errorf("failed to read term: %w", err)
	}

	cols, err := h.readUint32(reader)
	if err != nil {
		return fmt.Errorf("failed to read cols: %w", err)
	}

	rows, err := h.readUint32(reader)
	if err != nil {
		return fmt.Errorf("failed to read rows: %w", err)
	}

	_, err = h.readUint32(reader) // width
	if err != nil {
		return fmt.Errorf("failed to read width: %w", err)
	}

	_, err = h.readUint32(reader) // height
	if err != nil {
		return fmt.Errorf("failed to read height: %w", err)
	}

	// 更新会话信息
	session.SessionInfo.TerminalCols = int(cols)
	session.SessionInfo.TerminalRows = int(rows)

	// 发送成功回复
	if wantReply {
		return h.sendChannelSuccess(session, channel.ID)
	}

	return nil
}

// handleShellRequest 处理Shell请求
func (h *ChannelHandler) handleShellRequest(session *Session, channel *Channel, reader *bytes.Reader, wantReply bool) error {
	// 发送成功回复
	if wantReply {
		if err := h.sendChannelSuccess(session, channel.ID); err != nil {
			return err
		}
	}

	// 启动Shell处理
	go h.handleShell(session, channel)

	return nil
}

// handleWindowChange 处理窗口大小变更
func (h *ChannelHandler) handleWindowChange(session *Session, channel *Channel, reader *bytes.Reader, wantReply bool) error {
	// 读取新的窗口大小
	cols, err := h.readUint32(reader)
	if err != nil {
		return fmt.Errorf("failed to read cols: %w", err)
	}

	rows, err := h.readUint32(reader)
	if err != nil {
		return fmt.Errorf("failed to read rows: %w", err)
	}

	_, err = h.readUint32(reader) // width
	if err != nil {
		return fmt.Errorf("failed to read width: %w", err)
	}

	_, err = h.readUint32(reader) // height
	if err != nil {
		return fmt.Errorf("failed to read height: %w", err)
	}

	// 更新会话信息
	session.SessionInfo.TerminalCols = int(cols)
	session.SessionInfo.TerminalRows = int(rows)

	// window-change不需要回复
	return nil
}

// handleShell 处理Shell会话
func (h *ChannelHandler) handleShell(session *Session, channel *Channel) {
	defer func() {
		// 关闭通道
		channel.CloseChan <- true
		h.closeChannel(session, channel.ID)
	}()

	// 创建虚拟终端连接
	terminalConn := &TerminalConnection{
		Channel: channel,
		Session: session,
		Server:  h.server,
	}

	// 创建SSH通道适配器
	sshChannel := &SSHChannelAdapter{
		TerminalConnection: terminalConn,
	}

	// 调用终端处理器
	if err := h.server.terminalHandler.HandleTerminal(session.ctx, sshChannel, session.SessionInfo); err != nil {
		// 记录错误但不崩溃
	}
}

// closeChannel 关闭通道
func (h *ChannelHandler) closeChannel(session *Session, channelID uint32) {
	session.channelsMu.Lock()
	defer session.channelsMu.Unlock()

	if channel, exists := session.channels[channelID]; exists {
		channel.Closed = true
		close(channel.Data)
		close(channel.CloseChan)
		delete(session.channels, channelID)
	}
}

// 发送各种通道消息的方法
func (h *ChannelHandler) sendChannelOpenConfirmation(session *Session, recipientChannel, senderChannel, windowSize, packetSize uint32) error {
	payload := make([]byte, 0)
	payload = append(payload, h.encodeUint32(recipientChannel)...)
	payload = append(payload, h.encodeUint32(senderChannel)...)
	payload = append(payload, h.encodeUint32(windowSize)...)
	payload = append(payload, h.encodeUint32(packetSize)...)

	return h.server.sendSSHMessage(session, SSH_MSG_CHANNEL_OPEN_CONFIRMATION, payload)
}

func (h *ChannelHandler) sendChannelOpenFailure(session *Session, recipientChannel uint32, reasonCode uint32, reason string) error {
	payload := make([]byte, 0)
	payload = append(payload, h.encodeUint32(recipientChannel)...)
	payload = append(payload, h.encodeUint32(reasonCode)...)
	payload = append(payload, h.encodeString(reason)...)
	payload = append(payload, h.encodeString("")...) // 语言标签

	return h.server.sendSSHMessage(session, SSH_MSG_CHANNEL_OPEN_FAILURE, payload)
}

func (h *ChannelHandler) sendChannelSuccess(session *Session, channelID uint32) error {
	payload := h.encodeUint32(channelID)
	return h.server.sendSSHMessage(session, SSH_MSG_CHANNEL_SUCCESS, payload)
}

func (h *ChannelHandler) sendChannelFailure(session *Session, channelID uint32) error {
	payload := h.encodeUint32(channelID)
	return h.server.sendSSHMessage(session, SSH_MSG_CHANNEL_FAILURE, payload)
}

// 辅助函数
func (h *ChannelHandler) readString(reader *bytes.Reader) (string, error) {
	lengthBytes := make([]byte, 4)
	if _, err := reader.Read(lengthBytes); err != nil {
		return "", err
	}
	length := binary.BigEndian.Uint32(lengthBytes)

	strBytes := make([]byte, length)
	if _, err := reader.Read(strBytes); err != nil {
		return "", err
	}

	return string(strBytes), nil
}

func (h *ChannelHandler) readUint32(reader *bytes.Reader) (uint32, error) {
	bytes := make([]byte, 4)
	if _, err := reader.Read(bytes); err != nil {
		return 0, err
	}
	return binary.BigEndian.Uint32(bytes), nil
}

func (h *ChannelHandler) readBool(reader *bytes.Reader) (bool, error) {
	byte := make([]byte, 1)
	if _, err := reader.Read(byte); err != nil {
		return false, err
	}
	return byte[0] != 0, nil
}

func (h *ChannelHandler) encodeString(str string) []byte {
	bytes := make([]byte, 4+len(str))
	binary.BigEndian.PutUint32(bytes[0:4], uint32(len(str)))
	copy(bytes[4:], str)
	return bytes
}

func (h *ChannelHandler) encodeUint32(value uint32) []byte {
	bytes := make([]byte, 4)
	binary.BigEndian.PutUint32(bytes, value)
	return bytes
}

// TerminalConnection 虚拟终端连接
type TerminalConnection struct {
	Channel *Channel
	Session *Session
	Server  *CustomSSHServer
}

// Read 实现io.Reader接口
func (tc *TerminalConnection) Read(p []byte) (n int, err error) {
	select {
	case data := <-tc.Channel.Data:
		n = copy(p, data)
		return n, nil
	case <-tc.Channel.CloseChan:
		return 0, io.EOF
	case <-tc.Session.ctx.Done():
		return 0, io.EOF
	}
}

// Write 实现io.Writer接口
func (tc *TerminalConnection) Write(p []byte) (n int, err error) {
	// 发送数据到客户端
	payload := make([]byte, 0)
	payload = append(payload, tc.encodeUint32(tc.Channel.ID)...)
	payload = append(payload, p...)

	return len(p), tc.Server.sendSSHMessage(tc.Session, SSH_MSG_CHANNEL_DATA, payload)
}

// Close 实现io.Closer接口
func (tc *TerminalConnection) Close() error {
	// 发送通道关闭消息
	payload := tc.encodeUint32(tc.Channel.ID)
	tc.Server.sendSSHMessage(tc.Session, SSH_MSG_CHANNEL_CLOSE, payload)

	// 关闭通道
	tc.Channel.CloseChan <- true
	return nil
}

// SetDeadline 设置截止时间
func (tc *TerminalConnection) SetDeadline(t time.Time) error {
	// 简化实现，实际应该设置超时
	return nil
}

// SetReadDeadline 设置读取截止时间
func (tc *TerminalConnection) SetReadDeadline(t time.Time) error {
	return tc.SetDeadline(t)
}

// SetWriteDeadline 设置写入截止时间
func (tc *TerminalConnection) SetWriteDeadline(t time.Time) error {
	return tc.SetDeadline(t)
}

// encodeUint32 编码uint32
func (tc *TerminalConnection) encodeUint32(value uint32) []byte {
	bytes := make([]byte, 4)
	binary.BigEndian.PutUint32(bytes, value)
	return bytes
}

// SSHChannelAdapter SSH通道适配器
type SSHChannelAdapter struct {
	*TerminalConnection
}

// CloseWrite 实现ssh.Channel接口
func (sca *SSHChannelAdapter) CloseWrite() error {
	return nil
}

// SendRequest 实现ssh.Channel接口
func (sca *SSHChannelAdapter) SendRequest(name string, wantReply bool, payload []byte) (bool, error) {
	// 简化实现，实际应该发送SSH请求
	return true, nil
}

// Stderr 实现ssh.Channel接口
func (sca *SSHChannelAdapter) Stderr() io.ReadWriter {
	return sca
}

// 添加SSH_OPEN常量
const (
	SSH_OPEN_ADMINISTRATIVELY_PROHIBITED = 1
	SSH_OPEN_CONNECT_FAILED              = 2
	SSH_OPEN_UNKNOWN_CHANNEL_TYPE        = 3
	SSH_OPEN_RESOURCE_SHORTAGE           = 4
)
