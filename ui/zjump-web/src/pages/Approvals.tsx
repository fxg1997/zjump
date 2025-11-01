import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Chip,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Tabs,
  Tab,
  Stack,
  Tooltip,
  Badge,
  Alert,
  Divider,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Autocomplete,
  CircularProgress,
} from '@mui/material';
import {
  Add as AddIcon,
  CheckCircle as ApproveIcon,
  Cancel as RejectIcon,
  Delete as CancelIcon,
  Visibility as ViewIcon,
  Comment as CommentIcon,
  AccessTime as PendingIcon,
  Done as DoneIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { 
  approvalApi,
  authApi,
  showSuccessToast,
  Approval, 
  ApprovalComment,
  ApprovalType,
  ApprovalStatus,
  ApprovalPlatform,
} from '../api/api';
import { useTranslation } from 'react-i18next';

export default function Approvals() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(0); // 0: 我的申请, 1: 待我审批, 2: 全部
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [, setLoading] = useState(false);
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [openDetailDialog, setOpenDetailDialog] = useState(false);
  const [selectedApproval, setSelectedApproval] = useState<Approval | null>(null);
  const [comments, setComments] = useState<ApprovalComment[]>([]);
  const [stats, setStats] = useState<any>(null);
  
  // 工单平台配置（支持多个）
  const [enabledPlatforms, setEnabledPlatforms] = useState<Array<{
    id: string;
    type: ApprovalPlatform;
    name: string;
  }>>([]);
  const [selectedPlatform, setSelectedPlatform] = useState<string>(''); // 选中的平台ID
  
  // 表单数据
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'host_access' as ApprovalType,
    resource_type: 'host',
    resource_ids: [] as string[],
    resource_names: [] as string[],
    duration: 24,
    reason: '',
  });

  // 搜索数据
  const [hostSearchKeyword, setHostSearchKeyword] = useState('');
  const [searchedHosts, setSearchedHosts] = useState<any[]>([]);
  const [selectedHosts, setSelectedHosts] = useState<any[]>([]);  // 已选择的主机
  const [loadingHosts, setLoadingHosts] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [hasApprovalPermission, setHasApprovalPermission] = useState(false);

  // 审批操作对话框
  const [openApproveDialog, setOpenApproveDialog] = useState(false);
  const [openRejectDialog, setOpenRejectDialog] = useState(false);
  const [approvalNote, setApprovalNote] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [newComment, setNewComment] = useState('');

  // 加载启用的工单平台配置（支持多个）
  const loadEnabledPlatforms = async () => {
    try {
      const data = await approvalApi.getApprovalConfig();
      // 获取所有启用的配置
      const enabled = (data.configs || [])
        .filter((c: any) => c.enabled)
        .map((c: any) => ({
          id: c.id,
          type: c.type,
          name: c.name,
        }));
      setEnabledPlatforms(enabled);
      // 如果只有一个，自动选中
      if (enabled.length === 1) {
        setSelectedPlatform(enabled[0].id);
      }
    } catch (error) {
      console.error('获取工单平台配置失败:', error);
      setEnabledPlatforms([]);
    }
  };

  useEffect(() => {
    loadCurrentUser();
    loadEnabledPlatforms();
  }, []);

  useEffect(() => {
    if (currentUser) {
      loadApprovals();
      loadStats();
    }
  }, [activeTab, currentUser]);

  const loadCurrentUser = async () => {
    try {
      const user = await authApi.getCurrentUser();
      console.log('当前用户信息:', user);
      setCurrentUser(user);
      
      // 检查用户是否有审批权限（管理员或有待审批工单的用户）
      await checkApprovalPermission(user.id);
    } catch (error) {
      console.error('获取当前用户失败:', error);
      // 不要立即alert，让用户有机会重试
    }
  };

  const checkApprovalPermission = async (userId: string) => {
    try {
      // 检查用户是否有待审批的工单，如果有则说明有审批权限
      const data = await approvalApi.getApprovals({
        user_id: userId,
        role: 'approve',
      });
      setHasApprovalPermission(data.approvals && data.approvals.length > 0);
    } catch (error) {
      console.error('检查审批权限失败:', error);
      setHasApprovalPermission(false);
    }
  };

  // 搜索主机
  const searchHosts = async (keyword: string) => {
    if (!keyword || keyword.trim().length === 0) {
      setSearchedHosts([]);
      return;
    }

    try {
      setLoadingHosts(true);
      const data = await approvalApi.searchHosts(keyword.trim());
      setSearchedHosts(data.hosts || []);
    } catch (error) {
      console.error('搜索主机失败:', error);
      setSearchedHosts([]);
    } finally {
      setLoadingHosts(false);
    }
  };

  // 防抖搜索主机
  useEffect(() => {
    const timer = setTimeout(() => {
      if (hostSearchKeyword && hostSearchKeyword.trim().length > 0) {
        searchHosts(hostSearchKeyword);
      } else {
        setSearchedHosts([]);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [hostSearchKeyword]);

  const loadApprovals = async () => {
    if (!currentUser) return;

    try {
      setLoading(true);
      let role: 'my' | 'approve' | 'all' = 'my';
      
      // 根据是否有审批权限调整标签页索引
      if (hasApprovalPermission) {
        // 有审批权限：0=我的申请, 1=待我审批, 2=全部
        if (activeTab === 1) role = 'approve';
        else if (activeTab === 2) role = 'all';
      } else {
        // 无审批权限：0=我的申请, 1=全部
        if (activeTab === 1) role = 'all';
      }

      const data = await approvalApi.getApprovals({
        user_id: currentUser.id,
        role,
      });
      setApprovals(data.approvals || []);
    } catch (error) {
      console.error('加载审批列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    if (!currentUser) return;

    try {
      const data = await approvalApi.getApprovalStats(currentUser.id);
      setStats(data);
    } catch (error) {
      console.error('加载统计失败:', error);
    }
  };

  const handleCreateApproval = async () => {
    // 验证工单平台
    if (enabledPlatforms.length === 0) {
      alert('系统未配置工单平台，请联系管理员在"系统设置 > 工单配置"中启用平台');
      return;
    }

    if (!selectedPlatform) {
      alert('请选择工单平台');
      return;
    }

    // 验证表单
    if (!formData.title) {
      alert('请填写工单标题');
      return;
    }

    if (!formData.resource_ids.length) {
      alert('请选择至少一个资源');
      return;
    }

    if (!formData.reason) {
      alert('请填写申请理由');
      return;
    }

    // 检查用户信息
    if (!currentUser || !currentUser.id) {
      alert('用户信息未加载，请刷新页面重试');
      await loadCurrentUser();
      return;
    }

    // 获取选中平台的类型
    const platform = enabledPlatforms.find(p => p.id === selectedPlatform);
    if (!platform) {
      alert('未找到选中的工单平台');
      return;
    }

    try {
      await approvalApi.createApproval({
        ...formData,
        platform: platform.type,
        applicant_id: currentUser.id,
        applicant_name: currentUser.username || currentUser.fullName,
        applicant_email: currentUser.email,
      });
      
      showSuccessToast(t('approvals.messages.createSuccess'));
      setOpenCreateDialog(false);
      resetForm();
      loadApprovals();
      loadStats();
    } catch (error) {
      console.error('创建审批失败:', error);
    }
  };

  const handleViewDetail = async (approval: Approval) => {
    setSelectedApproval(approval);
    try {
      const data = await approvalApi.getApproval(approval.id);
      setSelectedApproval(data.approval);
      setComments(data.comments || []);
      setOpenDetailDialog(true);
    } catch (error) {
      console.error('加载详情失败:', error);
    }
  };

  const handleApprove = async () => {
    if (!selectedApproval || !currentUser) return;

    try {
      await approvalApi.approveApproval(selectedApproval.id, {
        approver_id: currentUser.id,
        approver_name: currentUser.username || currentUser.fullName,
        comment: approvalNote,
      });
      
      showSuccessToast(t('approvals.messages.approveSuccess'));
      setOpenApproveDialog(false);
      setOpenDetailDialog(false);
      setApprovalNote('');
      loadApprovals();
      loadStats();
    } catch (error) {
      console.error('批准失败:', error);
    }
  };

  const handleReject = async () => {
    if (!selectedApproval || !rejectReason || !currentUser) {
      alert(t('approvals.form.rejectReasonRequired'));
      return;
    }

    try {
      await approvalApi.rejectApproval(selectedApproval.id, {
        approver_id: currentUser.id,
        approver_name: currentUser.username || currentUser.fullName,
        reason: rejectReason,
      });
      
      showSuccessToast(t('approvals.messages.rejectSuccess'));
      setOpenRejectDialog(false);
      setOpenDetailDialog(false);
      setRejectReason('');
      loadApprovals();
      loadStats();
    } catch (error) {
      console.error('拒绝失败:', error);
    }
  };

  const handleCancel = async (approval: Approval) => {
    if (!currentUser || !confirm(t('approvals.messages.cancelConfirm'))) return;

    try {
      await approvalApi.cancelApproval(approval.id, {
        user_id: currentUser.id,
      });
      
      showSuccessToast(t('approvals.messages.cancelSuccess'));
      loadApprovals();
      loadStats();
    } catch (error) {
      console.error('取消失败:', error);
    }
  };

  const handleAddComment = async () => {
    if (!selectedApproval || !newComment.trim() || !currentUser) return;

    try {
      await approvalApi.addComment(selectedApproval.id, {
        user_id: currentUser.id,
        user_name: currentUser.username || currentUser.fullName,
        comment: newComment,
      });
      
      showSuccessToast(t('approvals.messages.commentSuccess'));
      setNewComment('');
      
      // 重新加载详情
      const data = await approvalApi.getApproval(selectedApproval.id);
      setComments(data.comments || []);
    } catch (error) {
      console.error('添加评论失败:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      type: 'host_access' as ApprovalType,
      resource_type: 'host',
      resource_ids: [],
      resource_names: [],
      duration: 24,
      reason: '',
    });
    setHostSearchKeyword('');
    setSearchedHosts([]);
    setSelectedHosts([]);
  };

  const getPlatformLabel = (platform: ApprovalPlatform | string | null) => {
    if (!platform) return '-';
    return t(`approvals.platforms.${platform}`);
  };

  const getStatusColor = (status: ApprovalStatus) => {
    const colors = {
      pending: 'warning',
      approved: 'success',
      rejected: 'error',
      canceled: 'default',
      expired: 'default',
    };
    return colors[status] as any;
  };

  const getStatusIcon = (status: ApprovalStatus) => {
    const icons = {
      pending: <PendingIcon />,
      approved: <DoneIcon />,
      rejected: <CloseIcon />,
      canceled: <CancelIcon />,
      expired: <PendingIcon />,
    };
    return icons[status];
  };

  const getActionIcon = (action: string) => {
    const icons: Record<string, any> = {
      submit: <AddIcon fontSize="small" />,
      approve: <ApproveIcon fontSize="small" />,
      reject: <RejectIcon fontSize="small" />,
      cancel: <CancelIcon fontSize="small" />,
      comment: <CommentIcon fontSize="small" />,
    };
    return icons[action] || <CommentIcon fontSize="small" />;
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" component="h1">
            {t('approvals.title')}
          </Typography>
          <Typography variant="body2" color="textSecondary">
            {t('approvals.subtitle')}
          </Typography>
        </Box>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={() => {
            resetForm();
            setOpenCreateDialog(true);
          }}
          disabled={enabledPlatforms.length === 0}
        >
          {t('approvals.createApproval')}
        </Button>
        {enabledPlatforms.length === 0 && (
          <Typography variant="caption" color="error" sx={{ ml: 2 }}>
            未配置工单平台
          </Typography>
        )}
      </Box>

      {/* 统计卡片 */}
      {stats && (
        <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          <Card sx={{ flex: hasApprovalPermission ? '1 1 calc(25% - 12px)' : '1 1 calc(33.33% - 12px)', minWidth: '200px' }}>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                {t('approvals.stats.total')}
              </Typography>
              <Typography variant="h4">
                {stats.my_approvals?.total || 0}
              </Typography>
            </CardContent>
          </Card>
          <Card sx={{ flex: hasApprovalPermission ? '1 1 calc(25% - 12px)' : '1 1 calc(33.33% - 12px)', minWidth: '200px' }}>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                {t('approvals.stats.pending')}
              </Typography>
              <Typography variant="h4" color="warning.main">
                {stats.my_approvals?.pending || 0}
              </Typography>
            </CardContent>
          </Card>
          <Card sx={{ flex: hasApprovalPermission ? '1 1 calc(25% - 12px)' : '1 1 calc(33.33% - 12px)', minWidth: '200px' }}>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                {t('approvals.stats.approved')}
              </Typography>
              <Typography variant="h4" color="success.main">
                {stats.my_approvals?.approved || 0}
              </Typography>
            </CardContent>
          </Card>
          {hasApprovalPermission && (
            <Card sx={{ flex: '1 1 calc(25% - 12px)', minWidth: '200px' }}>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  {t('approvals.pendingApprovals')}
                </Typography>
                <Typography variant="h4" color="info.main">
                  {stats.pending_approvals || 0}
                </Typography>
              </CardContent>
            </Card>
          )}
        </Box>
      )}

      {/* 标签页 */}
      <Card>
        <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)}>
          <Tab 
            label={
              <Badge badgeContent={stats?.my_approvals?.pending || 0} color="warning">
                {t('approvals.myApprovals')}
              </Badge>
            } 
          />
          {hasApprovalPermission && (
            <Tab 
              label={
                <Badge badgeContent={stats?.pending_approvals || 0} color="error">
                  {t('approvals.pendingApprovals')}
                </Badge>
              } 
            />
          )}
          <Tab label={t('approvals.allApprovals')} />
        </Tabs>

        <CardContent>
          <TableContainer component={Paper} elevation={0}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>{t('approvals.table.title')}</TableCell>
                  <TableCell>{t('approvals.table.type')}</TableCell>
                  <TableCell>{t('approvals.table.status')}</TableCell>
                  {activeTab !== 0 && <TableCell>{t('approvals.table.applicant')}</TableCell>}
                  <TableCell>{t('approvals.table.createdAt')}</TableCell>
                  <TableCell align="center">{t('common.actions')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {approvals.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 8 }}>
                      <Typography color="textSecondary">
                        {hasApprovalPermission && activeTab === 1
                          ? t('approvals.messages.noPendingApprovals')
                          : t('approvals.messages.noApprovals')}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  approvals.map((approval) => (
                    <TableRow key={approval.id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight="bold">
                          {approval.title}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={t('approvals.types.' + approval.type)}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          icon={getStatusIcon(approval.status)}
                          label={t('approvals.status.' + approval.status)}
                          color={getStatusColor(approval.status)}
                          size="small"
                        />
                      </TableCell>
                      {activeTab !== 0 && (
                        <TableCell>
                          {approval.applicant?.username || approval.applicant_name}
                        </TableCell>
                      )}
                      <TableCell>
                        {new Date(approval.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell align="center">
                        <Stack direction="row" spacing={1} justifyContent="center">
                          <Tooltip title={t('approvals.approvalDetails')}>
                            <IconButton
                              size="small"
                              onClick={() => handleViewDetail(approval)}
                            >
                              <ViewIcon />
                            </IconButton>
                          </Tooltip>
                          {activeTab === 0 && approval.status === 'pending' && (
                            <Tooltip title={t('approvals.cancel')}>
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleCancel(approval)}
                              >
                                <CancelIcon />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* 创建工单对话框 */}
      <Dialog 
        open={openCreateDialog} 
        onClose={() => {
          setOpenCreateDialog(false);
          resetForm();
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{t('approvals.createApproval')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            {/* 工单平台选择 */}
            {enabledPlatforms.length === 0 ? (
              <Alert severity="warning" sx={{ mb: 1 }}>
                {t('approvals.form.noPlatformConfigured')}
              </Alert>
            ) : (
              <FormControl fullWidth required>
                <InputLabel>{t('approvals.form.platform')}</InputLabel>
                <Select
                  value={selectedPlatform}
                  label={t('approvals.form.platform')}
                  onChange={(e) => setSelectedPlatform(e.target.value)}
                >
                  {enabledPlatforms.map((platform) => (
                    <MenuItem key={platform.id} value={platform.id}>
                      {getPlatformLabel(platform.type)} - {platform.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            <TextField
              fullWidth
              label={t('approvals.form.title')}
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder={t('approvals.form.titlePlaceholder')}
              required
            />

            <TextField
              fullWidth
              label={t('approvals.form.description')}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder={t('approvals.form.descriptionPlaceholder')}
              multiline
              rows={2}
            />

            <FormControl fullWidth>
              <InputLabel>{t('approvals.form.type')}</InputLabel>
              <Select
                value={formData.type}
                label={t('approvals.form.type')}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as ApprovalType })}
              >
                <MenuItem value="host_access">{t('approvals.types.hostAccess')}</MenuItem>
                <MenuItem value="host_group_access">{t('approvals.types.hostGroupAccess')}</MenuItem>
              </Select>
            </FormControl>

            <Autocomplete
              multiple
              freeSolo={false}
              options={searchedHosts}
              getOptionLabel={(option: any) => `${option.name} (${option.ip})`}
              isOptionEqualToValue={(option: any, value: any) => option.id === value.id}
              value={selectedHosts}
              onChange={(_, newValue) => {
                setSelectedHosts(newValue);
                const ids = newValue.map((v: any) => v.id);
                const names = newValue.map((v: any) => v.name);
                setFormData({
                  ...formData,
                  resource_ids: ids,
                  resource_names: names,
                });
                // 选中后清空搜索关键字
                setHostSearchKeyword('');
              }}
              inputValue={hostSearchKeyword}
              onInputChange={(_, newInputValue, reason) => {
                if (reason === 'input') {
                  setHostSearchKeyword(newInputValue);
                } else if (reason === 'clear') {
                  setHostSearchKeyword('');
                }
              }}
              loading={loadingHosts}
              noOptionsText={hostSearchKeyword ? t('approvals.form.noHostsFound') : t('approvals.form.enterHostSearch')}
              filterOptions={(x) => x}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={t('approvals.form.selectResource')}
                  placeholder={t('approvals.form.searchPlaceholder')}
                  required={formData.resource_ids.length === 0}
                  helperText={t('approvals.form.searchHelperText')}
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {loadingHosts ? <CircularProgress color="inherit" size={20} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
              renderTags={(value, getTagProps) =>
                value.map((option: any, index) => (
                  <Chip
                    label={`${option.name} (${option.ip})`}
                    {...getTagProps({ index })}
                    size="small"
                  />
                ))
              }
            />

            <TextField
              fullWidth
              type="number"
              label={t('approvals.form.durationLabel')}
              value={formData.duration}
              onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
              helperText={t('approvals.form.durationHelper')}
              InputProps={{
                endAdornment: t('approvals.form.durationHours'),
              }}
            />

            <TextField
              fullWidth
              label={t('approvals.form.reasonLabel')}
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              placeholder={t('approvals.form.reasonPlaceholder')}
              multiline
              rows={4}
              required
              helperText={t('approvals.form.reasonHelper')}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setOpenCreateDialog(false);
            resetForm();
          }}>{t('common.cancel')}</Button>
          <Button 
            onClick={handleCreateApproval} 
            variant="contained" 
            color="primary"
            disabled={enabledPlatforms.length === 0 || !selectedPlatform}
          >
            {t('approvals.actions.submit')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 详情对话框 */}
      <Dialog 
        open={openDetailDialog} 
        onClose={() => setOpenDetailDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">{t('approvals.approvalDetails')}</Typography>
            {selectedApproval && (
              <Chip
                icon={getStatusIcon(selectedApproval.status)}
                label={t('approvals.status.' + selectedApproval.status)}
                color={getStatusColor(selectedApproval.status)}
              />
            )}
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {selectedApproval && (
            <Box display="flex" flexDirection="column" gap={3}>
              <Box>
                <Typography variant="h6" gutterBottom>
                  {selectedApproval.title}
                </Typography>
                {selectedApproval.description && (
                  <Typography variant="body2" color="textSecondary" paragraph>
                    {selectedApproval.description}
                  </Typography>
                )}
              </Box>

              <Box display="flex" flexDirection="column" gap={2}>
                <Box display="flex" justifyContent="space-between">
                  <Box>
                    <Typography variant="caption" color="textSecondary">
                      {t('approvals.approvalType')}
                    </Typography>
                    <Typography>
                      {t('approvals.types.' + selectedApproval.type)}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="textSecondary">
                      {t('approvals.applicant')}
                    </Typography>
                    <Typography>
                      {selectedApproval.applicant?.username || selectedApproval.applicant_name}
                    </Typography>
                  </Box>
                </Box>

                {selectedApproval.resource_names && selectedApproval.resource_names.length > 0 && (
                  <Box>
                    <Typography variant="caption" color="textSecondary" display="block" gutterBottom>
                      {t('approvals.resources')}
                    </Typography>
                    <Box display="flex" flexWrap="wrap" gap={0.5}>
                      {selectedApproval.resource_names.map((name, idx) => (
                        <Chip key={idx} label={name} size="small" variant="outlined" />
                      ))}
                    </Box>
                  </Box>
                )}

                <Box display="flex" justifyContent="space-between">
                  {selectedApproval.duration && (
                    <Box>
                      <Typography variant="caption" color="textSecondary">
                        {t('approvals.duration')}
                      </Typography>
                      <Typography>
                        {selectedApproval.duration} {t('approvals.form.durationHours')}
                      </Typography>
                    </Box>
                  )}

                  {selectedApproval.expires_at && (
                    <Box>
                      <Typography variant="caption" color="textSecondary">
                        {t('approvals.expirationTime')}
                      </Typography>
                      <Typography>
                        {new Date(selectedApproval.expires_at).toLocaleString()}
                      </Typography>
                    </Box>
                  )}
                </Box>
              </Box>

              <Divider />

              <Box>
                <Typography variant="caption" color="textSecondary" display="block" gutterBottom>
                  {t('approvals.reason')}
                </Typography>
                <Alert severity="info" sx={{ mt: 1 }}>
                  {selectedApproval.reason}
                </Alert>
              </Box>

              {selectedApproval.approval_note && (
                <Box>
                  <Typography variant="caption" color="textSecondary" display="block" gutterBottom>
                    {t('approvals.approvalNote')}
                  </Typography>
                  <Alert severity="success" sx={{ mt: 1 }}>
                    {selectedApproval.approval_note}
                  </Alert>
                </Box>
              )}

              {selectedApproval.reject_reason && (
                <Box>
                  <Typography variant="caption" color="textSecondary" display="block" gutterBottom>
                    {t('approvals.rejectReason')}
                  </Typography>
                  <Alert severity="error" sx={{ mt: 1 }}>
                    {selectedApproval.reject_reason}
                  </Alert>
                </Box>
              )}


              <Box>
                <Divider />
                <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                  {t('approvals.history')}
                </Typography>
                <List sx={{ mt: 2 }}>
                  {comments.map((comment) => (
                    <ListItem 
                      key={comment.id}
                      alignItems="flex-start"
                      sx={{
                        borderLeft: 3,
                        borderColor: comment.action === 'approve' ? 'success.main' : comment.action === 'reject' ? 'error.main' : 'primary.main',
                        pl: 2,
                        mb: 2,
                        bgcolor: 'background.paper',
                      }}
                    >
                      <ListItemAvatar>
                        <Avatar 
                          sx={{ 
                            bgcolor: comment.action === 'approve' ? 'success.main' : comment.action === 'reject' ? 'error.main' : 'primary.main' 
                          }}
                        >
                          {getActionIcon(comment.action)}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={
                          <Box>
                            <Typography variant="body2" fontWeight="bold" component="span">
                              {comment.user_name || comment.user_id}
                            </Typography>
                            <Chip 
                              label={t('approvals.actions.' + comment.action)}
                              size="small"
                              sx={{ ml: 1 }}
                              color={comment.action === 'approve' ? 'success' : comment.action === 'reject' ? 'error' : 'primary'}
                            />
                          </Box>
                        }
                        secondary={
                          <Box sx={{ mt: 0.5 }}>
                            {comment.comment && (
                              <Typography variant="body2" color="textSecondary" paragraph sx={{ mb: 0.5 }}>
                                {comment.comment}
                              </Typography>
                            )}
                            <Typography variant="caption" color="textSecondary">
                              {new Date(comment.created_at).toLocaleString()}
                            </Typography>
                          </Box>
                        }
                      />
                    </ListItem>
                  ))}
                  {comments.length === 0 && (
                    <Typography variant="body2" color="textSecondary" align="center" sx={{ py: 4 }}>
                      {t('approvals.messages.noApprovals')}
                    </Typography>
                  )}
                </List>
              </Box>

              {/* 添加评论 */}
              <Box>
                <Divider sx={{ mb: 2 }} />
                <TextField
                  fullWidth
                  label={t('approvals.addComment')}
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder={t('approvals.form.commentPlaceholder')}
                  multiline
                  rows={2}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleAddComment();
                    }
                  }}
                  InputProps={{
                    endAdornment: (
                      <Button 
                        onClick={handleAddComment}
                        disabled={!newComment.trim()}
                      >
                        {t('approvals.comment')}
                      </Button>
                    ),
                  }}
                />
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDetailDialog(false)}>{t('common.close')}</Button>
          {selectedApproval && selectedApproval.status === 'pending' && 
           hasApprovalPermission && activeTab === 1 && (
            <>
              <Button 
                onClick={() => setOpenRejectDialog(true)}
                color="error"
                startIcon={<RejectIcon />}
              >
                {t('approvals.reject')}
              </Button>
              <Button 
                onClick={() => setOpenApproveDialog(true)}
                variant="contained"
                color="success"
                startIcon={<ApproveIcon />}
              >
                {t('approvals.approve')}
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      {/* 批准对话框 */}
      <Dialog open={openApproveDialog} onClose={() => setOpenApproveDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('approvals.approve')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="info">
              {t('approvals.messages.approveConfirm')}
            </Alert>
            <TextField
              fullWidth
              label={t('approvals.form.noteLabel')}
              value={approvalNote}
              onChange={(e) => setApprovalNote(e.target.value)}
              placeholder={t('approvals.form.notePlaceholder')}
              multiline
              rows={4}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenApproveDialog(false)}>{t('common.cancel')}</Button>
          <Button onClick={handleApprove} variant="contained" color="success">
            {t('approvals.approve')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 拒绝对话框 */}
      <Dialog open={openRejectDialog} onClose={() => setOpenRejectDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('approvals.reject')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="warning">
              {t('approvals.messages.rejectConfirm')}
            </Alert>
            <TextField
              fullWidth
              label={t('approvals.form.rejectReasonLabel')}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={t('approvals.form.rejectReasonPlaceholder')}
              multiline
              rows={4}
              required
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenRejectDialog(false)}>{t('common.cancel')}</Button>
          <Button onClick={handleReject} variant="contained" color="error">
            {t('approvals.reject')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

