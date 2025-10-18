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
  TextField,
  InputAdornment,
  IconButton,
  TablePagination,
  CircularProgress,
} from '@mui/material';
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { commandApi } from '../api/api';
import { useTranslation } from 'react-i18next';

interface CommandRecord {
  id: string;
  sessionId: string;
  hostName: string;
  hostIp: string;
  username: string;
  command: string;
  executedAt: string;
  status?: string;
}

export default function Commands() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [commands, setCommands] = useState<CommandRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState(''); // 实际搜索词（触发API请求）
  const [searchInput, setSearchInput] = useState(''); // 输入框的值
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [total, setTotal] = useState(0);

  const loadCommands = async () => {
    setLoading(true);
    try {
      const data = await commandApi.getCommandRecords({
        page: page + 1,
        pageSize: rowsPerPage,
        search: searchTerm,
      });
      
      // 转换数据格式
      const formattedCommands = data.commands.map((c: any) => ({
        id: c.id,
        sessionId: c.sessionId || '',
        hostName: c.hostIp || '', // Use IP address only
        hostIp: c.hostIp || '',
        username: c.username || '',
        command: c.command || '',
        executedAt: new Date(c.executedAt).toLocaleString('zh-CN'),
        status: c.status || 'success',
      }));
      
      setCommands(formattedCommands);
      setTotal(data.total);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load commands:', error);
      // 如果API失败，显示空列表
      setCommands([]);
      setTotal(0);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCommands();
  }, [page, rowsPerPage, searchTerm]);

  // 处理搜索：按回车键触发
  const handleSearch = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      setSearchTerm(searchInput);
      setPage(0); // 重置到第一页
    }
  };

  // 清空搜索
  const handleClearSearch = () => {
    setSearchInput('');
    setSearchTerm('');
    setPage(0);
  };

  const filteredCommands = commands.filter((cmd) =>
    cmd.command.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cmd.hostIp.toLowerCase().includes(searchTerm.toLowerCase())
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
        <Typography variant="h4" component="h1">
          {t("commands.title")}
        </Typography>
        <IconButton onClick={loadCommands} color="primary">
          <RefreshIcon />
        </IconButton>
      </Box>

      {/* 搜索 */}
      <Card elevation={0} sx={{ mb: 3, border: '1px solid #e2e8f0' }}>
        <CardContent>
          <TextField
            placeholder={t("common.search") + "..."}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleSearch}
            size="small"
            fullWidth
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
              endAdornment: searchInput && (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={handleClearSearch}>
                    ✕
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        </CardContent>
      </Card>

      {/* {t("commands.command")}列表 */}
      <Card elevation={0} sx={{ border: '1px solid #e2e8f0' }}>
        <CardContent sx={{ p: 0 }}>
          <Box sx={{ px: 3, py: 2.5, borderBottom: '1px solid #e2e8f0' }}>
            <Typography variant="h6" fontWeight="600" color="text.primary">
              {t("commands.executedRecords")}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {t("commands.totalRecords", { count: total })}
            </Typography>
          </Box>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, color: '#667eea' }}>{t("commands.executedAt")}</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#667eea' }}>{t("sessions.host")}</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#667eea' }}>{t("sessions.user")}</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#667eea' }}>{t("commands.command")}</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#667eea' }}>{t("common.status")}</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#667eea' }}>{t("sessions.sessionId")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredCommands.map((cmd) => (
                  <TableRow
                    key={cmd.id}
                    hover
                    sx={{
                      transition: 'all 0.2s ease',
                      '&:hover': {
                        backgroundColor: 'rgba(102, 126, 234, 0.05)',
                      },
                    }}
                  >
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {cmd.executedAt}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>
                        {cmd.hostIp}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={cmd.username}
                        size="small"
                        sx={{
                          backgroundColor: 'rgba(102, 126, 234, 0.1)',
                          color: '#667eea',
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Box
                        sx={{
                          fontFamily: 'monospace',
                          fontSize: '0.85rem',
                          backgroundColor: '#f7fafc',
                          padding: '6px 10px',
                          borderRadius: 1,
                          maxWidth: '400px',
                          overflow: 'auto',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {cmd.command}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={t("common.success")}
                        size="small"
                        sx={{
                          backgroundColor: '#f0fff4',
                          color: '#38a169',
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" fontFamily="monospace">
                        {cmd.sessionId}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          
          {/* 分页 */}
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

