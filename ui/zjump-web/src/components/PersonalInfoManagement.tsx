import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Alert,
  Stack,
  Divider,
  Chip,
  CircularProgress,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { authApi } from '../api/api';

interface PersonalInfo {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: string;
  status: string;
  authMethod: string;
  lastLoginTime: string;
  lastLoginIp: string;
  createdAt: string;
  updatedAt: string;
}

export default function PersonalInfoManagement() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [userInfo, setUserInfo] = useState<PersonalInfo | null>(null);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadUserInfo();
  }, []);

  const loadUserInfo = async () => {
    try {
      setLoading(true);
      const user = await authApi.getCurrentUser();
      setUserInfo(user);
    } catch (error) {
      console.error('加载用户信息失败:', error);
      setError(t('profile.loadUserInfoFailed'));
    } finally {
      setLoading(false);
    }
  };



  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'success';
      case 'inactive':
        return 'error';
      default:
        return 'default';
    }
  };

  const getRoleText = (role: string) => {
    return role === 'admin' ? t('profile.admin') : t('profile.user');
  };

  const getAuthMethodText = (authMethod: string) => {
    switch (authMethod) {
      case 'password':
        return t('profile.passwordAuth');
      case 'publickey':
        return t('profile.publickeyAuth');
      case 'both':
        return t('profile.bothAuth');
      default:
        return authMethod;
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
        <CircularProgress />
      </Box>
    );
  }

  if (!userInfo) {
    return (
      <Alert severity="error">
        {t('profile.loadUserInfoFailed')}
      </Alert>
    );
  }

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        {t('profile.personalInfo')}
      </Typography>

      {success && (
        <Alert severity="success" sx={{ mb: 2 }} icon={<CheckCircleIcon />}>
          {t('profile.saveSuccess')}
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Stack spacing={3}>
        {/* 账户信息卡片 */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              {t('profile.accountInfo')}
            </Typography>
            <Stack spacing={2}>
              <Box display="flex" justifyContent="space-between">
                <Typography variant="subtitle2" color="text.secondary">
                  {t('profile.role')}
                </Typography>
                <Typography variant="body2">
                  {getRoleText(userInfo.role)}
                </Typography>
              </Box>
              <Box display="flex" justifyContent="space-between">
                <Typography variant="subtitle2" color="text.secondary">
                  {t('profile.status')}
                </Typography>
                <Chip 
                  label={userInfo.status === 'active' ? t('common.active') : t('common.inactive')}
                  color={getStatusColor(userInfo.status)}
                  size="small"
                />
              </Box>
              <Box display="flex" justifyContent="space-between">
                <Typography variant="subtitle2" color="text.secondary">
                  {t('profile.authMethod')}
                </Typography>
                <Typography variant="body2">
                  {getAuthMethodText(userInfo.authMethod)}
                </Typography>
              </Box>
              {userInfo.lastLoginTime && (
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="subtitle2" color="text.secondary">
                    {t('profile.lastLogin')}
                  </Typography>
                  <Typography variant="body2">
                    {new Date(userInfo.lastLoginTime).toLocaleString()}
                  </Typography>
                </Box>
              )}
              {userInfo.lastLoginIp && (
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="subtitle2" color="text.secondary">
                    {t('profile.lastLoginIp')}
                  </Typography>
                  <Typography variant="body2" fontFamily="monospace">
                    {userInfo.lastLoginIp}
                  </Typography>
                </Box>
              )}
            </Stack>
          </CardContent>
        </Card>

        {/* 账户创建信息 */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              {t('profile.accountDetails')}
            </Typography>
            <Stack spacing={2}>
              <Box display="flex" justifyContent="space-between">
                <Typography variant="subtitle2" color="text.secondary">
                  {t('profile.createdAt')}
                </Typography>
                <Typography variant="body2">
                  {new Date(userInfo.createdAt).toLocaleString()}
                </Typography>
              </Box>
              <Box display="flex" justifyContent="space-between">
                <Typography variant="subtitle2" color="text.secondary">
                  {t('profile.updatedAt')}
                </Typography>
                <Typography variant="body2">
                  {new Date(userInfo.updatedAt).toLocaleString()}
                </Typography>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      </Stack>

    </Box>
  );
}
