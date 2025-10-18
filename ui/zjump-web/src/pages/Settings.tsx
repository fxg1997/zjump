import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Tabs,
  Tab,
  Alert,
  Paper,
} from '@mui/material';
import {
  Save as SaveIcon,
  Settings as SettingsIcon,
  Storage as StorageIcon,
  Notifications as NotificationsIcon,
  Cloud as CloudIcon,
  CheckCircle as CheckCircleIcon,
  Sync as SyncIcon,
  VpnKey as VpnKeyIcon,
  Approval as ApprovalIcon,
  MonitorHeart as MonitorHeartIcon,
} from '@mui/icons-material';
import { showSuccessToast, settingsApi } from '../api';
import { useSettings } from '../contexts/SettingsContext';
import { useTranslation } from 'react-i18next';
import SystemSettings from '../components/settings/SystemSettings';
import AuditSettings from '../components/settings/AuditSettings';
import NotificationSettings from '../components/settings/NotificationSettings';
import AssetSyncSettings from '../components/settings/AssetSyncSettings';
import AuthSettings from '../components/settings/AuthSettings';
import ApprovalConfigSettings from '../components/settings/ApprovalConfigSettings';
import HostMonitorSettings from '../components/settings/HostMonitorSettings';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`settings-tabpanel-${index}`}
      aria-labelledby={`settings-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

export default function Settings() {
  const { t } = useTranslation();
  const { refreshSettings } = useSettings();
  const [tabValue, setTabValue] = useState(0);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 系统配置
  const [systemConfig, setSystemConfig] = useState({
    siteName: 'ZJump 堡垒机',
    siteDescription: '企业级SSH跳板机管理平台',
    adminEmail: 'admin@example.com',
    autoReconnect: true,
  });

  // 审计配置
  const [auditConfig, setAuditConfig] = useState({
    enableSessionRecording: true,
    recordingFormat: 'asciinema',
    sessionRetentionDays: 90,
    commandRetentionDays: 180,
    enableRealTimeAudit: true,
    enableDangerousCommandAlert: true,
    alertEmails: 'security@example.com',
    enableFileTransferAudit: true,
  });

  // 通知配置
  const [notificationConfig, setNotificationConfig] = useState({
    enableFeishu: false,
    feishuWebhook: '',
    feishuSecret: '',
    enableDingTalk: false,
    dingTalkWebhook: '',
    dingTalkSecret: '',
    enableWeChat: false,
    wechatCorpId: '',
    wechatAgentId: '',
    wechatSecret: '',
  });

  // 认证配置
  const [authConfig, setAuthConfig] = useState({
    authMethod: 'password', // 'password', 'sso', 'ldap'
    passwordLogin: {
      enabled: true,
      passwordMinLength: 8,
      passwordComplexity: true,
      sessionTimeout: 30,
    },
    sso: {
      enabled: false,
      provider: '',
      clientId: '',
      clientSecret: '',
      authUrl: '',
      tokenUrl: '',
      userInfoUrl: '',
      redirectUrl: '',
      scopes: 'openid email profile',
    },
    ldap: {
      enabled: false,
      server: '',
      port: 389,
      bindDn: '',
      bindPassword: '',
      baseDn: '',
      userFilter: '(uid={username})',
      useTLS: false,
    },
  });

  // 从后端加载配置
  const loadSettings = async () => {
    try {
      setLoading(true);
      const data = await settingsApi.getAllSettings();
      
      const settingsByCategory: Record<string, Record<string, any>> = {};
      
      if (Array.isArray(data)) {
        data.forEach((setting: any) => {
          if (!settingsByCategory[setting.category]) {
            settingsByCategory[setting.category] = {};
          }
          settingsByCategory[setting.category][setting.key] = setting.value;
        });
      } else if (typeof data === 'object') {
        Object.keys(data).forEach(category => {
          const categorySettings = data[category];
          if (typeof categorySettings === 'object') {
            settingsByCategory[category] = categorySettings;
          }
        });
      }
      
      const convertValue = (value: any): any => {
        if (typeof value !== 'string') return value;
        if (value === 'true') return true;
        if (value === 'false') return false;
        if (/^\d+$/.test(value)) {
          const num = parseInt(value, 10);
          if (!isNaN(num)) return num;
        }
        if (/^\d+\.\d+$/.test(value)) {
          const num = parseFloat(value);
          if (!isNaN(num)) return num;
        }
        return value;
      };
      
      const convertConfig = (config: Record<string, any>): Record<string, any> => {
        const result: Record<string, any> = {};
        for (const [key, value] of Object.entries(config)) {
          result[key] = convertValue(value);
        }
        return result;
      };
      
      if (settingsByCategory.system) {
        setSystemConfig(prev => ({ ...prev, ...convertConfig(settingsByCategory.system) }));
      }
      if (settingsByCategory.audit) {
        setAuditConfig(prev => ({ ...prev, ...convertConfig(settingsByCategory.audit) }));
      }
      if (settingsByCategory.notification) {
        setNotificationConfig(prev => ({ ...prev, ...convertConfig(settingsByCategory.notification) }));
      }
      if (settingsByCategory.auth) {
        const authSettings = convertConfig(settingsByCategory.auth);
        // 重构authConfig以匹配嵌套结构
        const newAuthConfig = {
          authMethod: authSettings.authMethod || 'password',
          passwordLogin: {
            enabled: authSettings.passwordLoginEnabled ?? true,
            passwordMinLength: authSettings.passwordMinLength || 8,
            passwordComplexity: authSettings.passwordComplexity ?? true,
            sessionTimeout: authSettings.passwordSessionTimeout || 30,
          },
          sso: {
            enabled: authSettings.ssoEnabled ?? false,
            provider: authSettings.ssoProvider || '',
            clientId: authSettings.ssoClientId || '',
            clientSecret: authSettings.ssoClientSecret || '',
            authUrl: authSettings.ssoAuthUrl || '',
            tokenUrl: authSettings.ssoTokenUrl || '',
            userInfoUrl: authSettings.ssoUserInfoUrl || '',
            redirectUrl: authSettings.ssoRedirectUrl || '',
            scopes: authSettings.ssoScopes || 'openid email profile',
          },
          ldap: {
            enabled: authSettings.ldapEnabled ?? false,
            server: authSettings.ldapServer || '',
            port: authSettings.ldapPort || 389,
            bindDn: authSettings.ldapBindDn || '',
            bindPassword: authSettings.ldapBindPassword || '',
            baseDn: authSettings.ldapBaseDn || '',
            userFilter: authSettings.ldapUserFilter || '(uid={username})',
            useTLS: authSettings.ldapUseTLS ?? false,
          },
        };
        
        setAuthConfig(newAuthConfig);
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSaveSettings = async () => {
    try {
      setSaving(true);
      
      // 扁平化认证配置以便保存到后端
      const flattenAuthConfig = {
        authMethod: authConfig.authMethod,
        // Password配置
        passwordLoginEnabled: authConfig.passwordLogin.enabled,
        passwordMinLength: authConfig.passwordLogin.passwordMinLength,
        passwordComplexity: authConfig.passwordLogin.passwordComplexity,
        passwordSessionTimeout: authConfig.passwordLogin.sessionTimeout,
        // SSO配置
        ssoEnabled: authConfig.sso.enabled,
        ssoProvider: authConfig.sso.provider,
        ssoClientId: authConfig.sso.clientId,
        ssoClientSecret: authConfig.sso.clientSecret,
        ssoAuthUrl: authConfig.sso.authUrl,
        ssoTokenUrl: authConfig.sso.tokenUrl,
        ssoUserInfoUrl: authConfig.sso.userInfoUrl,
        ssoRedirectUrl: authConfig.sso.redirectUrl,
        ssoScopes: authConfig.sso.scopes,
        // LDAP配置
        ldapEnabled: authConfig.ldap.enabled,
        ldapServer: authConfig.ldap.server,
        ldapPort: authConfig.ldap.port,
        ldapBindDn: authConfig.ldap.bindDn,
        ldapBindPassword: authConfig.ldap.bindPassword,
        ldapBaseDn: authConfig.ldap.baseDn,
        ldapUserFilter: authConfig.ldap.userFilter,
        ldapUseTLS: authConfig.ldap.useTLS,
      };
      
      const allSettings: Record<string, any> = {
        system: systemConfig,
        audit: auditConfig,
        notification: notificationConfig,
        auth: flattenAuthConfig,
      };
      
      await settingsApi.updateSettings(allSettings);
      
      setSaveSuccess(true);
      showSuccessToast(t("settings.saveSuccess"));
      setTimeout(() => setSaveSuccess(false), 3000);
      
      await refreshSettings();
      await loadSettings();
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert(t("settings.saveFailed") + ': ' + (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <SettingsIcon sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
        <Box>
          <Typography variant="h4" component="h1" fontWeight="700">
            {t("settings.title")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t("settings.adminConfig")}
          </Typography>
        </Box>
      </Box>

      {loading && (
        <Alert severity="info" sx={{ mb: 3 }}>
          {t("settings.loadingConfig")}
        </Alert>
      )}

      {saveSuccess && (
        <Alert severity="success" sx={{ mb: 3 }} icon={<CheckCircleIcon />}>
          {t("settings.saveSuccessRestart")}
        </Alert>
      )}

      <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <Tabs
          value={tabValue}
          onChange={(_, newValue) => setTabValue(newValue)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            borderBottom: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
            '& .MuiTab-root': { minHeight: 64 },
          }}
        >
          <Tab icon={<CloudIcon />} label={t("settings.systemConfig")} />
          <Tab icon={<StorageIcon />} label={t("settings.auditConfig")} />
          <Tab icon={<NotificationsIcon />} label={t("settings.notificationConfig")} />
          <Tab icon={<VpnKeyIcon />} label={t("settings.authConfig")} />
          <Tab icon={<ApprovalIcon />} label={t("settings.approvalConfigTab")} />
          <Tab icon={<SyncIcon />} label={t("settings.assetSyncConfig")} />
          <Tab icon={<MonitorHeartIcon />} label={t("settings.hostMonitorConfig")} />
        </Tabs>

        <Box sx={{ px: 3, maxWidth: 1200 }}>
          <TabPanel value={tabValue} index={0}>
            <SystemSettings config={systemConfig} onChange={setSystemConfig} />
          </TabPanel>

          <TabPanel value={tabValue} index={1}>
            <AuditSettings config={auditConfig} onChange={setAuditConfig} />
          </TabPanel>

          <TabPanel value={tabValue} index={2}>
            <NotificationSettings config={notificationConfig} onChange={setNotificationConfig} />
          </TabPanel>

          <TabPanel value={tabValue} index={3}>
            <AuthSettings config={authConfig} onChange={setAuthConfig} />
          </TabPanel>

          <TabPanel value={tabValue} index={4}>
            <ApprovalConfigSettings />
          </TabPanel>

          <TabPanel value={tabValue} index={5}>
            <AssetSyncSettings />
          </TabPanel>

          <TabPanel value={tabValue} index={6}>
            <HostMonitorSettings />
          </TabPanel>
        </Box>

        {tabValue < 4 && (
          <Box sx={{ px: 3, pb: 3, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <Button
              variant="contained"
              size="large"
              startIcon={<SaveIcon />}
              onClick={handleSaveSettings}
              disabled={saving}
            >
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </Box>
        )}
      </Paper>
    </Box>
  );
}

