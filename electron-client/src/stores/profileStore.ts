import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Profile {
  id: string;
  name: string;
  mcVersion: string;
  loader: 'vanilla' | 'forge' | 'fabric' | 'neoforge';
  mods: string[];
  jvmArgs: string;
  ramMb: number;
  createdAt: Date;
  lastPlayed?: Date;
}

interface ProfileState {
  profiles: Profile[];
  currentProfile: Profile | null;
  loading: boolean;
  error: string | null;
  
  // Actions
  setProfiles: (profiles: Profile[]) => void;
  addProfile: (profile: Profile) => void;
  updateProfile: (id: string, updates: Partial<Profile>) => void;
  deleteProfile: (id: string) => void;
  selectProfile: (id: string) => void;
  clearCurrent: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      profiles: [],
      currentProfile: null,
      loading: false,
      error: null,
      
      setProfiles: (profiles) => set({ profiles }),
      
      addProfile: (profile) => set((state) => ({
        profiles: [...state.profiles, profile],
        error: null
      })),
      
      updateProfile: (id, updates) => set((state) => ({
        profiles: state.profiles.map(p => p.id === id ? {...p, ...updates} : p),
        currentProfile: state.currentProfile?.id === id 
          ? {...state.currentProfile, ...updates}
          : state.currentProfile,
        error: null
      })),
      
      deleteProfile: (id) => set((state) => ({
        profiles: state.profiles.filter(p => p.id !== id),
        currentProfile: state.currentProfile?.id === id ? null : state.currentProfile,
        error: null
      })),
      
      selectProfile: (id) => set((state) => ({
        currentProfile: state.profiles.find(p => p.id === id) || null,
        error: null
      })),
      
      clearCurrent: () => set({ currentProfile: null }),
      
      setLoading: (loading) => set({ loading }),
      
      setError: (error) => set({ error }),
    }),
    {
      name: 'atlas-profiles',
      version: 1,
    }
  )
);
