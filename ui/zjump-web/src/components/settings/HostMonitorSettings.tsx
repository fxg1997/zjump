import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Divider,
  Stack,
  FormControl,
  FormControlLabel,
  FormHelperText,
  Switch,
  Select,
  MenuItem,
  InputLabel,
  TextField,
  Alert,
  Paper,
  CircularProgress,
  Button,
} from '@mui/material';
import {
  MonitorHeart as MonitorIcon,
  CheckCircle as CheckIcon,
  Warning as WarningIcon,
  Save as SaveIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { settingsApi, showSuccessToast } from '../../api/api';

interface HostMonitorConfig {
  enabled: boolean;
  interval: number;
  method: string;
  timeout: number;
  concurrent: number;
}

export default function HostMonitorSettings() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<HostMonitorConfig>({
    enabled: true,
    interval: 5,
    method: 'tcp',
    timeout: 3,
    concurrent: 20,
  });

  // 从 settings API 加载配置
  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const data = await settingsApi.getSettingsByCategory('host_monitor');
      if (data) {
        setConfig({
          enabled: data.host_monitor_enabled === 'true',
          interval: parseInt(data.host_monitor_interval) || 5,
          method: data.host_monitor_method || 'tcp',
          timeout: parseInt(data.host_monitor_timeout) || 3,
          concurrent: parseInt(data.host_monitor_concurrent) || 20,
        });
      }
    } catch (error) {
      console.error('Failed to load host monitor config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: keyof HostMonitorConfig, value: any) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    try {
      const settings = {
        host_monitor: {
          host_monitor_enabled: config.enabled.toString(),
          host_monitor_interval: config.interval.toString(),
          host_monitor_method: config.method,
          host_monitor_timeout: config.timeout.toString(),
          host_monitor_concurrent: config.concurrent.toString(),
        }
      };

      await settingsApi.updateSettings(settings);
      showSuccessToast(t('settings.saveSuccess'));
    } catch (error) {
      console.error('Failed to save host monitor config:', error);
      alert(t('settings.saveError'));
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* 标题 */}
      <Stack direction="row" spacing={2} alignItems="center" mb={2}>
        <MonitorIcon color="primary" sx={{ fontSize: 28 }} />
        <Box>
          <Typography variant="h6">
            {t('settings.hostMonitorTitle')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('settings.hostMonitorDesc')}
          </Typography>
        </Box>
      </Stack>

      <Divider sx={{ mb: 3 }} />

      {/* 警告提示 */}
      <Alert severity="info" icon={<WarningIcon />} sx={{ mb: 3 }}>
        {t('settings.monitorMethodHelper')}
      </Alert>

      {/* 配置表单 */}
      <Paper elevation={0} sx={{ p: 3, bgcolor: 'background.default', mb: 3 }}>
        <Stack spacing={3}>
          {/* 启用开关 */}
          <FormControlLabel
            control={
              <Switch
                checked={config.enabled}
                onChange={(e) => handleChange('enabled', e.target.checked)}
                color="primary"
              />
            }
            label={
              <Box>
                <Typography variant="body1">
                  {t('settings.enableHostMonitor')}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t('settings.enableHostMonitorHelper')}
                </Typography>
              </Box>
            }
          />

          {/* 检测方式 */}
          <FormControl fullWidth disabled={!config.enabled}>
            <InputLabel>{t('settings.monitorMethod')}</InputLabel>
            <Select
              value={config.method}
              label={t('settings.monitorMethod')}
              onChange={(e) => handleChange('method', e.target.value)}
            >
              <MenuItem value="tcp">
                <Stack direction="row" spacing={1} alignItems="center">
                  <CheckIcon fontSize="small" color="primary" />
                  <Typography>{t('settings.monitorMethodTCP')}</Typography>
                </Stack>
              </MenuItem>
              <MenuItem value="icmp">
                <Stack direction="row" spacing={1} alignItems="center">
                  <CheckIcon fontSize="small" color="secondary" />
                  <Typography>{t('settings.monitorMethodICMP')}</Typography>
                </Stack>
              </MenuItem>
              <MenuItem value="http">
                <Stack direction="row" spacing={1} alignItems="center">
                  <CheckIcon fontSize="small" color="success" />
                  <Typography>{t('settings.monitorMethodHTTP')}</Typography>
                </Stack>
              </MenuItem>
            </Select>
            <FormHelperText>
              {config.method === 'tcp' && t('settings.monitorMethodTCPHelper')}
              {config.method === 'icmp' && t('settings.monitorMethodICMPHelper')}
              {config.method === 'http' && t('settings.monitorMethodHTTPHelper')}
            </FormHelperText>
          </FormControl>

          {/* 检测间隔 */}
          <TextField
            fullWidth
            type="number"
            label={t('settings.monitorInterval')}
            value={config.interval}
            onChange={(e) => handleChange('interval', parseInt(e.target.value))}
            disabled={!config.enabled}
            helperText={t('settings.monitorIntervalHelper')}
            InputProps={{
              inputProps: { min: 1, max: 60 }
            }}
          />

          {/* 超时时间 */}
          <TextField
            fullWidth
            type="number"
            label={t('settings.monitorTimeout')}
            value={config.timeout}
            onChange={(e) => handleChange('timeout', parseInt(e.target.value))}
            disabled={!config.enabled}
            helperText={t('settings.monitorTimeoutHelper')}
            InputProps={{
              inputProps: { min: 1, max: 30 }
            }}
          />

          {/* 最大并发数 */}
          <TextField
            fullWidth
            type="number"
            label={t('settings.monitorConcurrent')}
            value={config.concurrent}
            onChange={(e) => handleChange('concurrent', parseInt(e.target.value))}
            disabled={!config.enabled}
            helperText={t('settings.monitorConcurrentHelper')}
            InputProps={{
              inputProps: { min: 1, max: 100 }
            }}
          />
        </Stack>
      </Paper>

      {/* 当前配置摘要 */}
      {config.enabled && (
        <Alert severity="success" icon={<CheckIcon />}>
          <Typography variant="body2">
            {t('settings.monitorConfigSummary', {
              interval: config.interval,
              method: config.method === 'tcp' 
                ? t('settings.monitorMethodTCP')
                : config.method === 'icmp' 
                ? t('settings.monitorMethodICMP')
                : t('settings.monitorMethodHTTP'),
              timeout: config.timeout,
              concurrent: config.concurrent
            })}
          </Typography>
        </Alert>
      )}

      {!config.enabled && (
        <Alert severity="warning">
          <Typography variant="body2">
            {t('settings.monitorDisabledMessage')}
          </Typography>
        </Alert>
      )}

      {/* 保存按钮 */}
      <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="contained"
          size="large"
          startIcon={<SaveIcon />}
          onClick={handleSave}
        >
          {t('common.save')}
        </Button>
      </Box>
    </Box>
  );
}

