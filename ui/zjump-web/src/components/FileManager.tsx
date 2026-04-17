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
  Badge,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
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
  History as HistoryIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import { FileTransfer, Host } from '../types';
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

const ACTIVE_TRANSFER_STATUSES = new Set(['uploading', 'downloading']);

export default function FileManager({ host, systemUserId }: FileManagerProps) {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [transfers, setTransfers] = useState<FileTransfer[]>([]);
  const [currentPath, setCurrentPath] = useState('/');
  const [loading, setLoading] = useState(false);
  const [transfersLoading, setTransfersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [recentPanelOpen, setRecentPanelOpen] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const loadTransfers = useCallback(async (showLoading = false) => {
    if (!host?.id) {
      setTransfers([]);
      return;
    }

    if (showLoading) {
      setTransfersLoading(true);
    }

    try {
      const response = await fileApi.getFileTransfers({ hostId: host.id });
      setTransfers(response.transfers || []);
    } catch (err) {
      console.error('Failed to load file transfers:', err);
    } finally {
      if (showLoading) {
        setTransfersLoading(false);
      }
    }
  }, [host?.id]);

  useEffect(() => {
    if (host && systemUserId) {
      loadFiles(currentPath);
    }
  }, [host, systemUserId, currentPath, loadFiles]);

  useEffect(() => {
    if (!host?.id) {
      setTransfers([]);
      return;
    }

    loadTransfers(true);
    const timer = window.setInterval(() => {
      loadTransfers(false);
    }, 3000);

    return () => window.clearInterval(timer);
  }, [host?.id, loadTransfers]);

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
  };

  const formatDateTime = (value?: string) => {
    if (!value) return '-';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleString('zh-CN', { hour12: false });
  };

  const formatDuration = (seconds?: number) => {
    if (seconds === undefined || seconds === null) {
      return '-';
    }

    if (seconds < 60) {
      return `${seconds}s`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainSeconds = seconds % 60;
    if (minutes < 60) {
      return `${minutes}m ${remainSeconds}s`;
    }

    const hours = Math.floor(minutes / 60);
    const remainMinutes = minutes % 60;
    return `${hours}h ${remainMinutes}m`;
  };

  const getTransferStatusText = (status: FileTransfer['status']) => {
    switch (status) {
      case 'uploading':
        return '上传中';
      case 'downloading':
        return '下载中';
      case 'completed':
        return '已完成';
      case 'failed':
        return '失败';
      default:
        return status;
    }
  };

  const getTransferStatusColor = (status: FileTransfer['status']) => {
    switch (status) {
      case 'completed':
        return 'success.main';
      case 'failed':
        return 'error.main';
      default:
        return 'warning.main';
    }
  };

  const getDirectionText = (direction: FileTransfer['direction']) => (
    direction === 'upload' ? '上传' : '下载'
  );

  const handleItemClick = (file: FileInfo) => {
    if (!file.isDir) {
      return;
    }

    if (file.name === '..') {
      const pathParts = currentPath.split('/').filter(Boolean);
      pathParts.pop();
      setCurrentPath(pathParts.length > 0 ? `/${pathParts.join('/')}` : '/');
      return;
    }

    setCurrentPath(currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`);
  };

  const handleDownload = (file: FileInfo) => {
    if (!host || !systemUserId) {
      alert('请先选择主机和系统用户');
      return;
    }

    const link = document.createElement('a');
    link.href = fileApi.getDownloadUrl(host.id, file.path, systemUserId);
    link.download = file.name;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    window.setTimeout(() => loadTransfers(), 600);
    window.setTimeout(() => loadTransfers(), 2000);
  };

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
      (progress: number) => {
        setUploadProgress(progress);
      }
    )
      .then(() => {
        setUploadDialogOpen(false);
        loadFiles(currentPath);
        loadTransfers();
      })
      .catch((err) => {
        alert(`上传失败: ${err instanceof Error ? err.message : '未知错误'}`);
        loadTransfers();
      })
      .finally(() => {
        setUploading(false);
        setUploadProgress(0);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      });
  };

  const pathParts = currentPath.split('/').filter(Boolean);
  const breadcrumbs = [
    { name: '根目录', path: '/' },
    ...pathParts.map((part, index) => ({
      name: part,
      path: `/${pathParts.slice(0, index + 1).join('/')}`,
    })),
  ];

  const filteredFiles = files.filter((file) =>
    file.name.toLowerCase().includes(searchKeyword.toLowerCase())
  );
  const activeTransfers = transfers.filter((transfer) =>
    ACTIVE_TRANSFER_STATUSES.has(transfer.status)
  );
  const recentTransfers = transfers.slice(0, 10);
  const historyTransfers = recentTransfers.filter((transfer) => !ACTIVE_TRANSFER_STATUSES.has(transfer.status));

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box
        sx={{
          p: 2,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          gap: 2,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />}>
          {breadcrumbs.map((crumb, index) => (
            <Link
              key={crumb.path}
              component="button"
              variant="body2"
              onClick={() => setCurrentPath(crumb.path)}
              sx={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
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
          sx={{ width: { xs: '100%', sm: 220 } }}
        />
        <Tooltip title="刷新文件列表">
          <IconButton onClick={() => loadFiles(currentPath)}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title={recentPanelOpen ? '收起最近传输面板' : '展开最近传输面板'}>
          <IconButton onClick={() => setRecentPanelOpen((prev) => !prev)}>
            <Badge
              color="primary"
              badgeContent={recentTransfers.length}
              max={99}
              overlap="circular"
              invisible={recentTransfers.length === 0}
            >
              <HistoryIcon />
            </Badge>
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

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          p: 2,
          overflow: 'hidden',
        }}
      >
        <Paper sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {loading ? (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight={240}>
              <CircularProgress />
            </Box>
          ) : error ? (
            <Box sx={{ p: 2 }}>
              <Alert severity="error">{error}</Alert>
            </Box>
          ) : (
            <TableContainer sx={{ flex: 1 }}>
              <Table stickyHeader>
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
                  {filteredFiles.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
                        暂无文件
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredFiles.map((file) => (
                      <TableRow
                        key={file.path}
                        hover
                        sx={{ cursor: file.isDir ? 'pointer' : 'default' }}
                        onClick={() => handleItemClick(file)}
                      >
                        <TableCell>
                          <Box display="flex" alignItems="center" gap={1}>
                            {file.isDir ? <FolderIcon color="primary" /> : <FileIcon />}
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
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>

      </Box>

      <Paper
        elevation={8}
        sx={{
          position: 'fixed',
          right: 24,
          bottom: 24,
          width: { xs: 'calc(100vw - 32px)', sm: 560 },
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: { xs: '55vh', sm: '48vh' },
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          zIndex: (theme) => theme.zIndex.drawer + 1,
          border: 1,
          borderColor: 'divider',
        }}
      >
        <Box
          sx={{
            px: 2,
            py: 1.25,
            borderBottom: 1,
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <Typography variant="subtitle2" fontWeight={600}>
            最近传输记录
          </Typography>
          <Typography variant="caption" color="text.secondary">
            进行中 {activeTransfers.length} / 最近 {recentTransfers.length} 条
          </Typography>
          <Box sx={{ flex: 1 }} />
          {transfersLoading ? <CircularProgress size={16} /> : null}
          <Tooltip title="刷新传输记录">
            <IconButton size="small" onClick={() => loadTransfers(true)}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={recentPanelOpen ? '收起面板' : '展开面板'}>
            <IconButton size="small" onClick={() => setRecentPanelOpen((prev) => !prev)}>
              {recentPanelOpen ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Box>

        {recentPanelOpen ? (
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            {recentTransfers.length === 0 ? (
              <Box sx={{ p: 2 }}>
                <Typography variant="body2" color="text.secondary" align="center">
                  暂无传输记录
                </Typography>
              </Box>
            ) : (
              <List dense disablePadding>
                {activeTransfers.map((transfer, index) => (
                  <Box key={`active-${transfer.id}`}>
                    <ListItem sx={{ px: 2, py: 1, alignItems: 'flex-start', bgcolor: 'action.hover' }}>
                      <ListItemIcon sx={{ minWidth: 28, mt: 0.25 }}>
                        {transfer.direction === 'upload' ? (
                          <ArrowUpwardIcon fontSize="small" color="primary" />
                        ) : (
                          <ArrowDownwardIcon fontSize="small" color="info" />
                        )}
                      </ListItemIcon>
                      <ListItemText
                        primary={(
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2" noWrap title={transfer.file_name} sx={{ maxWidth: 220 }}>
                              {transfer.file_name}
                            </Typography>
                            <Typography variant="caption" color="warning.main">
                              进行中
                            </Typography>
                          </Box>
                        )}
                        secondary={(
                          <Box>
                            <Typography variant="caption" color="text.secondary" noWrap title={transfer.remote_path} display="block">
                              {transfer.remote_path}
                            </Typography>
                            <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Box sx={{ width: 120 }}>
                                <LinearProgress variant="determinate" value={transfer.progress || 0} />
                              </Box>
                              <Typography variant="caption" color="text.secondary">
                                {transfer.progress || 0}%
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {formatDateTime(transfer.transferred_at)}
                              </Typography>
                            </Box>
                          </Box>
                        )}
                      />
                    </ListItem>
                    {index < activeTransfers.length - 1 || historyTransfers.length > 0 ? (
                      <Divider component="li" />
                    ) : null}
                  </Box>
                ))}
                {historyTransfers.map((transfer, index) => (
                  <Box key={transfer.id}>
                    <ListItem sx={{ px: 2, py: 1, alignItems: 'flex-start' }}>
                      <ListItemIcon sx={{ minWidth: 28, mt: 0.25 }}>
                        {transfer.direction === 'upload' ? (
                          <ArrowUpwardIcon fontSize="small" color="primary" />
                        ) : (
                          <ArrowDownwardIcon fontSize="small" color="info" />
                        )}
                      </ListItemIcon>
                      <ListItemText
                        primary={(
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2" noWrap title={transfer.file_name} sx={{ maxWidth: 220 }}>
                              {transfer.file_name}
                            </Typography>
                            {transfer.status === 'completed' ? (
                              <CheckCircleIcon fontSize="small" color="success" />
                            ) : transfer.status === 'failed' ? (
                              <CancelIcon fontSize="small" color="error" />
                            ) : null}
                          </Box>
                        )}
                        secondary={(
                          <Box>
                            <Typography variant="caption" color="text.secondary" noWrap title={transfer.remote_path} display="block">
                              {transfer.remote_path}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {getDirectionText(transfer.direction)} | {formatFileSize(transfer.file_size)} | {formatDateTime(transfer.transferred_at)} | {formatDuration(transfer.duration)}
                            </Typography>
                            {transfer.status === 'failed' && transfer.error_message ? (
                              <Typography variant="caption" color="error" display="block" noWrap title={transfer.error_message}>
                                {transfer.error_message}
                              </Typography>
                            ) : null}
                          </Box>
                        )}
                      />
                    </ListItem>
                    {index < historyTransfers.length - 1 ? <Divider component="li" /> : null}
                  </Box>
                ))}
              </List>
            )}
          </Box>
        ) : null}
      </Paper>

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
