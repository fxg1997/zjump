import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Switch,
  FormControlLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Typography,
  Grid,
  Card,
  CardContent,
  Alert,
  Snackbar,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Person as PersonIcon,
  Key as KeyIcon,
} from '@mui/icons-material';
import { SystemUser, Protocol } from '../types';
import api from '../api';
import { useTranslation } from 'react-i18next';

const SystemUsers: React.FC = () => {
  const { t } = useTranslation();
  const [systemUsers, setSystemUsers] = useState<SystemUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingSystemUser, setEditingSystemUser] = useState<SystemUser | null>(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    authType: 'password' as 'password' | 'key',
    password: '',
    privateKey: '',
    passphrase: '',
    protocol: 'ssh' as Protocol,
    priority: 0,
    description: '',
    status: 'active' as 'active' | 'inactive',
  });

  useEffect(() => {
    fetchSystemUsers();
  }, []);

  const fetchSystemUsers = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/system-users');
      // 后端返回格式：{ code: 200, message: 'Success', data: [...] }
      const data = response.data?.data || response.data;
      setSystemUsers(Array.isArray(data) ? data : []);
    } catch (error: any) {
      setSnackbar({ open: true, message: error.message || '获取系统用户列表失败', severity: 'error' });
      setSystemUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingSystemUser(null);
    setFormData({
      name: '',
      username: '',
      authType: 'password',
      password: '',
      privateKey: '',
      passphrase: '',
      protocol: 'ssh',
      priority: 0,
      description: '',
      status: 'active',
    });
    setModalVisible(true);
  };

  const handleEdit = (record: SystemUser) => {
    setEditingSystemUser(record);
    setFormData({
      name: record.name,
      username: record.username,
      authType: record.authType,
      password: record.password || '',
      privateKey: record.privateKey || '',
      passphrase: record.passphrase || '',
      protocol: record.protocol,
      priority: record.priority,
      description: record.description || '',
      status: record.status,
    });
    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('systemUsers.deleteConfirm'))) return;
    
    try {
      await api.delete(`/api/system-users/${id}`);
      setSnackbar({ open: true, message: t('systemUsers.deleteSuccess'), severity: 'success' });
      fetchSystemUsers();
    } catch (error: any) {
      setSnackbar({ open: true, message: error.message || t('systemUsers.deleteFailed'), severity: 'error' });
    }
  };

  const handleSubmit = async () => {
    // 表单验证
    if (!formData.name || !formData.username) {
      setSnackbar({ open: true, message: t('systemUsers.requiredFields'), severity: 'error' });
      return;
    }

    // 认证方式验证：必须有对应的认证信息
    if (formData.authType === 'password' && !formData.password) {
      setSnackbar({ open: true, message: t('systemUsers.passwordRequired'), severity: 'error' });
      return;
    }
    if (formData.authType === 'key' && !formData.privateKey) {
      setSnackbar({ open: true, message: t('systemUsers.privateKeyRequired'), severity: 'error' });
      return;
    }

    try {
      if (editingSystemUser) {
        await api.put(`/api/system-users/${editingSystemUser.id}`, formData);
        setSnackbar({ open: true, message: t('systemUsers.updateSuccess'), severity: 'success' });
      } else {
        await api.post('/api/system-users', formData);
        setSnackbar({ open: true, message: t('systemUsers.createSuccess'), severity: 'success' });
      }
      
      setModalVisible(false);
      fetchSystemUsers();
    } catch (error: any) {
      setSnackbar({ open: true, message: error.message || t('common.error'), severity: 'error' });
    }
  };

  const stats = {
    total: systemUsers.length,
    active: systemUsers.filter(u => u.status === 'active').length,
    byAuth: {
      password: systemUsers.filter(u => u.authType === 'password').length,
      key: systemUsers.filter(u => u.authType === 'key').length,
    },
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* 统计卡片 */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Card sx={{ flex: '1 1 0', minWidth: 200 }}>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>
              {t('systemUsers.total')}
            </Typography>
            <Typography variant="h4">
              <PersonIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              {stats.total}
            </Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: '1 1 0', minWidth: 200 }}>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>
              {t('systemUsers.activeCount')}
            </Typography>
            <Typography variant="h4" color="success.main">
              {stats.active}
            </Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: '1 1 0', minWidth: 200 }}>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>
              {t('systemUsers.passwordAuth')}
            </Typography>
            <Typography variant="h4">
              {stats.byAuth.password}
            </Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: '1 1 0', minWidth: 200 }}>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>
              {t('systemUsers.keyAuth')}
            </Typography>
            <Typography variant="h4">
              {stats.byAuth.key}
            </Typography>
          </CardContent>
        </Card>
      </Box>

      {/* 表格 */}
      <Paper sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6">{t('systemUsers.title')}</Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleAdd}>
            {t('systemUsers.addUser')}
          </Button>
        </Box>

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{t('systemUsers.name')}</TableCell>
                <TableCell>{t('systemUsers.username')}</TableCell>
                <TableCell>{t('systemUsers.authType')}</TableCell>
                <TableCell>{t('systemUsers.protocol')}</TableCell>
                <TableCell>{t('systemUsers.status')}</TableCell>
                <TableCell>{t('systemUsers.description')}</TableCell>
                <TableCell>{t('common.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {systemUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <PersonIcon />
                      {user.name}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip label={user.username} size="small" color="info" />
                  </TableCell>
                  <TableCell>
                    <Chip
                      icon={<KeyIcon />}
                      label={user.authType === 'password' ? t('systemUsers.password') : t('systemUsers.key')}
                      size="small"
                      color={user.authType === 'password' ? 'success' : 'primary'}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip label={user.protocol.toUpperCase()} size="small" />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={user.status === 'active' ? t('systemUsers.active') : t('systemUsers.inactive')}
                      size="small"
                      color={user.status === 'active' ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell>{user.description}</TableCell>
                  <TableCell>
                    <IconButton size="small" color="primary" onClick={() => handleEdit(user)}>
                      <EditIcon />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={() => handleDelete(user.id)}>
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* 创建/编辑对话框 */}
      <Dialog open={modalVisible} onClose={() => setModalVisible(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editingSystemUser ? t('systemUsers.editUser') : t('systemUsers.addUser')}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 2 }}>
            {/* 基本信息 */}
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                fullWidth
                label={t('systemUsers.name')}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
              <TextField
                fullWidth
                label={t('systemUsers.username')}
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                required
              />
            </Box>

            {/* 认证和协议配置 */}
            <Box sx={{ display: 'flex', gap: 2 }}>
              <FormControl fullWidth required>
                <InputLabel>{t('systemUsers.authType')}</InputLabel>
                <Select
                  value={formData.authType}
                  onChange={(e) => setFormData({ ...formData, authType: e.target.value as any })}
                  label={t('systemUsers.authType')}
                >
                  <MenuItem value="password">{t('systemUsers.password')}</MenuItem>
                  <MenuItem value="key">{t('systemUsers.key')}</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel>{t('systemUsers.protocol')}</InputLabel>
                <Select
                  value={formData.protocol}
                  onChange={(e) => setFormData({ ...formData, protocol: e.target.value as Protocol })}
                  label={t('systemUsers.protocol')}
                >
                  <MenuItem value="ssh">SSH</MenuItem>
                  <MenuItem value="rdp">RDP</MenuItem>
                </Select>
              </FormControl>
            </Box>

            {/* 密码认证 */}
            {formData.authType === 'password' && (
              <TextField
                fullWidth
                type="password"
                label={t('systemUsers.password')}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
            )}

            {/* SSH密钥认证 */}
            {formData.authType === 'key' && (
              <>
                <TextField
                  fullWidth
                  multiline
                  rows={4}
                  label={t('systemUsers.privateKey')}
                  value={formData.privateKey}
                  onChange={(e) => setFormData({ ...formData, privateKey: e.target.value })}
                />
                <TextField
                  fullWidth
                  type="password"
                  label={t('systemUsers.passphrase')}
                  value={formData.passphrase}
                  onChange={(e) => setFormData({ ...formData, passphrase: e.target.value })}
                />
              </>
            )}

            {/* 状态 */}
            <FormControl fullWidth>
              <InputLabel>{t('systemUsers.status')}</InputLabel>
              <Select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                label={t('systemUsers.status')}
              >
                <MenuItem value="active">{t('systemUsers.active')}</MenuItem>
                <MenuItem value="inactive">{t('systemUsers.inactive')}</MenuItem>
              </Select>
            </FormControl>

            {/* 描述 */}
            <TextField
              fullWidth
              multiline
              rows={3}
              label={t('systemUsers.description')}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModalVisible(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={handleSubmit}>{t('common.confirm')}</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default SystemUsers;
