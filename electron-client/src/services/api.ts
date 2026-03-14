import axios, { AxiosInstance, AxiosError } from 'axios';
import { useUIStore } from '../stores/uiStore';

const API_BASE = 'http://localhost:35555';

// Create axios instance
export const api: AxiosInstance = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const uiStore = useUIStore.getState();
    
    const data = error.response?.data as any;
    const message = data?.error || error.message || 'An error occurred';
    
    uiStore.addNotification({
      type: 'error',
      message: String(message),
      duration: 5000,
    });
    
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);

// API Response wrapper type
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp?: string;
}

// === PROFILE ENDPOINTS ===
export const profileService = {
  async list() {
    const { data } = await api.get<ApiResponse<any[]>>('/api/profiles');
    return data.data || [];
  },
  
  async create(profileData: any) {
    const { data } = await api.post<ApiResponse<any>>('/api/profiles', profileData);
    return data.data;
  },
  
  async update(id: string, profileData: any) {
    const { data } = await api.put<ApiResponse<any>>(`/api/profiles/${id}`, profileData);
    return data.data;
  },
  
  async delete(id: string) {
    await api.delete(`/api/profiles/${id}`);
  },
};

// === VERSION ENDPOINTS ===
export const versionService = {
  async listVanilla() {
    const { data } = await api.get<ApiResponse<any[]>>('/api/versions');
    return data.data || [];
  },
  
  async listForge() {
    const { data } = await api.get<ApiResponse<string[]>>('/api/versions/forge');
    return data.data || [];
  },
  
  async listFabric() {
    const { data } = await api.get<ApiResponse<string[]>>('/api/versions/fabric');
    return data.data || [];
  },
  
  async listNeoForge() {
    const { data } = await api.get<ApiResponse<string[]>>('/api/versions/neoforge');
    return data.data || [];
  },
  
  async install(versionId: string, loader: string) {
    const { data } = await api.post<ApiResponse<any>>(
      `/api/versions/${versionId}/install`,
      { loader }
    );
    return data.data;
  },
};

// === MOD ENDPOINTS (MODRINTH) ===
export const modService = {
  async searchModrinth(query: string, limit: number = 20) {
    const { data } = await api.get<ApiResponse<any[]>>(
      '/api/mods/modrinth/search',
      { params: { q: query, limit } }
    );
    return data.data || [];
  },
  
  async searchCurseForge(query: string, limit: number = 20) {
    const { data } = await api.get<ApiResponse<any[]>>(
      '/api/mods/curseforge/search',
      { params: { q: query, limit } }
    );
    return data.data || [];
  },
  
  async installMod(modId: string, versionId: string, source: 'modrinth' | 'curseforge') {
    const { data } = await api.post<ApiResponse<any>>(
      `/api/mods/${modId}/install`,
      { versionId, source }
    );
    return data.data;
  },
  
  async uninstallMod(modId: string) {
    await api.delete(`/api/mods/${modId}`);
  },
  
  async getModDetails(modId: string, source: 'modrinth' | 'curseforge') {
    const { data } = await api.get<ApiResponse<any>>(
      `/api/mods/${modId}`,
      { params: { source } }
    );
    return data.data;
  },
};

// === GAME LAUNCHER ENDPOINTS ===
export const gameService = {
  async launch(profileId: string) {
    const { data } = await api.post<ApiResponse<any>>(
      `/api/profiles/${profileId}/launch`
    );
    return data.data;
  },
  
  async stop() {
    await api.post('/api/game/stop');
  },
  
  async getStatus() {
    const { data } = await api.get<ApiResponse<any>>('/api/game/status');
    return data.data;
  },
};

// === ACCOUNT ENDPOINTS ===
export const accountService = {
  async getOAuthUrl() {
    const { data } = await api.get<ApiResponse<{ url: string }>>('/api/auth/oauth-url');
    return data.data?.url;
  },
  
  async handleOAuthCallback(code: string) {
    const { data } = await api.post<ApiResponse<any>>(
      '/api/auth/oauth-callback',
      { code }
    );
    return data.data;
  },
  
  async getCurrentAccount() {
    const { data } = await api.get<ApiResponse<any>>('/api/auth/current');
    return data.data;
  },
  
  async listAccounts() {
    const { data } = await api.get<ApiResponse<any[]>>('/api/auth/accounts');
    return data.data || [];
  },
  
  async removeAccount(uuid: string) {
    await api.delete(`/api/auth/accounts/${uuid}`);
  },
};

// === CONFIG ENDPOINTS ===
export const configService = {
  async getConfig() {
    const { data } = await api.get<ApiResponse<any>>('/api/config');
    return data.data;
  },
  
  async updateConfig(config: any) {
    const { data } = await api.post<ApiResponse<any>>('/api/config', config);
    return data.data;
  },
};

// === UTILITY FUNCTIONS ===
export const apiUtils = {
  /**
   * Check if backend is available
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await api.get('/', { timeout: 5000 });
      return response.status === 200;
    } catch {
      return false;
    }
  },
  
  /**
   * Wait for backend to be available
   */
  async waitForBackend(maxRetries: number = 30, delayMs: number = 1000): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
      if (await this.isHealthy()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    return false;
  },
};

export default api;
