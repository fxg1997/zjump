import {
  Box,
  Typography,
  TextField,
  Switch,
  FormControlLabel,
  FormGroup,
  Divider,
  Paper,
  Alert,
  Radio,
  RadioGroup,
  FormControl,
  FormLabel,
} from '@mui/material';
import {
  VpnKey as VpnKeyIcon,
  Security as SecurityIcon,
  Cloud as CloudIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

interface AuthConfig {
  // 认证方式：'password', 'sso', 'ldap'
  authMethod: string;
  
  // 账号密码登录配置
  passwordLogin: {
    enabled: boolean;
    passwordMinLength: number;
    passwordComplexity: boolean;
    sessionTimeout: number;
  };
  
  // SSO配置
  sso: {
    enabled: boolean;
    provider: string;
    clientId: string;
    clientSecret: string;
    authUrl: string;
    tokenUrl: string;
    userInfoUrl: string;
    redirectUrl: string;
    scopes: string;
  };
  
  // LDAP配置
  ldap: {
    enabled: boolean;
    server: string;
    port: number;
    bindDn: string;
    bindPassword: string;
    baseDn: string;
    userFilter: string;
    useTLS: boolean;
  };
}

interface Props {
  config: AuthConfig;
  onChange: (config: AuthConfig) => void;
}

export default function AuthSettings({ config, onChange }: Props) {
  const { t } = useTranslation();

  const handleAuthMethodChange = (method: string) => {
    // 切换认证方式时，禁用其他方式
    onChange({
      ...config,
      authMethod: method,
      passwordLogin: {
        ...config.passwordLogin,
        enabled: method === 'password',
      },
      sso: {
        ...config.sso,
        enabled: method === 'sso',
      },
      ldap: {
        ...config.ldap,
        enabled: method === 'ldap',
      },
    });
  };

  const updatePasswordConfig = (field: string, value: any) => {
    onChange({
      ...config,
      passwordLogin: {
        ...config.passwordLogin,
        [field]: value,
      },
    });
  };

  const updateSsoConfig = (field: string, value: any) => {
    onChange({
      ...config,
      sso: {
        ...config.sso,
        [field]: value,
      },
    });
  };

  const updateLdapConfig = (field: string, value: any) => {
    onChange({
      ...config,
      ldap: {
        ...config.ldap,
        [field]: value,
      },
    });
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom fontWeight="600">
        {t('settings.authConfig')}
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        {t('settings.authConfigDesc')}
      </Typography>

      <Alert severity="warning" sx={{ mb: 3 }}>
        {t('settings.authWarning')}
      </Alert>

      {/* 认证方式选择 */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <FormControl component="fieldset">
          <FormLabel component="legend" sx={{ fontWeight: 600, color: 'text.primary', mb: 2 }}>
            {t('settings.selectAuthMethod')}
          </FormLabel>
          <RadioGroup
            value={config.authMethod}
            onChange={(e) => handleAuthMethodChange(e.target.value)}
          >
            <FormControlLabel 
              value="password" 
              control={<Radio />} 
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <VpnKeyIcon fontSize="small" />
                  <Typography>{t('settings.passwordAuthTitle')}</Typography>
                </Box>
              }
            />
            <FormControlLabel 
              value="sso" 
              control={<Radio />} 
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <SecurityIcon fontSize="small" />
                  <Typography>{t('settings.ssoAuthTitle')}</Typography>
                </Box>
              }
            />
            <FormControlLabel 
              value="ldap" 
              control={<Radio />} 
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CloudIcon fontSize="small" />
                  <Typography>{t('settings.ldapAuthTitle')}</Typography>
                </Box>
              }
            />
          </RadioGroup>
        </FormControl>
      </Paper>

      {/* 账号密码登录配置 */}
      {config.authMethod === 'password' && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <VpnKeyIcon color="primary" />
            <Typography variant="h6" fontWeight="600">
              {t('settings.passwordAuthConfig')}
            </Typography>
          </Box>
          
          <Divider sx={{ mb: 3 }} />
          
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <TextField
              fullWidth
              label={t('settings.minPasswordLengthLabel')}
              type="number"
              value={config.passwordLogin.passwordMinLength}
              onChange={(e) => updatePasswordConfig('passwordMinLength', parseInt(e.target.value))}
              helperText={t('settings.minPasswordLengthHelper')}
            />
            
            <TextField
              fullWidth
              label={t('settings.sessionTimeoutLabel')}
              type="number"
              value={config.passwordLogin.sessionTimeout}
              onChange={(e) => updatePasswordConfig('sessionTimeout', parseInt(e.target.value))}
              helperText={t('settings.sessionTimeoutHelperText')}
            />
            
            <FormGroup>
              <FormControlLabel
                control={
                  <Switch
                    checked={config.passwordLogin.passwordComplexity}
                    onChange={(e) => updatePasswordConfig('passwordComplexity', e.target.checked)}
                  />
                }
                label={t('settings.passwordComplexityLabel')}
              />
            </FormGroup>
          </Box>
        </Paper>
      )}

      {/* SSO配置 */}
      {config.authMethod === 'sso' && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <SecurityIcon color="primary" />
            <Typography variant="h6" fontWeight="600">
              {t('settings.ssoAuthConfig')}
            </Typography>
          </Box>
          
          <Divider sx={{ mb: 3 }} />
          
          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="body2" sx={{ mb: 1 }}>
              <strong>{t('settings.ssoExampleTitle')}</strong>
            </Typography>
            <Typography variant="body2" component="div" sx={{ fontFamily: 'monospace', fontSize: '0.85rem', lineHeight: 1.6 }}>
              {t('settings.ssoExampleProvider')}<br/>
              {t('settings.ssoExampleAuthUrl')}<br/>
              {t('settings.ssoExampleTokenUrl')}<br/>
              {t('settings.ssoExampleUserInfoUrl')}<br/>
              {t('settings.ssoExampleScopes')}
            </Typography>
            <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>
              {t('settings.ssoExampleNote')}
            </Typography>
          </Alert>
          
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <TextField
              fullWidth
              label={t('settings.providerLabel')}
              value={config.sso.provider}
              onChange={(e) => updateSsoConfig('provider', e.target.value)}
              helperText={t('settings.providerHelper')}
            />
            
            <TextField
              fullWidth
              label={t('settings.clientIdLabel')}
              value={config.sso.clientId}
              onChange={(e) => updateSsoConfig('clientId', e.target.value)}
              helperText={t('settings.clientIdHelper')}
              required
            />
            
            <TextField
              fullWidth
              label={t('settings.clientSecretLabel')}
              type="password"
              value={config.sso.clientSecret}
              onChange={(e) => updateSsoConfig('clientSecret', e.target.value)}
              helperText={t('settings.clientSecretHelper')}
              required
            />
            
            <TextField
              fullWidth
              label={t('settings.authUrlLabel')}
              value={config.sso.authUrl}
              onChange={(e) => updateSsoConfig('authUrl', e.target.value)}
              placeholder={t('settings.authUrlPlaceholder')}
              helperText={t('settings.authUrlHelper')}
              required
            />
            
            <TextField
              fullWidth
              label={t('settings.tokenUrlLabel')}
              value={config.sso.tokenUrl}
              onChange={(e) => updateSsoConfig('tokenUrl', e.target.value)}
              placeholder={t('settings.tokenUrlPlaceholder')}
              helperText={t('settings.tokenUrlHelper')}
              required
            />
            
            <TextField
              fullWidth
              label={t('settings.userInfoUrlLabel')}
              value={config.sso.userInfoUrl}
              onChange={(e) => updateSsoConfig('userInfoUrl', e.target.value)}
              placeholder={t('settings.userInfoUrlPlaceholder')}
              helperText={t('settings.userInfoUrlHelper')}
              required
            />
            
            <TextField
              fullWidth
              label={t('settings.redirectUrlLabel')}
              value={config.sso.redirectUrl}
              onChange={(e) => updateSsoConfig('redirectUrl', e.target.value)}
              placeholder={t('settings.redirectUrlPlaceholder')}
              helperText={t('settings.redirectUrlHelper')}
              required
            />
            
            <TextField
              fullWidth
              label={t('settings.scopesLabel')}
              value={config.sso.scopes}
              onChange={(e) => updateSsoConfig('scopes', e.target.value)}
              placeholder={t('settings.scopesPlaceholder')}
              helperText={t('settings.scopesHelper2')}
            />
          </Box>
        </Paper>
      )}

      {/* LDAP配置 */}
      {config.authMethod === 'ldap' && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <CloudIcon color="primary" />
            <Typography variant="h6" fontWeight="600">
              {t('settings.ldapAuthConfig')}
            </Typography>
          </Box>
          
          <Divider sx={{ mb: 3 }} />
          
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <TextField
              fullWidth
              label={t('settings.ldapServerLabel')}
              value={config.ldap.server}
              onChange={(e) => updateLdapConfig('server', e.target.value)}
              placeholder={t('settings.ldapServerPlaceholder')}
              required
            />
            
            <TextField
              fullWidth
              label={t('settings.portLabel')}
              type="number"
              value={config.ldap.port}
              onChange={(e) => updateLdapConfig('port', parseInt(e.target.value))}
              helperText={t('settings.portHelper')}
              required
            />
            
            <TextField
              fullWidth
              label={t('settings.bindDnLabel')}
              value={config.ldap.bindDn}
              onChange={(e) => updateLdapConfig('bindDn', e.target.value)}
              placeholder={t('settings.bindDnPlaceholder')}
              helperText={t('settings.bindDnHelper')}
              required
            />
            
            <TextField
              fullWidth
              label={t('settings.bindPasswordLabel')}
              type="password"
              value={config.ldap.bindPassword}
              onChange={(e) => updateLdapConfig('bindPassword', e.target.value)}
              helperText={t('settings.bindPasswordHelper')}
              required
            />
            
            <TextField
              fullWidth
              label={t('settings.baseDnLabel')}
              value={config.ldap.baseDn}
              onChange={(e) => updateLdapConfig('baseDn', e.target.value)}
              placeholder={t('settings.baseDnPlaceholder')}
              helperText={t('settings.baseDnHelper')}
              required
            />
            
            <TextField
              fullWidth
              label={t('settings.userFilterLabel')}
              value={config.ldap.userFilter}
              onChange={(e) => updateLdapConfig('userFilter', e.target.value)}
              placeholder={t('settings.userFilterPlaceholder')}
              helperText={t('settings.userFilterHelper2')}
              required
            />
            
            <FormGroup>
              <FormControlLabel
                control={
                  <Switch
                    checked={config.ldap.useTLS}
                    onChange={(e) => updateLdapConfig('useTLS', e.target.checked)}
                  />
                }
                label={t('settings.enableTlsLabel')}
              />
            </FormGroup>
          </Box>
        </Paper>
      )}

      {/* 状态信息 */}
      <Alert severity="info">
        <Typography variant="body2">
          <strong>{t('settings.currentAuthStatus')}</strong>
          {config.authMethod === 'password' && t('settings.passwordAuthStatus')}
          {config.authMethod === 'sso' && t('settings.ssoAuthStatus')}
          {config.authMethod === 'ldap' && t('settings.ldapAuthStatus')}
        </Typography>
      </Alert>
    </Box>
  );
}

