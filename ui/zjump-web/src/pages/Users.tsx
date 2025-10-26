import { useState, useEffect } from 'react';
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
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  TablePagination,
  InputAdornment,
  Tooltip,
  Alert,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  LockReset as LockResetIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
  Security as SecurityIcon,
} from '@mui/icons-material';
import { userManagementApi, User, showSuccessToast } from '../api/api';
import { useTranslation } from 'react-i18next';

export default function Users() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [openPasswordDialog, setOpenPasswordDialog] = useState(false);
  const [openReset2FADialog, setOpenReset2FADialog] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [currentUser, setCurrentUser] = useState<Partial<User>>({});
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    email: '',
    fullName: '',
    role: 'user' as 'admin' | 'user',
    authMethod: 'password' as 'password' | 'publickey',
    expiresAt: '',
    autoDisableOnExpiry: true,
  });

  // 获取当前登录用户
  const currentLoginUser = JSON.parse(localStorage.getItem('user') || '{}');
  
  // 调试信息
  console.log('当前登录用户:', currentLoginUser);
  console.log('当前用户角色:', currentLoginUser.role);
  console.log('用户对象的所有属性:', Object.keys(currentLoginUser));
  console.log('localStorage中的用户数据:', localStorage.getItem('user'));

  // 加载用户列表
  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      // 使用新的API获取用户及其用户组
      const response = await userManagementApi.getUsersWithUserGroups({
        page: page + 1,
        pageSize,
        keyword: keyword || undefined,
      });
      setUsers(response.users || []);
      setTotal(response.total || 0);
    } catch (err: any) {
      console.error('加载用户列表失败:', err);
      setError(err.response?.data?.message || '加载用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [page, pageSize]);

  // 搜索
  const handleSearch = () => {
    setPage(0);
    loadUsers();
  };

  // 打开创建对话框
  const handleOpenCreate = () => {
    setDialogMode('create');
    setFormData({
      username: '',
      password: '',
      email: '',
      fullName: '',
      role: 'user',
      authMethod: 'password',
      expiresAt: '',
      autoDisableOnExpiry: true,
    });
    setOpenDialog(true);
  };

  // 打开编辑对话框
  const handleOpenEdit = (user: User) => {
    setDialogMode('edit');
    setCurrentUser(user);
    setFormData({
      username: user.username,
      password: '',
      email: user.email || '',
      fullName: user.fullName || '',
      role: user.role,
      authMethod: user.authMethod || 'password',
      expiresAt: user.expiresAt ? user.expiresAt.substring(0, 16) : '', // 格式化为 datetime-local
      autoDisableOnExpiry: user.autoDisableOnExpiry !== undefined ? user.autoDisableOnExpiry : true,
    });
    setOpenDialog(true);
  };

  // 关闭对话框
  const handleCloseDialog = () => {
    setOpenDialog(false);
    setCurrentUser({});
    setFormData({
      username: '',
      password: '',
      email: '',
      fullName: '',
      role: 'user',
      authMethod: 'password',
      expiresAt: '',
      autoDisableOnExpiry: true,
    });
    setError('');
  };

  // 创建或更新用户
  const handleSubmit = async () => {
    try {
      if (dialogMode === 'create') {
        const userData = {
          ...formData,
          expiresAt: formData.expiresAt ? new Date(formData.expiresAt).toISOString() : undefined,
        };
        await userManagementApi.createUser(userData);
        showSuccessToast('用户创建成功');
      } else {
        const updateData: any = {
          fullName: formData.fullName,
          email: formData.email,
          expiresAt: formData.expiresAt ? new Date(formData.expiresAt).toISOString() : '',
          autoDisableOnExpiry: formData.autoDisableOnExpiry,
        };
        
        await userManagementApi.updateUser(currentUser.id!, updateData);
        
        // 如果角色改变了，单独更新角色
        if (formData.role !== currentUser.role) {
          await userManagementApi.updateUserRole(currentUser.id!, formData.role);
        }
        
        // 如果认证方式改变了，单独更新认证方式
        if (formData.authMethod !== currentUser.authMethod) {
          await userManagementApi.updateUserAuthMethod(currentUser.id!, formData.authMethod);
        }
        
        showSuccessToast('用户更新成功');
      }
      handleCloseDialog();
      loadUsers();
    } catch (err: any) {
      console.error('操作失败:', err);
      setError(err.response?.data?.message || '操作失败');
    }
  };

  // 删除用户
  const handleDelete = async (user: User) => {
    if (user.id === currentLoginUser.id) {
      setError('不能删除自己');
      return;
    }

    if (!window.confirm(`确定要删除用户 ${user.username} 吗？`)) {
      return;
    }

    try {
      await userManagementApi.deleteUser(user.id);
      showSuccessToast('用户删除成功');
      loadUsers();
    } catch (err: any) {
      console.error('删除失败:', err);
      setError(err.response?.data?.message || '删除失败');
    }
  };

  // 打开重置2FA对话框
  const handleOpenReset2FA = (user: User) => {
    setCurrentUser(user);
    setOpenReset2FADialog(true);
  };

  // 重置用户2FA
  const handleReset2FA = async () => {
    if (!currentUser.id) return;

    try {
      await userManagementApi.resetUser2FA(currentUser.id);
      showSuccessToast('用户2FA已重置');
      setOpenReset2FADialog(false);
      loadUsers();
    } catch (err: any) {
      console.error('重置2FA失败:', err);
      setError(err.response?.data?.message || '重置2FA失败');
    }
  };

  // 切换用户状态
  const handleToggleStatus = async (user: User) => {
    if (user.id === currentLoginUser.id) {
      setError('不能禁用自己');
      return;
    }

    const newStatus = user.status === 'active' ? 'inactive' : 'active';
    try {
      await userManagementApi.updateUserStatus(user.id, newStatus);
      showSuccessToast(newStatus === 'active' ? '用户已启用' : '用户已禁用');
      loadUsers();
    } catch (err: any) {
      console.error('状态切换失败:', err);
      setError(err.response?.data?.message || '状态切换失败');
    }
  };

  // 打开重置密码对话框
  const handleOpenResetPassword = (userId: string) => {
    setSelectedUserId(userId);
    setNewPassword('');
    setOpenPasswordDialog(true);
  };

  // 关闭重置密码对话框
  const handleClosePasswordDialog = () => {
    setOpenPasswordDialog(false);
    setSelectedUserId('');
    setNewPassword('');
  };

  // 重置密码
  const handleResetPassword = async () => {
    if (newPassword.length < 6) {
      setError('密码至少6位');
      return;
    }

    try {
      await userManagementApi.resetPassword(selectedUserId, newPassword);
      showSuccessToast('密码重置成功');
      handleClosePasswordDialog();
    } catch (err: any) {
      console.error('重置密码失败:', err);
      setError(err.response?.data?.message || '重置密码失败');
    }
  };

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" sx={{ fontWeight: 600 }}>
          {t("users.title")}
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleOpenCreate}
          sx={{ borderRadius: 2 }}
        >
          {t("users.createUser")}
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Paper sx={{ p: 3, borderRadius: 2 }}>
        {/* 搜索栏 */}
        <Box sx={{ mb: 3, display: 'flex', gap: 2 }}>
          <TextField
            size="small"
            placeholder={t("users.searchPlaceholder")}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            sx={{ flex: 1 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />
          <Button variant="outlined" onClick={handleSearch}>
            {t("common.search")}
          </Button>
          <Tooltip title={t("common.refresh")}>
            <IconButton onClick={loadUsers}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>

        {/* 用户表格 */}
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{t("users.username")}</TableCell>
                <TableCell>{t("users.name")}</TableCell>
                <TableCell>{t("users.email")}</TableCell>
                <TableCell>{t("users.role")}</TableCell>
                <TableCell>用户组</TableCell>
                <TableCell>{t("common.status")}</TableCell>
                <TableCell>过期时间</TableCell>
                <TableCell>{t("users.lastLoginTime")}</TableCell>
                <TableCell>{t("users.lastLoginIP")}</TableCell>
                <TableCell>{t("common.createdAt")}</TableCell>
                <TableCell align="right">{t("common.actions")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={11} align="center">
                    {t("common.loading")}
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} align="center">
                    {t("common.noData")}
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.id} hover>
                    <TableCell>{user.username}</TableCell>
                    <TableCell>{user.fullName || '-'}</TableCell>
                    <TableCell>{user.email || '-'}</TableCell>
                    <TableCell>
                      <Chip
                        label={user.role === 'admin' ? t("users.admin") : t("users.user")}
                        color={user.role === 'admin' ? 'primary' : 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, maxWidth: 300 }}>
                        {user.userGroups && user.userGroups.length > 0 ? (
                          user.userGroups.map((group) => (
                            <Chip key={group.id} label={group.name} size="small" color="secondary" />
                          ))
                        ) : (
                          <Typography variant="caption" color="text.secondary">无</Typography>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={user.status === 'active' ? t("common.enabled") : t("common.disabled")}
                        color={user.status === 'active' ? 'success' : 'default'}
                        size="small"
                        onClick={() => handleToggleStatus(user)}
                        sx={{ cursor: 'pointer' }}
                      />
                    </TableCell>
                    <TableCell>
                      {user.expiresAt ? (
                        <Box>
                          <Typography variant="body2">
                            {new Date(user.expiresAt).toLocaleString()}
                          </Typography>
                          {new Date(user.expiresAt) < new Date() && (
                            <Chip label="已过期" color="error" size="small" sx={{ mt: 0.5 }} />
                          )}
                          {new Date(user.expiresAt) > new Date() && 
                           new Date(user.expiresAt).getTime() - new Date().getTime() < 7 * 24 * 60 * 60 * 1000 && (
                            <Chip label="即将过期" color="warning" size="small" sx={{ mt: 0.5 }} />
                          )}
                        </Box>
                      ) : (
                        <Chip label="永不过期" color="default" size="small" />
                      )}
                    </TableCell>
                    <TableCell>
                      {user.lastLoginTime
                        ? new Date(user.lastLoginTime).toLocaleString()
                        : '-'}
                    </TableCell>
                    <TableCell>{user.lastLoginIp || '-'}</TableCell>
                    <TableCell>
                      {new Date(user.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        <Tooltip title={t("common.edit")}>
                          <IconButton size="small" onClick={() => handleOpenEdit(user)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={t("users.resetPassword")}>
                          <IconButton
                            size="small"
                            onClick={() => handleOpenResetPassword(user.id)}
                          >
                            <LockResetIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {/* 重置2FA按钮 */}
                        <Tooltip title="重置2FA">
                          <IconButton
                            size="small"
                            onClick={() => handleOpenReset2FA(user)}
                            color="warning"
                          >
                            <SecurityIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={t("common.delete")}>
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => handleDelete(user)}
                              disabled={user.id === currentLoginUser.id}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* 分页 */}
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          rowsPerPage={pageSize}
          onRowsPerPageChange={(e) => {
            setPageSize(parseInt(e.target.value, 10));
            setPage(0);
          }}
          labelRowsPerPage={`${t("common.rowsPerPage")}:`}
          labelDisplayedRows={({ from, to, count }) =>
            t("common.displayedRows", { from, to, count: count !== -1 ? count : `${to}+` })
          }
        />
      </Paper>

      {/* 创建/编辑对话框 */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {dialogMode === 'create' ? t("users.addUser") : t("users.editUser")}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label={t("users.username")}
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
              fullWidth
              disabled={dialogMode === 'edit'}
            />
            {dialogMode === 'create' && (
              <TextField
                label={t("users.password")}
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                fullWidth
                helperText={t("users.passwordMinLength")}
              />
            )}
            <TextField
              label={t("users.name")}
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              fullWidth
            />
            <TextField
              label={t("users.email")}
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
              fullWidth
            />
            <TextField
              label={t("users.role")}
              select
              value={formData.role}
              onChange={(e) =>
                setFormData({ ...formData, role: e.target.value as 'admin' | 'user' })
              }
              fullWidth
            >
              <MenuItem value="user">{t("users.user")}</MenuItem>
              <MenuItem value="admin">{t("users.admin")}</MenuItem>
            </TextField>
            <TextField
              label={t("users.authMethod")}
              select
              value={formData.authMethod}
              onChange={(e) =>
                setFormData({ ...formData, authMethod: e.target.value as 'password' | 'publickey' })
              }
              fullWidth
              helperText={t("users.authMethodHelper")}
            >
              <MenuItem value="password">{t("users.authPassword")}</MenuItem>
              <MenuItem value="publickey">{t("users.authPublickey")}</MenuItem>
            </TextField>
            <TextField
              label="过期时间"
              type="datetime-local"
              value={formData.expiresAt}
              onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
              fullWidth
              InputLabelProps={{
                shrink: true,
              }}
              helperText="留空表示永不过期"
            />
            <TextField
              label="过期后自动禁用"
              select
              value={formData.autoDisableOnExpiry ? 'true' : 'false'}
              onChange={(e) =>
                setFormData({ ...formData, autoDisableOnExpiry: e.target.value === 'true' })
              }
              fullWidth
              helperText="开启后，账号过期会自动禁用"
            >
              <MenuItem value="true">是</MenuItem>
              <MenuItem value="false">否</MenuItem>
            </TextField>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>{t("common.cancel")}</Button>
          <Button onClick={handleSubmit} variant="contained">
            {dialogMode === 'create' ? t("common.create") : t("common.save")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 重置密码对话框 */}
      <Dialog
        open={openPasswordDialog}
        onClose={handleClosePasswordDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{t("users.resetPassword")}</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <TextField
              label={t("users.newPassword")}
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              fullWidth
              helperText={t("users.passwordMinLength")}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClosePasswordDialog}>{t("common.cancel")}</Button>
          <Button onClick={handleResetPassword} variant="contained">
            {t("users.resetPassword")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 重置2FA对话框 */}
      <Dialog
        open={openReset2FADialog}
        onClose={() => setOpenReset2FADialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>重置用户2FA</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <Alert severity="warning" sx={{ mb: 2 }}>
              确定要重置用户 <strong>{currentUser.username}</strong> 的2FA设置吗？
              <br />
              此操作将清除用户的2FA密钥和备用码，用户需要重新设置2FA。
            </Alert>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenReset2FADialog(false)}>
            取消
          </Button>
          <Button onClick={handleReset2FA} color="error" variant="contained">
            确认重置
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}

