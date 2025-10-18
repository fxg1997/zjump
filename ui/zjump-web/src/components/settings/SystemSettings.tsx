import { Box, Typography, TextField, Divider, FormControlLabel, Switch, Stack } from '@mui/material';
import { Cloud as CloudIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

interface SystemSettingsProps {
  config: any;
  onChange: (config: any) => void;
}

export default function SystemSettings({ config, onChange }: SystemSettingsProps) {
  const { t } = useTranslation();

  return (
    <Stack spacing={4}>
      <Box>
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
          <CloudIcon sx={{ mr: 1 }} /> {t("settings.basicConfig")}
        </Typography>
        <Divider sx={{ mb: 3 }} />
        <Stack spacing={3}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
            <TextField
              label={t("settings.siteName")}
              value={config.siteName}
              onChange={(e) => onChange({ ...config, siteName: e.target.value })}
              helperText={t("settings.displayOnTitle")}
            />
            <TextField
              label={t("settings.adminEmail")}
              value={config.adminEmail}
              onChange={(e) => onChange({ ...config, adminEmail: e.target.value })}
              type="email"
            />
          </Box>
          <TextField
            label={t("settings.siteDescription")}
            value={config.siteDescription}
            onChange={(e) => onChange({ ...config, siteDescription: e.target.value })}
            multiline
            rows={2}
          />
          <FormControlLabel
            control={
              <Switch
                checked={config.autoReconnect}
                onChange={(e) => onChange({ ...config, autoReconnect: e.target.checked })}
              />
            }
            label={t("settings.autoReconnect")}
          />
        </Stack>
      </Box>
    </Stack>
  );
}

