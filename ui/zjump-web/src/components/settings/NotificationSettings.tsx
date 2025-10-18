import { Box, Typography, TextField, Divider, FormControlLabel, Switch, Stack, Button, Alert, Snackbar } from '@mui/material';
import { Notifications as NotificationsIcon, Send as SendIcon, CheckCircle as CheckCircleIcon, Error as ErrorIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { settingsApi } from '../../api';

interface NotificationSettingsProps {
  config: any;
  onChange: (config: any) => void;
}

export default function NotificationSettings({ config, onChange }: NotificationSettingsProps) {
  const { t } = useTranslation();
  const [testing, setTesting] = useState<'feishu' | 'dingtalk' | 'wechat' | null>(null);
  const [testResult, setTestResult] = useState<{ open: boolean; success: boolean; message: string }>({
    open: false,
    success: false,
    message: '',
  });

  const handleTestNotification = async (platform: 'feishu' | 'dingtalk' | 'wechat') => {
    setTesting(platform);
    try {
      let result;
      
      if (platform === 'feishu') {
        if (!config.feishuWebhook) {
          setTestResult({
            open: true,
            success: false,
            message: t('settings.testNotificationEmptyWebhook'),
          });
          return;
        }
        result = await settingsApi.testFeishuNotification({
          webhook: config.feishuWebhook,
          secret: config.feishuSecret,
        });
      } else if (platform === 'dingtalk') {
        if (!config.dingTalkWebhook) {
          setTestResult({
            open: true,
            success: false,
            message: t('settings.testNotificationEmptyWebhook'),
          });
          return;
        }
        result = await settingsApi.testDingtalkNotification({
          webhook: config.dingTalkWebhook,
          secret: config.dingTalkSecret,
        });
      } else if (platform === 'wechat') {
        if (!config.wechatCorpId || !config.wechatAgentId || !config.wechatSecret) {
          setTestResult({
            open: true,
            success: false,
            message: t('settings.testNotificationMissingConfig'),
          });
          return;
        }
        result = await settingsApi.testWechatNotification({
          corpId: config.wechatCorpId,
          agentId: config.wechatAgentId,
          secret: config.wechatSecret,
        });
      }

      setTestResult({
        open: true,
        success: result?.success || false,
        message: result?.message || t('settings.testNotificationSuccess'),
      });
    } catch (error: any) {
      console.error('Test notification failed:', error);
      setTestResult({
        open: true,
        success: false,
        message: error?.response?.data?.message || error?.message || t('settings.testNotificationFailed'),
      });
    } finally {
      setTesting(null);
    }
  };

  return (
    <Stack spacing={4}>
      {/* 飞书通知 */}
      <Box>
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
          <NotificationsIcon sx={{ mr: 1 }} /> {t("settings.feishuNotification")}
        </Typography>
        <Divider sx={{ mb: 3 }} />
        <Stack spacing={3}>
          <FormControlLabel
            control={
              <Switch
                checked={config.enableFeishu}
                onChange={(e) => onChange({ ...config, enableFeishu: e.target.checked })}
              />
            }
            label={t("settings.enableFeishuBot")}
          />
          <TextField
            label={t("settings.feishuWebhook")}
            value={config.feishuWebhook}
            onChange={(e) => onChange({ ...config, feishuWebhook: e.target.value })}
            disabled={!config.enableFeishu}
            placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
          />
          <TextField
            label={t("settings.feishuSecret")}
            value={config.feishuSecret}
            onChange={(e) => onChange({ ...config, feishuSecret: e.target.value })}
            disabled={!config.enableFeishu}
            helperText={t("settings.feishuSecretHelper")}
          />
          {config.enableFeishu && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<SendIcon />}
              onClick={() => handleTestNotification('feishu')}
              disabled={testing !== null}
              sx={{ alignSelf: 'flex-start' }}
            >
              {testing === 'feishu' ? t('settings.testing') : t('settings.testFeishuNotification')}
            </Button>
          )}
        </Stack>
      </Box>

      {/* 钉钉通知 */}
      <Box>
        <Typography variant="h6" gutterBottom>
          {t("settings.dingtalkNotification")}
        </Typography>
        <Divider sx={{ mb: 3 }} />
        <Stack spacing={3}>
          <FormControlLabel
            control={
              <Switch
                checked={config.enableDingTalk}
                onChange={(e) => onChange({ ...config, enableDingTalk: e.target.checked })}
              />
            }
            label={t("settings.enableDingtalkBot")}
          />
          <TextField
            label={t("settings.dingtalkWebhook")}
            value={config.dingTalkWebhook}
            onChange={(e) => onChange({ ...config, dingTalkWebhook: e.target.value })}
            disabled={!config.enableDingTalk}
            placeholder="https://oapi.dingtalk.com/robot/send?access_token=..."
          />
          <TextField
            label={t("settings.dingtalkSecret")}
            value={config.dingTalkSecret}
            onChange={(e) => onChange({ ...config, dingTalkSecret: e.target.value })}
            disabled={!config.enableDingTalk}
            helperText={t("settings.dingtalkSecretHelper")}
          />
          {config.enableDingTalk && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<SendIcon />}
              onClick={() => handleTestNotification('dingtalk')}
              disabled={testing !== null}
              sx={{ alignSelf: 'flex-start' }}
            >
              {testing === 'dingtalk' ? t('settings.testing') : t('settings.testDingtalkNotification')}
            </Button>
          )}
        </Stack>
      </Box>

      {/* 企业微信通知 */}
      <Box>
        <Typography variant="h6" gutterBottom>
          {t("settings.wechatNotification")}
        </Typography>
        <Divider sx={{ mb: 3 }} />
        <Stack spacing={3}>
          <FormControlLabel
            control={
              <Switch
                checked={config.enableWeChat}
                onChange={(e) => onChange({ ...config, enableWeChat: e.target.checked })}
              />
            }
            label={t("settings.enableWechatNotification")}
          />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 3 }}>
            <TextField
              label={t("settings.wechatCorpId")}
              value={config.wechatCorpId}
              onChange={(e) => onChange({ ...config, wechatCorpId: e.target.value })}
              disabled={!config.enableWeChat}
            />
            <TextField
              label={t("settings.wechatAgentId")}
              value={config.wechatAgentId}
              onChange={(e) => onChange({ ...config, wechatAgentId: e.target.value })}
              disabled={!config.enableWeChat}
            />
            <TextField
              label={t("settings.wechatSecret")}
              value={config.wechatSecret}
              onChange={(e) => onChange({ ...config, wechatSecret: e.target.value })}
              disabled={!config.enableWeChat}
            />
          </Box>
          {config.enableWeChat && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<SendIcon />}
              onClick={() => handleTestNotification('wechat')}
              disabled={testing !== null}
              sx={{ alignSelf: 'flex-start' }}
            >
              {testing === 'wechat' ? t('settings.testing') : t('settings.testWechatNotification')}
            </Button>
          )}
        </Stack>
      </Box>

      {/* 测试结果通知 */}
      <Snackbar
        open={testResult.open}
        autoHideDuration={6000}
        onClose={() => setTestResult({ ...testResult, open: false })}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setTestResult({ ...testResult, open: false })}
          severity={testResult.success ? 'success' : 'error'}
          icon={testResult.success ? <CheckCircleIcon /> : <ErrorIcon />}
          sx={{ width: '100%' }}
        >
          {testResult.message}
        </Alert>
      </Snackbar>
    </Stack>
  );
}

