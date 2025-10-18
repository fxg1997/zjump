/**
 * ZJump 前端配置文件
 * 
 * 修改端口配置后，需要重启前端开发服务器
 */

export interface AppConfig {
  // 是否使用 Nginx 作为网关
  useNginx: boolean;
  
  // API 基础地址
  apiUrl: string;
  
  // Linux Proxy API 地址
  linuxProxyUrl: string;
  
  // Nginx 模式下的 WebSocket 基础地址
  nginxWsUrl?: string;
  
  // 开发模式下直连各个 Proxy 的端口
  proxyPorts: {
    linux: number;    // Linux/Docker/VMware SSH Proxy
    windows: number;  // Windows RDP Proxy
    network: number;  // Network Device Proxy
  };
}

// 开发环境配置
const developmentConfig: AppConfig = {
  useNginx: false,
  apiUrl: 'http://localhost:8080',  // 不包含 /api，由各个 API 定义中添加
  linuxProxyUrl: 'http://localhost:8022',
  proxyPorts: {
    linux: 8022,
    windows: 8033,
    network: 8044,
  },
};

// 生产环境配置
const productionConfig: AppConfig = {
  useNginx: true,
  apiUrl: 'https://your-domain.com',  // 不包含 /api，由各个 API 定义中添加
  linuxProxyUrl: 'https://your-domain.com',
  nginxWsUrl: 'wss://your-domain.com',
  proxyPorts: {
    linux: 8022,
    windows: 8033,
    network: 8044,
  },
};

// 根据环境选择配置
const config: AppConfig = import.meta.env.MODE === 'production' 
  ? productionConfig 
  : developmentConfig;

export default config;

