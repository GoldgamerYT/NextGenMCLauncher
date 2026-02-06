import { create } from 'zustand';

export interface MCVersion {
  id: string;
  name: string;
  type: 'release' | 'snapshot';
  releaseTime: Date;
  loaders?: {
    forge?: string[];
    fabric?: string[];
    neoforge?: string[];
  };
}

interface VersionState {
  versions: MCVersion[];
  forgeVersions: string[];
  fabricVersions: string[];
  neoforgeVersions: string[];
  loading: boolean;
  error: string | null;
  lastFetch?: Date;
  
  // Actions
  setVersions: (versions: MCVersion[]) => void;
  setForgeVersions: (versions: string[]) => void;
  setFabricVersions: (versions: string[]) => void;
  setNeoforgeVersions: (versions: string[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setLastFetch: (date: Date) => void;
  clearError: () => void;
}

export const useVersionStore = create<VersionState>((set) => ({
  versions: [],
  forgeVersions: [],
  fabricVersions: [],
  neoforgeVersions: [],
  loading: false,
  error: null,
  lastFetch: undefined,
  
  setVersions: (versions) => set({ versions, error: null }),
  
  setForgeVersions: (versions) => set({ forgeVersions: versions, error: null }),
  
  setFabricVersions: (versions) => set({ fabricVersions: versions, error: null }),
  
  setNeoforgeVersions: (versions) => set({ neoforgeVersions: versions, error: null }),
  
  setLoading: (loading) => set({ loading }),
  
  setError: (error) => set({ error }),
  
  setLastFetch: (date) => set({ lastFetch: date }),
  
  clearError: () => set({ error: null }),
}));
