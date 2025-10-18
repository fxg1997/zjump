import { Box, Typography, TextField, Divider, FormControlLabel, Switch, Stack, Select, MenuItem, FormControl, InputLabel } from '@mui/material';
import { Storage as StorageIcon, Notifications as NotificationsIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

interface AuditSettingsProps {
  config: any;
  onChange: (config: any) => void;
}

export default function AuditSettings({ config, onChange }: AuditSettingsProps) {
  const { t } = useTranslation();

  return (
    <Stack spacing={4}>
      {/* 会话录制 */}
      <Box>
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
          <StorageIcon sx={{ mr: 1 }} /> {t("settings.sessionRecording")}
        </Typography>
        <Divider sx={{ mb: 3 }} />
        <Stack spacing={3}>
          <FormControlLabel
            control={
              <Switch
                checked={config.enableSessionRecording}
                onChange={(e) => onChange({ ...config, enableSessionRecording: e.target.checked })}
              />
            }
            label={t("settings.enableSessionRecording")}
          />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 3 }}>
            <FormControl disabled={!config.enableSessionRecording}>
              <InputLabel>{t("settings.recordingFormatLabel")}</InputLabel>
              <Select
                value={config.recordingFormat}
                label={t("settings.recordingFormatLabel")}
                onChange={(e) => onChange({ ...config, recordingFormat: e.target.value })}
              >
                <MenuItem value="asciinema">{t("settings.asciinemaText")}</MenuItem>
                <MenuItem value="mp4">{t("settings.mp4Video")}</MenuItem>
              </Select>
            </FormControl>
            <TextField
              type="number"
              label={t("settings.sessionRetentionDays")}
              value={config.sessionRetentionDays}
              onChange={(e) => onChange({ ...config, sessionRetentionDays: parseInt(e.target.value) })}
              helperText={t("settings.sessionRetentionHelper")}
              disabled={!config.enableSessionRecording}
            />
            <TextField
              type="number"
              label={t("settings.commandRetentionDays")}
              value={config.commandRetentionDays}
              onChange={(e) => onChange({ ...config, commandRetentionDays: parseInt(e.target.value) })}
              helperText={t("settings.commandRetentionHelper")}
            />
          </Box>
        </Stack>
      </Box>

      {/* 实时审计与告警 */}
      <Box>
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
          <NotificationsIcon sx={{ mr: 1 }} /> {t("settings.realtimeAuditAlert")}
        </Typography>
        <Divider sx={{ mb: 3 }} />
        <Stack spacing={2}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 1.5 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={config.enableRealTimeAudit}
                  onChange={(e) => onChange({ ...config, enableRealTimeAudit: e.target.checked })}
                />
              }
              label={t("settings.enableCommandAudit")}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={config.enableDangerousCommandAlert}
                  onChange={(e) => onChange({ ...config, enableDangerousCommandAlert: e.target.checked })}
                />
              }
              label={t("settings.dangerousCommandAlert")}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={config.enableFileTransferAudit}
                  onChange={(e) => onChange({ ...config, enableFileTransferAudit: e.target.checked })}
                />
              }
              label={t("settings.fileTransferAudit")}
            />
          </Box>
          <TextField
            label={t("settings.alertEmails")}
            value={config.alertEmails}
            onChange={(e) => onChange({ ...config, alertEmails: e.target.value })}
            placeholder="admin@example.com, security@example.com"
            helperText={t("settings.alertEmailsHelper")}
            disabled={!config.enableDangerousCommandAlert}
          />
        </Stack>
      </Box>
    </Stack>
  );
}

