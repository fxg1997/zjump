import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Avatar,
  Button,
  Divider,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  Person as PersonIcon,
  Security as SecurityIcon,
  VpnKey as VpnKeyIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { authApi } from '../api/api';
import TwoFactorSettings from '../components/settings/TwoFactorSettings';
import SSHKeyManagement from '../components/SSHKeyManagement';
import PersonalInfoManagement from '../components/PersonalInfoManagement';

export default function Profile() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    loadUserInfo();
    
    // 检查是否需要设置2FA
    if (searchParams.get('setup2fa') === 'true') {
      setActiveTab(1); // 切换到Security标签页（包含2FA设置）
    }
  }, [searchParams]);

  const loadUserInfo = async () => {
    try {
      setLoading(true);
      const userInfo = await authApi.getCurrentUser();
      setUser(userInfo);
    } catch (error) {
      console.error('加载用户信息失败:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <PersonIcon sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
        <Box>
          <Typography variant="h4" component="h1" fontWeight="700">
            {t('menu.profile')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('profile.description')}
          </Typography>
        </Box>
      </Box>

      {/* 2FA设置提示 */}
      {searchParams.get('setup2fa') === 'true' && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <Typography variant="body2">
            <strong>重要提示：</strong>系统已启用全局2FA，您需要设置双因素认证才能正常使用系统。
            请点击下方的"双因素认证"标签页完成设置。
          </Typography>
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 3 }}>
        {/* 左侧用户信息卡片 */}
        <Card sx={{ minWidth: 300, height: 'fit-content' }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
              <Avatar
                sx={{ width: 80, height: 80, mr: 2, bgcolor: 'primary.main' }}
              >
                {user?.username?.charAt(0).toUpperCase()}
              </Avatar>
              <Box>
                <Typography variant="h6" fontWeight="600">
                  {user?.fullName || user?.username}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  @{user?.username}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {user?.email}
                </Typography>
              </Box>
            </Box>

            <Divider sx={{ my: 2 }} />

            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                {t('profile.role')}
              </Typography>
              <Typography variant="body2">
                {user?.role === 'admin' ? t('profile.admin') : t('profile.user')}
              </Typography>
            </Box>

            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                {t('profile.status')}
              </Typography>
              <Typography variant="body2" color={user?.status === 'active' ? 'success.main' : 'error.main'}>
                {user?.status === 'active' ? t('common.active') : t('common.inactive')}
              </Typography>
            </Box>

            {user?.lastLoginTime && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  {t('profile.lastLogin')}
                </Typography>
                <Typography variant="body2">
                  {new Date(user.lastLoginTime).toLocaleString()}
                </Typography>
              </Box>
            )}

            {/* 导航按钮 */}
            <Box sx={{ mt: 3 }}>
              <Button
                fullWidth
                variant={activeTab === 0 ? 'contained' : 'outlined'}
                startIcon={<PersonIcon />}
                onClick={() => setActiveTab(0)}
                sx={{ mb: 1 }}
              >
                {t('profile.personalInfo')}
              </Button>
              <Button
                fullWidth
                variant={activeTab === 1 ? 'contained' : 'outlined'}
                startIcon={<SecurityIcon />}
                onClick={() => setActiveTab(1)}
                sx={{ mb: 1 }}
              >
                {t('profile.security')}
              </Button>
              <Button
                fullWidth
                variant={activeTab === 2 ? 'contained' : 'outlined'}
                startIcon={<VpnKeyIcon />}
                onClick={() => setActiveTab(2)}
              >
                {t('profile.sshKeys')}
              </Button>
            </Box>
          </CardContent>
        </Card>

        {/* 右侧内容区域 */}
        <Box sx={{ flex: 1 }}>
          {activeTab === 0 && (
            <PersonalInfoManagement />
          )}

          {activeTab === 1 && (
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  {t('profile.security')}
                </Typography>
                <TwoFactorSettings />
              </CardContent>
            </Card>
          )}

          {activeTab === 2 && (
            <Card>
              <CardContent>
                <SSHKeyManagement />
              </CardContent>
            </Card>
          )}
        </Box>
      </Box>
    </Box>
  );
}