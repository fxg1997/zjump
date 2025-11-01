import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Alert,
  Chip,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Stack,
  Divider,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  VpnKey as VpnKeyIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  ContentCopy as CopyIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { userManagementApi, authApi } from '../api/api';

interface SSHKeyInfo {
  fingerprint: string;
  publicKey: string;
  generatedAt: string;
  authMethod: string;
}

export default function SSHKeyManagement() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sshKeyInfo, setSSHKeyInfo] = useState<SSHKeyInfo | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    type: 'regenerate' | 'delete';
    title: string;
    message: string;
  }>({
    open: false,
    type: 'regenerate',
    title: '',
    message: '',
  });

  // 获取当前用户信息
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    loadUserInfo();
  }, []);

  const loadUserInfo = async () => {
    try {
      setLoading(true);
      const userInfo = await authApi.getCurrentUser();
      setCurrentUser(userInfo);
      
      // 检查是否有SSH密钥信息
      if (userInfo.sshKeyFingerprint) {
        setSSHKeyInfo({
          fingerprint: userInfo.sshKeyFingerprint,
          publicKey: userInfo.sshPublicKey || '',
          generatedAt: userInfo.sshKeyGeneratedAt || '',
          authMethod: userInfo.authMethod || 'password',
        });
      }
    } catch (error) {
      console.error('加载用户信息失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateKey = async () => {
    if (!currentUser?.id) return;

    try {
      setGenerating(true);
      const result = await userManagementApi.generateSSHKey(currentUser.id);
      
      // 更新SSH密钥信息
      setSSHKeyInfo({
        fingerprint: result.fingerprint,
        publicKey: result.publicKey,
        generatedAt: result.generatedAt,
        authMethod: currentUser.authMethod || 'password',
      });

      // 显示下载确认对话框
      setConfirmDialog({
        open: true,
        type: 'regenerate',
        title: t('profile.confirmDownload'),
        message: t('profile.confirmDownload'),
      });
    } catch (error) {
      console.error('生成SSH密钥失败:', error);
      alert(t('profile.downloadFailed'));
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadPrivateKey = async () => {
    if (!currentUser?.id) return;

    try {
      const blob = await userManagementApi.downloadSSHPrivateKey(currentUser.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zjump_${currentUser.username}_private_key`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      setConfirmDialog({ open: false, type: 'regenerate', title: '', message: '' });
      alert(t('profile.downloadSuccess'));
    } catch (error) {
      console.error('下载私钥失败:', error);
      alert(t('profile.downloadFailed'));
    }
  };

  const handleRegenerateKey = () => {
    setConfirmDialog({
      open: true,
      type: 'regenerate',
      title: t('profile.confirmRegenerate'),
      message: t('profile.confirmRegenerate'),
    });
  };

  const handleDeleteKey = () => {
    setConfirmDialog({
      open: true,
      type: 'delete',
      title: t('profile.confirmDelete'),
      message: t('profile.confirmDelete'),
    });
  };

  const handleConfirmAction = async () => {
    if (!currentUser?.id) return;

    try {
      if (confirmDialog.type === 'regenerate') {
        await handleGenerateKey();
      } else if (confirmDialog.type === 'delete') {
        await userManagementApi.deleteSSHKey(currentUser.id);
        setSSHKeyInfo(null);
        alert(t('profile.keyDeleted'));
      }
    } catch (error) {
      console.error('操作失败:', error);
      alert(t('profile.downloadFailed'));
    } finally {
      setConfirmDialog({ open: false, type: 'regenerate', title: '', message: '' });
    }
  };

  const handleCopyPublicKey = async () => {
    if (sshKeyInfo?.publicKey) {
      try {
        await navigator.clipboard.writeText(sshKeyInfo.publicKey);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } catch (error) {
        console.error('复制失败:', error);
      }
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        {t('profile.sshKeyManagement')}
      </Typography>

      {!sshKeyInfo ? (
        <Card>
          <CardContent>
            <Box textAlign="center" py={4}>
              <VpnKeyIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h6" gutterBottom>
                {t('profile.noKeyMessage')}
              </Typography>
              <Button
                variant="contained"
                startIcon={<VpnKeyIcon />}
                onClick={handleGenerateKey}
                disabled={generating}
                size="large"
              >
                {generating ? t('profile.generating') : t('profile.generateKey')}
              </Button>
            </Box>
          </CardContent>
        </Card>
      ) : (
        <Stack spacing={3}>
          {/* SSH密钥状态卡片 */}
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                <Box display="flex" alignItems="center">
                  <CheckCircleIcon color="success" sx={{ mr: 1 }} />
                  <Typography variant="h6">
                    {t('profile.configured')}
                  </Typography>
                </Box>
                <Chip 
                  label={t(`profile.${sshKeyInfo.authMethod}Auth`)} 
                  color="primary" 
                  size="small" 
                />
              </Box>

              <Stack spacing={2}>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    {t('profile.fingerprint')}
                  </Typography>
                  <Typography variant="body2" fontFamily="monospace">
                    {sshKeyInfo.fingerprint}
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    {t('profile.generatedTime')}
                  </Typography>
                  <Typography variant="body2">
                    {new Date(sshKeyInfo.generatedAt).toLocaleString()}
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    {t('profile.publicKey')}
                  </Typography>
                  <Box display="flex" alignItems="center" gap={1}>
                    <TextField
                      value={sshKeyInfo.publicKey}
                      multiline
                      rows={3}
                      variant="outlined"
                      size="small"
                      fullWidth
                      InputProps={{ readOnly: true }}
                      sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
                    />
                    <Tooltip title={copySuccess ? t('profile.publicKeyCopied') : t('profile.copyPublicKey')}>
                      <IconButton onClick={handleCopyPublicKey} color="primary">
                        {copySuccess ? <CheckCircleIcon /> : <CopyIcon />}
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
              </Stack>

              <Divider sx={{ my: 2 }} />

              <Stack direction="row" spacing={2}>
                <Button
                  variant="outlined"
                  startIcon={<DownloadIcon />}
                  onClick={handleDownloadPrivateKey}
                >
                  {t('profile.downloadPrivateKey')}
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<RefreshIcon />}
                  onClick={handleRegenerateKey}
                >
                  {t('profile.regenerate')}
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteIcon />}
                  onClick={handleDeleteKey}
                >
                  {t('profile.deleteKey')}
                </Button>
              </Stack>
            </CardContent>
          </Card>

          {/* 使用说明 */}
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                {t('profile.howToUse')}
              </Typography>
              <Stack spacing={1}>
                <Typography variant="body2">{t('profile.step1')}</Typography>
                <Typography variant="body2">{t('profile.step2')}</Typography>
                <Typography variant="body2">{t('profile.step3')}</Typography>
                <Typography variant="body2">{t('profile.step4')}</Typography>
                <Typography variant="body2">{t('profile.step5')}</Typography>
              </Stack>
            </CardContent>
          </Card>

          {/* 安全提示 */}
          <Alert severity="info">
            <Typography variant="subtitle2" gutterBottom>
              {t('profile.importantTips')}
            </Typography>
            <Stack spacing={0.5}>
              <Typography variant="body2">{t('profile.tip1')}</Typography>
              <Typography variant="body2">{t('profile.tip2')}</Typography>
              <Typography variant="body2">{t('profile.tip3')}</Typography>
            </Stack>
          </Alert>
        </Stack>
      )}

      {/* 确认对话框 */}
      <Dialog open={confirmDialog.open} onClose={() => setConfirmDialog({ open: false, type: 'regenerate', title: '', message: '' })}>
        <DialogTitle>{confirmDialog.title}</DialogTitle>
        <DialogContent>
          <Typography>{confirmDialog.message}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog({ open: false, type: 'regenerate', title: '', message: '' })}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleConfirmAction} color="primary" variant="contained">
            {t('common.confirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
