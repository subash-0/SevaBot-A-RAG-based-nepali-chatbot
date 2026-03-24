import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage keys (shared across the app)
export const STORAGE_KEYS = {
  TOKEN: 'token',
  USER: 'user',
  SERVER_IP: 'server_ip',
  ONBOARDING_DONE: 'onboarding_done',
};

/** Default fallback — Android emulator localhost */
export const DEFAULT_SERVER_IP = '10.0.2.2:8000';

/** Read the user-configured server address, falling back to the default */
export async function getServerIP(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.SERVER_IP);
    return stored && stored.trim() ? stored.trim() : DEFAULT_SERVER_IP;
  } catch {
    return DEFAULT_SERVER_IP;
  }
}

/** Build the full base URL from a host:port string */
export function buildBaseURL(hostPort: string): string {
  const cleaned = hostPort.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return `http://${cleaned}/api`;
}

// Create the axios instance (baseURL is overridden per-request via interceptor)
export const api = axios.create({
  baseURL: buildBaseURL(DEFAULT_SERVER_IP),
  headers: {'Content-Type': 'application/json'},
  timeout: 30000,
});

// Request interceptor — dynamically sets baseURL and auth token
api.interceptors.request.use(
  async config => {
    const ip = await getServerIP();
    config.baseURL = buildBaseURL(ip);

    const token = await AsyncStorage.getItem(STORAGE_KEYS.TOKEN);
    if (token) {
      config.headers.Authorization = `Token ${token}`;
    }
    return config;
  },
  error => Promise.reject(error),
);

// Response interceptor — clears auth on 401
api.interceptors.response.use(
  response => response,
  async error => {
    if (error.response?.status === 401) {
      await AsyncStorage.removeItem(STORAGE_KEYS.TOKEN);
      await AsyncStorage.removeItem(STORAGE_KEYS.USER);
    }
    return Promise.reject(error);
  },
);

// ─── Authentication ────────────────────────────────────────────────────────
export const authAPI = {
  signup: (data: {username: string; email: string; password: string}) =>
    api.post('/auth/signup/', data),
  login: (data: {username: string; password: string}) =>
    api.post('/auth/login/', data),
  logout: () => api.post('/auth/logout/'),
};

// ─── Conversations ─────────────────────────────────────────────────────────
export const conversationAPI = {
  list: () => api.get('/conversations/'),
  create: (data: {title: string}) => api.post('/conversations/', data),
  get: (id: number) => api.get(`/conversations/${id}/`),
  update: (id: number, data: any) => api.put(`/conversations/${id}/`, data),
  delete: (id: number) => api.delete(`/conversations/${id}/`),
  addMessage: (id: number, content: string, useRag = true) =>
    api.post(`/conversations/${id}/add_message/`, {content, use_rag: useRag}),
};

// ─── Messages ──────────────────────────────────────────────────────────────
export const messageAPI = {
  delete: (id: number) => api.delete(`/messages/${id}/`),
  update: (id: number, content: string) =>
    api.put(`/messages/${id}/`, {content}),
};

export default api;
