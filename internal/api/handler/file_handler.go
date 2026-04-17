package handler

import (
	"bytes"
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

	host, systemUser, _, err := h.resolveAuthorizedTarget(c, hostID, systemUserID)
	if err != nil {
		h.writeResolveError(c, err)
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
	systemUserID := c.PostForm("systemUserId")

	if hostID == "" || systemUserID == "" {
		c.JSON(http.StatusBadRequest, model.Error(400, "Missing hostId or systemUserId"))
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

	host, systemUser, userID, err := h.resolveAuthorizedTarget(c, hostID, systemUserID)
	if err != nil {
		h.writeResolveError(c, err)
		return
	}

	usernameValue, _ := c.Get("username")
	username, _ := usernameValue.(string)
	if username == "" {
		username = "unknown"
	}

	transferID := uuid.New().String()
	startTime := time.Now()
	fullRemotePath := joinRemotePath(normalizeRemotePath(remotePath), path.Base(header.Filename))

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

	err = h.uploadFile(host, systemUser, fullRemotePath, file, header.Size, func(progress int) {
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

func (h *FileHandler) uploadFile(host *model.Host, systemUser *model.SystemUser, remotePath string, fileReader io.Reader, fileSize int64, progressCallback func(int)) error {
	client, err := h.newSSHClient(host, systemUser)
	if err != nil {
		return err
	}
	defer client.Close()

	session, err := client.NewSession()
	if err != nil {
		return fmt.Errorf("failed to create SSH session: %w", err)
	}

	var stderr bytes.Buffer
	session.Stderr = &stderr

	stdin, err := session.StdinPipe()
	if err != nil {
		return fmt.Errorf("failed to open SSH stdin: %w", err)
	}

	command := buildUploadFileCommand(remotePath)
	if err := session.Start(command); err != nil {
		return fmt.Errorf("failed to start remote upload command: %w", err)
	}

	if progressCallback != nil {
		progressCallback(10)
	}

	written, copyErr := io.Copy(stdin, fileReader)
	closeErr := stdin.Close()
	waitErr := session.Wait()

	if copyErr != nil {
		return fmt.Errorf("failed to copy upload data: %w", copyErr)
	}
	if closeErr != nil {
		return fmt.Errorf("failed to close upload stream: %w", closeErr)
	}
	if waitErr != nil {
		errText := strings.TrimSpace(stderr.String())
		if errText != "" {
			return fmt.Errorf("remote upload command failed: %w: %s", waitErr, errText)
		}
		return fmt.Errorf("remote upload command failed: %w", waitErr)
	}
	if fileSize > 0 && written != fileSize {
		return fmt.Errorf("uploaded size mismatch: wrote %d bytes, expected %d", written, fileSize)
	}

	if progressCallback != nil {
		progressCallback(100)
	}
	return nil
}

func (h *FileHandler) listRemoteFiles(host *model.Host, systemUser *model.SystemUser, remotePath string) ([]RemoteFileInfo, error) {
	client, err := h.newSSHClient(host, systemUser)
	if err != nil {
		return nil, err
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

func (h *FileHandler) downloadFile(host *model.Host, systemUser *model.SystemUser, remotePath string) ([]byte, error) {
	client, err := h.newSSHClient(host, systemUser)
	if err != nil {
		return nil, err
	}
	defer client.Close()

	session, err := client.NewSession()
	if err != nil {
		return nil, fmt.Errorf("failed to create SSH session: %w", err)
	}

	output, err := session.CombinedOutput(buildDownloadFileCommand(remotePath))
	if err != nil {
		return nil, fmt.Errorf("remote download command failed: %w: %s", err, strings.TrimSpace(string(output)))
	}

	return output, nil
}

func (h *FileHandler) newSSHClient(host *model.Host, systemUser *model.SystemUser) (*sshclient.SSHClient, error) {
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

	return client, nil
}

func (h *FileHandler) resolveAuthorizedTarget(c *gin.Context, hostID, systemUserID string) (*model.Host, *model.SystemUser, string, error) {
	userIDValue, exists := c.Get("userID")
	if !exists {
		return nil, nil, "", fmt.Errorf("unauthorized")
	}

	userID, ok := userIDValue.(string)
	if !ok || userID == "" {
		return nil, nil, "", fmt.Errorf("invalid user context")
	}

	hasPermission, err := h.systemUserRepo.CheckUserHasPermission(userID, hostID, systemUserID)
	if err != nil {
		return nil, nil, "", fmt.Errorf("permission check failed: %w", err)
	}
	if !hasPermission {
		return nil, nil, "", fmt.Errorf("forbidden")
	}

	host, err := h.hostRepo.FindByID(hostID)
	if err != nil {
		return nil, nil, "", fmt.Errorf("host not found")
	}

	systemUser, err := h.systemUserRepo.FindByID(systemUserID)
	if err != nil {
		return nil, nil, "", fmt.Errorf("system user not found")
	}
	if systemUser.Protocol != "" && systemUser.Protocol != "ssh" {
		return nil, nil, "", fmt.Errorf("unsupported protocol")
	}

	return host, systemUser, userID, nil
}

func (h *FileHandler) writeResolveError(c *gin.Context, err error) {
	switch err.Error() {
	case "unauthorized", "invalid user context":
		c.JSON(http.StatusUnauthorized, model.Error(401, err.Error()))
	case "forbidden":
		c.JSON(http.StatusForbidden, model.Error(403, "No permission to use this system user"))
	case "host not found":
		c.JSON(http.StatusNotFound, model.Error(404, "Host not found"))
	case "system user not found":
		c.JSON(http.StatusNotFound, model.Error(404, "System user not found"))
	case "unsupported protocol":
		c.JSON(http.StatusBadRequest, model.Error(400, "Only SSH system users support file transfer"))
	default:
		c.JSON(http.StatusInternalServerError, model.Error(500, err.Error()))
	}
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

func buildUploadFileCommand(remotePath string) string {
	dir := path.Dir(remotePath)
	return "sh -c " + shellQuote(
		"TARGET_FILE=" + shellQuote(remotePath) + "\n" +
			"TARGET_DIR=" + shellQuote(dir) + "\n" +
			"mkdir -p \"$TARGET_DIR\" && cat > \"$TARGET_FILE\"\n",
	)
}

func buildDownloadFileCommand(remotePath string) string {
	return "sh -c " + shellQuote(
		"TARGET=" + shellQuote(remotePath) + "\n" +
			"if [ ! -f \"$TARGET\" ]; then\n" +
			"  echo \"file not found: $TARGET\" >&2\n" +
			"  exit 1\n" +
			"fi\n" +
			"cat \"$TARGET\"\n",
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
	hostID := c.Query("hostId")
	systemUserID := c.Query("systemUserId")
	remotePath := c.Query("remotePath")

	if hostID == "" || systemUserID == "" || remotePath == "" {
		c.JSON(http.StatusBadRequest, model.Error(400, "Missing hostId, systemUserId, or remotePath"))
		return
	}

	host, systemUser, _, err := h.resolveAuthorizedTarget(c, hostID, systemUserID)
	if err != nil {
		h.writeResolveError(c, err)
		return
	}

	cleanPath := normalizeRemotePath(remotePath)
	content, err := h.downloadFile(host, systemUser, cleanPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.Error(500, "Failed to download file: "+err.Error()))
		return
	}

	fileName := path.Base(cleanPath)
	if fileName == "/" || fileName == "." || fileName == "" {
		fileName = "download.bin"
	}

	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%q", fileName))
	c.Data(http.StatusOK, "application/octet-stream", content)
}
