package handler

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"path"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/fisker/zjump-backend/internal/model"
	"github.com/fisker/zjump-backend/internal/repository"
	"github.com/fisker/zjump-backend/pkg/sshclient"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type FileHandler struct {
	db             *gorm.DB
	hostRepo       *repository.HostRepository
	systemUserRepo *repository.SystemUserRepository
}

type RemoteFileInfo struct {
	Name    string `json:"name"`
	Path    string `json:"path"`
	Size    int64  `json:"size"`
	IsDir   bool   `json:"isDir"`
	Mode    string `json:"mode"`
	ModTime string `json:"modTime"`
}

func NewFileHandler(db *gorm.DB, hostRepo *repository.HostRepository, systemUserRepo *repository.SystemUserRepository) *FileHandler {
	return &FileHandler{
		db:             db,
		hostRepo:       hostRepo,
		systemUserRepo: systemUserRepo,
	}
}

// ListFiles lists a remote directory over SSH.
func (h *FileHandler) ListFiles(c *gin.Context) {
	hostID := c.Query("hostId")
	systemUserID := c.Query("systemUserId")
	requestedPath := c.Query("path")

	if hostID == "" || systemUserID == "" {
		c.JSON(http.StatusBadRequest, model.Error(400, "Missing hostId or systemUserId"))
		return
	}

	userIDValue, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, model.Error(401, "Unauthorized"))
		return
	}

	userID, ok := userIDValue.(string)
	if !ok || userID == "" {
		c.JSON(http.StatusUnauthorized, model.Error(401, "Invalid user context"))
		return
	}

	hasPermission, err := h.systemUserRepo.CheckUserHasPermission(userID, hostID, systemUserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.Error(500, "Failed to check permission: "+err.Error()))
		return
	}
	if !hasPermission {
		c.JSON(http.StatusForbidden, model.Error(403, "No permission to use this system user"))
		return
	}

	host, err := h.hostRepo.FindByID(hostID)
	if err != nil {
		c.JSON(http.StatusNotFound, model.Error(404, "Host not found"))
		return
	}

	systemUser, err := h.systemUserRepo.FindByID(systemUserID)
	if err != nil {
		c.JSON(http.StatusNotFound, model.Error(404, "System user not found"))
		return
	}
	if systemUser.Protocol != "" && systemUser.Protocol != "ssh" {
		c.JSON(http.StatusBadRequest, model.Error(400, "Only SSH system users support file listing"))
		return
	}

	cleanPath := normalizeRemotePath(requestedPath)
	files, err := h.listRemoteFiles(host, systemUser, cleanPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.Error(500, "Failed to list files: "+err.Error()))
		return
	}

	c.JSON(http.StatusOK, model.Success(gin.H{
		"files": files,
	}))
}

// UploadFile uploads a file to the target host.
func (h *FileHandler) UploadFile(c *gin.Context) {
	hostID := c.PostForm("hostId")
	remotePath := c.PostForm("remotePath")

	if hostID == "" {
		c.JSON(http.StatusBadRequest, model.Error(400, "Missing hostId"))
		return
	}
	if remotePath == "" {
		remotePath = "/tmp"
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, model.Error(400, "Failed to get file: "+err.Error()))
		return
	}
	defer file.Close()

	userIDValue, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, model.Error(401, "Unauthorized"))
		return
	}
	usernameValue, _ := c.Get("username")

	host, err := h.hostRepo.FindByID(hostID)
	if err != nil {
		c.JSON(http.StatusNotFound, model.Error(404, "Host not found"))
		return
	}

	userID, ok := userIDValue.(string)
	if !ok || userID == "" {
		c.JSON(http.StatusInternalServerError, model.Error(500, "Invalid user ID"))
		return
	}
	username, _ := usernameValue.(string)
	if username == "" {
		username = "unknown"
	}

	transferID := uuid.New().String()
	startTime := time.Now()
	fullRemotePath := path.Join(normalizeRemotePath(remotePath), header.Filename)

	transfer := &model.FileTransfer{
		ID:            transferID,
		SessionID:     uuid.New().String(),
		UserID:        userID,
		Username:      username,
		HostID:        host.ID,
		HostIP:        host.IP,
		HostName:      host.Name,
		Direction:     "upload",
		LocalPath:     header.Filename,
		RemotePath:    fullRemotePath,
		FileName:      header.Filename,
		FileSize:      header.Size,
		Status:        "uploading",
		Progress:      0,
		TransferredAt: startTime,
	}

	if err := h.db.Create(transfer).Error; err != nil {
		log.Printf("[FileHandler] Failed to create transfer record: %v", err)
	}

	err = h.uploadFileSFTP(host, remotePath, header.Filename, file, func(progress int) {
		h.db.Model(&model.FileTransfer{}).Where("id = ?", transferID).Update("progress", progress)
	})

	completedAt := time.Now()
	duration := int(completedAt.Sub(startTime).Seconds())

	if err != nil {
		h.db.Model(&model.FileTransfer{}).Where("id = ?", transferID).Updates(map[string]interface{}{
			"status":        "failed",
			"error_message": err.Error(),
			"completed_at":  completedAt,
			"duration":      duration,
		})

		c.JSON(http.StatusInternalServerError, model.Error(500, "Failed to upload file: "+err.Error()))
		return
	}

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
			"remotePath": fullRemotePath,
			"duration":   duration,
		},
	})
}

// uploadFileSFTP currently remains a placeholder because the upload flow still
// needs a complete SystemUser-aware SFTP implementation.
func (h *FileHandler) uploadFileSFTP(host *model.Host, remotePath, filename string, fileReader io.Reader, progressCallback func(int)) error {
	return fmt.Errorf("file upload needs a SystemUser-aware SFTP implementation")
}

func (h *FileHandler) listRemoteFiles(host *model.Host, systemUser *model.SystemUser, remotePath string) ([]RemoteFileInfo, error) {
	cfg := sshclient.SSHConfig{
		Host:       host.IP,
		Port:       host.Port,
		Username:   systemUser.Username,
		Password:   systemUser.Password,
		PrivateKey: systemUser.PrivateKey,
		Passphrase: systemUser.Passphrase,
		AuthType:   systemUser.AuthType,
		Timeout:    30 * time.Second,
	}

	client, err := sshclient.NewSSHClient(cfg)
	if err != nil {
		return nil, fmt.Errorf("failed to connect via SSH: %w", err)
	}
	defer client.Close()

	session, err := client.NewSession()
	if err != nil {
		return nil, fmt.Errorf("failed to create SSH session: %w", err)
	}

	output, err := session.CombinedOutput(buildListFilesCommand(remotePath))
	if err != nil {
		return nil, fmt.Errorf("remote command failed: %w: %s", err, strings.TrimSpace(string(output)))
	}

	files, err := parseRemoteFileList(output, remotePath)
	if err != nil {
		return nil, err
	}

	if remotePath != "/" {
		parentPath := path.Dir(remotePath)
		if parentPath == "." {
			parentPath = "/"
		}
		files = append([]RemoteFileInfo{{
			Name:  "..",
			Path:  parentPath,
			IsDir: true,
			Mode:  "drwxr-xr-x",
		}}, files...)
	}

	sort.Slice(files, func(i, j int) bool {
		if files[i].Name == ".." {
			return true
		}
		if files[j].Name == ".." {
			return false
		}
		if files[i].IsDir != files[j].IsDir {
			return files[i].IsDir
		}
		return strings.ToLower(files[i].Name) < strings.ToLower(files[j].Name)
	})

	return files, nil
}

func buildListFilesCommand(remotePath string) string {
	return "sh -c " + shellQuote(
		"TARGET=" + shellQuote(remotePath) + "\n" +
			"if [ ! -d \"$TARGET\" ]; then\n" +
			"  echo \"directory not found: $TARGET\" >&2\n" +
			"  exit 1\n" +
			"fi\n" +
			"LC_ALL=C find \"$TARGET\" -mindepth 1 -maxdepth 1 -printf '%f\\0%y\\0%s\\0%M\\0%TY-%Tm-%Td %TH:%TM:%TS\\0'\n",
	)
}

func parseRemoteFileList(output []byte, currentPath string) ([]RemoteFileInfo, error) {
	if len(output) == 0 {
		return []RemoteFileInfo{}, nil
	}

	parts := strings.Split(string(output), "\x00")
	if len(parts) > 0 && parts[len(parts)-1] == "" {
		parts = parts[:len(parts)-1]
	}

	if len(parts)%5 != 0 {
		return nil, fmt.Errorf("unexpected remote file list format")
	}

	files := make([]RemoteFileInfo, 0, len(parts)/5)
	for i := 0; i < len(parts); i += 5 {
		size, err := strconv.ParseInt(parts[i+2], 10, 64)
		if err != nil {
			size = 0
		}

		files = append(files, RemoteFileInfo{
			Name:    parts[i],
			Path:    joinRemotePath(currentPath, parts[i]),
			Size:    size,
			IsDir:   parts[i+1] == "d",
			Mode:    parts[i+3],
			ModTime: strings.TrimSpace(parts[i+4]),
		})
	}

	return files, nil
}

func normalizeRemotePath(p string) string {
	if strings.TrimSpace(p) == "" {
		return "/"
	}
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}

	cleanPath := path.Clean(p)
	if cleanPath == "." {
		return "/"
	}
	return cleanPath
}

func joinRemotePath(basePath, name string) string {
	if basePath == "/" {
		return "/" + name
	}
	return path.Join(basePath, name)
}

func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'"'"'`) + "'"
}

// GetFileTransfers returns recorded file transfer tasks.
func (h *FileHandler) GetFileTransfers(c *gin.Context) {
	var transfers []model.FileTransfer

	query := h.db.Model(&model.FileTransfer{}).Order("transferred_at DESC")

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
		Data: gin.H{
			"transfers": transfers,
		},
	})
}

// DownloadFile is not implemented yet.
func (h *FileHandler) DownloadFile(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, model.Error(501, "Download not implemented yet"))
}
