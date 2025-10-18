import { DeviceType, Protocol, Host } from '../types';
import config from '../config';

/**
 * 创建会话并获取 WebSocket URL
 * 
 * 优化版本（直接使用JWT Token）：
 * 1. 直接使用用户登录的JWT Token（24小时有效期）
 * 2. 统一连接到 API Server 的 /ws/connect 入口
 * 3. API Server 根据路由规则决策：
 *    - 直连模式：API Server 直接连接目标主机
 *    - 代理模式：API Server 内部转发到 Proxy Server
 * 4. 客户端无需关心是直连还是代理，完全透明
 * 
 * 优势：
 * - 统一入口，简化客户端逻辑
 * - 智能路由，自动选择最优路径
 * - 使用JWT Token，24小时有效期，无需额外接口
 * - Token过期前端会自动跳转登录页
 */
export async function createSessionAndGetWebSocketUrl(hostId: string, systemUserId?: string): Promise<string> {
  try {
    // 直接使用用户登录的JWT Token
    const jwtToken = localStorage.getItem('token');
    if (!jwtToken) {
      throw new Error('未登录，请先登录');
    }
    
    // 统一连接到 API Server 的 WebSocket 入口
    // 使用JWT Token进行认证（24小时有效期）
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = new URL(config.apiUrl).host;
    let url = `${wsProtocol}//${wsHost}/ws/connect?hostId=${hostId}&token=${jwtToken}`;
    
    // 如果指定了系统用户ID，添加到URL参数中
    if (systemUserId) {
      url += `&systemUserId=${systemUserId}`;
    }
    
    return url;
  } catch (error) {
    console.error('Failed to create websocket URL:', error);
    throw error;
  }
}

/**
 * 兼容旧版本的 getWebSocketUrl 方法
 * @deprecated 使用 createSessionAndGetWebSocketUrl 替代
 */
export function getWebSocketUrl(host: Host): string {
  // 旧版本直接返回，但实际应该先调用 createSessionAndGetWebSocketUrl
  console.warn('getWebSocketUrl is deprecated, use createSessionAndGetWebSocketUrl instead');
  const { protocol } = host;

  // 获取配置中的 Proxy 端口
  let proxyPort = config.proxyPorts.linux; // 默认 Linux SSH
  let protocolPath = 'ssh';
  
  if (protocol === 'rdp') {
    proxyPort = config.proxyPorts.windows;
    protocolPath = 'rdp';
  }

  return `ws://localhost:${proxyPort}/ws/${protocolPath}`;
}

/**
 * 获取设备类型的显示名称
 */
export function getDeviceTypeName(deviceType: DeviceType): string {
  const names: Record<DeviceType, string> = {
    linux: 'Linux 服务器',
    windows: 'Windows 服务器',
    network: '网络设备',
    vmware: 'VMware 虚拟机',
    docker: 'Docker 容器',
  };
  return names[deviceType] || deviceType;
}

/**
 * 获取协议的显示名称
 */
export function getProtocolName(protocol: Protocol): string {
  const names: Record<Protocol, string> = {
    ssh: 'SSH',
    rdp: 'RDP',
  };
  return names[protocol] || protocol;
}

/**
 * 获取设备类型的图标名称（用于 MUI Icons）
 */
export function getDeviceIcon(deviceType: DeviceType): string {
  const icons: Record<DeviceType, string> = {
    linux: 'Computer',
    windows: 'DesktopWindows',
    network: 'Router',
    vmware: 'Cloud',
    docker: 'ViewInAr',
  };
  return icons[deviceType] || 'Computer';
}

/**
 * 根据端口推测设备类型（用于迁移旧数据）
 */
export function guessDeviceType(port: number): { deviceType: DeviceType; protocol: Protocol } {
  if (port === 22) {
    return { deviceType: 'linux', protocol: 'ssh' };
  } else if (port === 3389) {
    return { deviceType: 'windows', protocol: 'rdp' };
  }
  
  // 默认返回 Linux SSH
  return { deviceType: 'linux', protocol: 'ssh' };
}

