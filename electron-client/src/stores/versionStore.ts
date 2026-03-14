import { create } from 'zustand';
import axios from 'axios';

const API_URL = 'http://localhost:35555/api';

interface VersionState {
  versions: string[];
  loading: boolean;
  error: string | null;
  
  // Actions
  loadVersions: () => Promise<void>;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useVersionStore = create<VersionState>((set) => ({
  versions: [],
  loading: false,
  error: null,
  
  loadVersions: async () => {
    set({ loading: true, error: null });
    try {
      const res = await axios.get<string[]>(`${API_URL}/versions/game`);
      set({ versions: res.data || [], loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },
  
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));
