// 设备类型
export type DeviceType = 'linux' | 'windows' | 'network' | 'vmware' | 'docker' | 'server' | 'switch' | 'router' | 'firewall' | 'other';

// 连接协议
export type Protocol = 'ssh' | 'rdp';

// 主机资产类型定义
// 注意：认证信息（用户名、密码、密钥）和协议已移至 SystemUser
// 通过 PermissionRule 关联主机和系统用户，实现更灵活的权限管理
export interface Host {
  id: string;
  name: string;
  ip: string;
  port: number;
  status: 'online' | 'offline' | 'unknown';
  os: string;
  cpu?: string;
  memory?: string;
  tags: string[];
  description?: string;
  lastLoginTime?: string;
  loginCount: number;
  deviceType: DeviceType;     // 设备类型
  connectionMode?: 'auto' | 'direct' | 'proxy';  // 连接模式
  proxyId?: string;            // 代理ID
  networkZone?: string;        // 网络区域
  createdAt: string;
  updatedAt: string;
}

// 登录记录
export interface LoginRecord {
  id: string;
  hostId: string;
  hostName: string;
  hostIp: string;
  username: string;
  loginTime: string;
  duration?: number;
  status: 'active' | 'completed' | 'failed';
  loginIp?: string;
  userAgent?: string;
}

// 统计信息
export interface DashboardStats {
  totalHosts: number;
  onlineHosts: number;
  offlineHosts: number;
  recentLogins: number;
}

// API 响应
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

// 系统用户类型（目标主机上的操作系统用户）
export interface SystemUser {
  id: string;
  name: string;            // 显示名称
  username: string;        // OS用户名（如root、admin等）
  authType: 'password' | 'key';  // 明确认证方式
  password?: string;
  privateKey?: string;
  passphrase?: string;
  protocol: Protocol;
  priority: number;
  description?: string;
  status: 'active' | 'inactive';
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

// 用户组类型（平台用户组）
export interface UserGroup {
  id: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  priority: number;
  status: 'active' | 'inactive';
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  memberCount?: number;
  members?: User[];
}

// 用户类型
export interface User {
  id: string;
  username: string;
  email?: string;
  fullName?: string;
  role: 'admin' | 'user';
  status: 'active' | 'inactive';
  expiresAt?: string;
  expirationWarningSent?: boolean;
  autoDisableOnExpiry?: boolean;
  lastLoginTime?: string;
  lastLoginIp?: string;
  createdAt: string;
  updatedAt: string;
  sshPublicKey?: string;
  userGroups?: UserGroup[]; // 用户所属的用户组
}

// 授权规则类型
export interface PermissionRule {
  id: string;
  name: string;
  userGroupId: string;
  userGroupName?: string;
  hostGroupId?: string;
  hostGroupName?: string;
  hostIds?: string;
  systemUserId: string;
  systemUserName?: string;
  validFrom?: string;
  validTo?: string;
  enabled: boolean;
  priority: number;
  description?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

