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
  Dialog,
  DialogTitle,
  DialogContent,
} from '@mui/material';
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  PlayCircle as PlayCircleIcon,
  Close as CloseIcon,
  StopCircle as StopCircleIcon,
} from '@mui/icons-material';
import { sessionApi } from '../api/api';
import AsciinemaPlayer from '../components/AsciinemaPlayer';
import { useTranslation } from 'react-i18next';

interface SessionRecord {
  id: string;
  sessionId: string;
  hostName: string;
  hostIp: string;
  username: string;
  startTime: string;
  endTime: string;
  duration: string;
  commandCount: number;
  status: 'active' | 'closed';
}

interface SessionRecordingDetail {
  sessionId: string;
  hostName: string;
  hostIp: string;
  username: string;
  startTime: string;
  endTime: string;
  recording: string;
  terminalCols: number;
  terminalRows: number;
}

export default function Sessions() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [total, setTotal] = useState(0);
  const [playingSession, setPlayingSession] = useState<SessionRecord | null>(null);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [recordingDetail, setRecordingDetail] = useState<SessionRecordingDetail | null>(null);
  const [loadingRecording, setLoadingRecording] = useState(false);
  const [dialogReady, setDialogReady] = useState(false);

  const loadSessions = async () => {
    setLoading(true);
    try {
      const data = await sessionApi.getSessionRecordings({
        page: page + 1,
        pageSize: rowsPerPage,
        search: searchTerm,
      });
      
      // 转换数据格式
      const formattedSessions = data.sessions.map((s: any) => ({
        id: s.id,
        sessionId: s.sessionId,
        hostName: s.hostName || s.hostIp || 'Unknown', // Use hostname first, then IP
        hostIp: s.hostIp || '',
        username: s.username || '',
        startTime: new Date(s.startTime).toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        }),
        endTime: s.endTime ? new Date(s.endTime).toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        }) : '',
        duration: s.duration || '-',
        commandCount: s.commandCount || 0,
        status: s.status === 'active' ? 'active' : 'closed',
      }));
      
      setSessions(formattedSessions);
      setTotal(data.total);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load sessions:', error);
      // 如果API失败，显示空列表
      setSessions([]);
      setTotal(0);
      setLoading(false);
    }
  };

  // {t("sessions.terminate")}会话
  const handleKillSession = async (session: SessionRecord) => {
    if (!confirm(`${t("sessions.terminateConfirm")} ${session.sessionId.substring(0, 8)}...?`)) {
      return;
    }

    try {
      await sessionApi.terminateSession(session.sessionId);
      alert(t("sessions.terminateConfirm"));
      // Refresh list
      loadSessions();
    } catch (error) {
      console.error('Failed to terminate session:', error);
      alert(t("sessions.terminate") + ' failed: ' + (error as Error).message);
    }
  };

  useEffect(() => {
    loadSessions();
  }, [page, rowsPerPage, searchTerm]);

  const handlePlaySession = async (session: SessionRecord) => {
    if (session.status === 'active') {
      alert('Session is still active, real-time replay not supported yet');
      return;
    }
    
    setPlayingSession(session);
    setPlayerOpen(true);
    setDialogReady(false); // 重置 Dialog 状态
    setLoadingRecording(true);
    setRecordingDetail(null);
    
    try {
      // 从后端 API 加载完整的录制数据
      const detail = await sessionApi.getSessionRecording(session.sessionId);
      setRecordingDetail(detail);
      setLoadingRecording(false);
    } catch (error) {
      console.error('Failed to load recording:', error);
      setLoadingRecording(false);
      alert('加载录制数据失败，请重试');
    }
  };

  const handleClosePlayer = () => {
    setPlayerOpen(false);
    setDialogReady(false);
    setPlayingSession(null);
    setRecordingDetail(null);
  };

  const handleDialogEntered = () => {
    console.log('[Sessions] Dialog animation completed');
    console.log('[Sessions] loadingRecording:', loadingRecording);
    console.log('[Sessions] recordingDetail:', recordingDetail ? 'exists' : 'null');
    console.log('[Sessions] playingSession:', playingSession ? 'exists' : 'null');
    setDialogReady(true);
  };

  const filteredSessions = sessions.filter((session) =>
    session.hostName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    session.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    session.sessionId.toLowerCase().includes(searchTerm.toLowerCase())
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
          {t("sessions.replayTitle")}
        </Typography>
        <IconButton onClick={loadSessions} color="primary">
          <RefreshIcon />
        </IconButton>
      </Box>

      {/* 搜索 */}
      <Card elevation={0} sx={{ mb: 3, border: '1px solid #e2e8f0' }}>
        <CardContent>
          <TextField
            placeholder={t("common.search") + "..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            size="small"
            fullWidth
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />
        </CardContent>
      </Card>

      {/* 会话列表 */}
      <Card elevation={0} sx={{ border: '1px solid #e2e8f0' }}>
        <CardContent sx={{ p: 0 }}>
          <Box sx={{ px: 3, py: 2.5, borderBottom: '1px solid #e2e8f0' }}>
            <Typography variant="h6" fontWeight="600" color="text.primary">
              {t("sessions.title")}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {t("common.totalRecords", { count: total })}
            </Typography>
          </Box>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, color: '#667eea' }}>{t("sessions.sessionId")}</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#667eea' }}>{t("sessions.host")}</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#667eea' }}>{t("sessions.user")}</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#667eea' }}>{t("sessions.startTime")}</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#667eea' }}>{t("sessions.endTime")}</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#667eea' }}>{t("sessions.duration")}</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#667eea' }}>{t("sessions.commandCount")}</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#667eea' }}>{t("common.status")}</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700, color: '#667eea' }}>{t("common.actions")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredSessions.map((session) => (
                  <TableRow
                    key={session.id}
                    hover
                    sx={{
                      transition: 'all 0.2s ease',
                      '&:hover': {
                        backgroundColor: 'rgba(102, 126, 234, 0.05)',
                      },
                    }}
                  >
                    <TableCell>
                      <Typography variant="caption" fontFamily="monospace" sx={{ fontSize: '0.75rem' }}>
                        {session.sessionId.substring(0, 20)}...
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>
                        {session.hostIp}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={session.username}
                        size="small"
                        sx={{
                          backgroundColor: 'rgba(102, 126, 234, 0.1)',
                          color: '#667eea',
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {session.startTime}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {session.endTime || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>
                        {session.duration}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={session.commandCount}
                        size="small"
                        sx={{
                          backgroundColor: '#faf5ff',
                          color: '#805ad5',
                          fontWeight: 600,
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      {session.status === 'active' ? (
                        <Chip
                          label={t("common.inProgress")}
                          size="small"
                          sx={{
                            backgroundColor: '#ebf8ff',
                            color: '#3182ce',
                          }}
                        />
                      ) : (
                        <Chip
                          label={t("common.completed")}
                          size="small"
                          sx={{
                            backgroundColor: '#f0f0f0',
                            color: '#718096',
                          }}
                        />
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <Box display="flex" gap={1} justifyContent="center">
                        {session.status === 'active' ? (
                          <IconButton
                            color="error"
                            onClick={() => handleKillSession(session)}
                            title={t("sessions.terminate")}
                          >
                            <StopCircleIcon />
                          </IconButton>
                        ) : (
                          <IconButton
                            color="primary"
                            onClick={() => handlePlaySession(session)}
                            title={t("sessions.replay")}
                          >
                            <PlayCircleIcon />
                          </IconButton>
                        )}
                      </Box>
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

      {/* 会话{t("sessions.replay")}播放器 */}
      <Dialog
        open={playerOpen}
        onClose={handleClosePlayer}
        maxWidth="lg"
        fullWidth
        TransitionProps={{
          onEntered: handleDialogEntered,
        }}
        PaperProps={{
          sx: {
            height: 'auto',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        <DialogTitle sx={{ 
          borderBottom: '1px solid #e2e8f0', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          py: 1.5,
          flexShrink: 0,
        }}>
          <Box display="flex" alignItems="baseline" gap={2}>
            <Typography variant="h6">{t("sessions.replayTitle")}</Typography>
            {playingSession && (
              <Typography variant="caption" color="text.secondary">
                {playingSession.hostName} ({playingSession.hostIp}) - {playingSession.username}
              </Typography>
            )}
          </Box>
          <IconButton
            onClick={handleClosePlayer}
            sx={{
              color: 'text.secondary',
              '&:hover': {
                color: 'error.main',
                backgroundColor: 'rgba(211, 47, 47, 0.08)',
              },
            }}
            title={t("common.close")}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ 
          p: 0, 
          backgroundColor: '#000', 
          display: 'flex',
          flexDirection: 'column',
          height: '650px',
          maxHeight: '70vh',
          overflow: 'hidden',
        }}>
          {(() => {
            console.log('[Sessions] Rendering DialogContent:', {
              loadingRecording,
              dialogReady,
              hasRecordingDetail: !!recordingDetail,
              hasPlayingSession: !!playingSession
            });

            if (loadingRecording) {
              return (
                <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" minHeight="400px">
                  <CircularProgress sx={{ color: '#667eea', mb: 2 }} />
                  <Typography color="white">{t("sessions.loadingRecording")}</Typography>
                </Box>
              );
            }
            
            if (!dialogReady) {
              return (
                <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" minHeight="400px">
                  <CircularProgress sx={{ color: '#667eea', mb: 2 }} />
                  <Typography color="white">{t("sessions.preparingPlayer")}</Typography>
                </Box>
              );
            }
            
            if (recordingDetail) {
              console.log('[Sessions] Rendering AsciinemaPlayer with:', {
                sessionId: recordingDetail.sessionId,
                recordingLength: recordingDetail.recording?.length || 0,
                cols: recordingDetail.terminalCols,
                rows: recordingDetail.terminalRows
              });
              return (
                <AsciinemaPlayer
                  sessionId={recordingDetail.sessionId}
                  recording={recordingDetail.recording}
                  cols={recordingDetail.terminalCols}
                  rows={recordingDetail.terminalRows}
                />
              );
            }
            
            if (playingSession) {
              return (
                <Box sx={{ textAlign: 'center', py: 10 }}>
                  <PlayCircleIcon sx={{ fontSize: 80, color: '#667eea', mb: 2 }} />
                  <Typography variant="h6" color="white" gutterBottom>
                    {t("sessions.loadRecordingFailed")}
                  </Typography>
                  <Typography variant="body2" color="rgba(255,255,255,0.7)">
                    {t("sessions.sessionId")}: {playingSession.sessionId}
                  </Typography>
                </Box>
              );
            }

            return null;
          })()}
        </DialogContent>
      </Dialog>
    </Box>
  );
}

