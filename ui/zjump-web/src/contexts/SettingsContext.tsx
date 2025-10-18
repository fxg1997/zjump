import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import axiosInstance from '../api/request';

// 系统设置接口
export interface SystemSettings {
  siteName: string;
  siteDescription: string;
  logo: string;
  favicon: string;
  loginLogo: string;
  loginBackground: string;
  apiUrl: string;
  wsUrl: string;
  adminEmail: string;
  autoReconnect: string;
}

interface SettingsContextType {
  settings: SystemSettings | null;
  loading: boolean;
  error: string | null;
  refreshSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

// 默认设置
const defaultSettings: SystemSettings = {
  siteName: 'ZJump 堡垒机',
  siteDescription: '企业级SSH跳板机管理平台',
  logo: '/logo.png',
  favicon: '/favicon.ico',
  loginLogo: '',
  loginBackground: '',
  apiUrl: 'http://localhost:8080',
  wsUrl: 'ws://localhost:8080',
  adminEmail: 'admin@example.com',
  autoReconnect: 'true',
};

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // 调用公开的设置接口（不需要认证）
      const response = await axiosInstance.get('/api/settings/public');
      
      if (response.data && response.data.data) {
        setSettings(response.data.data as SystemSettings);
        
        // 动态设置网页标题
        if (response.data.data.siteName) {
          document.title = response.data.data.siteName;
        }
        
        // 动态设置 favicon
        if (response.data.data.favicon) {
          const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement || document.createElement('link');
          link.type = 'image/x-icon';
          link.rel = 'shortcut icon';
          link.href = response.data.data.favicon;
          document.getElementsByTagName('head')[0].appendChild(link);
        }
      } else {
        // 使用默认设置
        setSettings(defaultSettings);
      }
    } catch (err: any) {
      console.warn('Failed to load settings, using defaults:', err);
      setError(err.message || '加载设置失败');
      // 出错时使用默认设置
      setSettings(defaultSettings);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const refreshSettings = async () => {
    await loadSettings();
  };

  return (
    <SettingsContext.Provider value={{ settings, loading, error, refreshSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}

