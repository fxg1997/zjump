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
  Card,
  CardContent,
  Alert,
  Snackbar,
  OutlinedInput,
  Checkbox,
  ListItemText,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Security as SecurityIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import { PermissionRule, UserGroup, SystemUser } from '../types';
import api, { HostGroup } from '../api';
import { useTranslation } from 'react-i18next';

const PermissionRules: React.FC = () => {
  const { t } = useTranslation();
  const [rules, setRules] = useState<PermissionRule[]>([]);
  const [, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRule, setEditingRule] = useState<PermissionRule | null>(null);
  const [userGroups, setUserGroups] = useState<UserGroup[]>([]);
  const [systemUsers, setSystemUsers] = useState<SystemUser[]>([]);
  const [hostGroups, setHostGroups] = useState<HostGroup[]>([]);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' | 'warning' });
  
  const [formData, setFormData] = useState({
    name: '',
    userGroupId: '',
    systemUserIds: [] as string[], // 改为数组，支持多选
    hostGroupIds: [] as string[],  // 支持多选
    validFrom: '',
    validTo: '',
    enabled: true,
    priority: 0,
    description: '',
  });

  useEffect(() => {
    fetchRules();
    fetchUserGroups();
    fetchSystemUsers();
    fetchHostGroups();
  }, []);

  const fetchRules = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/permission-rules');
      // 后端返回格式：{ code: 200, message: 'Success', data: [...] }
      const data = response.data?.data || response.data;
      setRules(Array.isArray(data) ? data : []);
    } catch (error: any) {
      setSnackbar({ open: true, message: error.message || '获取授权规则列表失败', severity: 'error' });
      setRules([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserGroups = async () => {
    try {
      const response = await api.get('/api/user-groups');
      // 后端返回格式：{ code: 200, message: 'Success', data: [...] }
      const data = response.data?.data || response.data;
      setUserGroups(Array.isArray(data) ? data : []);
    } catch (error: any) {
      console.error('Failed to fetch user groups:', error);
      setUserGroups([]);
    }
  };

  const fetchSystemUsers = async () => {
    try {
      const response = await api.get('/api/system-users');
      // 后端返回格式：{ code: 200, message: 'Success', data: [...] }
      const data = response.data?.data || response.data;
      setSystemUsers(Array.isArray(data) ? data : []);
    } catch (error: any) {
      console.error('Failed to fetch system users:', error);
      setSystemUsers([]);
    }
  };

  const fetchHostGroups = async () => {
    try {
      // 添加 stats=true 参数以获取主机数量统计
      const response = await api.get('/api/host-groups?stats=true');
      // 后端返回格式：{ code: 200, message: 'Success', data: { groups: HostGroup[], total?: number } }
      // 或者直接返回 { groups: HostGroup[], total?: number }
      const responseData = response.data?.data || response.data;
      const groups = responseData?.groups || responseData || [];
      setHostGroups(Array.isArray(groups) ? groups : []);
    } catch (error: any) {
      console.error('Failed to fetch host groups:', error);
      setHostGroups([]);
    }
  };

  const handleAdd = () => {
    setEditingRule(null);
    setFormData({
      name: '',
      userGroupId: '',
      systemUserIds: [],
      hostGroupIds: [],
      validFrom: '',
      validTo: '',
      enabled: true,
      priority: 0,
      description: '',
    });
    setModalVisible(true);
  };

  const handleEdit = (record: any) => {
    setEditingRule(record);
    // 从后端返回的数据中读取 systemUserIds 和 hostGroupIds
    const systemUserIds = record.systemUserIds || (record.systemUserId ? [record.systemUserId] : []);
    const hostGroupIds = record.hostGroupIds || (record.hostGroupId ? [record.hostGroupId] : []);
    
    setFormData({
      name: record.name,
      userGroupId: record.userGroupId,
      systemUserIds: systemUserIds,
      hostGroupIds: hostGroupIds,
      validFrom: record.validFrom ? new Date(record.validFrom).toISOString().slice(0, 16) : '',
      validTo: record.validTo ? new Date(record.validTo).toISOString().slice(0, 16) : '',
      enabled: record.enabled,
      priority: 0, // 固定为 0，不使用优先级功能
      description: record.description || '',
    });
    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('permissionRules.deleteConfirm'))) return;
    
    try {
      await api.delete(`/api/permission-rules/${id}`);
      setSnackbar({ open: true, message: t('permissionRules.deleteSuccess'), severity: 'success' });
      fetchRules();
    } catch (error: any) {
      setSnackbar({ open: true, message: error.message || t('permissionRules.deleteFailed'), severity: 'error' });
    }
  };

  const handleSubmit = async () => {
    try {
      const submitData: any = { ...formData };
      
      // 验证：至少选择一个系统用户和一个主机组
      if (!submitData.systemUserIds || submitData.systemUserIds.length === 0) {
        setSnackbar({ open: true, message: '请至少选择一个系统用户', severity: 'warning' });
        return;
      }
      if (!submitData.hostGroupIds || submitData.hostGroupIds.length === 0) {
        setSnackbar({ open: true, message: '请至少选择一个主机组', severity: 'warning' });
        return;
      }
      
      // 处理时间
      if (submitData.validFrom) {
        submitData.validFrom = new Date(submitData.validFrom).toISOString();
      } else {
        delete submitData.validFrom;
      }
      if (submitData.validTo) {
        submitData.validTo = new Date(submitData.validTo).toISOString();
      } else {
        delete submitData.validTo;
      }
      
      // 新架构：直接发送 systemUserIds 和 hostGroupIds 数组给后端
      // 后端会通过 permission_rule_system_users 和 permission_rule_host_groups 表处理多对多关系
      
      if (editingRule) {
        await api.put(`/api/permission-rules/${editingRule.id}`, submitData);
        setSnackbar({ open: true, message: t('permissionRules.updateSuccess'), severity: 'success' });
      } else {
        await api.post('/api/permission-rules', submitData);
        setSnackbar({ open: true, message: t('permissionRules.createSuccess'), severity: 'success' });
      }
      
      setModalVisible(false);
      fetchRules();
    } catch (error: any) {
      setSnackbar({ open: true, message: error.message || t('common.error'), severity: 'error' });
    }
  };

  const isRuleValid = (rule: PermissionRule) => {
    const now = new Date();
    const from = rule.validFrom ? new Date(rule.validFrom) : null;
    const to = rule.validTo ? new Date(rule.validTo) : null;
    return (!from || from <= now) && (!to || to >= now);
  };

  const stats = {
    total: rules.length,
    enabled: rules.filter(r => r.enabled).length,
    valid: rules.filter(r => isRuleValid(r)).length,
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* 统计卡片 */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Card sx={{ flex: '1 1 0', minWidth: 200 }}>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>
              {t('permissionRules.total')}
            </Typography>
            <Typography variant="h4">
              <SecurityIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              {stats.total}
            </Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: '1 1 0', minWidth: 200 }}>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>
              {t('permissionRules.enabledCount')}
            </Typography>
            <Typography variant="h4" color="success.main">
              {stats.enabled}
            </Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: '1 1 0', minWidth: 200 }}>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>
              {t('permissionRules.validCount')}
            </Typography>
            <Typography variant="h4" color="primary.main">
              {stats.valid}
            </Typography>
          </CardContent>
        </Card>
      </Box>

      {/* 表格 */}
      <Paper sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6">{t('permissionRules.title')}</Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleAdd}>
            {t('permissionRules.addRule')}
          </Button>
        </Box>

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{t('permissionRules.name')}</TableCell>
                <TableCell>{t('permissionRules.userGroup')}</TableCell>
                <TableCell>{t('permissionRules.systemUser')}</TableCell>
                <TableCell>{t('permissionRules.hostGroup')}</TableCell>
                <TableCell>{t('permissionRules.validFrom')}</TableCell>
                <TableCell>{t('permissionRules.enabled')}</TableCell>
                <TableCell>{t('common.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <SecurityIcon />
                      {rule.name}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip label={rule.userGroupName} size="small" color="secondary" />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {rule.systemUserNames && rule.systemUserNames.length > 0 ? (
                        rule.systemUserNames.map((name: string, idx: number) => (
                          <Chip key={idx} label={name} size="small" color="success" />
                        ))
                      ) : (
                        rule.systemUserName && <Chip label={rule.systemUserName} size="small" color="success" />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {rule.hostGroupNames && rule.hostGroupNames.length > 0 ? (
                        rule.hostGroupNames.map((name: string, idx: number) => (
                          <Chip key={idx} label={name} size="small" color="info" />
                        ))
                      ) : rule.hostGroupName ? (
                        <Chip label={rule.hostGroupName} size="small" color="info" />
                      ) : (
                        <Chip label={t('permissionRules.allHosts')} size="small" />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box>
                      {!rule.validFrom && !rule.validTo ? (
                        <Chip label={t('permissionRules.permanent')} size="small" color="success" />
                      ) : (
                        <>
                          {isRuleValid(rule) ? (
                            <>
                              <Chip label={t('permissionRules.valid')} size="small" color="success" />
                              {rule.validTo && new Date(rule.validTo).getTime() - new Date().getTime() < 3 * 24 * 60 * 60 * 1000 && (
                                <Chip label={t('permissionRules.expired')} size="small" color="warning" sx={{ ml: 1 }} />
                              )}
                            </>
                          ) : (
                            <Chip label={t('permissionRules.expired')} size="small" color="error" />
                          )}
                          <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                            {rule.validFrom && `${new Date(rule.validFrom).toLocaleString()}`}
                          </Typography>
                          <Typography variant="caption" display="block">
                            {rule.validTo && `${new Date(rule.validTo).toLocaleString()}`}
                          </Typography>
                        </>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    {rule.enabled ? (
                      <Chip icon={<CheckCircleIcon />} label={t('permissionRules.enabled')} size="small" color="success" />
                    ) : (
                      <Chip icon={<CancelIcon />} label={t('permissionRules.disabled')} size="small" color="default" />
                    )}
                  </TableCell>
                  <TableCell>
                    <IconButton size="small" color="primary" onClick={() => handleEdit(rule)}>
                      <EditIcon />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={() => handleDelete(rule.id)}>
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
        <DialogTitle>{editingRule ? t('permissionRules.editRule') : t('permissionRules.addRule')}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 2 }}>
            {/* 规则名称 */}
            <TextField
              fullWidth
              label={t('permissionRules.name')}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />

            {/* 用户组和系统用户 */}
            <Box sx={{ display: 'flex', gap: 2 }}>
              <FormControl fullWidth required>
                <InputLabel>{t('permissionRules.userGroup')}</InputLabel>
                <Select
                  value={formData.userGroupId}
                  onChange={(e) => setFormData({ ...formData, userGroupId: e.target.value })}
                  label={t('permissionRules.userGroup')}
                >
                  {userGroups.map(g => (
                    <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth required>
                <InputLabel>{t('permissionRules.systemUser')}</InputLabel>
                <Select
                  multiple
                  value={formData.systemUserIds}
                  onChange={(e) => setFormData({ ...formData, systemUserIds: typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value })}
                  input={<OutlinedInput label={t('permissionRules.systemUser')} />}
                  renderValue={(selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {selected.map((value) => {
                        const user = systemUsers.find(u => u.id === value);
                        return <Chip key={value} label={user?.name || value} size="small" />;
                      })}
                    </Box>
                  )}
                >
                  {systemUsers.map((user) => (
                    <MenuItem key={user.id} value={user.id}>
                      <Checkbox checked={formData.systemUserIds.indexOf(user.id) > -1} />
                      <ListItemText primary={user.name} secondary={user.username} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            {/* 主机组 - 多选 */}
            <Box>
              <FormControl fullWidth>
                <InputLabel>{t('permissionRules.hostGroup')}</InputLabel>
                <Select
                  multiple
                  value={formData.hostGroupIds}
                  onChange={(e) => setFormData({ ...formData, hostGroupIds: typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value })}
                  input={<OutlinedInput label={t('permissionRules.hostGroup')} />}
                  renderValue={(selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {selected.length === 0 ? (
                        <em>{t('permissionRules.allHosts')}</em>
                      ) : (
                        selected.map((value) => {
                          const group = hostGroups.find(g => g.id === value);
                          return <Chip key={value} label={group?.name || value} size="small" />;
                        })
                      )}
                    </Box>
                  )}
                >
                  {hostGroups.map((group) => (
                    <MenuItem key={group.id} value={group.id}>
                      <Checkbox checked={formData.hostGroupIds.indexOf(group.id) > -1} />
                      <ListItemText primary={group.name} secondary={`${group.hostCount || 0} hosts`} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Typography variant="caption" color="textSecondary" sx={{ ml: 1.5, mt: 0.5, display: 'block' }}>
                {t('permissionRules.hostGroupHelper')}
              </Typography>
            </Box>

            {/* 有效期 */}
            <Box>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField
                  fullWidth
                  label={t('permissionRules.validFrom')}
                  type="datetime-local"
                  value={formData.validFrom}
                  onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  fullWidth
                  label={t('permissionRules.validTo')}
                  type="datetime-local"
                  value={formData.validTo}
                  onChange={(e) => setFormData({ ...formData, validTo: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
              </Box>
              <Typography variant="caption" color="textSecondary" sx={{ ml: 1.5, mt: 0.5, display: 'block' }}>
                {t('permissionRules.validityHelper')}
              </Typography>
            </Box>

            {/* 启用状态 */}
            <Box>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.enabled}
                    onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                  />
                }
                label={t('permissionRules.enabled')}
              />
            </Box>

            {/* 描述 */}
            <TextField
              fullWidth
              multiline
              rows={3}
              label={t('permissionRules.description')}
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

export default PermissionRules;
