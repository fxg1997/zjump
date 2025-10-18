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
  Alert,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Tooltip,
  Switch,
  FormControlLabel,
  Stack,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Warning as WarningIcon,
  Security as SecurityIcon,
  Person as PersonIcon,
} from '@mui/icons-material';
import { blacklistApi, BlacklistRule, userApi, showSuccessToast } from '../api/api';
import { useTranslation } from 'react-i18next';

export default function Blacklist() {
  const { t } = useTranslation();
  const [rules, setRules] = useState<BlacklistRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [newRule, setNewRule] = useState<Partial<BlacklistRule>>({
    command: '',
    pattern: '',
    description: '',
    scope: 'global',
    users: [],
    enabled: true,
  });

  // 预定义的危险命令模板
  const dangerousCommands = [
    { command: 'rm', pattern: 'rm', description: '删除文件' },
    { command: 'rm -rf', pattern: 'rm -rf *', description: '递归强制删除' },
    // { command: 'dd', pattern: 'dd', description: '磁盘操作' },
    // { command: 'mkfs', pattern: 'mkfs', description: '格式化磁盘' },
    // { command: 'fdisk', pattern: 'fdisk', description: '分区操作' },
    { command: 'reboot', pattern: 'reboot', description: '重启系统' },
    { command: 'shutdown', pattern: 'shutdown', description: '关机' },
    { command: 'halt', pattern: 'halt', description: '停机' },
    { command: 'init 0', pattern: 'init 0', description: '关机' },
    { command: 'init 6', pattern: 'init 6', description: '重启' },
    // { command: 'chmod 777', pattern: 'chmod 777', description: '修改权限为777' },
    // { command: 'chown', pattern: 'chown', description: '修改文件所有者' },
    // { command: '> /dev/sda', pattern: '> /dev/*', description: '写入设备文件' },
  ];

  useEffect(() => {
    fetchRules();
    fetchUsers();
  }, []);

  const fetchRules = async () => {
    try {
      setLoading(true);
      const data = await blacklistApi.getRules();
      setRules(data.rules || []);
    } catch (error) {
      console.error('获取黑名单失败:', error);
      setRules([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const data = await userApi.getUsers();
      setUsers(data.users || []);
    } catch (error) {
      console.error('获取用户列表失败:', error);
      setUsers([]);
    }
  };

  const handleAddRule = async () => {
    if (!newRule.command || !newRule.pattern) {
      alert('请填写命令和模式！');
      return;
    }

    try {
      await blacklistApi.createRule(newRule as Omit<BlacklistRule, 'id' | 'createdAt' | 'updatedAt'>);
      showSuccessToast('黑名单规则添加成功！');
      fetchRules();
      setOpenDialog(false);
      setNewRule({
        command: '',
        pattern: '',
        description: '',
        scope: 'global',
        users: [],
        enabled: true,
      });
    } catch (error) {
      console.error('添加黑名单失败:', error);
      // 错误提示已经在 axios 拦截器中处理
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm('确定要删除这条规则吗？')) return;

    try {
      await blacklistApi.deleteRule(id);
      showSuccessToast('黑名单规则已删除');
      fetchRules();
    } catch (error) {
      console.error('删除失败:', error);
      // 错误提示已经在 axios 拦截器中处理
    }
  };

  const handleToggleRule = async (id: string, enabled: boolean) => {
    try {
      await blacklistApi.updateRule(id, { enabled });
      showSuccessToast(`${t("blacklist.rule")} ${enabled ? t("common.enabled") : t("common.disabled")}`);
      fetchRules();
    } catch (error) {
      console.error('更新失败:', error);
      // 错误提示已经在 axios 拦截器中处理
    }
  };

  const handleQuickAdd = (template: typeof dangerousCommands[0]) => {
    setNewRule({
      ...newRule,
      command: template.command,
      pattern: template.pattern,
      description: template.description,
    });
    setOpenDialog(true);
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1">
          <SecurityIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          {t("blacklist.title")}
        </Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={() => setOpenDialog(true)}
        >
          {t("blacklist.addRule")}
        </Button>
      </Box>

      <Alert severity="warning" sx={{ mb: 3 }}>
        <Typography variant="body2">
          {t("blacklist.ruleDescription")} {t("blacklist.scopeDescription")}
        </Typography>
      </Alert>

      {/* 快速添加模板 */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            {t("blacklist.quickAdd")}
          </Typography>
          <Box display="flex" flexWrap="wrap" gap={1} mt={2}>
            {dangerousCommands.map((cmd, index) => (
              <Tooltip key={index} title={cmd.description}>
                <Chip
                  label={cmd.command}
                  icon={<WarningIcon />}
                  onClick={() => handleQuickAdd(cmd)}
                  color="warning"
                  variant="outlined"
                  sx={{ cursor: 'pointer' }}
                />
              </Tooltip>
            ))}
          </Box>
        </CardContent>
      </Card>

      {/* 黑名单规则列表 */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            {t("blacklist.currentRules")} ({rules.length})
          </Typography>
          <TableContainer component={Paper} sx={{ mt: 2 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>{t("common.status")}</TableCell>
                  <TableCell>{t("blacklist.commandName")}</TableCell>
                  <TableCell>{t("blacklist.pattern")}</TableCell>
                  <TableCell>{t("common.description")}</TableCell>
                  <TableCell>{t("blacklist.scope")}</TableCell>
                  <TableCell>{t("blacklist.restrictUsers")}</TableCell>
                  <TableCell>{t("common.createdAt")}</TableCell>
                  <TableCell align="center">{t("common.actions")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rules.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 8 }}>
                      <Typography color="textSecondary">
                        {t("blacklist.noRules")}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  rules.map((rule) => (
                    <TableRow key={rule.id} hover>
                      <TableCell>
                        <Switch
                          checked={rule.enabled}
                          onChange={(e) => handleToggleRule(rule.id, e.target.checked)}
                          color="primary"
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight="bold">
                          {rule.command}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <code style={{ 
                          backgroundColor: '#f5f5f5', 
                          padding: '4px 8px', 
                          borderRadius: '4px',
                          fontSize: '12px'
                        }}>
                          {rule.pattern}
                        </code>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="textSecondary">
                          {rule.description || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={rule.scope === 'global' ? t("blacklist.global") : t("blacklist.specificUsers")}
                          color={rule.scope === 'global' ? 'error' : 'warning'}
                          size="small"
                          icon={rule.scope === 'global' ? <SecurityIcon /> : <PersonIcon />}
                        />
                      </TableCell>
                      <TableCell>
                        {rule.scope === 'user' && rule.users && rule.users.length > 0 ? (
                          <Box display="flex" flexWrap="wrap" gap={0.5}>
                            {rule.users.map((user, idx) => (
                              <Chip key={idx} label={user} size="small" variant="outlined" />
                            ))}
                          </Box>
                        ) : (
                          <Typography variant="body2" color="textSecondary">
                            -
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="textSecondary">
                          {new Date(rule.createdAt).toLocaleString('zh-CN')}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <IconButton
                          color="error"
                          size="small"
                          onClick={() => handleDeleteRule(rule.id)}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* 添加规则对话框 */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t("blacklist.addRuleDialog")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <TextField
              fullWidth
              label={t("blacklist.commandName")}
              value={newRule.command || ''}
              onChange={(e) => setNewRule({ ...newRule, command: e.target.value })}
              placeholder={t("blacklist.commandPlaceholder")}
              helperText={t("blacklist.commandHelp")}
            />

            <TextField
              fullWidth
              label={t("blacklist.pattern")}
              value={newRule.pattern || ''}
              onChange={(e) => setNewRule({ ...newRule, pattern: e.target.value })}
              placeholder={t("blacklist.patternPlaceholder")}
              helperText={t("blacklist.patternHelp")}
            />

            <TextField
              fullWidth
              label={t("common.description")}
              value={newRule.description || ''}
              onChange={(e) => setNewRule({ ...newRule, description: e.target.value })}
              placeholder={t("blacklist.descriptionPlaceholder")}
              multiline
              rows={2}
            />

            <FormControl fullWidth>
              <InputLabel>{t("blacklist.scope")}</InputLabel>
              <Select
                value={newRule.scope || 'global'}
                label={t("blacklist.scope")}
                onChange={(e) =>
                  setNewRule({ ...newRule, scope: e.target.value as 'global' | 'user' })
                }
              >
                <MenuItem value="global">{t("blacklist.globalAllUsers")}</MenuItem>
                <MenuItem value="user">{t("blacklist.specificUsers")}</MenuItem>
              </Select>
            </FormControl>

            {newRule.scope === 'user' && (
              <FormControl fullWidth>
                <InputLabel>{t("blacklist.restrictUsers")}</InputLabel>
                <Select
                  multiple
                  value={newRule.users || []}
                  label={t("blacklist.restrictUsers")}
                  onChange={(e) =>
                    setNewRule({ ...newRule, users: e.target.value as string[] })
                  }
                  renderValue={(selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {(selected as string[]).map((value) => (
                        <Chip key={value} label={value} size="small" />
                      ))}
                    </Box>
                  )}
                >
                  {users.map((user) => (
                    <MenuItem key={user.id} value={user.username}>
                      {user.username} - {user.realname || user.email}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            <FormControlLabel
              control={
                <Switch
                  checked={newRule.enabled ?? true}
                  onChange={(e) => setNewRule({ ...newRule, enabled: e.target.checked })}
                />
              }
              label={t("blacklist.enableRule")}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>{t("common.cancel")}</Button>
          <Button onClick={handleAddRule} variant="contained" color="primary">
            {t("common.add")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

