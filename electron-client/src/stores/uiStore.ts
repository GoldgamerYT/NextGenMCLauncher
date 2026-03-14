import { create } from 'zustand';

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  timestamp: Date;
  duration?: number; // ms before auto-close (0 = manual)
}

interface UIState {
  theme: 'dark' | 'light';
  notifications: Notification[];
  isLaunching: boolean;
  launchProgress: number; // 0-100
  gameLogs: string[];
  
  // Actions
  setTheme: (theme: 'dark' | 'light') => void;
  toggleTheme: () => void;
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
  setIsLaunching: (launching: boolean) => void;
  setLaunchProgress: (progress: number) => void;
  addGameLog: (log: string) => void;
  clearGameLogs: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  theme: 'dark',
  notifications: [],
  isLaunching: false,
  launchProgress: 0,
  gameLogs: [],
  
  setTheme: (theme) => set({ theme }),
  
  toggleTheme: () => set((state) => ({
    theme: state.theme === 'dark' ? 'light' : 'dark'
  })),
  
  addNotification: (notification) => set((state) => ({
    notifications: [
      ...state.notifications,
      {
        ...notification,
        id: Math.random().toString(36).substr(2, 9),
        timestamp: new Date(),
      }
    ]
  })),
  
  removeNotification: (id) => set((state) => ({
    notifications: state.notifications.filter(n => n.id !== id)
  })),
  
  clearNotifications: () => set({ notifications: [] }),
  
  setIsLaunching: (launching) => set({ isLaunching: launching }),
  
  setLaunchProgress: (progress) => set({ launchProgress: Math.min(100, Math.max(0, progress)) }),
  
  addGameLog: (log) => set((state) => ({
    gameLogs: [...state.gameLogs, log].slice(-1000) // Keep last 1000 logs
  })),
  
  clearGameLogs: () => set({ gameLogs: [] }),
}));
