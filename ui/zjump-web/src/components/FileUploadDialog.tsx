import { useState, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stack,
  Box,
  Typography,
  LinearProgress,
  Alert,
  Paper,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  IconButton,
  TextField,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  InsertDriveFile as FileIcon,
  Close as CloseIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { Host } from '../types';
import { fileApi } from '../api/api';

interface FileUploadDialogProps {
  open: boolean;
  onClose: () => void;
  host: Host | null;
}

interface FileItem {
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
}

export default function FileUploadDialog({ open, onClose, host }: FileUploadDialogProps) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [remotePath, setRemotePath] = useState('/tmp');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (!selectedFiles) return;

    const newFiles: FileItem[] = Array.from(selectedFiles).map(file => ({
      file,
      status: 'pending',
      progress: 0,
    }));

    setFiles([...files, ...newFiles]);
  };

  const handleRemoveFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (!host) return;

    setUploading(true);

    for (let i = 0; i < files.length; i++) {
      if (files[i].status !== 'pending') continue;

      // 更新状态为上传中
      setFiles(prev => {
        const updated = [...prev];
        updated[i].status = 'uploading';
        return updated;
      });

      try {
        // 调用后端API上传文件
        await fileApi.uploadFile(
          host.id,
          remotePath,
          files[i].file,
          (progress) => {
            // 更新上传进度
            setFiles(prev => {
              const updated = [...prev];
              updated[i].progress = progress;
              return updated;
            });
          }
        );

        // 上传成功
        setFiles(prev => {
          const updated = [...prev];
          updated[i].status = 'success';
          updated[i].progress = 100;
          return updated;
        });
      } catch (error) {
        // 上传失败
        console.error('Upload failed:', error);
        setFiles(prev => {
          const updated = [...prev];
          updated[i].status = 'error';
          updated[i].error = error instanceof Error ? error.message : '上传失败';
          return updated;
        });
      }
    }

    setUploading(false);
  };

  const handleClose = () => {
    if (!uploading) {
      setFiles([]);
      setRemotePath('/tmp');
      onClose();
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircleIcon color="success" />;
      case 'error':
        return <ErrorIcon color="error" />;
      default:
        return <FileIcon />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">
            上传文件到服务器
          </Typography>
          {host && (
            <Typography variant="body2" color="text.secondary">
              目标: {host.name} ({host.ip})
            </Typography>
          )}
        </Box>
      </DialogTitle>

      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          <TextField
            fullWidth
            label="远程路径"
            value={remotePath}
            onChange={(e) => setRemotePath(e.target.value)}
            placeholder="/tmp"
            helperText="文件将上传到此目录"
            disabled={uploading}
          />

          <Box>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            <Button
              variant="outlined"
              startIcon={<UploadIcon />}
              onClick={() => fileInputRef.current?.click()}
              fullWidth
              disabled={uploading}
              sx={{ height: 100, border: '2px dashed', borderColor: 'primary.main' }}
            >
              点击选择文件
            </Button>
          </Box>

          {files.length > 0 && (
            <Paper variant="outlined" sx={{ maxHeight: 300, overflow: 'auto' }}>
              <List dense>
                {files.map((item, index) => (
                  <ListItem
                    key={index}
                    secondaryAction={
                      item.status === 'pending' && !uploading ? (
                        <IconButton edge="end" onClick={() => handleRemoveFile(index)}>
                          <CloseIcon />
                        </IconButton>
                      ) : null
                    }
                  >
                    <ListItemIcon>
                      {getStatusIcon(item.status)}
                    </ListItemIcon>
                    <ListItemText
                      primary={item.file.name}
                      secondary={
                        <Box component="span" sx={{ display: 'block' }}>
                          <Typography variant="caption" component="span" display="block">
                            {formatFileSize(item.file.size)}
                          </Typography>
                          {item.status === 'uploading' && (
                            <LinearProgress variant="determinate" value={item.progress} sx={{ mt: 0.5 }} />
                          )}
                          {item.status === 'error' && item.error && (
                            <Typography variant="caption" component="span" color="error">
                              {item.error}
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            </Paper>
          )}

          {files.length > 0 && (
            <Alert severity="info">
              已选择 {files.length} 个文件，总大小: {formatFileSize(files.reduce((sum, f) => sum + f.file.size, 0))}
            </Alert>
          )}

          <Alert severity="warning">
            <Typography variant="body2">
              <strong>注意：</strong>
            </Typography>
            <Typography variant="body2" component="div">
              • 确保远程路径存在且有写入权限<br />
              • 大文件上传可能需要较长时间<br />
              • 支持通过 SFTP 协议上传文件
            </Typography>
          </Alert>
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={uploading}>
          取消
        </Button>
        <Button
          variant="contained"
          onClick={handleUpload}
          disabled={files.length === 0 || uploading || files.every(f => f.status !== 'pending')}
          startIcon={<UploadIcon />}
        >
          {uploading ? '上传中...' : '开始上传'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

