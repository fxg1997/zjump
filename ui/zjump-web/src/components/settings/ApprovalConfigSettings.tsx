import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Divider,
  Stack,
  Button,
  Chip,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  FormControlLabel,
  Switch,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  Approval as ApprovalIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  ExpandMore as ExpandMoreIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { approvalApi, ApprovalConfig } from '../../api/api';

interface ApprovalPlatformConfig {
  id?: string;
  name: string;
  type: 'feishu' | 'dingtalk' | 'wechat';
  enabled: boolean;
  
  // 基础配置
  app_id: string;
  app_secret: string;
  
  // 飞书特有
  approval_code?: string;
  
  // 钉钉特有
  process_code?: string;
  
  // 企业微信特有
  template_id?: string;
  
  // 表单字段映射 (JSON string)
  form_fields: string;
  
  // 审批人配置
  approver_user_ids?: string;
  
  // 抄送人配置
  cc_user_ids?: string;
  cc_open_ids?: string;
  
  // API配置
  api_base_url?: string;
  
  // 回调配置
  callback_url?: string;
  
  created_at?: string;
  updated_at?: string;
}

const defaultFormFields = {
  feishu: `[
  {
    "id": "widget17424405077590001",
    "name": "工单标题",
    "type": "input",
    "required": false,
    "visible": true,
    "printable": true,
    "enable_default_value": false,
    "default_value_type": "",
    "widget_default_value": "",
    "display_condition": null
  },
  {
    "id": "widget17611283640360001",
    "name": "详细描述",
    "type": "textarea",
    "required": false,
    "visible": true,
    "printable": true,
    "enable_default_value": false,
    "default_value_type": "",
    "widget_default_value": "",
    "display_condition": null
  },
  {
    "id": "widget17611425102270001",
    "name": "申请类型",
    "type": "radioV2",
    "required": false,
    "visible": true,
    "printable": true,
    "enable_default_value": false,
    "default_value_type": "",
    "widget_default_value": "",
    "display_condition": null,
    "option": [
      {"value": "mh22s1w3-nkqsak2eis-0", "text": "host_access"},
      {"value": "mh22s1w3-dipw4j04vb-0", "text": "host_group_access"}
    ]
  },
  {
    "id": "widget17611283900470001",
    "name": "申请理由",
    "type": "textarea",
    "required": false,
    "visible": true,
    "printable": true,
    "enable_default_value": false,
    "default_value_type": "",
    "widget_default_value": "",
    "display_condition": null
  },
  {
    "id": "widget17611284241860001",
    "name": "申请资源",
    "type": "textarea",
    "required": false,
    "visible": true,
    "printable": true,
    "enable_default_value": false,
    "default_value_type": "",
    "widget_default_value": "",
    "display_condition": null
  },
  {
    "id": "widget17611477809060001",
    "name": "权限时长",
    "type": "input",
    "required": false,
    "visible": true,
    "printable": true,
    "enable_default_value": false,
    "default_value_type": "",
    "widget_default_value": "",
    "display_condition": null
  }
]`,
  dingtalk: `[
  {
    "name": "title",
    "label": "工单标题",
    "field": "title"
  },
  {
    "name": "description",
    "label": "详细描述",
    "field": "description"
  },
  {
    "name": "type",
    "label": "申请类型",
    "field": "type",
    "options": [
      {"value": "host_access", "label": "主机访问权限"},
      {"value": "host_group_access", "label": "主机组访问权限"}
    ]
  },
  {
    "name": "reason",
    "label": "申请理由",
    "field": "reason"
  },
  {
    "name": "duration",
    "label": "权限时长",
    "field": "duration"
  }
]`,
  wechat: `[
  {
    "control": "Text",
    "id": "Text-title",
    "label": "工单标题",
    "field": "title"
  },
  {
    "control": "Textarea",
    "id": "Textarea-description",
    "label": "详细描述",
    "field": "description"
  },
  {
    "control": "Select",
    "id": "Select-type",
    "label": "申请类型",
    "field": "type",
    "options": [
      {"value": "host_access", "label": "主机访问权限"},
      {"value": "host_group_access", "label": "主机组访问权限"}
    ]
  },
  {
    "control": "Textarea",
    "id": "Textarea-reason",
    "label": "申请理由",
    "field": "reason"
  },
  {
    "control": "Text",
    "id": "Text-duration",
    "label": "权限时长",
    "field": "duration"
  }
]`,
};

export default function ApprovalConfigSettings() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [configs, setConfigs] = useState<ApprovalPlatformConfig[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ApprovalPlatformConfig | null>(null);
  const [formData, setFormData] = useState<Partial<ApprovalPlatformConfig>>({
    name: '',
    type: 'feishu',
    enabled: true,
    app_id: '',
    app_secret: '',
    approval_code: '',
    process_code: '',
    template_id: '',
    form_fields: defaultFormFields.feishu,
    // 审批人配置
    approver_user_ids: '',
    // 抄送人配置
    cc_user_ids: '',
    cc_open_ids: '',
    // API配置
    api_base_url: '',
    // 回调配置
    callback_url: '',
  });

  // 加载配置列表
  const loadConfigs = async () => {
    setLoading(true);
    try {
      const data = await approvalApi.getApprovalConfig();
      console.log('加载到的工单配置列表：', data);
      setConfigs((data.configs || []) as any);
    } catch (error) {
      console.error('Failed to load approval configs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfigs();
  }, []);

  // 打开创建/编辑对话框
  const handleOpenDialog = (config?: ApprovalPlatformConfig) => {
    if (config) {
      console.log('编辑配置，原始数据：', config);
      setEditingConfig(config);
      setFormData({
        name: config.name || '',
        type: config.type || 'feishu',
        enabled: config.enabled !== undefined ? config.enabled : true,
        app_id: config.app_id || '',
        app_secret: config.app_secret || '',
        approval_code: config.approval_code || '',
        process_code: config.process_code || '',
        template_id: config.template_id || '',
        form_fields: config.form_fields || defaultFormFields[config.type || 'feishu'],
        // 审批人配置
        approver_user_ids: config.approver_user_ids || '',
        // 抄送人配置
        cc_user_ids: config.cc_user_ids || '',
        cc_open_ids: config.cc_open_ids || '',
        // API配置
        api_base_url: config.api_base_url || '',
        // 回调配置
        callback_url: config.callback_url || '',
      });
    } else {
      setEditingConfig(null);
      setFormData({
        name: '',
        type: 'feishu',
        enabled: true,
        app_id: '',
        app_secret: '',
        approval_code: '',
        process_code: '',
        template_id: '',
        form_fields: defaultFormFields.feishu,
        // 审批人配置
        approver_user_ids: '',
        // 抄送人配置
        cc_user_ids: '',
        cc_open_ids: '',
        // API配置
        api_base_url: '',
        // 回调配置
        callback_url: '',
      });
    }
    setDialogOpen(true);
  };

  // 关闭对话框
  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingConfig(null);
  };

  // 提交表单
  const handleSubmit = async () => {
    try {
      // 验证表单字段是否为有效JSON
      try {
        JSON.parse(formData.form_fields || '[]');
      } catch (e) {
        alert(t('settings.approvalConfig.invalidJsonFormat'));
        return;
      }

      // 转换数据格式以匹配后端API
      const apiData: Partial<ApprovalConfig> = {
        name: formData.name,
        type: formData.type as string,
        enabled: formData.enabled,
        app_id: formData.app_id,
        app_secret: formData.app_secret,
        approval_code: formData.approval_code,
        process_code: formData.process_code,
        template_id: formData.template_id,
        form_fields: formData.form_fields,
        approver_user_ids: formData.approver_user_ids,
        cc_user_ids: formData.cc_user_ids,
        cc_open_ids: formData.cc_open_ids,
        api_base_url: formData.api_base_url,
        callback_url: formData.callback_url,
      };

      if (editingConfig) {
        // 更新
        await approvalApi.updateApprovalConfig(editingConfig.id!, apiData);
        alert(t('settings.approvalConfig.messages.updateSuccess'));
      } else {
        // 创建
        await approvalApi.updateApprovalConfig(null, apiData);
        alert(t('settings.approvalConfig.messages.createSuccess'));
      }
      handleCloseDialog();
      loadConfigs();
    } catch (error) {
      console.error('Failed to save config:', error);
      alert(t('settings.approvalConfig.messages.saveFailed') + ': ' + (error as any).message);
    }
  };

  // 删除配置
  const handleDelete = async (configId: string) => {
    if (!confirm(t('settings.approvalConfig.deleteConfirm'))) return;
    
    try {
      await approvalApi.deleteApprovalConfig(configId);
      alert(t('settings.approvalConfig.messages.deleteSuccess'));
      loadConfigs();
    } catch (error) {
      console.error('Failed to delete config:', error);
      alert(t('settings.approvalConfig.messages.saveFailed') + ': ' + (error as any).message);
    }
  };

  // 切换平台类型时更新默认表单字段
  const handlePlatformChange = (type: 'feishu' | 'dingtalk' | 'wechat') => {
    setFormData({
      ...formData,
      type,
      form_fields: defaultFormFields[type],
      approval_code: '',
      process_code: '',
      template_id: '',
    });
  };

  const getPlatformLabel = (type: string) => {
    const labels: Record<string, string> = {
      feishu: t('settings.approvalConfig.platforms.feishu'),
      dingtalk: t('settings.approvalConfig.platforms.dingtalk'),
      wechat: t('settings.approvalConfig.platforms.wechat'),
    };
    return labels[type] || type;
  };

  const formatTime = (time?: string) => {
    if (!time) return '-';
    return new Date(time).toLocaleString();
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Stack spacing={4}>
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Box>
            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center' }}>
              <ApprovalIcon sx={{ mr: 1 }} /> {t('settings.approvalConfig.title')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {t('settings.approvalConfig.subtitle')}
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
          >
            {t('settings.approvalConfig.addConfig')}
          </Button>
        </Box>
        <Divider />
      </Box>

      <Alert severity="info" icon={<ApprovalIcon />}>
        <Typography variant="body2" fontWeight="bold" gutterBottom>
          {t('settings.approvalConfig.tips.title')}
        </Typography>
        <Typography variant="body2" component="div">
          • <strong>{t('settings.approvalConfig.platforms.feishu')}</strong>: {t('settings.approvalConfig.tips.feishu')}<br />
          • <strong>{t('settings.approvalConfig.platforms.dingtalk')}</strong>: {t('settings.approvalConfig.tips.dingtalk')}<br />
          • <strong>{t('settings.approvalConfig.platforms.wechat')}</strong>: {t('settings.approvalConfig.tips.wechat')}
        </Typography>
      </Alert>


      {configs.length === 0 ? (
        <Alert severity="info">
          {t('settings.approvalConfig.noConfigs')}
        </Alert>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{t('settings.approvalConfig.table.name')}</TableCell>
                <TableCell>{t('settings.approvalConfig.table.platform')}</TableCell>
                <TableCell>{t('settings.approvalConfig.table.appId')}</TableCell>
                <TableCell>{t('settings.approvalConfig.table.flowCode')}</TableCell>
                <TableCell align="center">{t('settings.approvalConfig.table.status')}</TableCell>
                <TableCell align="center">{t('settings.approvalConfig.table.createdAt')}</TableCell>
                <TableCell align="right">{t('settings.approvalConfig.table.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {configs.map((config) => (
                <TableRow key={config.id}>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {config.name}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={getPlatformLabel(config.type)} 
                      size="small" 
                      variant="outlined"
                      color={config.type === 'feishu' ? 'primary' : config.type === 'dingtalk' ? 'info' : 'secondary'}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {config.app_id}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {config.approval_code || config.process_code || config.template_id || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    {config.enabled ? (
                      <Chip
                        icon={<CheckCircleIcon />}
                        label={t('common.enabled')}
                        size="small"
                        color="success"
                      />
                    ) : (
                      <Chip
                        icon={<CancelIcon />}
                        label={t('common.disabled')}
                        size="small"
                        color="default"
                      />
                    )}
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="body2" color="text.secondary">
                      {formatTime(config.created_at)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                      <Tooltip title={t('common.edit')}>
                        <IconButton
                          size="small"
                          color="info"
                          onClick={() => handleOpenDialog(config)}
                        >
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t('common.delete')}>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDelete(config.id!)}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* 创建/编辑对话框 */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingConfig ? t('settings.approvalConfig.editConfig') : t('settings.approvalConfig.addConfig')}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            {/* 基础配置 */}
            <Typography variant="subtitle1" fontWeight="600">
              {t('settings.approvalConfig.basicConfig')}
            </Typography>

            <TextField
              fullWidth
              label={t('settings.approvalConfig.configName')}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />

            <FormControl fullWidth>
              <InputLabel>{t('settings.approvalConfig.platformType')}</InputLabel>
              <Select
                value={formData.type}
                label={t('settings.approvalConfig.platformType')}
                onChange={(e) => handlePlatformChange(e.target.value as any)}
              >
                <MenuItem value="feishu">{t('settings.approvalConfig.platforms.feishu')}</MenuItem>
                <MenuItem value="dingtalk">{t('settings.approvalConfig.platforms.dingtalk')}</MenuItem>
                <MenuItem value="wechat">{t('settings.approvalConfig.platforms.wechat')}</MenuItem>
              </Select>
            </FormControl>

            <TextField
              fullWidth
              label={t('settings.approvalConfig.appId')}
              value={formData.app_id}
              onChange={(e) => setFormData({ ...formData, app_id: e.target.value })}
              required
              helperText={t('settings.approvalConfig.appIdHelper')}
            />

            <TextField
              fullWidth
              label={t('settings.approvalConfig.appSecret')}
              type="password"
              value={formData.app_secret}
              onChange={(e) => setFormData({ ...formData, app_secret: e.target.value })}
              required
              helperText={editingConfig ? t('settings.approvalConfig.appSecretHelperEdit') : t('settings.approvalConfig.appSecretHelper')}
              placeholder={editingConfig ? t('settings.approvalConfig.appSecretPlaceholder') : ''}
            />

            {/* 平台特定配置 */}
            {formData.type === 'feishu' && (
              <TextField
                fullWidth
                label={t('settings.approvalConfig.approvalCode')}
                value={formData.approval_code}
                onChange={(e) => setFormData({ ...formData, approval_code: e.target.value })}
                required
                helperText={t('settings.approvalConfig.approvalCodeHelper')}
              />
            )}

            {formData.type === 'dingtalk' && (
              <TextField
                fullWidth
                label={t('settings.approvalConfig.processCode')}
                value={formData.process_code}
                onChange={(e) => setFormData({ ...formData, process_code: e.target.value })}
                required
                helperText={t('settings.approvalConfig.processCodeHelper')}
              />
            )}

            {formData.type === 'wechat' && (
              <TextField
                fullWidth
                label={t('settings.approvalConfig.templateId')}
                value={formData.template_id}
                onChange={(e) => setFormData({ ...formData, template_id: e.target.value })}
                required
                helperText={t('settings.approvalConfig.templateIdHelper')}
              />
            )}

            <Divider />

            {/* 外部链接配置 */}
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle1" fontWeight="600">
                  {t('settings.approvalConfig.apiConfig.title')}
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={2}>
                  <TextField
                    fullWidth
                    label={t('settings.approvalConfig.apiConfig.apiBaseUrl')}
                    value={formData.api_base_url || ''}
                    onChange={(e) => setFormData({ ...formData, api_base_url: e.target.value })}
                    helperText={t('settings.approvalConfig.apiConfig.apiBaseUrlHelper')}
                    placeholder="https://open.larksuite.com/open-apis"
                  />
                  <Box>
                    <TextField
                      fullWidth
                      label={t('settings.approvalConfig.apiConfig.callbackUrl')}
                      value={formData.callback_url || ''}
                      onChange={(e) => setFormData({ ...formData, callback_url: e.target.value })}
                      helperText={t('settings.approvalConfig.apiConfig.callbackUrlHelper')}
                      placeholder="https://your-domain.com/api/approvals/callback/feishu"
                    />
                    <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => {
                          const baseUrl = window.location.origin;
                          const callbackPath = `/api/approvals/callback/${formData.type}`;
                          setFormData({ ...formData, callback_url: baseUrl + callbackPath });
                        }}
                      >
                        {t('settings.approvalConfig.apiConfig.autoGenerateCallbackUrl')}
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        color="info"
                        onClick={() => {
                          if (formData.callback_url) {
                            navigator.clipboard.writeText(formData.callback_url);
                            alert(t('settings.approvalConfig.apiConfig.callbackUrlCopied'));
                          }
                        }}
                        disabled={!formData.callback_url}
                      >
                        {t('settings.approvalConfig.apiConfig.copyCallbackUrl')}
                      </Button>
                    </Box>
                  </Box>
                </Stack>
              </AccordionDetails>
            </Accordion>

            {/* 审批人配置 */}
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle1" fontWeight="600">
                  {t('settings.approvalConfig.approverConfig.title')}
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={2}>
                  <TextField
                    fullWidth
                    label={t('settings.approvalConfig.approverConfig.approverUserIds')}
                    value={formData.approver_user_ids || ''}
                    onChange={(e) => setFormData({ ...formData, approver_user_ids: e.target.value })}
                    helperText={t('settings.approvalConfig.approverConfig.approverUserIdsHelper')}
                    placeholder='["user1", "user2", "user3"]'
                    multiline
                    rows={3}
                  />
                </Stack>
              </AccordionDetails>
            </Accordion>

            {/* 表单字段映射 */}
            <Accordion defaultExpanded>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle1" fontWeight="600">
                  {t('settings.approvalConfig.formFields')}
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={2}>
                  <Alert severity="info">
                    {t('settings.approvalConfig.formFieldsHelper')}
                  </Alert>
                  
                  <TextField
                    fullWidth
                    label={t('settings.approvalConfig.formFieldsJson')}
                    value={formData.form_fields}
                    onChange={(e) => setFormData({ ...formData, form_fields: e.target.value })}
                    multiline
                    rows={12}
                    required
                    sx={{
                      fontFamily: 'monospace',
                      '& textarea': {
                        fontFamily: 'monospace',
                        fontSize: '0.875rem',
                      },
                    }}
                  />

                  {/* 显示格式示例 */}
                  <Accordion>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Typography variant="body2" color="primary">
                        {t('settings.approvalConfig.viewExample')}
                      </Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Box sx={{ bgcolor: '#f5f5f5', p: 2, borderRadius: 1, fontFamily: 'monospace', fontSize: '0.75rem', overflow: 'auto' }}>
                        <pre style={{ margin: 0 }}>
                          {formData.type === 'feishu' && defaultFormFields.feishu}
                          {formData.type === 'dingtalk' && defaultFormFields.dingtalk}
                          {formData.type === 'wechat' && defaultFormFields.wechat}
                        </pre>
                      </Box>
                    </AccordionDetails>
                  </Accordion>
                </Stack>
              </AccordionDetails>
            </Accordion>

            <FormControlLabel
              control={
                <Switch
                  checked={formData.enabled}
                  onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                />
              }
              label={t('settings.approvalConfig.enableConfig')}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!formData.name || !formData.app_id || !formData.app_secret}
          >
            {editingConfig ? t('common.save') : t('common.create')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

