import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Paper,
  AppBar,
  Toolbar,
  IconButton,
} from '@mui/material';
import {
  Close as CloseIcon,
  ArrowBack as ArrowBackIcon,
} from '@mui/icons-material';
import FileManager from '../components/FileManager';
import HostTree from '../components/HostTree';
import { useTranslation } from 'react-i18next';
import { Host } from '../types';
import { hostApi } from '../api/api';
import api from '../api';
import { SystemUser } from '../types';

interface FileManagementSession {
  id: string;
  host: Host;
  systemUserId?: string;
}

export default function FileManagementPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [sessions, setSessions] = useState<FileManagementSession[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  
  // 保存进入全屏页面前的路径
  const [previousPath, setPreviousPath] = useState<string>('/');
  
  // 组件挂载时保存上一个路径
  useEffect(() => {
    // 如果是从新标签页打开的，尝试从sessionStorage获取之前的路径
    // 如果没有，则使用referrer或默认路径
    const savedPath = sessionStorage.getItem('file_management_previous_path') || 
                      (document.referrer ? new URL(document.referrer).pathname : '/');
    setPreviousPath(savedPath);
  }, []);

  // 当活动标签超出范围时调整
  useEffect(() => {
    if (activeTab >= sessions.length && sessions.length > 0) {
      setActiveTab(sessions.length - 1);
    }
  }, [sessions.length, activeTab]);

  const closeTab = (sessionId: string, index: number) => {
    setSessions(prev => {
      const newSessions = prev.filter(s => s.id !== sessionId);
      // 如果关闭的是当前激活的标签，切换到其他标签
      if (index === activeTab) {
        if (newSessions.length > 0) {
          // 优先切换到右侧的标签页，如果没有则切换到左侧
          const nextIndex = index < newSessions.length ? index : newSessions.length - 1;
          setActiveTab(nextIndex);
        } else {
          setActiveTab(0);
        }
      } else if (index < activeTab) {
        // 如果关闭的是左侧的标签，当前激活标签的索引需要减1
        setActiveTab(activeTab - 1);
      }
      return newSessions;
    });
  };

  // 处理主机树中的主机点击
  const handleHostClick = async (host: Host) => {
    try {
      // 检查是否已经有该主机的会话
      const existingSession = sessions.find(s => s.host.id === host.id);
      if (existingSession) {
        const index = sessions.findIndex(s => s.id === existingSession.id);
        setActiveTab(index);
        return;
      }

      // 获取主机详细信息
      const hostData = await hostApi.getHost(host.id);
      
      // 检查可用的系统用户
      let systemUserId: string | undefined;
      try {
        const response = await api.get(`/api/system-users/available?hostId=${host.id}`);
        // 后端返回格式：{ code: 200, message: 'Success', data: [...] }
        const systemUsers: SystemUser[] = Array.isArray(response.data?.data) 
          ? response.data.data 
          : (response.data?.data?.data || response.data || []);
        
        if (systemUsers.length === 0) {
          alert('没有可用的系统用户，请联系管理员配置权限');
          return;
        } else if (systemUsers.length === 1) {
          systemUserId = systemUsers[0].id;
        } else {
          systemUserId = systemUsers[0].id;
        }
      } catch (error) {
        console.error('获取系统用户失败:', error);
      }
      
      // 添加会话
      const newSession: FileManagementSession = {
        id: `file-${Date.now()}-${Math.random()}`,
        host: hostData,
        systemUserId: systemUserId || undefined,
      };
      
      setSessions(prev => {
        const updatedSessions = [...prev, newSession];
        // 切换到新添加的会话
        setTimeout(() => {
          setActiveTab(updatedSessions.length - 1);
        }, 100);
        return updatedSessions;
      });
    } catch (error) {
      console.error('连接主机失败:', error);
      alert('连接主机失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  return (
    <Box sx={{ 
      height: '100vh', 
      width: '100vw',
      display: 'flex', 
      flexDirection: 'column', 
      position: 'fixed', 
      top: 0, 
      left: 0, 
      right: 0, 
      bottom: 0, 
      zIndex: 1300, 
      bgcolor: 'background.default',
      overflow: 'hidden'
    }}>
      {/* 顶部工具栏 */}
      <AppBar position="static" color="default" elevation={1} sx={{ flexShrink: 0 }}>
        <Toolbar>
          <IconButton edge="start" onClick={() => {
            // 如果是新标签页打开的，关闭当前窗口；否则导航回之前的页面
            if (window.opener) {
              // 新标签页打开的情况，关闭当前窗口
              window.close();
            } else {
              // 同标签页打开的情况，导航回之前的页面
              navigate(previousPath);
            }
          }} sx={{ mr: 2 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            文件管理
          </Typography>
          {sessions.length > 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mr: 2 }}>
              已打开 {sessions.length} 个主机
            </Typography>
          )}
        </Toolbar>
      </AppBar>

      {/* 主内容区域：左侧主机树 + 右侧文件管理区域 */}
      <Box sx={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', gap: 2, p: 2, overflow: 'hidden' }}>
        {/* 左侧：主机树 */}
        <Box sx={{ width: '300px', flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          <HostTree onHostClick={handleHostClick} />
        </Box>

        {/* 右侧：文件管理会话区域 */}
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          {sessions.length === 0 ? (
            <Paper sx={{ p: 4, textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Typography variant="h6" gutterBottom color="text.secondary">
                未打开任何主机
              </Typography>
              <Typography variant="body2" color="text.secondary">
                从左侧主机树选择主机进行文件管理
              </Typography>
            </Paper>
          ) : (
            <>
              {/* 会话标签页 */}
              <Paper sx={{ mb: 2, flexShrink: 0 }}>
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

              {/* 文件管理会话内容 */}
              <Box sx={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {sessions.map((session, index) => (
                  <Box
                    key={session.id}
                    sx={{ 
                      display: activeTab === index ? 'flex' : 'none', 
                      flex: 1,
                      width: '100%',
                      minHeight: 0,
                      flexDirection: 'column',
                      overflow: 'hidden',
                    }}
                  >
                    <FileManager
                      host={session.host}
                      systemUserId={session.systemUserId}
                    />
                  </Box>
                ))}
              </Box>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}


