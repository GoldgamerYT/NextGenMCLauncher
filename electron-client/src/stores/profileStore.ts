import { create } from 'zustand';
import axios from 'axios';

const API_URL = 'http://localhost:35555/api';

export interface Profile {
  id: string;           // Same as name for simplicity
  name: string;
  version: string;      // MC version e.g. "1.21.1"
  modLoader: string;    // "vanilla" | "fabric" | "forge" | "neoforge"
  loaderVersion?: string;
  ramMb: number;
  javaPath?: string;
  gameDir?: string;
  iconPath?: string;
  status?: 'stopped' | 'installing' | 'running';
}

interface ProfileState {
  profiles: Profile[];
  currentProfile: Profile | null;
  loading: boolean;
  error: string | null;
  
  // Actions
  loadProfiles: () => Promise<void>;
  addProfile: (profile: Omit<Profile, 'id'>) => Promise<void>;
  updateProfile: (name: string, updates: Partial<Profile>) => Promise<void>;
  deleteProfile: (name: string) => Promise<void>;
  setCurrentProfile: (id: string | null) => void;
  setProfileStatus: (name: string, status: Profile['status']) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profiles: [],
  currentProfile: null,
  loading: false,
  error: null,
  
  loadProfiles: async () => {
    set({ loading: true, error: null });
    try {
      const res = await axios.get<any[]>(`${API_URL}/profiles`);
      const profiles: Profile[] = res.data.map(p => ({
        id: p.name,
        name: p.name,
        version: p.version,
        modLoader: p.modLoader || 'vanilla',
        loaderVersion: p.loaderVersion,
        ramMb: p.ramMb || 4096,
        javaPath: p.javaPath,
        gameDir: p.gameDir,
        iconPath: p.iconPath,
        status: 'stopped' as const
      }));
      set({ profiles, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },
  
  addProfile: async (profile) => {
    set({ loading: true, error: null });
    try {
      await axios.post(`${API_URL}/profiles`, {
        name: profile.name,
        version: profile.version,
        modLoader: profile.modLoader,
        loaderVersion: profile.loaderVersion,
        ramMb: profile.ramMb || 4096
      });
      // Reload profiles from server
      await get().loadProfiles();
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },
  
  updateProfile: async (name, updates) => {
    set({ loading: true, error: null });
    try {
      const current = get().profiles.find(p => p.name === name);
      if (!current) throw new Error('Profile not found');
      
      await axios.put(`${API_URL}/profiles/${encodeURIComponent(name)}`, {
        ...current,
        ...updates
      });
      await get().loadProfiles();
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },
  
  deleteProfile: async (name) => {
    set({ loading: true, error: null });
    try {
      await axios.delete(`${API_URL}/profiles/${encodeURIComponent(name)}`);
      const { currentProfile } = get();
      if (currentProfile?.name === name) {
        set({ currentProfile: null });
      }
      await get().loadProfiles();
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },
  
  setCurrentProfile: (id) => {
    const { profiles } = get();
    const profile = id ? profiles.find(p => p.id === id) : null;
    set({ currentProfile: profile || null });
  },
  
  setProfileStatus: (name, status) => {
    set(state => ({
      profiles: state.profiles.map(p => 
        p.name === name ? { ...p, status } : p
      ),
      currentProfile: state.currentProfile?.name === name 
        ? { ...state.currentProfile, status }
        : state.currentProfile
    }));
  },
  
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));
