import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Tabs,
  Tab,
  Paper,
  Alert,
} from '@mui/material';
import {
  Close as CloseIcon,
  Terminal as TerminalIcon,
} from '@mui/icons-material';
import Terminal from '../components/Terminal';
import { useTerminal } from '../contexts/TerminalContext';
import { useTranslation } from 'react-i18next';

export default function TerminalPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { sessions, removeSession } = useTerminal();
  const [activeTab, setActiveTab] = useState(0);

  // 当活动标签超出范围时调整
  useEffect(() => {
    if (activeTab >= sessions.length && sessions.length > 0) {
      setActiveTab(sessions.length - 1);
    }
  }, [sessions.length, activeTab]);

  const closeTab = (sessionId: string, index: number) => {
    // 关闭WebSocket连接
    const session = sessions.find(s => s.id === sessionId);
    const ws = session?.wsConnection;
    if (ws && ws.readyState === WebSocket.OPEN) {
      console.log(`[TerminalPage] User manually closing WebSocket for session ${sessionId}`);
      // 标记为用户主动关闭（通过在WebSocket对象上添加属性）
      (ws as any).__userClosed = true;
      ws.close();
    }
    
    // 从Context移除会话
    removeSession(sessionId);
    
    // 如果关闭的是当前激活的标签，切换到前一个
    if (activeTab === index && index > 0) {
      setActiveTab(index - 1);
    }
  };

  if (sessions.length === 0) {
    return (
      <Box>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
          <Typography variant="h4" component="h1" fontWeight="700">
            {t("terminal.title")}
          </Typography>
        </Box>
        <Alert severity="info" sx={{ mb: 2 }}>
          {t("terminal.noActiveSessions")}
        </Alert>
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <TerminalIcon sx={{ fontSize: 64, color: '#cbd5e0', mb: 2 }} />
          <Typography variant="h6" gutterBottom color="text.secondary">
            {t("terminal.noOpenSessions")}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {t("terminal.instruction")}
          </Typography>
          <Box display="flex" gap={2} justifyContent="center">
            <Button
              variant="contained"
              onClick={() => navigate('/')}
              sx={{ textTransform: 'none' }}
            >
              {t("terminal.goToDashboard")}
            </Button>
            <Button
              variant="outlined"
              onClick={() => navigate('/assets')}
              sx={{ textTransform: 'none' }}
            >
              {t("terminal.goToAssets")}
            </Button>
          </Box>
        </Paper>
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" component="h1" fontWeight="700">
            {t("terminal.title")}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {t("terminal.activeSessions", { count: sessions.length })}
          </Typography>
        </Box>
        <Button
          variant="outlined"
          onClick={() => navigate('/assets')}
          sx={{ textTransform: 'none' }}
        >
          {t("terminal.addMoreSessions")}
        </Button>
      </Box>

      <Paper sx={{ mb: 2 }}>
        <Tabs
          value={activeTab}
          onChange={(_, newValue) => setActiveTab(newValue)}
          variant="scrollable"
          scrollButtons="auto"
        >
          {sessions.map((session, index) => (
            <Tab
              key={session.id}
              label={
                <Box display="flex" alignItems="center" gap={1}>
                  <span>{session.host.name}</span>
                  <span style={{ fontSize: '0.8em', opacity: 0.7 }}>
                    ({session.host.ip})
                  </span>
                  <Box
                    component="span"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(session.id, index);
                    }}
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      cursor: 'pointer',
                      ml: 0.5,
                      '&:hover': {
                        backgroundColor: 'rgba(0, 0, 0, 0.08)',
                      },
                    }}
                  >
                    <CloseIcon sx={{ fontSize: 16 }} />
                  </Box>
                </Box>
              }
            />
          ))}
        </Tabs>
      </Paper>

      {sessions.map((session, index) => (
        <Box
          key={session.id}
          sx={{ display: activeTab === index ? 'block' : 'none' }}
        >
          <Terminal
            hostId={session.host.id}
            host={session.host}
            sessionId={session.id}
            systemUserId={session.systemUserId}
            onClose={() => closeTab(session.id, index)}
          />
        </Box>
      ))}
    </Box>
  );
}

