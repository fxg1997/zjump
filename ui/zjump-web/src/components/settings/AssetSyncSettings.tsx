import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Divider,
  Stack,
  Button,
  Chip,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  FormControlLabel,
  Switch,
  CircularProgress,
} from '@mui/material';
import {
  Sync as SyncIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  PlayArrow as PlayArrowIcon,
  Stop as StopIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { assetSyncApi, AssetSyncConfig } from '../../api/api';

export default function AssetSyncSettings() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncConfigs, setSyncConfigs] = useState<AssetSyncConfig[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<AssetSyncConfig | null>(null);
  const [formData, setFormData] = useState<Partial<AssetSyncConfig>>({
    name: '',
    type: 'prometheus',
    enabled: true,
    url: '',
    auth_type: 'none',
    username: '',
    password: '',
    token: '',
    sync_interval: 0, // 一次性同步，不再需要间隔
    config: '',
  });
  
  // Prometheus 配置
  const [promQuery, setPromQuery] = useState('up');

  // 加载配置列表
  const loadConfigs = async () => {
    setLoading(true);
    try {
      const data = await assetSyncApi.getConfigs();
      setSyncConfigs(data.configs || []);
    } catch (error) {
      console.error('Failed to load configs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfigs();
  }, []);

  // 打开创建/编辑对话框
  const handleOpenDialog = (config?: AssetSyncConfig) => {
    if (config) {
      setEditingConfig(config);
      setFormData({
        name: config.name,
        type: config.type,
        enabled: config.enabled,
        url: config.url,
        auth_type: config.auth_type,
        username: config.username,
        password: config.password,
        token: config.token,
        sync_interval: 0,
        config: config.config,
      });
      
      // 解析 Prometheus 配置
      if (config.type === 'prometheus' && config.config) {
        try {
          const promConfig = JSON.parse(config.config);
          setPromQuery(promConfig.query || 'up');
        } catch (e) {
          setPromQuery('up');
        }
      } else {
        setPromQuery('up');
      }
    } else {
      setEditingConfig(null);
      setFormData({
        name: '',
        type: 'prometheus',
        enabled: true,
        url: '',
        auth_type: 'none',
        username: '',
        password: '',
        token: '',
        sync_interval: 0,
        config: '',
      });
      setPromQuery('up');
    }
    setDialogOpen(true);
  };

  // 关闭对话框
  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingConfig(null);
  };

  // 提交表单
  const handleSubmit = async () => {
    try {
      // 构建 config JSON (Prometheus)
      let configData = { 
        ...formData,
        sync_interval: 0, // 确保是一次性同步
      };
      
      configData.config = JSON.stringify({
        query: promQuery,
      });
      
      if (editingConfig) {
        // 更新
        await assetSyncApi.updateConfig(editingConfig.id, configData);
        alert(t('settings.assetSync.messages.updateSuccess'));
      } else {
        // 创建
        await assetSyncApi.createConfig(configData as any);
        alert(t('settings.assetSync.messages.createSuccess'));
      }
      handleCloseDialog();
      loadConfigs();
    } catch (error) {
      console.error('Failed to save config:', error);
      alert(t('settings.assetSync.messages.saveFailed') + ': ' + (error as any).message);
    }
  };

  // 删除配置
  const handleDelete = async (configId: string) => {
    if (!confirm(t('settings.assetSync.deleteConfirm'))) return;
    
    try {
      await assetSyncApi.deleteConfig(configId);
      alert(t('settings.assetSync.messages.deleteSuccess'));
      loadConfigs();
    } catch (error) {
      console.error('Failed to delete config:', error);
      alert(t('settings.assetSync.messages.saveFailed'));
    }
  };

  // 启用/禁用
  const handleToggle = async (configId: string) => {
    try {
      await assetSyncApi.toggleConfig(configId);
      loadConfigs();
    } catch (error) {
      console.error('Failed to toggle config:', error);
      alert(t('settings.assetSync.messages.saveFailed'));
    }
  };

  // 立即同步
  const handleSync = async (configId: string) => {
    setSyncing(true);
    try {
      const result = await assetSyncApi.syncNow(configId);
      alert(result.message || t('settings.assetSync.messages.syncStarted'));
      // 等待一会儿后刷新状态
      setTimeout(() => loadConfigs(), 3000);
    } catch (error) {
      console.error('Failed to sync:', error);
      alert(t('settings.assetSync.messages.syncFailed'));
    } finally {
      setSyncing(false);
    }
  };

  const formatTime = (time?: string) => {
    if (!time) return '-';
    return new Date(time).toLocaleString();
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Stack spacing={4}>
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Box>
            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center' }}>
              <SyncIcon sx={{ mr: 1 }} /> {t('settings.assetSync.title')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {t('settings.assetSync.subtitle')}
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
          >
            {t('settings.assetSync.addConfig')}
          </Button>
        </Box>
        <Divider />
      </Box>

      {syncConfigs.length === 0 ? (
        <Alert severity="info">
          {t('settings.assetSync.noConfigs')}
        </Alert>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{t('settings.assetSync.table.name')}</TableCell>
                <TableCell>{t('settings.assetSync.table.type')}</TableCell>
                <TableCell>{t('settings.assetSync.table.url')}</TableCell>
                <TableCell>{t('settings.assetSync.table.lastSync')}</TableCell>
                <TableCell align="center">{t('settings.assetSync.table.status')}</TableCell>
                <TableCell align="center">{t('settings.assetSync.table.syncedCount')}</TableCell>
                <TableCell align="right">{t('settings.assetSync.table.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {syncConfigs.map((config) => (
                <TableRow key={config.id}>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {config.name}
                      {config.enabled ? (
                        <Chip label={t('common.enabled')} size="small" color="success" />
                      ) : (
                        <Chip label={t('common.disabled')} size="small" color="default" />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip label="Prometheus" size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {config.url}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {formatTime(config.last_sync_time)}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    {config.last_sync_status === 'success' ? (
                      <Chip
                        icon={<CheckCircleIcon />}
                        label={t('settings.assetSync.status.success')}
                        size="small"
                        color="success"
                      />
                    ) : config.last_sync_status === 'failed' ? (
                      <Chip
                        icon={<ErrorIcon />}
                        label={t('settings.assetSync.status.failed')}
                        size="small"
                        color="error"
                      />
                    ) : (
                      <Chip label={t('settings.assetSync.status.notSynced')} size="small" variant="outlined" />
                    )}
                  </TableCell>
                  <TableCell align="center">
                    {config.synced_count ? (
                      <Typography variant="body2">{config.synced_count} {t('common.total')}</Typography>
                    ) : (
                      <Typography variant="body2" color="text.disabled">0 {t('common.total')}</Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                      <Tooltip title={config.enabled ? t('settings.assetSync.actions.disable') : t('settings.assetSync.actions.enable')}>
                        <IconButton
                          size="small"
                          color={config.enabled ? "warning" : "success"}
                          onClick={() => handleToggle(config.id)}
                        >
                          {config.enabled ? <StopIcon /> : <PlayArrowIcon />}
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t('settings.assetSync.actions.syncNow')}>
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => handleSync(config.id)}
                          disabled={!config.enabled || syncing}
                        >
                          <SyncIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t('settings.assetSync.actions.edit')}>
                        <IconButton
                          size="small"
                          color="info"
                          onClick={() => handleOpenDialog(config)}
                        >
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t('settings.assetSync.actions.delete')}>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDelete(config.id)}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Alert severity="info" icon={<SyncIcon />}>
        <Typography variant="body2" fontWeight="bold" gutterBottom>
          {t('settings.assetSync.tips.title')}
        </Typography>
        <Typography variant="body2" component="div">
          • <strong>Prometheus</strong>: {t('settings.assetSync.tips.prometheus')}
        </Typography>
      </Alert>

      {/* 创建/编辑对话框 */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingConfig ? t('settings.assetSync.editConfig') : t('settings.assetSync.addConfig')}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <TextField
              fullWidth
              label={t('settings.assetSync.configName')}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />

            <FormControl fullWidth disabled>
              <InputLabel>{t('settings.assetSync.syncType')}</InputLabel>
              <Select
                value="prometheus"
                label={t('settings.assetSync.syncType')}
              >
                <MenuItem value="prometheus">Prometheus</MenuItem>
              </Select>
            </FormControl>

            <TextField
              fullWidth
              label={t('settings.assetSync.apiUrl')}
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              placeholder={t('settings.assetSync.apiUrlPlaceholder')}
              required
            />

            <TextField
              fullWidth
              label={t('settings.assetSync.promqlQuery')}
              value={promQuery}
              onChange={(e) => setPromQuery(e.target.value)}
              placeholder={t('settings.assetSync.promqlPlaceholder')}
              helperText={t('settings.assetSync.promqlHelper')}
              multiline
              rows={2}
            />

            <FormControl fullWidth>
              <InputLabel>{t('settings.assetSync.authType')}</InputLabel>
              <Select
                value={formData.auth_type}
                label={t('settings.assetSync.authType')}
                onChange={(e) => setFormData({ ...formData, auth_type: e.target.value as any })}
              >
                <MenuItem value="none">{t('settings.assetSync.authNone')}</MenuItem>
                <MenuItem value="basic">{t('settings.assetSync.authBasic')}</MenuItem>
                <MenuItem value="token">{t('settings.assetSync.authToken')}</MenuItem>
              </Select>
            </FormControl>

            {formData.auth_type === 'basic' && (
              <>
                <TextField
                  fullWidth
                  label={t('settings.assetSync.username')}
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                />
                <TextField
                  fullWidth
                  label={t('settings.assetSync.password')}
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
              </>
            )}

            {formData.auth_type === 'token' && (
              <TextField
                fullWidth
                label={t('settings.assetSync.token')}
                value={formData.token}
                onChange={(e) => setFormData({ ...formData, token: e.target.value })}
                multiline
                rows={2}
              />
            )}

            <FormControlLabel
              control={
                <Switch
                  checked={formData.enabled}
                  onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                />
              }
              label={t('settings.assetSync.enableConfig')}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!formData.name || !formData.url}
          >
            {editingConfig ? t('common.save') : t('common.create')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
