import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  IconButton,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Typography,
  CircularProgress,
  InputAdornment,
  Tooltip,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Search as SearchIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { Host, DeviceType, Protocol } from '../types';
import { mockHosts, useMockData } from '../api/mockData';
import { hostApi, hostGroupApi, HostGroup } from '../api/api';
import { getDeviceTypeName } from '../utils/websocket';
import { useTranslation } from 'react-i18next';

export default function Assets() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [hosts, setHosts] = useState<Host[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [showError, setShowError] = useState(false);
  const [alertSeverity, setAlertSeverity] = useState<'success' | 'error'>('error');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  
  // 主机组相关状态
  const [hostGroups, setHostGroups] = useState<HostGroup[]>([]);
  const [selectedHostGroupIds, setSelectedHostGroupIds] = useState<string[]>([]);
  
  // 新增主机相关状态
  const [addHostDialogOpen, setAddHostDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newHost, setNewHost] = useState({
    name: '',
    ip: '',
    port: 22,
    protocol: 'ssh' as Protocol,
    deviceType: 'server' as DeviceType,
    username: 'root',
    tags: '',
  });

  // 编辑主机相关状态
  const [editHostDialogOpen, setEditHostDialogOpen] = useState(false);
  const [editingHost, setEditingHost] = useState<Host | null>(null);
  const [editHostGroupIds, setEditHostGroupIds] = useState<string[]>([]);
  const [editHost, setEditHost] = useState({
    name: '',
    ip: '',
    port: 22,
    protocol: 'ssh' as Protocol,
    deviceType: 'server' as DeviceType,
    status: 'offline',
    tags: '',
  });

  // 获取用户角色
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;
  const isAdmin = user?.role === 'admin';

  const loadHosts = async () => {
    setLoading(true);
    try {
      if (useMockData) {
        setTimeout(() => {
          setHosts(mockHosts);
          setLoading(false);
        }, 500);
      } else {
        // 管理员获取所有主机，设置较大的 pageSize
        const data = await hostApi.getHosts({ pageSize: 10000 });
        // 解析 tags 字段（从 JSON 字符串转为数组）
        const hostsWithParsedTags = data.hosts.map(host => ({
          ...host,
          tags: typeof host.tags === 'string' ? JSON.parse(host.tags || '[]') : (host.tags || [])
        }));
        setHosts(hostsWithParsedTags);
        setLoading(false);
      }
    } catch (error) {
      console.error('Failed to load hosts:', error);
      setLoading(false);
    }
  };

  // 加载主机组列表（包含统计信息）
  const loadHostGroups = async () => {
    try {
      // 传递参数以获取统计信息
      const data = await hostGroupApi.listGroups({ stats: true });
      console.log('加载的主机组列表:', data);
      setHostGroups(data.groups || []);
    } catch (error) {
      console.error('Failed to load host groups:', error);
    }
  };

  useEffect(() => {
    loadHosts();
    loadHostGroups();
  }, []);


  const handleCloseError = () => {
    setShowError(false);
  };

  // 打开新增主机对话框
  const handleOpenAddHost = async () => {
    setNewHost({
      name: '',
      ip: '',
      port: 22,
      protocol: 'ssh' as Protocol,
      deviceType: 'linux' as DeviceType,
      username: 'root',
      tags: '',
    });
    setSelectedHostGroupIds([]);
    // 重新加载主机组列表以获取最新的主机数量
    await loadHostGroups();
    setAddHostDialogOpen(true);
  };

  // 关闭新增主机对话框
  const handleCloseAddHost = () => {
    setAddHostDialogOpen(false);
    setNewHost({
      name: '',
      ip: '',
      port: 22,
      protocol: 'ssh' as Protocol,
      deviceType: 'server' as DeviceType,
      username: 'root',
      tags: '',
    });
    setSelectedHostGroupIds([]);
  };

  // 提交新增主机
  const handleSubmitAddHost = async () => {
    // 表单验证
    if (!newHost.name || !newHost.ip) {
      setAlertSeverity('error');
      setErrorMessage('请填写所有必填字段');
      setShowError(true);
      return;
    }

    setSubmitting(true);
    try {
      // 处理标签（转为JSON字符串）
      const tagsArray = newHost.tags
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag !== '');

      // 调用API创建主机
      const createdHost = await hostApi.createHost({
        name: newHost.name,
        ip: newHost.ip,
        port: newHost.port,
        protocol: newHost.protocol,
        deviceType: newHost.deviceType,
        username: newHost.username,
        tags: JSON.stringify(tagsArray), // 转为JSON字符串
        status: 'offline', // 新建主机默认离线
        os: '',
      });

      // 如果选择了主机组，将主机添加到主机组
      if (selectedHostGroupIds.length > 0 && createdHost.id) {
        try {
          // 将主机添加到所有选中的主机组
          for (const groupId of selectedHostGroupIds) {
            await hostGroupApi.addHostsToGroup(groupId, [createdHost.id]);
          }
        } catch (error) {
          console.error('Failed to add host to groups:', error);
          // 不阻塞主流程，只记录错误
        }
      }

      // 成功后刷新列表和主机组
      await loadHosts();
      await loadHostGroups();
      handleCloseAddHost();
      
      // 显示成功提示
      setAlertSeverity('success');
      setErrorMessage(selectedHostGroupIds.length > 0 ? '主机添加成功并已加入主机组！' : '主机添加成功！');
      setShowError(true);
    } catch (error) {
      console.error('Failed to add host:', error);
      setAlertSeverity('error');
      setErrorMessage(error instanceof Error ? error.message : '添加主机失败');
      setShowError(true);
    } finally {
      setSubmitting(false);
    }
  };

  // 打开编辑主机对话框
  const handleOpenEditHost = async (host: Host) => {
    setEditingHost(host);
    setEditHost({
      name: host.name,
      ip: host.ip,
      port: host.port,
      protocol: host.protocol,
      deviceType: host.deviceType,
      status: host.status,
      tags: Array.isArray(host.tags) ? host.tags.join(', ') : '',
    });
    
    // 重新加载主机组列表以获取最新的主机数量
    await loadHostGroups();
    
    // 获取主机所属的所有主机组
    try {
      const groups = await hostGroupApi.getHostGroups(host.id);
      console.log('获取到的主机组数据:', groups);
      console.log('主机ID:', host.id);
      if (groups && Array.isArray(groups) && groups.length > 0) {
        const groupIds = groups.map(g => g.id);
        console.log('设置的主机组IDs:', groupIds);
        setEditHostGroupIds(groupIds);
      } else {
        console.log('未找到主机组或返回数据为空');
        setEditHostGroupIds([]);
      }
    } catch (error) {
      console.error('Failed to load host groups:', error);
      setEditHostGroupIds([]);
    }
    
    setEditHostDialogOpen(true);
  };

  // 关闭编辑主机对话框
  const handleCloseEditHost = () => {
    setEditHostDialogOpen(false);
    setEditingHost(null);
    setEditHost({
      name: '',
      ip: '',
      port: 22,
      protocol: 'ssh' as Protocol,
      deviceType: 'server' as DeviceType,
      status: 'offline',
      tags: '',
    });
    setEditHostGroupIds([]);
  };

  // 提交编辑主机
  const handleSubmitEditHost = async () => {
    if (!editingHost) return;

    // 表单验证
    if (!editHost.name || !editHost.ip) {
      setAlertSeverity('error');
      setErrorMessage('请填写所有必填字段');
      setShowError(true);
      return;
    }

    setSubmitting(true);
    try {
      // 处理标签（转为JSON字符串）
      const tagsArray = editHost.tags
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag !== '');

      // 构建更新数据
      const updateData: any = {
        name: editHost.name,
        ip: editHost.ip,
        port: editHost.port,
        deviceType: editHost.deviceType as DeviceType,
        status: editHost.status,
        tags: JSON.stringify(tagsArray), // 转为JSON字符串
      };

      // 调用API更新主机
      await hostApi.updateHost(editingHost.id, updateData);

      // 处理主机组变更
      try {
        // 获取主机原来所属的所有主机组
        const oldGroups = await hostGroupApi.getHostGroups(editingHost.id);
        const oldGroupIds = oldGroups ? oldGroups.map(g => g.id) : [];

        // 找出需要移除的主机组（在旧列表中但不在新列表中）
        const groupsToRemove = oldGroupIds.filter(id => !editHostGroupIds.includes(id));
        
        // 找出需要添加的主机组（在新列表中但不在旧列表中）
        const groupsToAdd = editHostGroupIds.filter(id => !oldGroupIds.includes(id));

        // 从需要移除的主机组中移除主机
        for (const groupId of groupsToRemove) {
          await hostGroupApi.removeHostsFromGroup(groupId, [editingHost.id]);
        }

        // 将主机添加到新的主机组
        for (const groupId of groupsToAdd) {
          await hostGroupApi.addHostsToGroup(groupId, [editingHost.id]);
        }
      } catch (error) {
        console.error('Failed to update host groups:', error);
        // 主机组更新失败不阻塞主流程，只记录错误
      }

      // 成功后刷新列表和主机组
      await loadHosts();
      await loadHostGroups();
      handleCloseEditHost();
      
      // 显示成功提示
      setAlertSeverity('success');
      setErrorMessage('主机更新成功！');
      setShowError(true);
    } catch (error) {
      console.error('Failed to update host:', error);
      setAlertSeverity('error');
      setErrorMessage(error instanceof Error ? error.message : '更新主机失败');
      setShowError(true);
    } finally {
      setSubmitting(false);
    }
  };

  // 删除主机
  const handleDeleteHost = async (host: Host) => {
    // 二次确认
    const confirmed = window.confirm(
      `确定要删除主机 "${host.name}" (${host.ip}) 吗？\n\n此操作不可恢复！`
    );
    
    if (!confirmed) return;

    setSubmitting(true);
    try {
      await hostApi.deleteHost(host.id);
      
      // 成功后刷新列表
      await loadHosts();
      
      // 显示成功提示
      setAlertSeverity('success');
      setErrorMessage(`主机 "${host.name}" 已删除`);
      setShowError(true);
    } catch (error) {
      console.error('Failed to delete host:', error);
      setAlertSeverity('error');
      setErrorMessage(error instanceof Error ? error.message : '删除主机失败');
      setShowError(true);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredHosts = hosts.filter(
    (host) =>
      host.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      host.ip.includes(searchTerm) ||
      host.tags.some((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // 分页数据
  const paginatedHosts = filteredHosts.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" component="h1" fontWeight="700" gutterBottom>
            💻 {t("assets.title")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('assets.description')}
          </Typography>
        </Box>
        <Box display="flex" gap={2}>
          <TextField
            size="small"
            placeholder={t("common.search") + "..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            sx={{
              width: 280,
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
                backgroundColor: 'white',
              },
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="action" />
                </InputAdornment>
              ),
            }}
          />
          {isAdmin && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleOpenAddHost}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #764ba2 0%, #667eea 100%)',
                },
              }}
            >
              新增主机
            </Button>
          )}
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={loadHosts}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
            }}
          >
            {t("common.refresh")}
          </Button>
        </Box>
      </Box>

      <Card 
        sx={{ 
          borderRadius: 3,
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        }}
      >
        <CardContent sx={{ p: 0 }}>
          <TableContainer sx={{ p: 2, overflowX: 'auto' }}>
            <Table sx={{ minWidth: 1200 }}>
              <TableHead>
                <TableRow sx={{ backgroundColor: 'rgba(102, 126, 234, 0.05)' }}>
                  <TableCell sx={{ fontWeight: 700, color: '#667eea', minWidth: 150, width: 180 }}>{t("assets.hostName")}</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#667eea', width: 145 }}>{t("assets.hostIP")}</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#667eea', width: 70 }}>{t("assets.port")}</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#667eea', width: 120 }}>{t("assets.deviceType")}</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#667eea', width: 90 }}>{t("common.status")}</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#667eea', width: 180 }}>{t("assets.tags")}</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700, color: '#667eea', width: 130 }}>{t("common.actions")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedHosts.map((host) => (
                  <TableRow 
                    key={host.id} 
                    hover
                    sx={{
                      transition: 'all 0.2s ease',
                      '&:hover': {
                        backgroundColor: 'rgba(102, 126, 234, 0.05)',
                        transform: 'scale(1.005)',
                      },
                    }}
                  >
                    <TableCell sx={{ minWidth: 150, width: 180 }}>
                      <Tooltip title={host.name} arrow>
                        <Typography 
                          fontWeight={700} 
                          sx={{ 
                            color: '#1a202c',
                            fontSize: '1rem',
                            letterSpacing: '0.01em',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            cursor: 'pointer',
                          }}
                        >
                          {host.name}
                        </Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell sx={{ width: 145 }}>
                      <Chip 
                        label={host.ip} 
                        size="small" 
                        variant="outlined"
                        sx={{ fontFamily: 'monospace', fontWeight: 600 }}
                      />
                    </TableCell>
                    <TableCell sx={{ width: 70 }}>
                      <Chip 
                        label={host.port} 
                        size="small"
                        sx={{ fontFamily: 'monospace' }}
                      />
                    </TableCell>
                    <TableCell sx={{ width: 120 }}>
                      <Chip 
                        label={getDeviceTypeName(host.deviceType)} 
                        size="small"
                        color="info"
                        variant="outlined"
                        sx={{ fontWeight: 600 }}
                      />
                    </TableCell>
                    <TableCell sx={{ width: 90 }}>
                      <Chip
                        label={host.status === 'online' ? '🟢 在线' : ' 离线'}
                        color={host.status === 'online' ? 'success' : 'error'}
                        size="small"
                        sx={{ fontWeight: 600 }}
                      />
                    </TableCell>
                    <TableCell sx={{ width: 180, maxWidth: 180 }}>
                      <Box display="flex" gap={0.5} flexWrap="wrap">
                        {host.tags.map((tag) => (
                          <Chip 
                            key={tag} 
                            label={tag} 
                            size="small"
                            sx={{
                              backgroundColor: 'rgba(102, 126, 234, 0.1)',
                              color: '#667eea',
                              fontWeight: 500,
                            }}
                          />
                        ))}
                      </Box>
                    </TableCell>
                    <TableCell align="center" sx={{ width: 130 }}>
                      <Box display="flex" gap={1} justifyContent="center">
                        {isAdmin && (
                          <>
                            <Tooltip title="编辑主机">
                              <IconButton
                                size="small"
                                onClick={() => handleOpenEditHost(host)}
                                sx={{
                                  backgroundColor: 'rgba(255, 152, 0, 0.1)',
                                  color: '#ff9800',
                                  '&:hover': {
                                    backgroundColor: 'rgba(255, 152, 0, 0.2)',
                                  },
                                }}
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="删除主机">
                              <span>
                                <IconButton
                                  size="small"
                                  onClick={() => handleDeleteHost(host)}
                                  disabled={submitting}
                                  sx={{
                                    backgroundColor: 'rgba(244, 67, 54, 0.1)',
                                    color: '#f44336',
                                    '&:hover': {
                                      backgroundColor: 'rgba(244, 67, 54, 0.2)',
                                    },
                                    '&:disabled': {
                                      backgroundColor: 'transparent',
                                    color: 'rgba(0, 0, 0, 0.26)',
                                  },
                                }}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                              </span>
                            </Tooltip>
                          </>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            rowsPerPageOptions={[5, 10, 25, 50]}
            component="div"
            count={filteredHosts.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            labelRowsPerPage={t("common.rowsPerPage")}
            labelDisplayedRows={({ from, to, count }) =>
              t("common.displayedRows", { from, to, count })
            }
            sx={{
              borderTop: '1px solid #e2e8f0',
              '.MuiTablePagination-selectLabel, .MuiTablePagination-displayedRows': {
                fontWeight: 500,
              },
            }}
          />
        </CardContent>
      </Card>

      {/* 消息提示 */}
      <Snackbar 
        open={showError} 
        autoHideDuration={6000}
        onClose={handleCloseError}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert 
          onClose={handleCloseError} 
          severity={alertSeverity}
          sx={{ 
            width: '100%',
            '& .MuiAlert-message': {
              fontSize: '1rem',
              fontWeight: 500,
            }
          }}
        >
          {errorMessage}
        </Alert>
      </Snackbar>



      {/* 编辑主机对话框 */}
      <Dialog 
        open={editHostDialogOpen} 
        onClose={handleCloseEditHost}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          }
        }}
      >
        <DialogTitle sx={{ 
          pb: 2,
          pt: 2,
          px: 3,
          background: 'linear-gradient(135deg, #ff9800 0%, #ff5722 100%)',
          color: 'white',
        }}>
          <Box>
            <Typography 
              variant="h6" 
              sx={{ 
                fontWeight: 700,
                fontSize: '1.25rem',
                mb: 0.5,
              }}
            >
              ✏️ 编辑主机
            </Typography>
            {editingHost && (
              <Typography 
                variant="body2" 
                sx={{ 
                  opacity: 0.95,
                  fontWeight: 500,
                  fontSize: '0.95rem',
                  letterSpacing: '0.02em',
                }}
              >
                {editingHost.name}
              </Typography>
            )}
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3, mt: 2 }}>
          <Box display="flex" flexDirection="column" gap={2.5}>
            {/* 主机名称 */}
            <TextField
              label="主机名称"
              value={editHost.name}
              onChange={(e) => setEditHost({ ...editHost, name: e.target.value })}
              fullWidth
              required
              placeholder="例如：Web服务器-01"
              variant="outlined"
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                },
                '& .MuiInputLabel-root': {
                  marginTop: '10px',
                },
              }}
            />

            {/* IP地址 */}
            <TextField
              label="IP地址"
              value={editHost.ip}
              onChange={(e) => setEditHost({ ...editHost, ip: e.target.value })}
              fullWidth
              required
              placeholder="例如：192.168.1.100"
              variant="outlined"
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                },
              }}
            />

            {/* 端口号 */}
            <TextField
              label="端口号"
              type="number"
              value={editHost.port}
              onChange={(e) => setEditHost({ ...editHost, port: parseInt(e.target.value) || 22 })}
              fullWidth
              required
              variant="outlined"
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                },
              }}
            />

            {/* 设备类型 */}
            <FormControl fullWidth>
              <InputLabel>设备类型</InputLabel>
              <Select
                value={editHost.deviceType}
                label="设备类型"
                onChange={(e) => setEditHost({ ...editHost, deviceType: e.target.value })}
                sx={{
                  borderRadius: 2,
                }}
              >
                <MenuItem value="linux">Linux 服务器</MenuItem>
                <MenuItem value="windows">Windows 服务器</MenuItem>
                <MenuItem value="vmware">VMware 虚拟机</MenuItem>
                <MenuItem value="docker">Docker 容器</MenuItem>
                <MenuItem value="switch">交换机</MenuItem>
                <MenuItem value="router">路由器</MenuItem>
                <MenuItem value="firewall">防火墙</MenuItem>
                <MenuItem value="storage">存储设备</MenuItem>
                <MenuItem value="other">其他设备</MenuItem>
              </Select>
            </FormControl>

            {/* 状态 */}
            <FormControl fullWidth>
              <InputLabel>状态</InputLabel>
              <Select
                value={editHost.status}
                label="状态"
                onChange={(e) => setEditHost({ ...editHost, status: e.target.value })}
                sx={{
                  borderRadius: 2,
                }}
              >
                <MenuItem value="online">🟢 在线</MenuItem>
                <MenuItem value="offline"> 离线</MenuItem>
              </Select>
            </FormControl>

            {/* 标签 */}
            <TextField
              label="标签"
              value={editHost.tags}
              onChange={(e) => setEditHost({ ...editHost, tags: e.target.value })}
              fullWidth
              placeholder="多个标签用逗号分隔，例如：生产环境,Web服务器"
              variant="outlined"
              helperText="标签用于分组和路由决策"
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                },
              }}
            />

            {/* 主机组选择 */}
            <FormControl fullWidth>
              <InputLabel>主机组（可选）</InputLabel>
              <Select
                multiple
                value={editHostGroupIds}
                label="主机组（可选）"
                onChange={(e) => {
                  const value = e.target.value;
                  setEditHostGroupIds(typeof value === 'string' ? value.split(',') : value);
                }}
                renderValue={(selected) => {
                  if (selected.length === 0) {
                    return <em>不加入任何主机组</em>;
                  }
                  return hostGroups
                    .filter(g => selected.includes(g.id))
                    .map(g => `${g.icon ? g.icon + ' ' : ''}${g.name}`)
                    .join(', ');
                }}
                sx={{
                  borderRadius: 2,
                }}
              >
                {hostGroups.map((group) => (
                  <MenuItem key={group.id} value={group.id}>
                    <Checkbox checked={editHostGroupIds.indexOf(group.id) > -1} />
                    <Box component="span" sx={{ ml: 1 }}>
                      {group.icon && `${group.icon} `}{group.name}
                      {group.hostCount !== undefined && ` (${group.hostCount}台主机)`}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, pt: 2 }}>
          <Button 
            onClick={handleCloseEditHost}
            disabled={submitting}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              px: 3,
            }}
          >
            取消
          </Button>
          <Button 
            onClick={handleSubmitEditHost}
            variant="contained"
            disabled={submitting}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              px: 3,
              background: 'linear-gradient(135deg, #ff9800 0%, #ff5722 100%)',
              '&:hover': {
                background: 'linear-gradient(135deg, #ff5722 0%, #ff9800 100%)',
              },
            }}
          >
            {submitting ? <CircularProgress size={20} color="inherit" /> : '确认保存'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 新增主机对话框 */}
      <Dialog 
        open={addHostDialogOpen} 
        onClose={handleCloseAddHost}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          }
        }}
      >
        <DialogTitle sx={{ 
          pb: 2,
          pt: 2,
          px: 3,
          fontWeight: 700,
          fontSize: '1.25rem',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
        }}>
          ➕ 新增主机
        </DialogTitle>
        <DialogContent sx={{ pt: 3, mt: 2 }}>
          <Box display="flex" flexDirection="column" gap={2.5}>
            {/* 主机名称 */}
            <TextField
              label="主机名称"
              value={newHost.name}
              onChange={(e) => setNewHost({ ...newHost, name: e.target.value })}
              fullWidth
              required
              placeholder="例如：Web服务器-01"
              variant="outlined"
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                },
              }}
            />

            {/* IP地址 */}
            <TextField
              label="IP地址"
              value={newHost.ip}
              onChange={(e) => setNewHost({ ...newHost, ip: e.target.value })}
              fullWidth
              required
              placeholder="例如：192.168.1.100"
              variant="outlined"
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                },
              }}
            />

            {/* 端口号 */}
            <TextField
              label="端口号"
              type="number"
              value={newHost.port}
              onChange={(e) => setNewHost({ ...newHost, port: parseInt(e.target.value) || 22 })}
              fullWidth
              required
              variant="outlined"
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                },
              }}
            />

            {/* 设备类型 */}
            <FormControl fullWidth>
              <InputLabel>设备类型</InputLabel>
              <Select
                value={newHost.deviceType}
                label="设备类型"
                onChange={(e) => setNewHost({ ...newHost, deviceType: e.target.value })}
                sx={{
                  borderRadius: 2,
                }}
              >
                <MenuItem value="linux">Linux 服务器</MenuItem>
                <MenuItem value="windows">Windows 服务器</MenuItem>
                <MenuItem value="vmware">VMware 虚拟机</MenuItem>
                <MenuItem value="docker">Docker 容器</MenuItem>
                <MenuItem value="switch">交换机</MenuItem>
                <MenuItem value="router">路由器</MenuItem>
                <MenuItem value="firewall">防火墙</MenuItem>
                <MenuItem value="storage">存储设备</MenuItem>
                <MenuItem value="other">其他设备</MenuItem>
              </Select>
            </FormControl>

            {/* 标签 */}
            <TextField
              label="标签"
              value={newHost.tags}
              onChange={(e) => setNewHost({ ...newHost, tags: e.target.value })}
              fullWidth
              placeholder="多个标签用逗号分隔，例如：生产环境,Web服务器"
              variant="outlined"
              helperText="标签用于分组和路由决策"
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                },
              }}
            />

            {/* 主机组选择 */}
            <FormControl fullWidth>
              <InputLabel>主机组（可选）</InputLabel>
              <Select
                multiple
                value={selectedHostGroupIds}
                label="主机组（可选）"
                onChange={(e) => {
                  const value = e.target.value;
                  setSelectedHostGroupIds(typeof value === 'string' ? value.split(',') : value);
                }}
                renderValue={(selected) => {
                  if (selected.length === 0) {
                    return <em>不加入任何主机组</em>;
                  }
                  return hostGroups
                    .filter(g => selected.includes(g.id))
                    .map(g => `${g.icon ? g.icon + ' ' : ''}${g.name}`)
                    .join(', ');
                }}
                sx={{
                  borderRadius: 2,
                }}
              >
                {hostGroups.map((group) => (
                  <MenuItem key={group.id} value={group.id}>
                    <Checkbox checked={selectedHostGroupIds.indexOf(group.id) > -1} />
                    <Box component="span" sx={{ ml: 1 }}>
                      {group.icon && `${group.icon} `}{group.name}
                      {group.hostCount !== undefined && ` (${group.hostCount}台主机)`}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, pt: 2 }}>
          <Button 
            onClick={handleCloseAddHost}
            disabled={submitting}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              px: 3,
            }}
          >
            取消
          </Button>
          <Button 
            onClick={handleSubmitAddHost}
            variant="contained"
            disabled={submitting}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              px: 3,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              '&:hover': {
                background: 'linear-gradient(135deg, #764ba2 0%, #667eea 100%)',
              },
            }}
          >
            {submitting ? <CircularProgress size={20} color="inherit" /> : '确认添加'}
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}





