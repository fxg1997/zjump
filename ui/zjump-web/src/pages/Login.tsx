import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  Container,
  InputAdornment,
  IconButton,
  CircularProgress,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  Login as LoginIcon,
  VpnKey as VpnKeyIcon,
  Cloud as CloudIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api/api';
import { useSettings } from '../contexts/SettingsContext';
import { useTranslation } from 'react-i18next';

type AuthMethod = 'password' | 'ldap' | 'sso';

interface AuthMethods {
  password: boolean;
  ldap: boolean;
  sso: boolean;
  primary: AuthMethod;
}

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [authMethods, setAuthMethods] = useState<AuthMethods | null>(null);
  const [loadingAuthMethods, setLoadingAuthMethods] = useState(true);
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { t } = useTranslation();

  // 获取启用的认证方式
  useEffect(() => {
    const fetchAuthMethods = async () => {
      try {
        const methods = await authApi.getAuthMethods();
        setAuthMethods(methods);
      } catch (error) {
        console.error('Failed to fetch auth methods:', error);
        // 默认使用密码认证
        setAuthMethods({
          password: true,
          ldap: false,
          sso: false,
          primary: 'password',
        });
      } finally {
        setLoadingAuthMethods(false);
      }
    };

    fetchAuthMethods();
  }, []);

  // 处理 SSO 回调
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const ssoToken = urlParams.get('sso_token');
    const error = urlParams.get('error');
    const errorDescription = urlParams.get('error_description');

    if (ssoToken) {
      // SSO 登录成功，保存 token
      console.log(' SSO 登录成功，保存 token');
      localStorage.setItem('token', ssoToken);
      
      // 清理 URL 参数
      window.history.replaceState({}, document.title, '/');
      
      // 跳转到首页
      navigate('/');
    } else if (error) {
      // SSO 登录失败
      console.error(' SSO 登录失败:', error, errorDescription);
      const errorMsg = errorDescription 
        ? decodeURIComponent(errorDescription)
        : (error === 'missing_code' ? 'SSO 授权失败：缺少授权码' : 'SSO 登录失败');
      setError(errorMsg);
      setLoadingAuthMethods(false);
      
      // 清理 URL 参数
      window.history.replaceState({}, document.title, '/');
    }
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await authApi.login(username, password);
      localStorage.setItem('token', result.token);
      localStorage.setItem('user', JSON.stringify(result.user));
      navigate('/');
    } catch (err: any) {
      setError(err.message || t('login.loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleSSOLogin = async () => {
    try {
      setLoading(true);
      setError('');
      
      // 调用后端接口获取 SSO 授权 URL
      const result = await authApi.initiateSSO();
      
      // 保存 state 到 sessionStorage 用于后续验证
      sessionStorage.setItem('sso_state', result.state);
      
      // 跳转到 SSO 认证平台
      window.location.href = result.authUrl;
    } catch (err: any) {
      setError(err.response?.data?.message || t('login.loginFailed'));
      setLoading(false);
    }
  };

  // 获取认证方式标题和图标
  const getAuthMethodInfo = (method: AuthMethod) => {
    switch (method) {
      case 'ldap':
        return {
          title: t('login.ldapAuth'),
          icon: <VpnKeyIcon sx={{ fontSize: 28, color: '#5E6AD2' }} />,
          iconBg: '#EEF0FF',
          color: '#5E6AD2',
        };
      case 'sso':
        return {
          title: t('login.ssoAuth'),
          icon: <CloudIcon sx={{ fontSize: 28, color: '#E94A8B' }} />,
          iconBg: '#FFE8F0',
          color: '#E94A8B',
        };
      default:
        return {
          title: t('login.title'),
          icon: <LoginIcon sx={{ fontSize: 28, color: '#2D3748' }} />,
          iconBg: '#F7FAFC',
          color: '#2D3748',
        };
    }
  };

  // 如果正在加载认证方式，显示加载状态
  if (loadingAuthMethods) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          background: '#f5f7fa',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  const authMethodInfo = getAuthMethodInfo(authMethods?.primary || 'password');

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: settings?.loginBackground 
          ? `url(${settings.loginBackground}) center/cover no-repeat`
          : 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        '&::before': settings?.loginBackground ? {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(5px)',
        } : {},
      }}
    >
      <Container maxWidth="sm" sx={{ position: 'relative', zIndex: 1 }}>
        <Card
          elevation={0}
          sx={{
            borderRadius: 3,
            overflow: 'visible',
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.06)',
          }}
        >
          <CardContent sx={{ p: 5 }}>
            <Box textAlign="center" mb={4}>
              {/* 如果配置了登录Logo则显示图片，否则不显示图标 */}
              {settings?.loginLogo && (
                <Box
                  component="img"
                  src={settings.loginLogo}
                  alt="Logo"
                  sx={{
                    width: 'auto',
                    height: 56,
                    maxWidth: 200,
                    margin: '0 auto 20px',
                    display: 'block',
                    objectFit: 'contain',
                  }}
                  onError={(e: any) => {
                    // 图片加载失败时隐藏
                    e.target.style.display = 'none';
                  }}
                />
              )}
              <Typography 
                variant="h5" 
                component="h1" 
                fontWeight="600" 
                gutterBottom
                sx={{ color: '#1A202C', mb: 0.5, mt: settings?.loginLogo ? 0 : 2 }}
              >
                {settings?.siteName || 'ZJump'}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: '14px' }}>
                {authMethodInfo.title}
              </Typography>
            </Box>

            {error && (
              <Alert 
                severity="error" 
                sx={{ 
                  mb: 3,
                  borderRadius: 1.5,
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FCA5A5',
                  color: '#991B1B',
                  '& .MuiAlert-icon': {
                    color: '#DC2626',
                  },
                }}
              >
                {error}
              </Alert>
            )}

            {authMethods?.primary === 'sso' ? (
              // SSO 统一登录
              <Box>
                {/* SSO 说明卡片 */}
                <Box 
                  sx={{ 
                    mb: 3, 
                    p: 2.5,
                    borderRadius: 2,
                    backgroundColor: '#F8F9FF',
                    border: '1px solid #E8EBFF',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                    <CloudIcon sx={{ color: '#5E6AD2', fontSize: 24, mt: 0.2 }} />
                    <Box>
                      <Typography variant="body2" fontWeight="600" color="#2D3748" gutterBottom>
                        {t('login.ssoTitle') || '统一身份认证'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '13px', lineHeight: 1.6 }}>
                        {t('login.ssoLoginHint') || '点击下方按钮，将跳转到您的企业身份认证平台完成登录'}
                      </Typography>
                    </Box>
                  </Box>
                </Box>

                {/* SSO 登录按钮 */}
                <Button
                  fullWidth
                  variant="contained"
                  size="large"
                  onClick={handleSSOLogin}
                  disabled={loading}
                  startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <CloudIcon />}
                  sx={{
                    py: 1.8,
                    borderRadius: 1.5,
                    fontSize: '15px',
                    fontWeight: 600,
                    textTransform: 'none',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)',
                    '&:hover': {
                      background: 'linear-gradient(135deg, #764ba2 0%, #667eea 100%)',
                      boxShadow: '0 6px 16px rgba(102, 126, 234, 0.4)',
                      transform: 'translateY(-1px)',
                    },
                    '&:active': {
                      transform: 'translateY(0)',
                    },
                    '&:disabled': {
                      background: '#E2E8F0',
                      color: '#A0AEC0',
                      boxShadow: 'none',
                    },
                    transition: 'all 0.2s ease',
                  }}
                >
                  {loading ? t('common.loading') || '正在跳转...' : t('login.ssoLoginButton') || '使用企业账号登录'}
                </Button>
              </Box>
            ) : (
              // 账户密码 / LDAP 登录表单
              <form onSubmit={handleLogin}>
              <TextField
                fullWidth
                label={t('login.username')}
                variant="outlined"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                margin="normal"
                required
                autoFocus
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 1.5,
                    backgroundColor: '#F7FAFC',
                    transition: 'all 0.2s ease',
                    '& fieldset': {
                      borderColor: '#E2E8F0',
                      borderWidth: '1.5px',
                    },
                    '&:hover': {
                      backgroundColor: '#FFFFFF',
                      '& fieldset': {
                        borderColor: '#CBD5E0',
                      },
                    },
                    '&.Mui-focused': {
                      backgroundColor: '#FFFFFF',
                      boxShadow: authMethods?.primary === 'ldap'
                        ? '0 0 0 3px rgba(102, 126, 234, 0.1)'
                        : '0 0 0 3px rgba(45, 55, 72, 0.1)',
                      '& fieldset': {
                        borderColor: authMethods?.primary === 'ldap' ? '#667eea' : '#2D3748',
                        borderWidth: '1.5px',
                      },
                    },
                  },
                  '& .MuiInputLabel-root.Mui-focused': {
                    color: authMethods?.primary === 'ldap' ? '#667eea' : '#2D3748',
                    fontWeight: 500,
                  },
                }}
              />

              <TextField
                fullWidth
                label={t('login.password')}
                type={showPassword ? 'text' : 'password'}
                variant="outlined"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                margin="normal"
                required
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 1.5,
                    backgroundColor: '#F7FAFC',
                    transition: 'all 0.2s ease',
                    '& fieldset': {
                      borderColor: '#E2E8F0',
                      borderWidth: '1.5px',
                    },
                    '&:hover': {
                      backgroundColor: '#FFFFFF',
                      '& fieldset': {
                        borderColor: '#CBD5E0',
                      },
                    },
                    '&.Mui-focused': {
                      backgroundColor: '#FFFFFF',
                      boxShadow: authMethods?.primary === 'ldap'
                        ? '0 0 0 3px rgba(102, 126, 234, 0.1)'
                        : '0 0 0 3px rgba(45, 55, 72, 0.1)',
                      '& fieldset': {
                        borderColor: authMethods?.primary === 'ldap' ? '#667eea' : '#2D3748',
                        borderWidth: '1.5px',
                      },
                    },
                  },
                  '& .MuiInputLabel-root.Mui-focused': {
                    color: authMethods?.primary === 'ldap' ? '#667eea' : '#2D3748',
                    fontWeight: 500,
                  },
                }}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                        sx={{
                          color: '#718096',
                          '&:hover': {
                            color: '#2D3748',
                            backgroundColor: 'rgba(0,0,0,0.04)',
                          },
                        }}
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                disabled={loading}
                startIcon={loading ? <CircularProgress size={20} color="inherit" /> : (authMethods?.primary === 'ldap' ? <VpnKeyIcon /> : <LoginIcon />)}
                sx={{
                  mt: 3,
                  py: 1.8,
                  borderRadius: 1.5,
                  fontSize: '15px',
                  fontWeight: 600,
                  textTransform: 'none',
                  background: authMethods?.primary === 'ldap' 
                    ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                    : 'linear-gradient(135deg, #2D3748 0%, #4A5568 100%)',
                  boxShadow: authMethods?.primary === 'ldap'
                    ? '0 4px 12px rgba(102, 126, 234, 0.3)'
                    : '0 4px 12px rgba(45, 55, 72, 0.3)',
                  '&:hover': {
                    background: authMethods?.primary === 'ldap'
                      ? 'linear-gradient(135deg, #764ba2 0%, #667eea 100%)'
                      : 'linear-gradient(135deg, #4A5568 0%, #2D3748 100%)',
                    boxShadow: authMethods?.primary === 'ldap'
                      ? '0 6px 16px rgba(102, 126, 234, 0.4)'
                      : '0 6px 16px rgba(45, 55, 72, 0.4)',
                    transform: 'translateY(-1px)',
                  },
                  '&:active': {
                    transform: 'translateY(0)',
                  },
                  '&:disabled': {
                    background: '#E2E8F0',
                    color: '#A0AEC0',
                    boxShadow: 'none',
                  },
                  transition: 'all 0.2s ease',
                }}
              >
                {loading
                  ? t('common.loading') || '登录中...'
                  : authMethods?.primary === 'ldap'
                  ? t('login.ldapAuth') || 'LDAP登录'
                  : t('login.loginButton') || '登录'}
              </Button>
            </form>
            )}

            {authMethods?.primary === 'password' && (
              <Box 
                mt={4} 
                pt={3} 
                textAlign="center"
                sx={{ 
                  borderTop: '1px solid #F0F0F0',
                }}
              >
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '13px' }}>
                  {t('login.defaultAccount')}: <strong>admin</strong> / <strong>admin123</strong>
                </Typography>
              </Box>
            )}
            
            {authMethods?.primary === 'ldap' && (
              <Box 
                mt={4} 
                pt={3} 
                textAlign="center"
                sx={{ 
                  borderTop: '1px solid #F0F0F0',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                  <VpnKeyIcon sx={{ fontSize: 16, color: '#667eea' }} />
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '13px' }}>
                    {t('login.ldapLoginHint') || '使用您的LDAP域账号登录'}
                  </Typography>
                </Box>
              </Box>
            )}
          </CardContent>
        </Card>
        
        <Box mt={3} textAlign="center" sx={{ position: 'relative', zIndex: 1 }}>
          <Typography 
            variant="caption" 
            sx={{ 
              fontSize: '13px',
              color: 'rgba(0, 0, 0, 0.45)',
              fontWeight: 400,
            }}
          >
            {t('login.copyright')}
          </Typography>
        </Box>
      </Container>
    </Box>
  );
}

