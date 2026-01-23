import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Breadcrumbs,
  Link,
  TextField,
  InputAdornment,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  LinearProgress,
  Tooltip,
} from '@mui/material';
import {
  Folder as FolderIcon,
  InsertDriveFile as FileIcon,
  CloudUpload as UploadIcon,
  CloudDownload as DownloadIcon,
  Refresh as RefreshIcon,
  Home as HomeIcon,
  NavigateNext as NavigateNextIcon,
  Search as SearchIcon,
  ArrowUpward as ArrowUpwardIcon,
} from '@mui/icons-material';
import { Host } from '../types';
import { fileApi } from '../api/api';

interface FileInfo {
  name: string;
  path: string;
  size: number;
  isDir: boolean;
  mode: string;
  modTime: string;
}

interface FileManagerProps {
  host: Host;
  systemUserId?: string;
}

export default function FileManager({ host, systemUserId }: FileManagerProps) {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [currentPath, setCurrentPath] = useState('/');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 加载文件列表
  const loadFiles = useCallback(async (path: string) => {
    if (!host || !systemUserId) {
      setError('请先选择主机和系统用户');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fileApi.listFiles(host.id, path, systemUserId);
      setFiles(response.files || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载文件列表失败');
      console.error('Failed to load files:', err);
    } finally {
      setLoading(false);
    }
  }, [host, systemUserId]);

  // 初始加载
  useEffect(() => {
    if (host && systemUserId) {
      loadFiles(currentPath);
    }
  }, [host, systemUserId, currentPath, loadFiles]);

  // 格式化文件大小
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  // 处理文件/目录点击
  const handleItemClick = (file: FileInfo) => {
    if (file.isDir) {
      if (file.name === '..') {
        // 返回上一级目录
        const pathParts = currentPath.split('/').filter(p => p);
        pathParts.pop();
        const newPath = pathParts.length > 0 ? '/' + pathParts.join('/') : '/';
        setCurrentPath(newPath);
      } else {
        // 进入目录
        const newPath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;
        setCurrentPath(newPath);
      }
    }
  };

  // 处理文件下载
  const handleDownload = async (file: FileInfo) => {
    if (!host || !systemUserId) {
      alert('请先选择主机和系统用户');
      return;
    }

    try {
      const blob = await fileApi.downloadFile(host.id, file.path, systemUserId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('下载失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  // 处理文件上传
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile || !host || !systemUserId) {
      alert('请先选择主机和系统用户');
      return;
    }

    setUploadDialogOpen(true);
    setUploading(true);
    setUploadProgress(0);

    fileApi.uploadFile(
      host.id,
      currentPath,
      systemUserId,
      selectedFile,
      (progress) => {
        setUploadProgress(progress);
      }
    )
      .then(() => {
        setUploadDialogOpen(false);
        loadFiles(currentPath);
      })
      .catch((err) => {
        alert('上传失败: ' + (err instanceof Error ? err.message : '未知错误'));
      })
      .finally(() => {
        setUploading(false);
        setUploadProgress(0);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      });
  };

  // 构建面包屑导航
  const pathParts = currentPath.split('/').filter(p => p);
  const breadcrumbs = [
    { name: '根目录', path: '/' },
    ...pathParts.map((part, index) => ({
      name: part,
      path: '/' + pathParts.slice(0, index + 1).join('/'),
    })),
  ];

  // 过滤文件列表
  const filteredFiles = files.filter(file =>
    file.name.toLowerCase().includes(searchKeyword.toLowerCase())
  );

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 工具栏 */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', gap: 2, alignItems: 'center' }}>
        <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />}>
          {breadcrumbs.map((crumb, index) => (
            <Link
              key={index}
              component="button"
              variant="body2"
              onClick={() => setCurrentPath(crumb.path)}
              sx={{ cursor: 'pointer' }}
            >
              {index === 0 ? <HomeIcon sx={{ fontSize: 16, mr: 0.5 }} /> : null}
              {crumb.name}
            </Link>
          ))}
        </Breadcrumbs>
        <Box sx={{ flex: 1 }} />
        <TextField
          size="small"
          placeholder="搜索文件..."
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ width: 200 }}
        />
        <Tooltip title="刷新">
          <IconButton onClick={() => loadFiles(currentPath)}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        <Button
          variant="contained"
          startIcon={<UploadIcon />}
          onClick={() => fileInputRef.current?.click()}
          disabled={!host || !systemUserId}
        >
          上传文件
        </Button>
      </Box>

      {/* 文件列表 */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {loading ? (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : (
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>名称</TableCell>
                  <TableCell>大小</TableCell>
                  <TableCell>修改时间</TableCell>
                  <TableCell>权限</TableCell>
                  <TableCell align="right">操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredFiles.map((file) => (
                  <TableRow
                    key={file.path}
                    hover
                    sx={{ cursor: file.isDir ? 'pointer' : 'default' }}
                    onClick={() => handleItemClick(file)}
                  >
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={1}>
                        {file.isDir ? (
                          <FolderIcon color="primary" />
                        ) : (
                          <FileIcon />
                        )}
                        <Typography>{file.name}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>{file.isDir ? '-' : formatFileSize(file.size)}</TableCell>
                    <TableCell>{file.modTime || '-'}</TableCell>
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace" fontSize="0.75rem">
                        {file.mode}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      {!file.isDir && (
                        <Tooltip title="下载">
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(file);
                            }}
                          >
                            <DownloadIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>

      {/* 上传进度对话框 */}
      <Dialog open={uploadDialogOpen} onClose={() => {}} maxWidth="sm" fullWidth>
        <DialogTitle>上传文件</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <LinearProgress variant="determinate" value={uploadProgress} sx={{ mb: 2 }} />
            <Typography variant="body2" color="text.secondary">
              {uploadProgress}% 已完成
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUploadDialogOpen(false)} disabled={uploading}>
            关闭
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}


