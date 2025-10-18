import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { Host } from '../types';

interface TerminalSession {
  id: string;
  host: Host;
  systemUserId?: string; // 系统用户ID
  createdAt: number;
  wsConnection?: WebSocket; // 保持WebSocket连接引用
  lastActiveAt?: number; // 最后活跃时间
}

interface TerminalContextType {
  sessions: TerminalSession[];
  addSession: (host: Host, systemUserId?: string) => void;
  removeSession: (sessionId: string) => void;
  clearSessions: () => void;
  hasSession: (hostId: string) => boolean;
  getWebSocket: (sessionId: string) => WebSocket | null;
  setWebSocket: (sessionId: string, ws: WebSocket) => void;
  updateLastActive: (sessionId: string) => void;
}

const TerminalContext = createContext<TerminalContextType | undefined>(undefined);

const SESSIONS_STORAGE_KEY = 'terminal_sessions';

// 从 sessionStorage 加载会话（不包含WebSocket连接）
const loadSessionsFromStorage = (): TerminalSession[] => {
  try {
    const stored = sessionStorage.getItem(SESSIONS_STORAGE_KEY);
    if (stored) {
      const sessions: TerminalSession[] = JSON.parse(stored);
      // WebSocket连接不能序列化，需要在返回时重新建立
      return sessions.map(s => ({ ...s, wsConnection: undefined }));
    }
  } catch (error) {
    console.error('Failed to load sessions from storage:', error);
  }
  return [];
};

// 保存会话到 sessionStorage（不包含WebSocket连接）
const saveSessionsToStorage = (sessions: TerminalSession[]) => {
  try {
    // 移除WebSocket连接引用，因为它不能序列化
    const sessionsToStore = sessions.map(({ wsConnection, ...rest }) => rest);
    sessionStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessionsToStore));
  } catch (error) {
    console.error('Failed to save sessions to storage:', error);
  }
};

export function TerminalProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<TerminalSession[]>(() => loadSessionsFromStorage());

  // 当 sessions 变化时保存到 sessionStorage
  useEffect(() => {
    saveSessionsToStorage(sessions);
  }, [sessions]);

  const addSession = (host: Host, systemUserId?: string) => {
    // 检查是否已经存在相同主机的会话
    const existingSession = sessions.find(s => s.host.id === host.id);
    if (existingSession) {
      // 如果已存在，不添加新会话
      return;
    }

    const newSession: TerminalSession = {
      id: `${host.id}-${Date.now()}`,
      host,
      systemUserId,
      createdAt: Date.now(),
    };

    setSessions(prev => [...prev, newSession]);
  };

  const removeSession = (sessionId: string) => {
    setSessions(prev => prev.filter(s => s.id !== sessionId));
  };

  const clearSessions = () => {
    setSessions([]);
  };

  const hasSession = (hostId: string) => {
    return sessions.some(s => s.host.id === hostId);
  };

  const getWebSocket = (sessionId: string): WebSocket | null => {
    const session = sessions.find(s => s.id === sessionId);
    return session?.wsConnection || null;
  };

  const setWebSocket = (sessionId: string, ws: WebSocket) => {
    setSessions(prev => prev.map(s =>
      s.id === sessionId
        ? { ...s, wsConnection: ws, lastActiveAt: Date.now() }
        : s
    ));
  };

  const updateLastActive = (sessionId: string) => {
    setSessions(prev => prev.map(s =>
      s.id === sessionId
        ? { ...s, lastActiveAt: Date.now() }
        : s
    ));
  };

  // 清理断开的WebSocket连接
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      setSessions(prev => prev.map(s => {
        if (s.wsConnection && s.wsConnection.readyState === WebSocket.CLOSED) {
          console.log(`[TerminalContext] Cleaning up closed WebSocket for session ${s.id}`);
          return { ...s, wsConnection: undefined };
        }
        return s;
      }));
    }, 10000); // 每10秒检查一次

    return () => clearInterval(cleanupInterval);
  }, []);

  return (
    <TerminalContext.Provider value={{
      sessions,
      addSession,
      removeSession,
      clearSessions,
      hasSession,
      getWebSocket,
      setWebSocket,
      updateLastActive
    }}>
      {children}
    </TerminalContext.Provider>
  );
}

export function useTerminal() {
  const context = useContext(TerminalContext);
  if (context === undefined) {
    throw new Error('useTerminal must be used within a TerminalProvider');
  }
  return context;
}

