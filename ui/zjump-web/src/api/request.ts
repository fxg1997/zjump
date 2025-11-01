import axios, { AxiosError, AxiosResponse } from 'axios';
import config from '../config';

// 创建 axios 实例
const axiosInstance = axios.create({
  baseURL: config.apiUrl,
  timeout: 30000, // 30秒超时
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器 - 自动添加 token
axiosInstance.interceptors.request.use(
  (config) => {
    // 从 localStorage 获取 token
    const token = localStorage.getItem('token');
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // 只在开发环境输出日志
    if (import.meta.env.DEV) {
      console.log(`[API Request] ${config.method?.toUpperCase()} ${config.url}`, config.data);
    }
    return config;
  },
  (error) => {
    console.error('[API Request Error]', error);
    return Promise.reject(error);
  }
);

// 响应拦截器 - 统一错误处理
axiosInstance.interceptors.response.use(
  (response: AxiosResponse) => {
    // 只在开发环境输出日志
    if (import.meta.env.DEV) {
      console.log(`[API Response] ${response.config.url}`, response.data);
    }
    
    // 使用 HTTP 状态码判断成功/失败
    // 2xx 状态码表示成功，直接返回响应
    // 业务层可以通过 response.data 获取数据
    return response;
  },
  (error: AxiosError) => {
    console.error('[API Response Error]', error);
    
    // 处理网络错误或HTTP错误
    if (error.response) {
      const { status, data } = error.response;
      
      switch (status) {
        case 401:
          // 对登录接口的401特殊处理：不要跳转，由页面自行处理重试/错误显示
          if (error.config && typeof error.config.url === 'string' && error.config.url.includes('/api/auth/login')) {
            // 直接透传错误，不做全局跳转
            break;
          }
          // 未授权，清除token并跳转到登录页
          showErrorToast('登录已过期，请重新登录');
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setTimeout(() => {
            window.location.href = '/login';
          }, 1500);
          break;
          
        case 403:
          showErrorToast('没有权限访问');
          break;
          
        case 404:
          showErrorToast('请求的资源不存在');
          break;
          
        case 500:
          showErrorToast('服务器错误，请稍后重试');
          break;
          
        case 502:
        case 503:
        case 504:
          showErrorToast('服务暂时不可用，请稍后重试');
          break;
          
        default:
          const message = (data as any)?.message || error.message || '请求失败';
          showErrorToast(message);
      }
    } else if (error.request) {
      // 请求已发出，但没有收到响应
      showErrorToast('网络连接失败，请检查网络设置');
    } else {
      // 其他错误
      showErrorToast(error.message || '请求失败');
    }
    
    return Promise.reject(error);
  }
);

// 错误提示函数
let toastTimeout: ReturnType<typeof setTimeout> | null = null;

export function showErrorToast(message: string) {
  // 清除之前的提示
  if (toastTimeout) {
    clearTimeout(toastTimeout);
  }
  
  // 移除旧的提示元素
  const oldToast = document.getElementById('api-error-toast');
  if (oldToast) {
    oldToast.remove();
  }
  
  // 创建新的提示元素
  const toast = document.createElement('div');
  toast.id = 'api-error-toast';
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #f44336;
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 9999;
    font-size: 14px;
    font-weight: 500;
    max-width: 400px;
    text-align: center;
    animation: slideDown 0.3s ease-out;
  `;
  toast.textContent = message;
  
  // 添加动画样式
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideDown {
      from {
        opacity: 0;
        transform: translateX(-50%) translateY(-20px);
      }
      to {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    }
    @keyframes fadeOut {
      to {
        opacity: 0;
        transform: translateX(-50%) translateY(-20px);
      }
    }
  `;
  document.head.appendChild(style);
  
  document.body.appendChild(toast);
  
  // 3秒后自动消失
  toastTimeout = setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease-out forwards';
    setTimeout(() => {
      toast.remove();
      style.remove();
    }, 300);
  }, 3000);
}

// 成功提示函数
export function showSuccessToast(message: string) {
  // 移除旧的提示元素
  const oldToast = document.getElementById('api-success-toast');
  if (oldToast) {
    oldToast.remove();
  }
  
  const toast = document.createElement('div');
  toast.id = 'api-success-toast';
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #4caf50;
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 9999;
    font-size: 14px;
    font-weight: 500;
    max-width: 400px;
    text-align: center;
    animation: slideDown 0.3s ease-out;
  `;
  toast.textContent = message;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease-out forwards';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

export default axiosInstance;

