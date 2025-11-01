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
  Card,
  CardContent,
  Alert,
  Snackbar,
  Avatar,
  List,
  ListItemButton,
  ListItemText,
  Checkbox,
  Divider,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Group as GroupIcon,
  Person as PersonIcon,
  GroupAdd as GroupAddIcon,
} from '@mui/icons-material';
import { UserGroup, User } from '../types';
import api from '../api';
import { useTranslation } from 'react-i18next';

const UserGroups: React.FC = () => {
  const { t } = useTranslation();
  const [userGroups, setUserGroups] = useState<UserGroup[]>([]);
  const [, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [memberModalVisible, setMemberModalVisible] = useState(false);
  const [editingGroup, setEditingGroup] = useState<UserGroup | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<UserGroup | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#1890ff',
    priority: 0,
    status: 'active' as 'active' | 'inactive',
  });

  useEffect(() => {
    fetchUserGroups();
    fetchAllUsers();
  }, []);

  const fetchUserGroups = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/user-groups?withMembers=true');
      // 后端返回格式：{ code: 200, message: 'Success', data: [...] }
      const data = response.data?.data || response.data;
      setUserGroups(Array.isArray(data) ? data : []);
    } catch (error: any) {
      setSnackbar({ open: true, message: error.message || '获取用户组列表失败', severity: 'error' });
      setUserGroups([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllUsers = async () => {
    try {
      const response = await api.get('/api/users');
      // 后端返回格式：{ code: 200, message: 'Success', data: { users: [...], total: N } }
      const data = response.data?.data?.users || response.data?.data || response.data;
      setAllUsers(Array.isArray(data) ? data : []);
    } catch (error: any) {
      setSnackbar({ open: true, message: error.message || '获取用户列表失败', severity: 'error' });
      setAllUsers([]);
    }
  };

  const handleAdd = () => {
    setEditingGroup(null);
    setFormData({
      name: '',
      description: '',
      color: '#1890ff',
      priority: 0,
      status: 'active',
    });
    setModalVisible(true);
  };

  const handleEdit = (record: UserGroup) => {
    setEditingGroup(record);
    setFormData({
      name: record.name,
      description: record.description || '',
      color: record.color || '#1890ff',
      priority: record.priority,
      status: record.status,
    });
    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('userGroups.deleteConfirm'))) return;
    
    try {
      await api.delete(`/api/user-groups/${id}`);
      setSnackbar({ open: true, message: t('userGroups.deleteSuccess'), severity: 'success' });
      fetchUserGroups();
    } catch (error: any) {
      setSnackbar({ open: true, message: error.message || t('userGroups.deleteFailed'), severity: 'error' });
    }
  };

  const handleSubmit = async () => {
    try {
      if (editingGroup) {
        await api.put(`/api/user-groups/${editingGroup.id}`, formData);
        setSnackbar({ open: true, message: t('userGroups.updateSuccess'), severity: 'success' });
      } else {
        await api.post('/api/user-groups', formData);
        setSnackbar({ open: true, message: t('userGroups.createSuccess'), severity: 'success' });
      }
      
      setModalVisible(false);
      fetchUserGroups();
    } catch (error: any) {
      setSnackbar({ open: true, message: error.message || t('common.error'), severity: 'error' });
    }
  };

  const handleManageMembers = async (group: UserGroup) => {
    setSelectedGroup(group);
    
    try {
      const response = await api.get(`/api/user-groups/${group.id}?withMembers=true`);
      const groupDetail: UserGroup = response.data;
      setSelectedUserIds(groupDetail.members?.map(m => m.id) || []);
      setMemberModalVisible(true);
    } catch (error: any) {
      setSnackbar({ open: true, message: error.message || t('userGroups.memberUpdateFailed'), severity: 'error' });
    }
  };

  const handleToggleUser = (userId: string) => {
    setSelectedUserIds(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleMemberSubmit = async () => {
    if (!selectedGroup) return;

    try {
      await api.post(`/api/user-groups/${selectedGroup.id}/members/batch`, {
        userIds: selectedUserIds,
      });
      setSnackbar({ open: true, message: t('userGroups.memberUpdateSuccess'), severity: 'success' });
      setMemberModalVisible(false);
      fetchUserGroups();
    } catch (error: any) {
      setSnackbar({ open: true, message: error.message || t('userGroups.memberUpdateFailed'), severity: 'error' });
    }
  };

  const stats = {
    total: userGroups.length,
    active: userGroups.filter(g => g.status === 'active').length,
    totalMembers: userGroups.reduce((sum, g) => sum + (g.memberCount || 0), 0),
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* 统计卡片 */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Card sx={{ flex: '1 1 0', minWidth: 200 }}>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>
              {t('userGroups.total')}
            </Typography>
            <Typography variant="h4">
              <GroupIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              {stats.total}
            </Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: '1 1 0', minWidth: 200 }}>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>
              {t('userGroups.activeCount')}
            </Typography>
            <Typography variant="h4" color="success.main">
              {stats.active}
            </Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: '1 1 0', minWidth: 200 }}>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>
              {t('userGroups.totalMembers')}
            </Typography>
            <Typography variant="h4">
              <PersonIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              {stats.totalMembers}
            </Typography>
          </CardContent>
        </Card>
      </Box>

      {/* 表格 */}
      <Paper sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6">{t('userGroups.title')}</Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleAdd}>
            {t('userGroups.addGroup')}
          </Button>
        </Box>

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{t('userGroups.name')}</TableCell>
                <TableCell>{t('userGroups.memberCount')}</TableCell>
                <TableCell>{t('userGroups.description')}</TableCell>
                <TableCell>{t('userGroups.status')}</TableCell>
                <TableCell>{t('common.createdAt')}</TableCell>
                <TableCell>{t('common.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {userGroups.map((group) => (
                <TableRow key={group.id}>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Avatar sx={{ bgcolor: group.color || '#1890ff', width: 32, height: 32 }}>
                        <GroupIcon fontSize="small" />
                      </Avatar>
                      {group.name}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip
                      icon={<PersonIcon />}
                      label={`${group.memberCount || 0} 人`}
                      size="small"
                      color="info"
                    />
                  </TableCell>
                  <TableCell>{group.description}</TableCell>
                  <TableCell>
                    <Chip
                      label={group.status === 'active' ? t('userGroups.active') : t('userGroups.inactive')}
                      size="small"
                      color={group.status === 'active' ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell>{new Date(group.createdAt).toLocaleString()}</TableCell>
                  <TableCell>
                    <IconButton size="small" color="info" onClick={() => handleManageMembers(group)}>
                      <GroupAddIcon />
                    </IconButton>
                    <IconButton size="small" color="primary" onClick={() => handleEdit(group)}>
                      <EditIcon />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={() => handleDelete(group.id)}>
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
      <Dialog open={modalVisible} onClose={() => setModalVisible(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingGroup ? t('userGroups.editGroup') : t('userGroups.addGroup')}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 2 }}>
            {/* 用户组名称 */}
            <TextField
              fullWidth
              label={t('userGroups.name')}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />

            {/* 描述 */}
            <TextField
              fullWidth
              multiline
              rows={3}
              label={t('userGroups.description')}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />

            {/* 显示颜色 */}
            <TextField
              fullWidth
              type="color"
              label={t('userGroups.color')}
              value={formData.color}
              onChange={(e) => setFormData({ ...formData, color: e.target.value })}
            />

            {/* 状态 */}
            <FormControl fullWidth>
              <InputLabel>{t('userGroups.status')}</InputLabel>
              <Select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                label={t('userGroups.status')}
              >
                <MenuItem value="active">{t('userGroups.active')}</MenuItem>
                <MenuItem value="inactive">{t('userGroups.inactive')}</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModalVisible(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={handleSubmit}>{t('common.confirm')}</Button>
        </DialogActions>
      </Dialog>

      {/* 管理成员对话框 */}
      <Dialog open={memberModalVisible} onClose={() => setMemberModalVisible(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('userGroups.manageMembers')} - {selectedGroup?.name}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
            {t('userGroups.selectUsers')}
          </Typography>
          <List sx={{ bgcolor: 'background.paper', maxHeight: 400, overflow: 'auto' }}>
            {allUsers.map((user) => (
              <React.Fragment key={user.id}>
                <ListItemButton
                  onClick={() => handleToggleUser(user.id)}
                  dense
                >
                  <Checkbox
                    edge="start"
                    checked={selectedUserIds.includes(user.id)}
                    tabIndex={-1}
                    disableRipple
                  />
                  <ListItemText
                    primary={user.username}
                    secondary={user.fullName || user.email || ''}
                  />
                </ListItemButton>
                <Divider />
              </React.Fragment>
            ))}
          </List>
          {selectedGroup && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
              <Typography variant="caption" color="textSecondary">
                {t('userGroups.selectedCount', { count: selectedUserIds.length })}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMemberModalVisible(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={handleMemberSubmit}>{t('common.confirm')}</Button>
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

export default UserGroups;
