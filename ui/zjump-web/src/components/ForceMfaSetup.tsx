import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Stepper,
  Step,
  StepLabel,
  CircularProgress,
} from '@mui/material';
import {
  Security as SecurityIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import axiosInstance from '../api/request';

interface ForceMfaSetupProps {
  open: boolean;
  onComplete: () => void;
  onCancel: () => void;
  token?: string; // 临时登录token，用于强制MFA流程
}

interface TwoFactorSetupResponse {
  qrCode: string;
  secret: string;
  backupCodes: string[];
}

export default function ForceMfaSetup({
  open,
  onComplete,
  onCancel,
  token,
}: ForceMfaSetupProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [setupData, setSetupData] = useState<TwoFactorSetupResponse | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [showBackupCodes, setShowBackupCodes] = useState(false);

  const steps = ['扫描二维码', '验证设置', '完成'];

  useEffect(() => {
    if (open) {
      initializeSetup();
    }
  }, [open]);

  const initializeSetup = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await axiosInstance.post('/api/two-factor/setup', undefined, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      setSetupData(response.data.data);
      setActiveStep(0);
    } catch (err: any) {
      setError(err.response?.data?.message || '初始化2FA设置失败');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      setError('请输入6位验证码');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const response = await axiosInstance.post('/api/two-factor/verify', {
        secret: setupData?.secret,
        code: verificationCode,
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      
      setBackupCodes(response.data.data.backupCodes);
      setShowBackupCodes(true);
      setActiveStep(2);
    } catch (err: any) {
      setError(err.response?.data?.message || '验证码错误');
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = () => {
    setShowBackupCodes(false);
    setVerificationCode('');
    setError('');
    setActiveStep(0);
    onComplete();
  };

  const handleCancel = () => {
    setShowBackupCodes(false);
    setVerificationCode('');
    setError('');
    setActiveStep(0);
    onCancel();
  };

  const renderStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <Box textAlign="center">
            <Typography variant="h6" gutterBottom>
              扫描二维码设置2FA
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              使用您的身份验证器应用（如Google Authenticator、Microsoft Authenticator等）扫描下方二维码
            </Typography>
            
            {setupData && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
                {/* 后端已返回 data:image/png;base64,... 直接显示图片 */}
                <img src={setupData.qrCode} alt="2FA QR" style={{ width: 200, height: 200 }} />
              </Box>
            )}
            
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              或者手动输入密钥：
            </Typography>
            <TextField
              fullWidth
              value={setupData?.secret || ''}
              InputProps={{ readOnly: true }}
              variant="outlined"
              size="small"
              sx={{ mb: 3 }}
            />
            
            <Button
              variant="contained"
              onClick={() => setActiveStep(1)}
              disabled={!setupData}
            >
              下一步
            </Button>
          </Box>
        );
      
      case 1:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              验证2FA设置
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              请在您的身份验证器应用中输入6位验证码
            </Typography>
            
            <TextField
              fullWidth
              label="验证码"
              value={verificationCode}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                setVerificationCode(value);
              }}
              placeholder="000000"
              sx={{ mb: 3 }}
            />
            
            <Box display="flex" gap={2}>
              <Button
                variant="outlined"
                onClick={() => setActiveStep(0)}
              >
                上一步
              </Button>
              <Button
                variant="contained"
                onClick={handleVerifyCode}
                disabled={verificationCode.length !== 6 || loading}
              >
                {loading ? <CircularProgress size={20} /> : '验证'}
              </Button>
            </Box>
          </Box>
        );
      
      case 2:
        return (
          <Box textAlign="center">
            <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              2FA设置完成！
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              您的账户现在受到双因素认证保护
            </Typography>
            
            {showBackupCodes && (
              <Alert severity="warning" sx={{ mb: 3 }}>
                <Typography variant="body2">
                  <strong>重要：</strong>请保存这些备用代码，当您无法访问身份验证器时可以使用它们。
                  每个代码只能使用一次。
                </Typography>
              </Alert>
            )}
            
            {showBackupCodes && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" gutterBottom>
                  备用代码：
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
                  {backupCodes.map((code, index) => (
                    <Typography key={index} variant="body2" fontFamily="monospace">
                      {code}
                    </Typography>
                  ))}
                </Box>
              </Box>
            )}
            
            <Button
              variant="contained"
              onClick={handleComplete}
              size="large"
            >
              完成设置
            </Button>
          </Box>
        );
      
      default:
        return null;
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleCancel}
      maxWidth="sm"
      fullWidth
      disableEscapeKeyDown
    >
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <SecurityIcon color="primary" />
          <Typography variant="h6">
            强制设置双因素认证
          </Typography>
        </Box>
      </DialogTitle>
      
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 3 }}>
          <Typography variant="body2">
            <strong>系统要求：</strong>系统已启用全局双因素认证，您必须设置2FA才能继续使用。
          </Typography>
        </Alert>
        
        <Stepper activeStep={activeStep} sx={{ mb: 3 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
        
        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}
        
        {loading && activeStep === 0 ? (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        ) : (
          renderStepContent(activeStep)
        )}
      </DialogContent>
      
      <DialogActions>
        <Button onClick={handleCancel} disabled={loading}>
          取消
        </Button>
      </DialogActions>
    </Dialog>
  );
}
