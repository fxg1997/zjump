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
// 在 Docker 环境中，前端和 API 通过 Nginx 在同一域名下，使用相对路径
const getProductionConfig = (): AppConfig => {
  // 运行时获取当前协议和域名
  const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss://' : 'ws://';
  const host = typeof window !== 'undefined' ? window.location.host : '';
  
  return {
    useNginx: true,
    // 使用相对路径，自动使用当前域名（适用于 Docker 部署）
    apiUrl: '',  // 空字符串表示使用当前域名，Nginx 会代理 /api/* 到后端
    linuxProxyUrl: '',  // 使用当前域名
    nginxWsUrl: protocol + host,  // WebSocket 使用当前域名
    proxyPorts: {
      linux: 8022,
      windows: 8033,
      network: 8044,
    },
  };
};

const productionConfig = getProductionConfig();

// 根据环境选择配置
const config: AppConfig = import.meta.env.MODE === 'production' 
  ? productionConfig 
  : developmentConfig;

export default config;

