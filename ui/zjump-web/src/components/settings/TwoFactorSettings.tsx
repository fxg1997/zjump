import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
  IconButton,
  Tooltip,
  CircularProgress,
  FormControlLabel,
  Switch,
} from '@mui/material';
import {
  Security as SecurityIcon,
  Download as DownloadIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import axiosInstance from '../../api/request';

interface TwoFactorStatus {
  enabled: boolean;
  verifiedAt?: string;
  backupCodes?: string[];
}

interface TwoFactorSetupResponse {
  qrCode: string;
  secret: string;
  backupCodes: string[];
}

interface User {
  role: string;
  username: string;
}

interface TwoFactorSettingsProps {
  showGlobalConfig?: boolean;
}

// 全局2FA配置组件
function GlobalTwoFactorConfig() {
  const [config, setConfig] = useState({
    enabled: false,
    issuer: 'ZJump',
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const response = await axiosInstance.get('/api/admin/two-factor/config');
      setConfig(response.data.data);
    } catch (error) {
      console.error('加载全局2FA配置失败:', error);
      setError('加载配置失败');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (enabled: boolean) => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const response = await axiosInstance.put('/api/admin/two-factor/config', {
        enabled,
        issuer: config.issuer,
      });

      setConfig(response.data.data);
      setSuccess(enabled ? '全局2FA已启用' : '全局2FA已禁用');
    } catch (error: any) {
      console.error('更新全局2FA配置失败:', error);
      setError(error.response?.data?.message || '更新配置失败');
    } finally {
      setSaving(false);
    }
  };

  const handleIssuerChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setConfig(prev => ({
      ...prev,
      issuer: event.target.value,
    }));
  };

  const handleSaveIssuer = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const response = await axiosInstance.put('/api/admin/two-factor/config', {
        enabled: config.enabled,
        issuer: config.issuer,
      });

      setConfig(response.data.data);
      setSuccess('发行者名称已更新');
    } catch (error: any) {
      console.error('更新发行者名称失败:', error);
      setError(error.response?.data?.message || '更新失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}

      <Box sx={{ mb: 3 }}>
        <FormControlLabel
          control={
            <Switch
              checked={config.enabled}
              onChange={(e) => handleToggle(e.target.checked)}
              disabled={saving}
              color="primary"
            />
          }
          label={
            <Box>
              <Typography variant="body1">
                启用全局2FA
              </Typography>
              <Typography variant="body2" color="textSecondary">
                {config.enabled 
                  ? '所有用户必须启用2FA才能登录' 
                  : '用户可以自由选择是否启用2FA'
                }
              </Typography>
            </Box>
          }
        />
      </Box>

      <Box sx={{ mb: 3 }}>
        <TextField
          label="发行者名称"
          value={config.issuer}
          onChange={handleIssuerChange}
          fullWidth
          variant="outlined"
          helperText="在2FA应用中显示的名称"
          disabled={saving}
        />
        <Button
          variant="outlined"
          onClick={handleSaveIssuer}
          disabled={saving}
          sx={{ mt: 1 }}
        >
          {saving ? '保存中...' : '保存发行者名称'}
        </Button>
      </Box>

      {config.enabled && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          <Typography variant="body2">
            <strong>注意：</strong>启用全局2FA后，所有用户都必须设置2FA才能登录。
            禁用全局2FA将自动清除所有用户的2FA设置。
          </Typography>
        </Alert>
      )}
    </Box>
  );
}

export default function TwoFactorSettings({ showGlobalConfig = false }: TwoFactorSettingsProps = {}) {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [userStatus, setUserStatus] = useState<TwoFactorStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [setupDialogOpen, setSetupDialogOpen] = useState(false);
  const [backupCodesDialogOpen, setBackupCodesDialogOpen] = useState(false);
  const [setupData, setSetupData] = useState<TwoFactorSetupResponse | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [qrCodeRefreshTime, setQrCodeRefreshTime] = useState<number | null>(null);
  const [timeUntilRefresh, setTimeUntilRefresh] = useState<number>(0);
  const [globalConfig, setGlobalConfig] = useState({ enabled: false });

  useEffect(() => {
    loadData();
  }, []);

  // 自动刷新二维码（每30秒）
  useEffect(() => {
    if (setupDialogOpen && qrCodeRefreshTime) {
      const interval = setInterval(() => {
        handleRefreshQRCode();
      }, 30000); // 30秒

      return () => clearInterval(interval);
    }
  }, [setupDialogOpen, qrCodeRefreshTime]);

  // 倒计时显示
  useEffect(() => {
    if (setupDialogOpen && qrCodeRefreshTime) {
      const updateCountdown = () => {
        const now = Date.now();
        const elapsed = now - qrCodeRefreshTime;
        const remaining = Math.max(0, 30000 - elapsed);
        setTimeUntilRefresh(Math.ceil(remaining / 1000));
      };

      updateCountdown();
      const interval = setInterval(updateCountdown, 1000);

      return () => clearInterval(interval);
    }
  }, [setupDialogOpen, qrCodeRefreshTime]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [userRes, statusRes, globalConfigRes] = await Promise.all([
        axiosInstance.get('/api/auth/me'),
        axiosInstance.get('/api/two-factor/status'),
        axiosInstance.get('/api/two-factor/global-status').catch(() => ({ data: { data: { enabled: false } } }))
      ]);
      console.log('用户角色:', userRes.data?.data?.role);
      
      // 使用正确的数据结构
      setUser(userRes.data.data);
      setUserStatus(statusRes.data.data);
      setGlobalConfig(globalConfigRes.data.data);
    } catch (error) {
      console.error('加载2FA数据失败:', error);
    } finally {
      setLoading(false);
    }
  };


  const handleSetupTwoFactor = async () => {
    try {
      setLoading(true);
      const response = await axiosInstance.post('/api/two-factor/setup');
      console.log('2FA设置响应:', response.data);
      console.log('二维码数据:', response.data.data);
      setSetupData(response.data.data);
      setSetupDialogOpen(true);
      setQrCodeRefreshTime(Date.now());
    } catch (error: any) {
      console.error('设置2FA失败:', error);
      const errorMessage = error.response?.data?.message || error.message;
      if (error.response?.status === 403) {
        alert('权限不足：只有管理员可以启用2FA');
      } else {
        alert(`设置2FA失败: ${errorMessage}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // 刷新二维码
  const handleRefreshQRCode = async () => {
    try {
      setLoading(true);
      const response = await axiosInstance.post('/api/two-factor/setup');
      console.log('刷新二维码响应:', response.data);
      console.log('新的二维码数据:', response.data.data);
      setSetupData(response.data.data);
      setQrCodeRefreshTime(Date.now());
      setVerificationCode(''); // 清空验证码
    } catch (error) {
      console.error('刷新二维码失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyTwoFactor = async () => {
    if (!setupData || !verificationCode) return;
    
    // 验证码格式检查
    if (!/^\d{6}$/.test(verificationCode)) {
      alert('验证码必须是6位数字');
      return;
    }

    // 时间同步检查
    const now = new Date();
    const timeOffset = Math.abs(now.getTime() - Date.now());
    if (timeOffset > 30000) { // 30秒
      console.warn('系统时间可能不同步，时间偏移:', timeOffset, 'ms');
    }

    // 检查认证状态
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    console.log('当前token:', token ? '存在' : '不存在');
    console.log('当前用户:', user);
    console.log('Token内容:', token ? token.substring(0, 20) + '...' : '无');
    
    // 解析JWT token来检查内容
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        console.log('Token payload:', payload);
        console.log('Token过期时间:', new Date(payload.exp * 1000));
        console.log('当前时间:', new Date());
        console.log('Token是否过期:', new Date() > new Date(payload.exp * 1000));
      } catch (e) {
        console.error('Token解析失败:', e);
      }
    }
    if (!token) {
      alert('请先登录');
      return;
    }

    try {
      setLoading(true);
      const response = await axiosInstance.post('/api/two-factor/verify', {
        secret: setupData.secret,
        code: verificationCode,
      });
      setBackupCodes(response.data.data.backupCodes || []);
      setBackupCodesDialogOpen(true);
      setSetupDialogOpen(false);
      loadData(); // 重新加载状态
    } catch (error: any) {
      console.error('验证2FA失败:', error);
      console.error('错误详情:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message
      });
      console.error('完整错误响应:', JSON.stringify(error.response?.data, null, 2));
      // 显示错误信息给用户
      const errorMessage = error.response?.data?.message || error.message;
      if (error.response?.status === 401) {
        alert('登录已过期，请重新登录');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      } else if (error.response?.status === 403) {
        alert('权限不足：只有管理员可以启用2FA');
      } else if (errorMessage === '验证码错误') {
        alert('验证码错误，请检查：\n1. 确保使用正确的身份验证器应用\n2. 确保系统时间正确\n3. 验证码必须在30秒内使用\n4. 重新扫描二维码获取新的密钥');
      } else {
        alert(`验证失败: ${errorMessage}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDisableTwoFactor = async () => {
    if (!confirm('确定要禁用2FA吗？这将降低账户安全性。')) return;

    try {
      setLoading(true);
      await axiosInstance.post('/api/two-factor/disable');
      loadData(); // 重新加载状态
    } catch (error: any) {
      console.error('禁用2FA失败:', error);
      const errorMessage = error.response?.data?.message || error.message;
      if (error.response?.status === 403) {
        alert('权限不足：只有管理员可以禁用2FA');
      } else {
        alert(`禁用2FA失败: ${errorMessage}`);
      }
    } finally {
      setLoading(false);
    }
  };


  const downloadBackupCodes = () => {
    if (!backupCodes || !backupCodes.length) return;

    const content = backupCodes.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'zjump-2fa-backup-codes.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading && !userStatus) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        {t('settings.twoFactor.title')}
      </Typography>
      <Typography variant="body2" color="textSecondary" paragraph>
        {t('settings.twoFactor.description')}
      </Typography>

      {/* 全局2FA配置（仅管理员且在系统设置中） */}
      {showGlobalConfig && user?.role === 'admin' && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Box display="flex" alignItems="center" mb={2}>
              <SecurityIcon sx={{ mr: 1 }} />
              <Typography variant="h6">
                {t('settings.twoFactor.globalConfig')}
              </Typography>
            </Box>
            <Alert severity="info" sx={{ mb: 2 }}>
              全局2FA配置控制所有用户的2FA设置。禁用全局2FA将强制所有用户禁用2FA。
            </Alert>
            <GlobalTwoFactorConfig />
          </CardContent>
        </Card>
      )}

      {/* 全局MFA强制提示 - 只在全局MFA开启且用户未设置MFA时显示 */}
      {globalConfig.enabled && !userStatus?.enabled && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <Typography variant="body2">
            <strong>重要提示：</strong>系统已启用全局2FA，您必须设置双因素认证才能正常使用系统。
            请立即设置2FA以避免登录问题。
          </Typography>
        </Alert>
      )}

      {/* 用户2FA状态 */}
      <Card>
        <CardContent>
          <Box display="flex" alignItems="center" mb={2}>
            <SecurityIcon sx={{ mr: 1 }} />
            <Typography variant="h6">
              {t('settings.twoFactor.userConfig')}
            </Typography>
          </Box>

          {userStatus?.enabled ? (
            <Box>
              <Alert severity="success" sx={{ mb: 2 }}>
                {t('settings.twoFactor.enabled')}
                {userStatus.verifiedAt && (
                  <Typography variant="caption" display="block">
                    {t('settings.twoFactor.verifiedAt')}: {new Date(userStatus.verifiedAt).toLocaleString()}
                  </Typography>
                )}
              </Alert>

              <Box display="flex" gap={2} mb={2}>
                {/* 管理员可以看到禁用按钮 */}
                {user?.role === 'admin' && (
                  <Button
                    variant="outlined"
                    color="error"
                    onClick={handleDisableTwoFactor}
                    disabled={loading}
                  >
                    {t('settings.twoFactor.disable')}
                  </Button>
                )}
              </Box>
            </Box>
          ) : (
            <Box>
              <Alert severity="info" sx={{ mb: 2 }}>
                {t('settings.twoFactor.notEnabled')}
              </Alert>
              <Button
                variant="contained"
                startIcon={<SecurityIcon />}
                onClick={handleSetupTwoFactor}
                disabled={loading}
              >
                {t('settings.twoFactor.enable')}
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* 2FA设置对话框 */}
      <Dialog open={setupDialogOpen} onClose={() => setSetupDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('settings.twoFactor.setupTitle')}</DialogTitle>
        <DialogContent>
          {setupData && (
            <Box>
              <Alert severity="info" sx={{ mb: 2 }}>
                {t('settings.twoFactor.setupInstructions')}
              </Alert>
              
              <Alert severity="warning" sx={{ mb: 2 }}>
                <Typography variant="body2" component="div">
                  <strong>如果二维码扫描失败，请按以下步骤手动设置：</strong>
                  <br />
                  1. 复制上面的密钥
                  <br />
                  2. 在身份验证器应用中添加新账户
                  <br />
                  3. 选择"手动输入密钥"
                  <br />
                  4. 输入账户名：admin@zjump.local
                  <br />
                  5. 粘贴密钥，选择TOTP，SHA1，6位数字，30秒周期
                  <br />
                  <br />
                  <strong>重要：</strong>确保身份验证器应用的设置完全匹配：
                  <br />
                  • 算法：SHA1（不是SHA256）
                  <br />
                  • 位数：6位
                  <br />
                  • 周期：30秒
                </Typography>
              </Alert>

              <Box textAlign="center" mb={2}>
                <img
                  src={setupData.qrCode}
                  alt="2FA QR Code"
                  style={{ maxWidth: '200px', height: 'auto' }}
                />
                <Box mt={1}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={handleRefreshQRCode}
                    disabled={loading}
                    startIcon={<RefreshIcon />}
                  >
                    刷新二维码
                  </Button>
                  {timeUntilRefresh > 0 && (
                    <Typography variant="caption" color="textSecondary" sx={{ ml: 1 }}>
                      {timeUntilRefresh}秒后自动刷新
                    </Typography>
                  )}
                </Box>
              </Box>

              <TextField
                fullWidth
                label={t('settings.twoFactor.secretKey')}
                value={setupData.secret}
                InputProps={{ 
                  readOnly: true,
                  endAdornment: (
                    <Button
                      size="small"
                      onClick={() => {
                        navigator.clipboard.writeText(setupData.secret);
                        alert('密钥已复制到剪贴板');
                      }}
                    >
                      复制
                    </Button>
                  )
                }}
                sx={{ mb: 2 }}
                helperText="如果二维码扫描失败，请手动复制此密钥到身份验证器应用中"
              />

              <TextField
                fullWidth
                label={t('settings.twoFactor.verificationCode')}
                value={verificationCode}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setVerificationCode(value);
                }}
                placeholder="000000"
                inputProps={{ maxLength: 6 }}
                sx={{ mb: 2 }}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSetupDialogOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleVerifyTwoFactor}
            variant="contained"
            disabled={!verificationCode || verificationCode.length !== 6}
          >
            {t('settings.twoFactor.verify')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 备用码对话框 */}
      <Dialog open={backupCodesDialogOpen} onClose={() => setBackupCodesDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('settings.twoFactor.backupCodesTitle')}</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            {t('settings.twoFactor.backupCodesWarning')}
          </Alert>

          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6">
              {t('settings.twoFactor.backupCodes')}
            </Typography>
            <Box>
              <Tooltip title={showBackupCodes ? t('common.hide') : t('common.show')}>
                <IconButton onClick={() => setShowBackupCodes(!showBackupCodes)}>
                  {showBackupCodes ? <VisibilityOffIcon /> : <VisibilityIcon />}
                </IconButton>
              </Tooltip>
              <Tooltip title={t('settings.twoFactor.download')}>
                <IconButton onClick={downloadBackupCodes}>
                  <DownloadIcon />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>

          <Box display="flex" flexWrap="wrap" gap={1}>
            {backupCodes && backupCodes.length > 0 ? backupCodes.map((code, index) => (
              <Box key={index} sx={{ minWidth: '120px', flex: '1 1 120px' }}>
                <Chip
                  label={showBackupCodes ? code : '••••••••'}
                  variant="outlined"
                  sx={{ width: '100%' }}
                />
              </Box>
            )) : (
              <Typography variant="body2" color="textSecondary">
                暂无备用码
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBackupCodesDialogOpen(false)} variant="contained">
            {t('common.close')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
