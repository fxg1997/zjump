import { useEffect, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Chip,
  IconButton,
  TextField,
  InputAdornment,
  TablePagination,
  CircularProgress,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { sessionApi } from '../api/api';

interface VMLoginRecord {
  id: string;
  sessionId: string;
  hostId: string;
  hostName: string;
  hostIp: string;
  username: string;
  loginTime: string;
  logoutTime?: string;
  duration?: number;
  status: 'active' | 'completed' | 'failed';
  connectionType?: 'webshell' | 'ssh_gateway' | 'ssh_client';
}

export default function History() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<VMLoginRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const loadRecords = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await sessionApi.getLoginRecords({
        page: page + 1,
        pageSize: rowsPerPage,
      });
      
      console.log('VM Login Records Response:', data);
      
      // 检查返回数据是否有效
      if (!data || !data.records) {
        console.warn('No records returned from API, using empty array');
        setRecords([]);
        setTotal(data?.total || 0);
        setLoading(false);
        return;
      }
      
      // 确保 records 是数组
      const recordsArray = Array.isArray(data.records) ? data.records : [];
      
      // 转换数据格式，确保时间格式正确
      const formattedRecords = recordsArray.map((record: any) => ({
        id: record.id || record.sessionId || record.session_id || '',
        sessionId: record.sessionId || record.session_id || '',
        hostId: record.hostId || record.host_id || '',
        hostName: record.hostName || record.host_name || 'Unknown',
        hostIp: record.hostIp || record.host_ip || '',
        username: record.username || '',
        connectionType: record.connectionType || record.connection_type || 'webshell',
        loginTime: record.loginTime 
          ? new Date(record.loginTime).toLocaleString('zh-CN', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false
            })
          : '',
        logoutTime: record.logoutTime 
          ? new Date(record.logoutTime).toLocaleString('zh-CN', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false
            })
          : '',
        duration: record.duration || 0,
        status: record.status || 'unknown',
      }));
      
      setRecords(formattedRecords);
      setTotal(data.total || 0);
      setLoading(false);
    } catch (error: any) {
      console.error('Failed to load VM login records:', error);
      setError(t('history.loadError') + ': ' + (error.message || t('history.networkError')));
      setRecords([]);
      setTotal(0);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, [page, rowsPerPage]);

  // 格式化持续时间
  const formatDuration = (seconds?: number) => {
    // null/undefined 或 0 表示还未结束或连接失败
    if (!seconds || seconds === 0) return '-';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}${t('history.hour')} ${minutes}${t('history.minute')}`;
    } else if (minutes > 0) {
      return `${minutes}${t('history.minute')} ${secs}${t('history.second')}`;
    } else {
      return `${secs}${t('history.second')}`;
    }
  };

  const filteredRecords = records.filter(
    (record) =>
      record.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.hostIp.includes(searchTerm) ||
      record.hostName.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
        <Box>
          <Typography variant="h4" component="h1">
            {t("history.vmLoginHistory")}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {t("history.vmLoginHistoryDesc")}
          </Typography>
        </Box>
        <Box display="flex" gap={2}>
          <TextField
            size="small"
            placeholder={t("common.search") + "..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />
          <IconButton onClick={loadRecords} color="primary">
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      {error && (
        <Card sx={{ mb: 2, backgroundColor: '#fff3e0', borderLeft: '4px solid #ff9800' }}>
          <CardContent>
            <Typography color="error" variant="body1">
               {error}
            </Typography>
          </CardContent>
        </Card>
      )}

      <Card elevation={0} sx={{ border: '1px solid #e2e8f0' }}>
        <CardContent sx={{ p: 0 }}>
          <Box sx={{ px: 3, py: 2.5, borderBottom: '1px solid #e2e8f0' }}>
            <Typography variant="h6" fontWeight="600" color="text.primary">
              {t("history.loginRecords")}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {t("common.totalRecords", { count: total })}
            </Typography>
          </Box>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, color: '#667eea' }}>{t("sessions.host")}</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#667eea' }}>{t("sessions.user")}</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#667eea' }}>连接方式</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#667eea' }}>{t("sessions.startTime")}</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#667eea' }}>{t("sessions.endTime")}</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#667eea' }}>{t("sessions.duration")}</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#667eea' }}>{t("common.status")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredRecords
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((record) => (
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
                        <Box>
                          <Typography variant="body2" fontWeight={500}>
                            {record.hostName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {record.hostIp}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={record.username}
                          size="small"
                          sx={{
                            backgroundColor: 'rgba(102, 126, 234, 0.1)',
                            color: '#667eea',
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={
                            record.connectionType === 'ssh_gateway' 
                              ? 'SSH客户端' 
                              : record.connectionType === 'webshell'
                              ? 'WebShell'
                              : record.connectionType || 'WebShell'
                          }
                          size="small"
                          sx={{
                            backgroundColor: record.connectionType === 'ssh_gateway' 
                              ? 'rgba(76, 175, 80, 0.1)' 
                              : 'rgba(33, 150, 243, 0.1)',
                            color: record.connectionType === 'ssh_gateway' 
                              ? '#4caf50' 
                              : '#2196f3',
                            fontWeight: 500,
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {record.loginTime}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {record.logoutTime || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>
                          {formatDuration(record.duration)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {record.status === 'completed' ? (
                          <Chip
                            icon={<CheckCircleIcon style={{ fontSize: 16 }} />}
                            label={t("history.success")}
                            size="small"
                            sx={{
                              backgroundColor: '#d4edda',
                              color: '#155724',
                            }}
                          />
                        ) : record.status === 'failed' ? (
                          <Chip
                            icon={<ErrorIcon style={{ fontSize: 16 }} />}
                            label={t("history.failed")}
                            size="small"
                            sx={{
                              backgroundColor: '#f8d7da',
                              color: '#721c24',
                            }}
                          />
                        ) : (
                          <Chip
                            label={t("common.inProgress")}
                            size="small"
                            sx={{
                              backgroundColor: '#ebf8ff',
                              color: '#3182ce',
                            }}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </TableContainer>
          {total > 0 && (
            <TablePagination
              component="div"
              count={total}
              page={page}
              onPageChange={(_, newPage) => setPage(newPage)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => {
                setRowsPerPage(parseInt(e.target.value, 10));
                setPage(0);
              }}
              labelRowsPerPage={`${t("common.rowsPerPage")}:`}
            />
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

