import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';
import { Box, Paper, CircularProgress, Alert, Button } from '@mui/material';
import { Host } from '../types';
import { createSessionAndGetWebSocketUrl, getDeviceTypeName, getProtocolName } from '../utils/websocket';
import { useTerminal } from '../contexts/TerminalContext';
import { useTranslation } from 'react-i18next';

interface TerminalProps {
  hostId: string;
  host?: Host;  // 可选：如果提供，使用它来生成 WebSocket URL
  sessionId: string;  // 会话ID，用于在Context中存储WebSocket
  systemUserId?: string;  // 系统用户ID
  onClose?: () => void;
}

export default function Terminal({ hostId, host, sessionId, systemUserId, onClose }: TerminalProps) {
  const { t } = useTranslation();
  const { getWebSocket, setWebSocket, updateLastActive } = useTerminal();
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hostInfo, setHostInfo] = useState<Host | null>(host || null);
  const connectedRef = useRef(false); // 跟踪是否曾经连接成功
  const authenticatedRef = useRef(false); // 跟踪是否认证成功（收到过正常数据）
  const errorRef = useRef<string | null>(null); // 用 ref 持久化错误信息
  const initializedRef = useRef(false); // 跟踪是否已经初始化
  const keepAliveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 如果提供了 host，直接使用；否则从 mockData 加载
  useEffect(() => {
    if (host) {
      setHostInfo(host);
    } else if (!hostInfo) {
      // 从 mockData 获取主机信息（仅在没有提供 host 且 hostInfo 为空时）
      import('../api/mockData').then(({ mockHosts }) => {
        const foundHost = mockHosts.find(h => h.id === hostId);
        if (foundHost) {
          setHostInfo(foundHost);
        }
      });
    }
  }, [hostId, host]); // 移除 hostInfo 依赖，避免循环

  useEffect(() => {
    console.log('[Terminal useEffect] hostId:', hostId, 'hostInfo:', hostInfo, 'initialized:', initializedRef.current);
    
    if (!terminalRef.current || !hostInfo || initializedRef.current) {
      console.log('[Terminal] Skipping initialization:', {
        noRef: !terminalRef.current,
        noHostInfo: !hostInfo,
        alreadyInitialized: initializedRef.current
      });
      return;
    }

    // 标记已经初始化，防止重复
    initializedRef.current = true;
    console.log('[Terminal] Initializing terminal and connecting...');

    // 初始化 xterm.js
    const term = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#ffffff',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#e5e5e5',
      },
      rows: 30,
      cols: 120,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // 连接到 WebSocket
    connectWebSocket(term, hostInfo);

    // 处理窗口大小变化
    const handleResize = () => {
      fitAddon.fit();
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'resize',
            cols: term.cols,
            rows: term.rows,
          })
        );
      }
    };

    window.addEventListener('resize', handleResize);

    // 清理函数：只在组件卸载时执行
    return () => {
      console.log('[Terminal] Cleanup: Component unmounting for hostId:', hostId);
      window.removeEventListener('resize', handleResize);
      
      // 清理心跳定时器
      if (keepAliveIntervalRef.current) {
        clearInterval(keepAliveIntervalRef.current);
        keepAliveIntervalRef.current = null;
      }
      
      //  重要：不关闭WebSocket，保持连接活跃
      // WebSocket引用已保存在Context中，即使组件卸载，连接仍然保持
      // 只在用户显式关闭会话时才真正关闭WebSocket
      if (wsRef.current) {
        console.log('[Terminal] Cleanup: Keeping WebSocket alive in Context');
        // wsRef.current = null;  // 不清空引用，保持连接
      }
      
      // 清理终端UI实例
      if (xtermRef.current) {
        console.log('[Terminal] Cleanup: Disposing terminal UI');
        xtermRef.current.dispose();
        xtermRef.current = null;
      }
      
      // 重置初始化标记，以便React可以重新初始化
      initializedRef.current = false;
    };
  }, []); // 空依赖：只在组件 mount/unmount 时执行

  const connectWebSocket = async (term: XTerm, host: Host) => {
    try {
      // 首先检查Context中是否已有连接
      const existingWs = getWebSocket(sessionId);
      
      if (existingWs && existingWs.readyState === WebSocket.OPEN) {
        console.log('[Terminal] Reusing existing WebSocket connection from Context');
        wsRef.current = existingWs;
        
        // 重新绑定消息处理器
        bindWebSocketHandlers(existingWs, term, host);
        setLoading(false);
        connectedRef.current = true;
        term.writeln(t('terminal.connectionRestored'));
        term.writeln('');
        return;
      }
      
      // 没有现有连接，创建新的
      // 先调用 API Server 创建会话，获取带 token 的 wsUrl
      console.log(`正在创建会话: ${getDeviceTypeName(host.deviceType)} (${getProtocolName(host.protocol)})`);
      const wsUrl = await createSessionAndGetWebSocketUrl(host.id, systemUserId);
      
      console.log(`WebSocket URL: ${wsUrl}${systemUserId ? ` (SystemUser: ${systemUserId})` : ''}`);
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      
      // 保存到Context
      setWebSocket(sessionId, ws);

      bindWebSocketHandlers(ws, term, host);
    } catch (err) {
      console.error('Failed to connect:', err);
      const errorMsg = t('terminal.connectionFailed') + ': ' + (err as Error).message;
      errorRef.current = errorMsg; // 持久化到 ref
      setError(errorMsg);
      setLoading(false);
    }
  };

  const bindWebSocketHandlers = (ws: WebSocket, term: XTerm, host: Host) => {
    ws.onopen = () => {
        connectedRef.current = true; // 标记为已连接
        setLoading(false);
        errorRef.current = null; // 清除错误
        setError(null);
        term.writeln(t('terminal.connectingProtocol', { protocol: getProtocolName(host.protocol) }));
        term.writeln(t('terminal.connectingToHost', { name: host.name, ip: host.ip, port: host.port }));
        term.writeln('');
        
        // 发送初始化信息（设置终端大小）
        ws.send(
          JSON.stringify({
            type: 'init',
            cols: term.cols,
            rows: term.rows,
          })
        );

        // 启动心跳机制，保持连接活跃（每30秒发送一次）
        keepAliveIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
            console.log('[Terminal] Sent keep-alive ping');
          }
        }, 30000); // 30秒
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'output') {
            // 收到正常输出数据，标记为已认证成功
            authenticatedRef.current = true;
            term.write(data.data);
          } else if (data.type === 'error') {
            term.writeln(`\r\n${t('common.error')}: ${data.message}`);
            errorRef.current = data.message; // 持久化错误
            setError(data.message);
          } else if (data.type === 'info') {
            term.writeln(data.message);
          }
        } catch {
          // 如果不是 JSON，直接写入终端（认为是正常数据）
          authenticatedRef.current = true;
          term.write(event.data);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        const errorMsg = t('terminal.websocketError');
        errorRef.current = errorMsg; // 持久化到 ref
        setError(errorMsg);
        setLoading(false);
      };

      ws.onclose = () => {
        setLoading(false);
        
        // 清理心跳定时器
        if (keepAliveIntervalRef.current) {
          clearInterval(keepAliveIntervalRef.current);
          keepAliveIntervalRef.current = null;
        }
        
        // 检查是否是用户主动关闭
        const isUserClosed = (ws as any).__userClosed === true;
        
        // 只有在用户主动关闭时才自动关闭标签
        // 其他情况（连接失败、认证失败、登录失败等）都保持标签打开
        if (isUserClosed) {
          term.writeln('\r\n\r\n' + t('terminal.connectionClosed'));
          if (onClose) {
            setTimeout(onClose, 500);
          }
        } else {
          // 连接失败或认证失败，显示消息但不关闭标签
          term.writeln('\r\n\r\n' + t('terminal.connectionDisconnected'));
          
          if (!errorRef.current) {
            const errorMsg = t('terminal.connectionError');
            errorRef.current = errorMsg;
            setError(errorMsg);
          }
          
          // 提示用户可以手动关闭标签
          term.writeln(t('terminal.closeTabHint'));
        }
      };

      // 监听终端输入
      term.onData((data) => {
        updateLastActive(sessionId); // 更新最后活跃时间
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'input',
              data,
            })
          );
        }
      });
  };

  const handleManualClose = () => {
    // 标记为用户主动关闭
    if (wsRef.current) {
      (wsRef.current as any).__userClosed = true;
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    }
    if (onClose) {
      onClose();
    }
  };

  return (
    <Box>
      {loading && (
        <Box display="flex" justifyContent="center" alignItems="center" p={3}>
          <CircularProgress />
        </Box>
      )}
      {error && (
        <Alert 
          severity="error" 
          sx={{ mb: 2 }}
          action={
            onClose && (
              <Button color="inherit" size="small" onClick={handleManualClose}>
                {t('common.close')}
              </Button>
            )
          }
        >
          <Box>
            <strong>{t('terminal.connectionFailed')}</strong>
            <Box mt={1}>{error}</Box>
            <Box mt={1} sx={{ fontSize: '0.875rem', opacity: 0.8 }}>
              {t('terminal.checkHostConfig')}
            </Box>
          </Box>
        </Alert>
      )}
      <Paper
        elevation={3}
        sx={{
          p: 2,
          backgroundColor: '#1e1e1e',
          display: loading || error ? 'none' : 'block',
        }}
      >
        <div ref={terminalRef} style={{ height: '100%', width: '100%' }} />
      </Paper>
    </Box>
  );
}

