import { create } from 'zustand';

export interface Mod {
  id: string;
  name: string;
  version: string;
  loader: 'forge' | 'fabric' | 'neoforge';
  mcVersion: string;
  source: 'modrinth' | 'curseforge';
  downloadUrl: string;
  description?: string;
  authors?: string[];
  fileSize?: number;
}

export interface InstalledMod extends Mod {
  installedAt: Date;
  enabled: boolean;
}

interface ModState {
  searchResults: Mod[];
  installedMods: InstalledMod[];
  loading: boolean;
  searching: boolean;
  error: string | null;
  
  // Actions
  setSearchResults: (mods: Mod[]) => void;
  setInstalledMods: (mods: InstalledMod[]) => void;
  addInstalledMod: (mod: InstalledMod) => void;
  removeInstalledMod: (id: string) => void;
  toggleModEnabled: (id: string) => void;
  setLoading: (loading: boolean) => void;
  setSearching: (searching: boolean) => void;
  setError: (error: string | null) => void;
  clearSearchResults: () => void;
  clearError: () => void;
}

export const useModStore = create<ModState>((set) => ({
  searchResults: [],
  installedMods: [],
  loading: false,
  searching: false,
  error: null,
  
  setSearchResults: (mods) => set({ searchResults: mods, error: null }),
  
  setInstalledMods: (mods) => set({ installedMods: mods, error: null }),
  
  addInstalledMod: (mod) => set((state) => ({
    installedMods: [...state.installedMods, mod],
    error: null
  })),
  
  removeInstalledMod: (id) => set((state) => ({
    installedMods: state.installedMods.filter(m => m.id !== id),
    error: null
  })),
  
  toggleModEnabled: (id) => set((state) => ({
    installedMods: state.installedMods.map(m => 
      m.id === id ? {...m, enabled: !m.enabled} : m
    )
  })),
  
  setLoading: (loading) => set({ loading }),
  
  setSearching: (searching) => set({ searching }),
  
  setError: (error) => set({ error }),
  
  clearSearchResults: () => set({ searchResults: [] }),
  
  clearError: () => set({ error: null }),
}));
