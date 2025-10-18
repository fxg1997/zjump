package handler

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"path/filepath"
	"time"

	"github.com/fisker/zjump-backend/internal/model"
	"github.com/fisker/zjump-backend/internal/repository"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type FileHandler struct {
	db       *gorm.DB
	hostRepo *repository.HostRepository
}

func NewFileHandler(db *gorm.DB, hostRepo *repository.HostRepository) *FileHandler {
	return &FileHandler{
		db:       db,
		hostRepo: hostRepo,
	}
}

// UploadFile 上传文件到目标服务器
func (h *FileHandler) UploadFile(c *gin.Context) {
	// 获取参数
	hostID := c.PostForm("hostId")
	remotePath := c.PostForm("remotePath")

	if hostID == "" {
		c.JSON(http.StatusBadRequest, model.Error(400, "Missing hostId"))
		return
	}

	if remotePath == "" {
		remotePath = "/tmp"
	}

	// 获取上传的文件
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, model.Error(400, "Failed to get file: "+err.Error()))
		return
	}
	defer file.Close()

	// 获取用户信息（修复：使用驼峰命名与中间件一致）
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, model.Error(401, "未找到用户信息"))
		return
	}
	username, _ := c.Get("username")

	// 获取主机信息
	host, err := h.hostRepo.FindByID(hostID)
	if err != nil {
		c.JSON(http.StatusNotFound, model.Error(404, "Host not found"))
		return
	}

	// 创建文件传输记录
	transferID := uuid.New().String()
	startTime := time.Now()

	// 安全的类型转换
	userIDStr, ok := userID.(string)
	if !ok {
		c.JSON(http.StatusInternalServerError, model.Error(500, "用户ID类型错误"))
		return
	}
	usernameStr, ok := username.(string)
	if !ok {
		usernameStr = "unknown" // 如果username获取失败，使用默认值
	}

	transfer := &model.FileTransfer{
		ID:            transferID,
		SessionID:     uuid.New().String(), // 文件传输也需要会话ID
		UserID:        userIDStr,
		Username:      usernameStr,
		HostID:        host.ID,
		HostIP:        host.IP,
		HostName:      host.Name,
		Direction:     "upload",
		LocalPath:     header.Filename,
		RemotePath:    filepath.Join(remotePath, header.Filename),
		FileName:      header.Filename,
		FileSize:      header.Size,
		Status:        "uploading",
		Progress:      0,
		TransferredAt: startTime,
	}

	if err := h.db.Create(transfer).Error; err != nil {
		log.Printf("[FileHandler] Failed to create transfer record: %v", err)
	}

	// 通过SFTP上传文件
	err = h.uploadFileSFTP(host, remotePath, header.Filename, file, func(progress int) {
		// 更新进度
		h.db.Model(&model.FileTransfer{}).Where("id = ?", transferID).Update("progress", progress)
	})

	completedAt := time.Now()
	duration := int(completedAt.Sub(startTime).Seconds())

	if err != nil {
		// 更新为失败状态
		h.db.Model(&model.FileTransfer{}).Where("id = ?", transferID).Updates(map[string]interface{}{
			"status":        "failed",
			"error_message": err.Error(),
			"completed_at":  completedAt,
			"duration":      duration,
		})

		c.JSON(http.StatusInternalServerError, model.Error(500, "Failed to upload file: "+err.Error()))
		return
	}

	// 更新为成功状态
	h.db.Model(&model.FileTransfer{}).Where("id = ?", transferID).Updates(map[string]interface{}{
		"status":       "completed",
		"progress":     100,
		"completed_at": completedAt,
		"duration":     duration,
	})

	c.JSON(http.StatusOK, model.Response{
		Code:    0,
		Message: "File uploaded successfully",
		Data: gin.H{
			"transferId": transferID,
			"fileName":   header.Filename,
			"fileSize":   header.Size,
			"remotePath": filepath.Join(remotePath, header.Filename),
			"duration":   duration,
		},
	})
}

// uploadFileSFTP 通过SFTP上传文件
// TODO: 需要重构此方法，传入 SystemUser 参数以获取认证信息
// 当前实现已不可用，因为 Host 模型已移除认证字段
func (h *FileHandler) uploadFileSFTP(host *model.Host, remotePath, filename string, fileReader io.Reader, progressCallback func(int)) error {
	// TODO: 需要从 SystemUser 获取认证信息
	return fmt.Errorf("文件上传功能需要重构以支持系统用户认证，请稍后再试")

	// 以下代码需要重构
	/*
		// 创建SSH连接
		config := &ssh.ClientConfig{
			User: systemUser.Username,  // 从 SystemUser 获取
			Auth: []ssh.AuthMethod{
				ssh.Password(systemUser.Password),
			},
			HostKeyCallback: ssh.InsecureIgnoreHostKey(),
			Timeout:         30 * time.Second,
		}

		if systemUser.PrivateKey != "" {
			signer, err := ssh.ParsePrivateKey([]byte(systemUser.PrivateKey))
			if err == nil {
				config.Auth = append(config.Auth, ssh.PublicKeys(signer))
			}
		}


		conn, err := ssh.Dial("tcp", fmt.Sprintf("%s:%d", host.IP, host.Port), config)
		if err != nil {
			return fmt.Errorf("failed to dial: %w", err)
		}
		defer conn.Close()

		// 创建SFTP会话
		session, err := conn.NewSession()
		if err != nil {
			return fmt.Errorf("failed to create session: %w", err)
		}
		defer session.Close()

		// 获取stdin管道
		stdin, err := session.StdinPipe()
		if err != nil {
			return fmt.Errorf("failed to get stdin pipe: %w", err)
		}

		// 创建目标文件
		remoteFile := filepath.Join(remotePath, filename)
		cmd := fmt.Sprintf("cat > %s", remoteFile)

		if err := session.Start(cmd); err != nil {
			return fmt.Errorf("failed to start command: %w", err)
		}

		// 复制文件内容
		buffer := make([]byte, 32*1024) // 32KB buffer
		var totalWritten int64

		for {
			n, err := fileReader.Read(buffer)
			if n > 0 {
				written, writeErr := stdin.Write(buffer[:n])
				if writeErr != nil {
					return fmt.Errorf("failed to write: %w", writeErr)
				}
				totalWritten += int64(written)

				// 更新进度（暂时简化，实际需要知道文件总大小）
				if progressCallback != nil {
					progressCallback(50) // 简化的进度更新
				}
			}

			if err == io.EOF {
				break
			}
			if err != nil {
				return fmt.Errorf("failed to read: %w", err)
			}
		}

		stdin.Close()

		if progressCallback != nil {
			progressCallback(100)
		}

		return session.Wait()
	*/
}

// GetFileTransfers 获取文件传输记录列表
func (h *FileHandler) GetFileTransfers(c *gin.Context) {
	var transfers []model.FileTransfer

	query := h.db.Model(&model.FileTransfer{}).Order("transferred_at DESC")

	// 可选过滤条件
	if hostID := c.Query("hostId"); hostID != "" {
		query = query.Where("host_id = ?", hostID)
	}
	if userID := c.Query("userId"); userID != "" {
		query = query.Where("user_id = ?", userID)
	}
	if direction := c.Query("direction"); direction != "" {
		query = query.Where("direction = ?", direction)
	}

	if err := query.Find(&transfers).Error; err != nil {
		c.JSON(http.StatusInternalServerError, model.Error(500, "Failed to get file transfers: "+err.Error()))
		return
	}

	c.JSON(http.StatusOK, model.Response{
		Code:    0,
		Message: "File transfers retrieved successfully",
		Data:    gin.H{"transfers": transfers},
	})
}

// DownloadFile 从目标服务器下载文件
func (h *FileHandler) DownloadFile(c *gin.Context) {
	// TODO: 实现文件下载功能
	c.JSON(http.StatusNotImplemented, model.Error(501, "Download not implemented yet"))
}
