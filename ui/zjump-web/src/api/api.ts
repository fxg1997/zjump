import { Host, LoginRecord, DashboardStats, ApiResponse, Protocol, DeviceType } from '../types';
import axiosInstance, { showSuccessToast, showErrorToast } from './request';
import config from '../config';

// 统一导出，作为 API 层的唯一入口

// 黑名单规则接口
export interface BlacklistRule {
  id: string;
  command: string;
  pattern: string;
  description: string;
  scope: 'global' | 'user';
  users?: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// 主机分组接口
export interface HostGroup {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  sortOrder: number;
  hostCount: number;
  onlineCount: number;
  createdAt: string;
}

// 审批相关接口
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'canceled' | 'expired';
export type ApprovalType = 'host_access' | 'host_group_access' | 'command_exec' | 'file_transfer';
export type ApprovalPlatform = 'internal' | 'feishu' | 'dingtalk' | 'wechat' | 'custom';

export interface Approval {
  id: string;
  title: string;
  description?: string;
  type: ApprovalType;
  status: ApprovalStatus;
  platform: ApprovalPlatform;
  
  // 申请人信息
  applicant_id: string;
  applicant_name?: string;
  applicant_email?: string;
  applicant?: {
    id: string;
    username: string;
    full_name?: string;
    email?: string;
  };
  
  // 审批人信息
  approver_ids?: string[];
  approver_names?: string[];
  current_approver?: string;
  
  // 资源信息
  resource_type?: string;
  resource_ids?: string[];
  resource_names?: string[];
  
  // 权限信息
  permissions?: string[];
  duration?: number;
  expires_at?: string;
  
  // 审批详情
  reason?: string;
  approval_note?: string;
  reject_reason?: string;
  
  // 第三方平台信息
  external_id?: string;
  external_url?: string;
  external_data?: string;
  
  // 时间信息
  created_at: string;
  updated_at: string;
  approved_at?: string;
  rejected_at?: string;
}

export interface ApprovalComment {
  id: string;
  approval_id: string;
  user_id: string;
  user_name?: string;
  action: string;
  comment?: string;
  created_at: string;
}

export interface ApprovalConfig {
  id: string;
  name: string;
  type: string; // 平台类型: feishu, dingtalk, wechat
  enabled: boolean;
  app_id: string;
  app_secret: string;
  approval_code?: string;
  process_code?: string;
  template_id?: string;
  form_fields: string;
  approver_user_ids?: string;
  cc_user_ids?: string;
  cc_open_ids?: string;
  api_base_url?: string;
  callback_url?: string;
  created_at: string;
  updated_at: string;
}

// 通用请求函数 - 使用 axios
async function request<T>(
  endpoint: string,
  options?: {
    method?: string;
    body?: string;
    params?: Record<string, any>;
  }
): Promise<T> {
  try {
    const response = await axiosInstance.request({
      url: endpoint,
      method: (options?.method || 'GET') as any,
      data: options?.body ? JSON.parse(options.body) : undefined,
      params: options?.params,
    });

    const result: ApiResponse<T> = response.data;
    
    // 如果后端返回标准格式 { code, message, data }
    if (result.code !== undefined && result.data !== undefined) {
      // 兼容 code: 0 和 code: 200 两种模式
      // HTTP 2xx 状态码已经表示成功，直接返回 data
      return result.data;
    }
    
    // 否则直接返回整个响应数据
    return response.data as T;
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}

// 导出提示方法
export { showSuccessToast, showErrorToast };

// Dashboard API
export const dashboardApi = {
  // 获取统计信息
  getStats: () => request<DashboardStats>('/api/dashboard/stats'),
  
  // 获取最近登录记录
  getRecentLogins: (limit: number = 10) =>
    request<LoginRecord[]>(`/api/dashboard/recent-logins?limit=${limit}`),
  
  // 获取用户常用主机（按用户登录次数排序）
  getFrequentHosts: (limit: number = 5) =>
    request<Host[]>(`/api/dashboard/frequent-hosts?limit=${limit}`),
};

// 主机资产 API
export const hostApi = {
  // 获取主机列表
  getHosts: (params?: { 
    page?: number; 
    pageSize?: number; 
    search?: string;
    tags?: string[];
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.pageSize) queryParams.set('pageSize', params.pageSize.toString());
    if (params?.search) queryParams.set('search', params.search);
    if (params?.tags?.length) queryParams.set('tags', params.tags.join(','));
    
    const query = queryParams.toString();
    return request<{ hosts: Host[]; total: number }>(
      `/api/hosts${query ? `?${query}` : ''}`
    );
  },

  // 获取单个主机详情
  getHost: (id: string) => request<Host>(`/api/hosts/${id}`),

  // 创建主机
  createHost: (host: {
    name: string;
    ip: string;
    port: number;
    username: string;
    password?: string;
    privateKey?: string;
    status: string;
    protocol: Protocol;
    deviceType: DeviceType;
    tags?: string;
    os?: string;
    cpu?: string;
    memory?: string;
    description?: string;
  }) =>
    request<Host>('/api/hosts', {
      method: 'POST',
      body: JSON.stringify(host),
    }),

  // 更新主机
  updateHost: (id: string, host: Partial<Host>) =>
    request<Host>(`/api/hosts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(host),
    }),

  // 删除主机
  deleteHost: (id: string) =>
    request<void>(`/api/hosts/${id}`, {
      method: 'DELETE',
    }),

  // 测试连接
  testConnection: (id: string) =>
    request<{ success: boolean; message: string }>(`/api/hosts/${id}/test`),
};

// 登录会话 API
export const sessionApi = {
  // 创建 SSH 会话
  createSession: (hostId: string) =>
    request<{ sessionId: string; wsUrl: string }>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ hostId }),
    }),

  // 获取登录记录
  getLoginRecords: (params?: { 
    page?: number; 
    pageSize?: number; 
    hostId?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.pageSize) queryParams.set('pageSize', params.pageSize.toString());
    if (params?.hostId) queryParams.set('hostId', params.hostId);
    
    const query = queryParams.toString();
    return request<{ records: LoginRecord[]; total: number }>(
      `/api/sessions/records${query ? `?${query}` : ''}`
    );
  },

  // 获取会话录制列表
  getSessionRecordings: (params?: {
    page?: number;
    pageSize?: number;
    search?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.pageSize) queryParams.set('pageSize', params.pageSize.toString());
    if (params?.search) queryParams.set('search', params.search);

    const query = queryParams.toString();
    return request<{ sessions: any[]; total: number }>(
      `/api/sessions/recordings${query ? `?${query}` : ''}`
    );
  },

  // 获取单个会话录制
  getSessionRecording: (sessionId: string) =>
    request<any>(`/api/sessions/recordings/${sessionId}`),

  // 终止会话
  terminateSession: (sessionId: string) =>
    request<{ message: string }>(`/api/sessions/${sessionId}/terminate`, {
      method: 'DELETE',
    }),
};

// 命令审计 API
export const commandApi = {
  // 获取命令记录
  getCommandRecords: (params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    host?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.pageSize) queryParams.set('pageSize', params.pageSize.toString());
    if (params?.search) queryParams.set('search', params.search);
    if (params?.host) queryParams.set('host', params.host);

    const query = queryParams.toString();
    return request<{ commands: any[]; total: number }>(
      `/api/commands${query ? `?${query}` : ''}`
    );
  },

  // 获取指定会话的命令记录
  getCommandsBySession: (sessionId: string) =>
    request<any[]>(`/api/commands/session/${sessionId}`),
};

// 认证 API
export const authApi = {
  // 获取启用的认证方式（不需要认证）
  getAuthMethods: () =>
    request<{
      password: boolean;
      ldap: boolean;
      sso: boolean;
      primary: 'password' | 'ldap' | 'sso';
    }>('/api/auth/methods'),

  // 登录
  login: (username: string, password: string, twoFactorCode?: string, backupCode?: string) =>
    request<{ token: string; user: any; requiresTwoFactor?: boolean; twoFactorEnabled?: boolean; needsTwoFactorSetup?: boolean }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ 
        username, 
        password, 
        twoFactorCode, 
        backupCode 
      }),
    }),

  // 登出
  logout: () =>
    request<void>('/api/auth/logout', {
      method: 'POST',
    }),

  // 获取当前用户信息
  getCurrentUser: () => request<any>('/api/auth/me'),

  // 发起 SSO 登录
  initiateSSO: () =>
    request<{ authUrl: string; state: string }>('/api/auth/sso/initiate'),

  // 获取平台登录记录
  getLoginRecords: (params?: { page?: number; pageSize?: number }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.pageSize) queryParams.set('pageSize', params.pageSize.toString());

    const query = queryParams.toString();
    return request<{ records: any[]; total: number }>(
      `/api/auth/login-records${query ? `?${query}` : ''}`
    );
  },
};

// 用户 API
export const userApi = {
  // 获取用户列表（用于黑名单选择）
  getUsers: () => request<{ users: any[] }>('/api/users'),
};

// 用户管理 API（管理员功能）
export interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: 'admin' | 'user';
  status: 'active' | 'inactive';
  lastLoginTime?: string;
  lastLoginIp?: string;
  sshPublicKey?: string;
  authMethod?: 'password' | 'publickey' | 'both';
  sshKeyGeneratedAt?: string;
  sshKeyFingerprint?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  autoDisableOnExpiry?: boolean;
  userGroups?: { id: string; name: string }[];
}

export const userManagementApi = {
  // 分页获取用户列表
  getUsersWithPagination: (params?: {
    page?: number;
    pageSize?: number;
    keyword?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.pageSize) queryParams.set('pageSize', params.pageSize.toString());
    if (params?.keyword) queryParams.set('keyword', params.keyword);

    const query = queryParams.toString();
    return request<{ users: User[]; total: number; page: number; pageSize: number }>(
      `/api/user-management/users${query ? `?${query}` : ''}`
    );
  },

  // 创建用户
  createUser: (user: {
    username: string;
    password: string;
    email: string;
    fullName: string;
    role: 'admin' | 'user';
    authMethod?: 'password' | 'publickey' | 'both';
    expiresAt?: string;
    autoDisableOnExpiry?: boolean;
  }) =>
    request<User>('/api/user-management/users', {
      method: 'POST',
      body: JSON.stringify(user),
    }),

  // 更新用户信息
  updateUser: (id: string, user: { fullName: string; email: string }) =>
    request<{ message: string }>(`/api/user-management/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(user),
    }),

  // 更新用户角色
  updateUserRole: (id: string, role: 'admin' | 'user') =>
    request<{ message: string }>(`/api/user-management/users/${id}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    }),

  // 更新用户状态
  updateUserStatus: (id: string, status: 'active' | 'inactive') =>
    request<{ message: string }>(`/api/user-management/users/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    }),

  // 删除用户
  deleteUser: (id: string) =>
    request<{ message: string }>(`/api/user-management/users/${id}`, {
      method: 'DELETE',
    }),

  // 重置密码
  resetPassword: (id: string, password: string) =>
    request<{ message: string }>(`/api/user-management/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  // 重置用户2FA
  resetUser2FA: (id: string) =>
    request<{ message: string }>(`/api/admin/two-factor/reset/${id}`, {
      method: 'POST',
    }),

  // 获取用户分组权限
  getUserGroups: (id: string) =>
    request<{ groupIds: string[] }>(`/api/user-management/users/${id}/groups`),

  // 分配分组权限
  assignGroups: (id: string, groupIds: string[]) =>
    request<{ message: string }>(`/api/user-management/users/${id}/groups`, {
      method: 'POST',
      body: JSON.stringify({ groupIds }),
    }),

  // 获取所有用户及其分组信息（分页）
  getUsersWithGroups: (params?: {
    page?: number;
    pageSize?: number;
    keyword?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.pageSize) queryParams.set('pageSize', params.pageSize.toString());
    if (params?.keyword) queryParams.set('keyword', params.keyword);

    const query = queryParams.toString();
    return request<{ users: (User & { groupIds?: string[]; hostIds?: string[] })[]; total: number }>(
      `/api/user-management/users-with-groups${query ? `?${query}` : ''}`
    );
  },

  // 获取所有用户及其所属用户组（分页）
  getUsersWithUserGroups: (params?: {
    page?: number;
    pageSize?: number;
    keyword?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.pageSize) queryParams.set('pageSize', params.pageSize.toString());
    if (params?.keyword) queryParams.set('keyword', params.keyword);

    const query = queryParams.toString();
    return request<{ users: User[]; total: number }>(
      `/api/user-management/users-with-user-groups${query ? `?${query}` : ''}`
    );
  },

  // 获取用户主机权限
  getUserHosts: (id: string) =>
    request<{ hostIds: string[] }>(`/api/user-management/users/${id}/hosts`),

  // 分配主机权限
  assignHosts: (id: string, hostIds: string[]) =>
    request<{ message: string }>(`/api/user-management/users/${id}/hosts`, {
      method: 'POST',
      body: JSON.stringify({ hostIds }),
    }),

  // 获取用户完整权限（分组+主机）
  getUserPermissions: (id: string) =>
    request<User & { groupIds?: string[]; hostIds?: string[] }>(
      `/api/user-management/users/${id}/permissions`
    ),

  // SSH密钥管理
  generateSSHKey: (id: string) =>
    request<{ message: string; fingerprint: string; publicKey: string; generatedAt: string }>(
      `/api/user-management/users/${id}/ssh-key/generate`,
      {
        method: 'POST',
      }
    ),

  deleteSSHKey: (id: string) =>
    request<{ message: string }>(`/api/user-management/users/${id}/ssh-key`, {
      method: 'DELETE',
    }),

  downloadSSHPrivateKey: async (id: string): Promise<Blob> => {
    const token = localStorage.getItem('token');
    const response = await fetch(
      `${config.apiUrl}/api/user-management/users/${id}/ssh-key/download`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      let errorMessage = 'Download failed';
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorMessage;
      } catch (e) {
        // 如果响应不是JSON，使用状态文本
        errorMessage = response.statusText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    return response.blob();
  },

  updateUserAuthMethod: (id: string, authMethod: 'password' | 'publickey' | 'both') =>
    request<{ message: string }>(`/api/user-management/users/${id}/auth-method`, {
      method: 'PUT',
      body: JSON.stringify({ authMethod }),
    }),
};

// 黑名单 API
export const blacklistApi = {
  // 获取黑名单规则列表
  getRules: () =>
    request<{ rules: BlacklistRule[] }>('/api/proxy/blacklist/commands'),

  // 添加黑名单规则
  createRule: (rule: Omit<BlacklistRule, 'id' | 'createdAt' | 'updatedAt'>) =>
    request<BlacklistRule>('/api/proxy/blacklist/commands', {
      method: 'POST',
      body: JSON.stringify(rule),
    }),

  // 更新黑名单规则
  updateRule: (id: string, rule: Partial<BlacklistRule>) =>
    request<BlacklistRule>(`/api/proxy/blacklist/commands/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(rule),
    }),

  // 删除黑名单规则
  deleteRule: (id: string) =>
    request<void>(`/api/proxy/blacklist/commands/${id}`, {
      method: 'DELETE',
    }),
};

// 系统设置 API
export const settingsApi = {
  // 获取所有设置
  getAllSettings: () => 
    request<Record<string, any>>('/api/settings'),

  // 获取指定分类的设置
  getSettingsByCategory: (category: string) =>
    request<Record<string, any>>(`/api/settings/${category}`),

  // 批量更新设置
  updateSettings: (settings: Record<string, any>) =>
    request<void>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),

  // 获取公开设置（不需要认证）
  getPublicSettings: () =>
    request<Record<string, any>>('/api/settings/public'),

  // 测试 LDAP 连接
  testLDAPConnection: (config: {
    server: string;
    baseDN: string;
    bindDN: string;
    bindPassword: string;
    enableSSL?: boolean;
    enableTLS?: boolean;
    timeout?: number;
  }) =>
    request<{ success: boolean; message: string }>('/api/settings/test-ldap', {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  // 测试 SSO 配置
  testSSOConnection: (config: {
    provider: string;
    clientId: string;
    clientSecret: string;
    authUrl: string;
    tokenUrl: string;
    userInfoUrl?: string;
  }) =>
    request<{ success: boolean; message: string }>('/api/settings/test-sso', {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  // 测试飞书通知
  testFeishuNotification: (config: {
    webhook: string;
    secret?: string;
  }) =>
    request<{ success: boolean; message: string }>('/api/settings/test-feishu', {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  // 测试钉钉通知
  testDingtalkNotification: (config: {
    webhook: string;
    secret?: string;
  }) =>
    request<{ success: boolean; message: string }>('/api/settings/test-dingtalk', {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  // 测试企业微信通知
  testWechatNotification: (config: {
    corpId: string;
    agentId: string;
    secret: string;
  }) =>
    request<{ success: boolean; message: string }>('/api/settings/test-wechat', {
      method: 'POST',
      body: JSON.stringify(config),
    }),
};

// 审批 API
export const approvalApi = {
  // 获取审批列表
  getApprovals: (params?: {
    user_id?: string;
    status?: ApprovalStatus;
    type?: ApprovalType;
    role?: 'my' | 'approve' | 'all'; // my: 我的申请, approve: 待我审批, all: 全部
    page?: number;
    pageSize?: number;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.user_id) queryParams.set('user_id', params.user_id);
    if (params?.status) queryParams.set('status', params.status);
    if (params?.type) queryParams.set('type', params.type);
    if (params?.role) queryParams.set('role', params.role);
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.pageSize) queryParams.set('pageSize', params.pageSize.toString());
    
    const query = queryParams.toString();
    return request<{ approvals: Approval[]; total: number }>(
      `/api/approvals${query ? `?${query}` : ''}`
    );
  },

  // 获取审批详情
  getApproval: (id: string) => 
    request<{ approval: Approval; comments: ApprovalComment[] }>(`/api/approvals/${id}`),

  // 创建审批申请
  createApproval: (approval: {
    title: string;
    description?: string;
    type: ApprovalType;
    platform?: ApprovalPlatform;
    applicant_id: string;
    applicant_name?: string;
    applicant_email?: string;
    approver_ids?: string[];
    approver_names?: string[];
    resource_type?: string;
    resource_ids?: string[];
    resource_names?: string[];
    permissions?: string[];
    duration?: number;
    reason: string;
  }) =>
    request<Approval>('/api/approvals', {
      method: 'POST',
      body: JSON.stringify(approval),
    }),

  // 批准审批
  approveApproval: (id: string, data: {
    approver_id: string;
    approver_name?: string;
    comment?: string;
  }) =>
    request<Approval>(`/api/approvals/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // 拒绝审批
  rejectApproval: (id: string, data: {
    approver_id: string;
    approver_name?: string;
    reason: string;
  }) =>
    request<Approval>(`/api/approvals/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // 取消审批
  cancelApproval: (id: string, data: {
    user_id: string;
    reason?: string;
  }) =>
    request<Approval>(`/api/approvals/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // 添加评论
  addComment: (id: string, data: {
    user_id: string;
    user_name?: string;
    comment: string;
  }) =>
    request<ApprovalComment>(`/api/approvals/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // 获取审批统计
  getApprovalStats: (userId?: string) => {
    const queryParams = new URLSearchParams();
    if (userId) queryParams.set('user_id', userId);
    
    const query = queryParams.toString();
    return request<{
      my_approvals?: {
        total: number;
        pending: number;
        approved: number;
        rejected: number;
      };
      pending_approvals?: number;
      global: {
        total: number;
        pending: number;
        approved: number;
        rejected: number;
      };
    }>(`/api/approvals/stats${query ? `?${query}` : ''}`);
  },

  // 搜索用户（审批人选择）
  searchUsers: (keyword: string) =>
    request<{ users: any[] }>(`/api/approvals/search/users?keyword=${encodeURIComponent(keyword)}`),

  // 搜索主机（资源选择）
  searchHosts: (keyword: string) =>
    request<{ hosts: any[] }>(`/api/approvals/search/hosts?keyword=${encodeURIComponent(keyword)}`),

  // 获取审批配置
  getApprovalConfig: () =>
    request<{ configs: ApprovalConfig[]; platforms: string[] }>('/api/approvals/config'),

  // 更新审批配置
  updateApprovalConfig: (id: string | null, config: Partial<ApprovalConfig>) => {
    if (id) {
      return request<ApprovalConfig>(`/api/approvals/config/${id}`, {
        method: 'PUT',
        body: JSON.stringify(config),
      });
    } else {
      return request<ApprovalConfig>('/api/approvals/config', {
        method: 'POST',
        body: JSON.stringify(config),
      });
    }
  },

  // 删除审批配置
  deleteApprovalConfig: (id: string) =>
    request<void>(`/api/approvals/config/${id}`, {
      method: 'DELETE',
    }),
};

// 主机分组 API
export const hostGroupApi = {
  // 获取所有分组
  listGroups: (params?: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    stats?: boolean;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.pageSize) queryParams.set('pageSize', params.pageSize.toString());
    if (params?.keyword) queryParams.set('keyword', params.keyword);
    if (params?.stats) queryParams.set('stats', 'true');
    
    const query = queryParams.toString();
    return request<{ groups: HostGroup[]; total?: number }>(
      `/api/host-groups${query ? `?${query}` : ''}`
    );
  },

  // 获取单个分组详情
  getGroup: (id: string) => 
    request<HostGroup>(`/api/host-groups/${id}`),

  // 创建分组
  createGroup: (group: {
    name: string;
    description?: string;
    color?: string;
    icon?: string;
  }) =>
    request<HostGroup>('/api/host-groups', {
      method: 'POST',
      body: JSON.stringify(group),
    }),

  // 更新分组
  updateGroup: (id: string, group: Partial<HostGroup>) =>
    request<HostGroup>(`/api/host-groups/${id}`, {
      method: 'PUT',
      body: JSON.stringify(group),
    }),

  // 删除分组
  deleteGroup: (id: string) =>
    request<void>(`/api/host-groups/${id}`, {
      method: 'DELETE',
    }),

  // 获取分组中的主机
  getGroupHosts: (id: string) =>
    request<{ hosts: any[] }>(`/api/host-groups/${id}/hosts`),

  // 获取分组的授权用户列表
  getGroupUsers: (id: string) =>
    request<{ users: User[] }>(`/api/host-groups/${id}/users`),

  // 添加主机到分组
  addHostsToGroup: (id: string, hostIds: string[]) =>
    request<{ message: string }>(`/api/host-groups/${id}/hosts`, {
      method: 'POST',
      body: JSON.stringify({ hostIds }),
    }),

  // 从分组移除主机
  removeHostsFromGroup: (id: string, hostIds: string[]) =>
    request<{ message: string }>(`/api/host-groups/${id}/hosts`, {
      method: 'DELETE',
      body: JSON.stringify({ hostIds }),
    }),

  // 获取分组统计
  getGroupStatistics: (id: string) =>
    request<{
      totalHosts: number;
      onlineHosts: number;
      offlineHosts: number;
    }>(`/api/host-groups/${id}/statistics`),

  // 获取主机所属的分组
  getHostGroups: (hostId: string) =>
    request<HostGroup[]>(`/api/hosts/${hostId}/groups`),
};

// Asset Sync Types
export interface AssetSyncConfig {
  id: string;
  name: string;
  type: 'prometheus' | 'zabbix' | 'cmdb' | 'custom';
  enabled: boolean;
  url: string;
  auth_type?: 'none' | 'basic' | 'token' | 'oauth';
  username?: string;
  password?: string;
  token?: string;
  sync_interval: number; // 分钟
  last_sync_time?: string;
  last_sync_status?: 'success' | 'failed';
  synced_count?: number;
  error_message?: string;
  config?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AssetSyncLog {
  id: string;
  config_id: string;
  status: 'success' | 'failed';
  synced_count: number;
  error_message?: string;
  duration: number;
  created_at: string;
}

// 文件传输 API
export const fileApi = {
  // 上传文件到目标服务器
  uploadFile: async (hostId: string, remotePath: string, systemUserId: string, file: File, onProgress?: (progress: number) => void): Promise<any> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('hostId', hostId);
    formData.append('remotePath', remotePath);
    formData.append('systemUserId', systemUserId);

    try {
      const response = await axiosInstance.post('/api/files/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total && onProgress) {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            onProgress(percentCompleted);
          }
        },
      });

      return response.data;
    } catch (error) {
      console.error('Failed to upload file:', error);
      throw error;
    }
  },

  // 从目标服务器下载文件
  downloadFile: async (hostId: string, remotePath: string, systemUserId: string): Promise<Blob> => {
    try {
      const response = await axiosInstance.get('/api/files/download', {
        params: {
          hostId,
          remotePath,
          systemUserId,
        },
        responseType: 'blob',
      });

      return response.data;
    } catch (error) {
      console.error('Failed to download file:', error);
      throw error;
    }
  },

  // 列出远程目录文件
  listFiles: async (hostId: string, path: string, systemUserId: string): Promise<{ files: any[] }> => {
    return request<{ files: any[] }>(`/api/files/list?hostId=${hostId}&path=${encodeURIComponent(path)}&systemUserId=${systemUserId}`);
  },

  // 获取文件传输记录
  getFileTransfers: (params?: {
    hostId?: string;
    userId?: string;
    direction?: 'upload' | 'download';
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.hostId) queryParams.set('hostId', params.hostId);
    if (params?.userId) queryParams.set('userId', params.userId);
    if (params?.direction) queryParams.set('direction', params.direction);

    const query = queryParams.toString();
    return request<{ transfers: any[] }>(
      `/api/files/transfers${query ? `?${query}` : ''}`
    );
  },
};

// Asset Sync API
export const assetSyncApi = {
  // 获取所有同步配置
  getConfigs: () =>
    request<{ configs: AssetSyncConfig[] }>('/api/asset-sync/configs'),

  // 创建同步配置
  createConfig: (config: Omit<AssetSyncConfig, 'id' | 'created_at' | 'updated_at'>) =>
    request<AssetSyncConfig>('/api/asset-sync/configs', {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  // 更新同步配置
  updateConfig: (id: string, config: Partial<AssetSyncConfig>) =>
    request<AssetSyncConfig>(`/api/asset-sync/configs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(config),
    }),

  // 删除同步配置
  deleteConfig: (id: string) =>
    request<void>(`/api/asset-sync/configs/${id}`, {
      method: 'DELETE',
    }),

  // 启用/禁用配置
  toggleConfig: (id: string) =>
    request<AssetSyncConfig>(`/api/asset-sync/configs/${id}/toggle`, {
      method: 'POST',
    }),

  // 立即同步
  syncNow: (id: string) =>
    request<{ message: string }>(`/api/asset-sync/configs/${id}/sync`, {
      method: 'POST',
    }),

  // 获取同步日志
  getLogs: (configId?: string) =>
    request<{ logs: AssetSyncLog[] }>(
      `/api/asset-sync/logs${configId ? `?configId=${configId}` : ''}`
    ),
};


