import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Alert,
  Divider,
  FormControlLabel,
  Checkbox,
  Link,
} from '@mui/material';
import {
  Security as SecurityIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

interface TwoFactorVerificationProps {
  onVerify: (code: string, backupCode?: string) => void;
  onCancel: () => void;
  loading?: boolean;
  error?: string;
}

export default function TwoFactorVerification({
  onVerify,
  onCancel,
  loading = false,
  error,
}: TwoFactorVerificationProps) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (useBackupCode) {
      onVerify('', backupCode);
    } else {
      onVerify(code);
    }
  };

  const handleCodeChange = (value: string) => {
    // 只允许数字，最多6位
    const numericValue = value.replace(/\D/g, '').slice(0, 6);
    setCode(numericValue);
  };

  return (
    <Box
      display="flex"
      justifyContent="center"
      alignItems="center"
      minHeight="100vh"
      bgcolor="background.default"
    >
      <Card sx={{ maxWidth: 400, width: '100%', mx: 2 }}>
        <CardContent sx={{ p: 4 }}>
          <Box textAlign="center" mb={3}>
            <SecurityIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
            <Typography variant="h5" gutterBottom>
              {t('auth.twoFactor.title')}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              {t('auth.twoFactor.description')}
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            {!useBackupCode ? (
              <Box>
                <TextField
                  fullWidth
                  label={t('auth.twoFactor.codeLabel')}
                  value={code}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  placeholder="000000"
                  inputProps={{
                    maxLength: 6,
                    style: { textAlign: 'center', fontSize: '1.2rem', letterSpacing: '0.2em' },
                  }}
                  disabled={loading}
                  autoFocus
                />
                <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
                  {t('auth.twoFactor.codeHelper')}
                </Typography>
              </Box>
            ) : (
              <Box>
                <TextField
                  fullWidth
                  label={t('auth.twoFactor.backupCodeLabel')}
                  value={backupCode}
                  onChange={(e) => setBackupCode(e.target.value)}
                  placeholder="XXXXXXXX"
                  inputProps={{
                    style: { textAlign: 'center', fontSize: '1.1rem', letterSpacing: '0.1em' },
                  }}
                  disabled={loading}
                  autoFocus
                />
                <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
                  {t('auth.twoFactor.backupCodeHelper')}
                </Typography>
              </Box>
            )}

            <Box mt={3}>
              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                disabled={loading || (!useBackupCode ? code.length !== 6 : !backupCode)}
                sx={{ mb: 2 }}
              >
                {loading ? t('common.verifying') : t('auth.twoFactor.verify')}
              </Button>

              <Divider sx={{ my: 2 }}>
                <Typography variant="caption" color="textSecondary">
                  {t('common.or')}
                </Typography>
              </Divider>

              <FormControlLabel
                control={
                  <Checkbox
                    checked={useBackupCode}
                    onChange={(e) => setUseBackupCode(e.target.checked)}
                    disabled={loading}
                  />
                }
                label={t('auth.twoFactor.useBackupCode')}
                sx={{ mb: 2 }}
              />

              <Box textAlign="center">
                <Button
                  variant="text"
                  onClick={onCancel}
                  disabled={loading}
                  sx={{ mr: 2 }}
                >
                  {t('common.cancel')}
                </Button>
                <Link
                  component="button"
                  type="button"
                  onClick={() => {
                    // 这里可以添加帮助链接
                    console.log('Help clicked');
                  }}
                  variant="body2"
                >
                  {t('auth.twoFactor.needHelp')}
                </Link>
              </Box>
            </Box>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}
