/**
 * API 层统一入口
 * 
 * 所有的 API 请求都通过这个模块导出
 * 使用方式：import { hostApi, authApi } from '@/api'
 */

// 导出所有 API 模块
export * from './api';

// 导出工具函数
export { showSuccessToast } from './request';

// 默认导出 axios 实例（如果需要直接使用）
export { default as axiosInstance } from './request';

// 同时导出 default，方便直接使用 import api from '../api'
import axiosInstance from './request';
export default axiosInstance;

