import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface GameAccount {
  uuid: string;
  name: string;
  email: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  skinUrl?: string;
  capeUrl?: string;
}

interface AccountState {
  accounts: GameAccount[];
  currentAccount: GameAccount | null;
  loading: boolean;
  error: string | null;
  
  // Actions
  setAccounts: (accounts: GameAccount[]) => void;
  addAccount: (account: GameAccount) => void;
  selectAccount: (uuid: string) => void;
  removeAccount: (uuid: string) => void;
  updateAccount: (uuid: string, updates: Partial<GameAccount>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  logout: () => void;
}

export const useAccountStore = create<AccountState>()(
  persist(
    (set) => ({
      accounts: [],
      currentAccount: null,
      loading: false,
      error: null,
      
      setAccounts: (accounts) => set({ accounts, error: null }),
      
      addAccount: (account) => set((state) => ({
        accounts: [...state.accounts, account],
        currentAccount: state.currentAccount || account,
        error: null
      })),
      
      selectAccount: (uuid) => set((state) => ({
        currentAccount: state.accounts.find(a => a.uuid === uuid) || null,
        error: null
      })),
      
      removeAccount: (uuid) => set((state) => ({
        accounts: state.accounts.filter(a => a.uuid !== uuid),
        currentAccount: state.currentAccount?.uuid === uuid ? null : state.currentAccount,
        error: null
      })),
      
      updateAccount: (uuid, updates) => set((state) => ({
        accounts: state.accounts.map(a => a.uuid === uuid ? {...a, ...updates} : a),
        currentAccount: state.currentAccount?.uuid === uuid
          ? {...state.currentAccount, ...updates}
          : state.currentAccount,
        error: null
      })),
      
      setLoading: (loading) => set({ loading }),
      
      setError: (error) => set({ error }),
      
      clearError: () => set({ error: null }),
      
      logout: () => set({ currentAccount: null, accounts: [] }),
    }),
    {
      name: 'atlas-accounts',
      version: 1,
    }
  )
);
