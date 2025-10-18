import { useEffect, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  CircularProgress,
  Snackbar,
  Alert,
} from '@mui/material';
import {
  Computer as ComputerIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Terminal as TerminalIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { Host, DashboardStats, LoginRecord } from '../types';
import { dashboardApi, hostApi, sessionApi } from '../api/api';
import { useNavigate } from 'react-router-dom';
import { useTerminal } from '../contexts/TerminalContext';
import { useTranslation } from 'react-i18next';

export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { addSession } = useTerminal();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentHosts, setRecentHosts] = useState<Host[]>([]);
  const [recentLogins, setRecentLogins] = useState<LoginRecord[]>([]);
  const [connectingHostId, setConnectingHostId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [showError, setShowError] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      // 使用真实 API 获取数据
      const [statsData, frequentHosts, loginsData] = await Promise.all([
        dashboardApi.getStats(),
        dashboardApi.getFrequentHosts(5), // 获取用户最常用的5个主机
        sessionApi.getLoginRecords({ pageSize: 5 }), // 获取最近5条登录记录
      ]);
      
      setStats(statsData);
      
      // 格式化常用主机数据
      const formattedHosts = frequentHosts.map(host => ({
        ...host,
        tags: typeof host.tags === 'string' ? JSON.parse(host.tags || '[]') : host.tags,
      }));
      
      setRecentHosts(formattedHosts);
      
      // 格式化SSH会话历史记录
      console.log('Raw login records from API:', loginsData);
      const records = loginsData?.records || [];
      const formattedLogins = records.map((record: any, index: number) => {
        console.log(`Record ${index}:`, record);
        return {
          id: record.sessionId || record.session_id || `session-${index}`,
          hostId: record.hostId || record.host_id,
          hostName: record.hostName || record.host_name || 'Unknown',
          hostIp: record.hostIp || record.host_ip || '',
          username: record.username || '',
          loginTime: record.loginTime ? new Date(record.loginTime).toLocaleString('zh-CN') : 'N/A',
          status: record.status, // active 或 closed
        };
      });
      
      console.log('Formatted login records:', formattedLogins);
      setRecentLogins(formattedLogins);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      setErrorMessage(t('dashboard.loadFailed'));
      setShowError(true);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleConnectHost = async (hostId: string) => {
    setConnectingHostId(hostId);
    
    try {
      // 从当前列表中查找主机（已经加载过了）
      let host = recentHosts.find(h => h.id === hostId);
      
      // 如果列表中没有，从API获取
      if (!host) {
        host = await hostApi.getHost(hostId);
        // 解析 tags 字段
        if (host && typeof host.tags === 'string') {
          host.tags = JSON.parse(host.tags || '[]');
        }
      }
      
      if (!host) {
        setErrorMessage('未找到主机信息');
        setShowError(true);
        setConnectingHostId(null);
        return;
      }
      
      // 添加会话到 Context
      addSession(host);
      
      // 跳转到终端页面
      navigate('/terminal');
      
    } catch (error) {
      // 发生错误，显示错误消息
      const message = error instanceof Error ? error.message : t('dashboard.connectFailed');
      setErrorMessage(message);
      setShowError(true);
    } finally {
      setConnectingHostId(null);
    }
  };

  const handleCloseError = () => {
    setShowError(false);
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1">
          {t("dashboard.title")}
        </Typography>
        <IconButton onClick={loadData} color="primary">
          <RefreshIcon />
        </IconButton>
      </Box>

      {/* 统计卡片 - Flex 布局（参考 Tauri，不换行） */}
      <Box sx={{ display: 'flex', gap: 2.5, mb: 4, flexWrap: 'nowrap' }}>
        <Card 
          elevation={0}
          sx={{ 
            border: '1px solid #e2e8f0',
            height: '180px',
            flex: 1,
            minWidth: 0,
            transition: 'all 0.3s ease',
            '&:hover': {
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              transform: 'translateY(-2px)',
            },
          }}
        >
            <CardContent sx={{ 
              p: 3.5, 
              height: '100%', 
              display: 'flex', 
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary" fontWeight={500}>
                  {t("dashboard.totalHosts")}
                </Typography>
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: 2.5,
                    backgroundColor: '#ebf8ff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ComputerIcon sx={{ fontSize: 28, color: '#3182ce' }} />
                </Box>
              </Box>
              <Typography variant="h2" fontWeight="700" color="text.primary">
                {stats?.totalHosts || 0}
              </Typography>
            </CardContent>
          </Card>

        <Card 
          elevation={0}
          sx={{ 
            border: '1px solid #e2e8f0',
            height: '180px',
            flex: 1,
            minWidth: 0,
            transition: 'all 0.3s ease',
            '&:hover': {
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              transform: 'translateY(-2px)',
            },
          }}
        >
          <CardContent sx={{ 
            p: 3.5, 
            height: '100%', 
            display: 'flex', 
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary" fontWeight={500}>
                {t("dashboard.onlineHosts")}
              </Typography>
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: 2.5,
                  backgroundColor: '#f0fff4',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CheckCircleIcon sx={{ fontSize: 28, color: '#38a169' }} />
              </Box>
            </Box>
            <Typography variant="h2" fontWeight="700" color="text.primary">
              {stats?.onlineHosts || 0}
            </Typography>
          </CardContent>
        </Card>

        <Card 
          elevation={0}
          sx={{ 
            border: '1px solid #e2e8f0',
            height: '180px',
            flex: 1,
            minWidth: 0,
            transition: 'all 0.3s ease',
            '&:hover': {
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              transform: 'translateY(-2px)',
            },
          }}
        >
          <CardContent sx={{ 
            p: 3.5, 
            height: '100%', 
            display: 'flex', 
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary" fontWeight={500}>
                {t("dashboard.offlineHosts")}
              </Typography>
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: 2.5,
                  backgroundColor: '#fff5f5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CancelIcon sx={{ fontSize: 28, color: '#e53e3e' }} />
              </Box>
            </Box>
            <Typography variant="h2" fontWeight="700" color="text.primary">
              {stats?.offlineHosts || 0}
            </Typography>
          </CardContent>
        </Card>

        <Card 
          elevation={0}
          sx={{ 
            border: '1px solid #e2e8f0',
            height: '180px',
            flex: 1,
            minWidth: 0,
            transition: 'all 0.3s ease',
            '&:hover': {
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              transform: 'translateY(-2px)',
            },
          }}
        >
          <CardContent sx={{ 
            p: 3.5, 
            height: '100%', 
            display: 'flex', 
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary" fontWeight={500}>
                {t("dashboard.todayLogins")}
              </Typography>
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: 2.5,
                  backgroundColor: '#faf5ff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <TerminalIcon sx={{ fontSize: 28, color: '#805ad5' }} />
              </Box>
            </Box>
            <Typography variant="h2" fontWeight="700" color="text.primary">
              {stats?.recentLogins || 0}
            </Typography>
          </CardContent>
        </Card>
      </Box>

      {/* {t("dashboard.recentHosts")}列表 */}
      <Card 
        elevation={0}
        sx={{ 
          mb: 3,
          border: '1px solid #e2e8f0',
        }}
      >
        <CardContent sx={{ p: 0 }}>
          <Box sx={{ px: 3, py: 2.5, borderBottom: '1px solid #e2e8f0' }}>
            <Typography variant="h6" fontWeight="600" color="text.primary">
              {t("dashboard.recentHosts")}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {t('dashboard.clickToConnect')}
            </Typography>
          </Box>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, color: '#667eea' }}>{t("dashboard.hostName")}</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#667eea' }}>{t("assets.hostIP")}</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#667eea' }}>{t("dashboard.operatingSystem")}</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#667eea' }}>{t("common.status")}</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#667eea' }}>{t("dashboard.loginCount")}</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#667eea' }}>{t("dashboard.lastLogin")}</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700, color: '#667eea' }}>{t("common.actions")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {recentHosts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 8 }}>
                      <Typography variant="body1" color="text.secondary">
                        暂无主机数据，请先添加主机
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : recentHosts.map((host, index) => (
                  <TableRow 
                    key={host.id} 
                    hover
                    sx={{
                      transition: 'all 0.2s ease',
                      '&:hover': {
                        backgroundColor: 'rgba(102, 126, 234, 0.05)',
                        transform: 'scale(1.01)',
                      },
                    }}
                  >
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Box
                          sx={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            fontWeight: 700,
                            fontSize: 14,
                          }}
                        >
                          {index + 1}
                        </Box>
                        <Typography fontWeight={600}>{host.name}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={host.ip} 
                        size="small" 
                        variant="outlined"
                        sx={{ fontFamily: 'monospace', fontWeight: 600 }}
                      />
                    </TableCell>
                    <TableCell>{host.os}</TableCell>
                    <TableCell>
                      <Chip
                        label={host.status === 'online' ? t("common.online") : t("common.offline")}
                        color={host.status === 'online' ? 'success' : 'error'}
                        size="small"
                        sx={{ fontWeight: 600 }}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={host.loginCount} 
                        size="small" 
                        color="primary"
                        variant="outlined"
                        sx={{ fontWeight: 700 }}
                      />
                    </TableCell>
                    <TableCell sx={{ color: 'text.secondary' }}>{host.lastLoginTime || '-'}</TableCell>
                    <TableCell align="center">
                      <IconButton
                        size="medium"
                        onClick={() => handleConnectHost(host.id)}
                        disabled={host.status !== 'online' || connectingHostId === host.id}
                        sx={{
                          background: host.status === 'online' 
                            ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' 
                            : 'rgba(0,0,0,0.12)',
                          color: 'white',
                          '&:hover': {
                            background: host.status === 'online' 
                              ? 'linear-gradient(135deg, #764ba2 0%, #667eea 100%)' 
                              : 'rgba(0,0,0,0.12)',
                          },
                          '&:disabled': {
                            color: 'rgba(0,0,0,0.26)',
                          },
                        }}
                        title="连接终端"
                      >
                        {connectingHostId === host.id ? (
                          <CircularProgress size={20} sx={{ color: 'white' }} />
                        ) : (
                          <TerminalIcon fontSize="small" />
                        )}
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* {t("dashboard.recentLogins")} */}
      <Card 
        sx={{ 
          borderRadius: 3,
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          overflow: 'hidden',
        }}
      >
        <CardContent sx={{ p: 0 }}>
          <Box sx={{ p: 3, pb: 2, background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)' }}>
            <Typography variant="h5" fontWeight="700" color="text.primary">
              📋 {t("dashboard.recentLogins")}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {t('dashboard.recentSessionHistory')}
            </Typography>
          </Box>
          <TableContainer sx={{ px: 2, pb: 2 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, color: '#667eea' }}>{t("dashboard.hostName")}</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#667eea' }}>{t("assets.hostIP")}</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#667eea' }}>{t("assets.username")}</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#667eea' }}>{t("dashboard.loginTime")}</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#667eea' }}>{t("common.status")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {recentLogins.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 8 }}>
                      <Typography variant="body1" color="text.secondary">
                        {t('dashboard.noLoginRecords')}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : recentLogins.map((record) => (
                  <TableRow 
                    key={record.id} 
                    hover
                    sx={{
                      transition: 'all 0.2s ease',
                      '&:hover': {
                        backgroundColor: 'rgba(102, 126, 234, 0.05)',
                      },
                    }}
                  >
                    <TableCell>
                      <Typography fontWeight={600}>{record.hostName}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={record.hostIp} 
                        size="small" 
                        variant="outlined"
                        sx={{ fontFamily: 'monospace' }}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={record.username} 
                        size="small"
                        sx={{ fontWeight: 600 }}
                      />
                    </TableCell>
                    <TableCell sx={{ color: 'text.secondary' }}>{record.loginTime}</TableCell>
                    <TableCell>
                      <Chip
                        label={
                          record.status === 'active'
                            ? '🟢 进行中'
                            : record.status === 'completed'
                            ? ' 已完成'
                            : ' 异常'
                        }
                        color={
                          record.status === 'active'
                            ? 'success'
                            : record.status === 'completed'
                            ? 'default'
                            : 'error'
                        }
                        size="small"
                        sx={{ fontWeight: 600 }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* 错误提示 */}
      <Snackbar 
        open={showError} 
        autoHideDuration={6000}
        onClose={handleCloseError}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert 
          onClose={handleCloseError} 
          severity="error" 
          sx={{ 
            width: '100%',
            '& .MuiAlert-message': {
              fontSize: '1rem',
              fontWeight: 500,
            }
          }}
        >
          {errorMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
}

