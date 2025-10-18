import { useState, useEffect } from 'react';
import {
  Container,
  Paper,
  Typography,
  Box,
  Button,
  Alert,
  Divider,
  IconButton,
  Chip,
  Stack,
  CircularProgress,
} from '@mui/material';
import {
  Key as KeyIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  ContentCopy as ContentCopyIcon,
  Person as PersonIcon,
} from '@mui/icons-material';
import { userManagementApi } from '../api/api';
import { useTranslation } from 'react-i18next';

export default function Profile() {
  const { t } = useTranslation();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [hasKey, setHasKey] = useState(false);
  const [publicKey, setPublicKey] = useState('');
  const [fingerprint, setFingerprint] = useState('');
  const [generatedAt, setGeneratedAt] = useState('');
  const [authMethod, setAuthMethod] = useState<'password' | 'publickey'>('password');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadUserProfile();
  }, []);

  const loadUserProfile = async () => {
    try {
      const userData = JSON.parse(localStorage.getItem('user') || '{}');
      setUser(userData);
      setHasKey(!!userData.sshPublicKey);
      setPublicKey(userData.sshPublicKey || '');
      setFingerprint(userData.sshKeyFingerprint || '');
      setGeneratedAt(userData.sshKeyGeneratedAt || '');
      setAuthMethod(userData.authMethod || 'password');
    } catch (error) {
      console.error('Failed to load user profile:', error);
      showError(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateKey = async () => {
    if (hasKey) {
      if (!window.confirm(t('profile.confirmRegenerate'))) {
        return;
      }
    }

    setActionLoading(true);
    try {
      const response = await userManagementApi.generateSSHKey(user.id);
      showSuccess(t('profile.keyGenerated'));
      setPublicKey(response.publicKey);
      setFingerprint(response.fingerprint);
      setGeneratedAt(response.generatedAt);
      setHasKey(true);

      // 提示下载私钥
      if (window.confirm(t('profile.confirmDownload'))) {
        await handleDownloadKey();
      }

      // 更新本地存储的用户信息
      const updatedUser = { ...user, sshPublicKey: response.publicKey, sshKeyFingerprint: response.fingerprint, sshKeyGeneratedAt: response.generatedAt };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setUser(updatedUser);
    } catch (err: any) {
      console.error('生成密钥失败:', err);
      showError(err.response?.data?.message || t('common.error'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownloadKey = async () => {
    try {
      const blob = await userManagementApi.downloadSSHPrivateKey(user.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${user.username}_zjump_ssh_key`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      showSuccess(t('profile.downloadSuccess'));
    } catch (err: any) {
      console.error('下载失败:', err);
      showError(err.message || t('profile.downloadFailed'));
    }
  };

  const handleDeleteKey = async () => {
    if (!window.confirm(t('profile.confirmDelete'))) {
      return;
    }

    setActionLoading(true);
    try {
      await userManagementApi.deleteSSHKey(user.id);
      showSuccess(t('profile.keyDeleted'));
      setHasKey(false);
      setPublicKey('');
      setFingerprint('');
      setGeneratedAt('');

      // 更新本地存储的用户信息
      const updatedUser = { ...user, sshPublicKey: '', sshKeyFingerprint: '', sshKeyGeneratedAt: null };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setUser(updatedUser);
    } catch (err: any) {
      showError(err.response?.data?.message || t('common.error'));
    } finally {
      setActionLoading(false);
    }
  };


  const handleCopyPublicKey = () => {
    navigator.clipboard.writeText(publicKey);
    showSuccess(t('profile.publicKeyCopied'));
  };

  const showSuccess = (message: string) => {
    // 简单的成功提示（可以替换为更好的Toast组件）
    alert(' ' + message);
  };

  const showError = (message: string) => {
    // 简单的错误提示（可以替换为更好的Toast组件）
    alert(' ' + message);
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
          <PersonIcon fontSize="large" />
          {t('menu.profile')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('profile.subtitle')}
        </Typography>
      </Box>

      {/* 用户信息 */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
          {t('profile.basicInfo')}
        </Typography>
        <Divider sx={{ mb: 2 }} />
        <Box sx={{ display: 'grid', gap: 2 }}>
          <Box>
            <Typography variant="body2" color="text.secondary">{t('profile.username')}</Typography>
            <Typography variant="body1" sx={{ fontWeight: 500 }}>{user?.username}</Typography>
          </Box>
          <Box>
            <Typography variant="body2" color="text.secondary">{t('profile.role')}</Typography>
            <Chip 
              label={user?.role === 'admin' ? t('profile.admin') : t('profile.user')} 
              size="small" 
              color={user?.role === 'admin' ? 'primary' : 'default'}
            />
          </Box>
          <Box>
            <Typography variant="body2" color="text.secondary">{t('profile.authMethod')}</Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 0.5 }}>
              <Chip 
                label={
                  authMethod === 'password' ? t('profile.passwordAuth') :
                  authMethod === 'publickey' ? t('profile.publickeyAuth') :
                  t('profile.bothAuth')
                } 
                size="small" 
                color="primary"
                variant="outlined"
              />
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              {t('profile.authMethodNote')}
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* SSH密钥管理 */}
      <Paper sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
            <KeyIcon />
            {t('profile.sshKeyManagement')}
          </Typography>
          {hasKey && (
            <Chip label={t('profile.configured')} color="success" size="small" />
          )}
        </Box>
        <Divider sx={{ mb: 2 }} />

        {!hasKey ? (
          <Alert severity="info" sx={{ mb: 2 }}>
            {t('profile.noKeyMessage')}
          </Alert>
        ) : (
          <Alert severity="success" sx={{ mb: 2 }}>
            {t('profile.keyConfiguredMessage')}
            <Box sx={{ mt: 1, p: 1, bgcolor: 'rgba(0,0,0,0.05)', borderRadius: 1, fontFamily: 'monospace', fontSize: '0.9rem' }}>
              ssh -i /path/to/{user?.username}_zjump_ssh_key {user?.username}@your-server -p 2222
            </Box>
          </Alert>
        )}

        <Stack spacing={2}>
          {/* 密钥信息 */}
          {hasKey && (
            <>
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {t('profile.fingerprint')}
                </Typography>
                <Box sx={{ 
                  p: 1.5, 
                  bgcolor: 'background.default', 
                  borderRadius: 1, 
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                  wordBreak: 'break-all'
                }}>
                  {fingerprint}
                </Box>
              </Box>

              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                  <Typography variant="body2" color="text.secondary">
                    {t('profile.publicKey')}
                  </Typography>
                  <IconButton size="small" onClick={handleCopyPublicKey} title={t('profile.copyPublicKey')}>
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Box>
                <Box sx={{ 
                  p: 1.5, 
                  bgcolor: 'background.default', 
                  borderRadius: 1, 
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  wordBreak: 'break-all',
                  maxHeight: 100,
                  overflow: 'auto'
                }}>
                  {publicKey}
                </Box>
              </Box>

              <Box>
                <Typography variant="body2" color="text.secondary">
                  {t('profile.generatedTime')}
                </Typography>
                <Typography variant="body1">
                  {generatedAt ? new Date(generatedAt).toLocaleString() : '-'}
                </Typography>
              </Box>
            </>
          )}

          {/* 操作按钮 */}
          <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
            {!hasKey ? (
              <Button
                variant="contained"
                startIcon={<RefreshIcon />}
                onClick={handleGenerateKey}
                disabled={actionLoading}
              >
                {actionLoading ? t('profile.generating') : t('profile.generateKey')}
              </Button>
            ) : (
              <>
                <Button
                  variant="outlined"
                  startIcon={<DownloadIcon />}
                  onClick={handleDownloadKey}
                  disabled={actionLoading}
                >
                  {t('profile.downloadPrivateKey')}
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<RefreshIcon />}
                  onClick={handleGenerateKey}
                  disabled={actionLoading}
                >
                  {t('profile.regenerate')}
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteIcon />}
                  onClick={handleDeleteKey}
                  disabled={actionLoading}
                >
                  {t('profile.deleteKey')}
                </Button>
              </>
            )}
          </Box>

          <Alert severity="warning" sx={{ mt: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>{t('profile.securityTips')}</Typography>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li>{t('profile.tip1')}</li>
              <li>{t('profile.tip2')}</li>
              <li>{t('profile.tip3')}</li>
              <li>{t('profile.tip4')}</li>
            </ul>
          </Alert>
        </Stack>
      </Paper>
    </Container>
  );
}

