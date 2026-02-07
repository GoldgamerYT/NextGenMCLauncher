import { useState, useEffect } from 'react';
import { Plus, LayoutGrid, Settings, LogOut, Gamepad2, AlertCircle } from 'lucide-react';
import logoDark from './assets/logos/logo-dark.svg';
import { TitleBar } from './components/TitleBar';
import { ModCenter } from './components/ModCenter';
import { GlobalSettings } from './components/GlobalSettings';
import { ProfileCard } from './components/ProfileCard';
import { AddProfileModal } from './components/AddProfileModal';
import { SettingsModal } from './components/SettingsModal';
import { LoginModal } from './components/LoginModal';

// Zustand Stores
import { useProfileStore } from './stores/profileStore';
import { useVersionStore } from './stores/versionStore';
import { useModStore } from './stores/modStore';
import { useAccountStore } from './stores/accountStore';
import { useUIStore } from './stores/uiStore';

// Services
import { api } from './api';
import { wsClient } from './services/websocket';

import clsx from 'clsx';

function App() {
  // Check for console window mode
  if (window.location.search.includes('console=')) {
    return <div className="w-full h-screen bg-black text-white font-mono text-sm p-4">Console Window</div>;
  }

  // State
  const [activeTab, setActiveTab] = useState<'launcher' | 'mods' | 'settings' | 'about'>('launcher');
  const [isAddProfileOpen, setIsAddProfileOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<any>(null);
  const [modCenterProfile, setModCenterProfile] = useState<any>(null);
  const [gridScale, setGridScale] = useState(1.0);
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  // Store Hooks
  const { profiles, currentProfile, setCurrentProfile, loadProfiles, deleteProfile, setProfileStatus } = useProfileStore();
  const { loadVersions } = useVersionStore();
  const { loadMods } = useModStore();
  const { currentAccount, logout } = useAccountStore();
  const { notifications, isLaunching, gameLogs, addNotification } = useUIStore();

  // Initialize Stores & WebSocket on Mount
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Load profiles from backend
        await loadProfiles();

        // Load versions
        await loadVersions();

        // Load mods
        await loadMods();

        // Connect WebSocket for real-time logs
        wsClient.connect();
        
        // Handle WebSocket status updates
        wsClient.on('status', (msg) => {
          if (msg.profile && msg.payload) {
            setProfileStatus(msg.profile, msg.payload as any);
          }
        });

        // Load grid config
        try {
          const config = await api.getConfig();
          if (config?.gridScale) {
            setGridScale(config.gridScale);
          }
        } catch (e) {
          console.log('Config load failed, using defaults');
        }
      } catch (error) {
        console.error('Failed to initialize app:', error);
        addNotification({type: 'error',
          message: 'Failed to initialize application',
        });
      }
    };

    initializeApp();

    // Cleanup WebSocket on unmount
    return () => {
      wsClient.disconnect();
    };
  }, []);

  const handleDeleteProfile = async (profileId: string) => {
    try {
      await deleteProfile(profileId);
      addNotification({type: 'success',
        message: 'Profile deleted',
        duration: 3000,
      });
    } catch (error: any) {
      addNotification({type: 'error',
        message: error.message || 'Failed to delete profile',
        duration: 5000,
      });
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      addNotification({type: 'success',
        message: 'Logged out',
        duration: 2000,
      });
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <div className="h-screen w-full bg-slate-950 text-white flex flex-col font-[Montserrat] overflow-hidden selection:bg-cyan-500/30">
      {/* Title Bar */}
      <TitleBar />

      {/* Ambient Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-500/5 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-cyan-500/5 blur-[120px]" />
      </div>

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden z-10 relative">
        {/* Sidebar */}
        <div className="w-20 lg:w-64 flex-shrink-0 flex flex-col p-4 gap-2 border-r border-white/5 bg-black/20 backdrop-blur-xl">
          <nav className="flex-1 flex flex-col gap-2">
            <NavButton
              active={activeTab === 'launcher'}
              onClick={() => setActiveTab('launcher')}
              icon={Gamepad2}
              label="Launcher"
            />
            <NavButton
              active={activeTab === 'mods'}
              onClick={() => setActiveTab('mods')}
              icon={Plus}
              label="Mods"
            />
            <NavButton
              active={activeTab === 'settings'}
              onClick={() => setActiveTab('settings')}
              icon={Settings}
              label="Settings"
            />
          </nav>

          {/* Account Section */}
          <div className="pt-4 border-t border-white/5 flex flex-col gap-2">
            {currentAccount ? (
              <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <p className="text-xs text-white/70 mb-1">Account</p>
                <p className="text-sm font-bold text-cyan-400 truncate">{currentAccount.name}</p>
                <button
                  onClick={handleLogout}
                  className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 text-xs rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 transition-colors"
                >
                  <LogOut size={14} />
                  <span className="hidden lg:block">Logout</span>
                </button>
              </div>
            ) : (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <p className="text-xs text-amber-300">Not logged in</p>
                <p className="text-xs text-white/60 mt-1">Login to play online</p>
                <button
                  onClick={() => setIsLoginOpen(true)}
                  className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 text-xs rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 transition-colors font-medium"
                >
                  Sign In
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          <div className="w-full h-full p-4 lg:p-8">
            {/* Launcher Tab */}
            {activeTab === 'launcher' && (
              <div className="space-y-8">
                {/* Header */}
                <div className="flex items-end justify-between">
                  <div>
                    <h1 className="text-4xl font-bold tracking-tight text-white mb-2">
                      Atlas Craft
                    </h1>
                    <p className="text-zinc-400 font-medium">Launch & Manage Game Profiles</p>
                  </div>
                  <button
                    onClick={() => setIsAddProfileOpen(true)}
                    className="group px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-cyan-500/30 transition-all active:scale-95 flex items-center gap-2"
                  >
                    <Plus size={20} />
                    <span>New Profile</span>
                  </button>
                </div>

                {/* Profiles Grid */}
                {profiles.length > 0 ? (
                  <div
                    className="grid gap-6 pb-20 transition-all"
                    style={{
                      gridTemplateColumns: `repeat(auto-fill, minmax(${280 * gridScale}px, 1fr))`,
                    }}
                  >
                    {profiles.map((profile) => (
                      <div
                        key={profile.id}
                        onClick={() => setCurrentProfile(profile.id)}
                        className={clsx(
                          'cursor-pointer transition-all',
                          currentProfile?.id === profile.id &&
                          'ring-2 ring-cyan-400 shadow-lg shadow-cyan-500/20'
                        )}
                      >
                        <ProfileCard
                          profile={profile}
                          onDelete={() => handleDeleteProfile(profile.id)}
                          onSettings={() => setEditingProfile(profile)}
                          onMods={() => setModCenterProfile(profile)}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center min-h-[50vh] border border-dashed border-white/10 rounded-3xl bg-white/[0.02]">
                    <div className="text-center">
                      <div className="inline-flex p-6 rounded-2xl bg-white/5 mb-6 ring-1 ring-white/10">
                        <Gamepad2 size={48} className="text-zinc-600" />
                      </div>
                      <h3 className="text-2xl font-bold text-zinc-300 mb-2">
                        No Profiles Yet
                      </h3>
                      <p className="text-zinc-500 mb-8 max-w-md">
                        Create your first game profile to get started. Configure Java, RAM, mods, and more.
                      </p>
                      <button
                        onClick={() => setIsAddProfileOpen(true)}
                        className="px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-cyan-500/20 transition-all"
                      >
                        Create Profile
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Mods Tab */}
            {activeTab === 'mods' && modCenterProfile && (
              <ModCenter
                profile={modCenterProfile}
                onClose={() => {
                  setModCenterProfile(null);
                  setActiveTab('launcher');
                }}
              />
            )}

            {/* Mods Tab - Empty State */}
            {activeTab === 'mods' && !modCenterProfile && (
              <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                  <AlertCircle size={48} className="text-zinc-600 mx-auto mb-4" />
                  <h3 className="text-2xl font-bold text-zinc-300 mb-2">
                    Select a Profile
                  </h3>
                  <p className="text-zinc-500 mb-8 max-w-md">
                    Go to the Launcher tab and select a profile to manage mods.
                  </p>
                  <button
                    onClick={() => setActiveTab('launcher')}
                    className="px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-cyan-500/30 transition-all"
                  >
                    Go to Launcher
                  </button>
                </div>
              </div>
            )}

            {/* Settings Tab */}
            {activeTab === 'settings' && <GlobalSettings />}

            {/* About Tab (embedded in about state) */}
          </div>
        </div>
      </div>

      {/* Modals */}
      {isAddProfileOpen && (
        <AddProfileModal
          onClose={() => setIsAddProfileOpen(false)}
          onCreated={() => {
            setIsAddProfileOpen(false);
          }}
        />
      )}

      {editingProfile && (
        <SettingsModal
          profile={editingProfile}
          onClose={() => setEditingProfile(null)}
          onSaved={() => {
            setEditingProfile(null);
          }}
        />
      )}

      {isLoginOpen && (
        <LoginModal
          onClose={() => setIsLoginOpen(false)}
          onSuccess={() => {
            addNotification({type: 'success',
              message: 'Successfully logged in!',
              duration: 3000,
            });
          }}
        />
      )}

      {/* Notification Toast Container */}
      <div className="fixed bottom-4 right-4 space-y-2 z-50 pointer-events-none">
        {notifications.slice(-3).map((notification) => (
          <div
            key={notification.id}
            className={clsx(
              'px-4 py-3 rounded-lg font-medium text-sm flex items-center gap-2 pointer-events-auto shadow-lg backdrop-blur-sm',
              notification.type === 'success' &&
              'bg-green-500/20 border border-green-500/50 text-green-300',
              notification.type === 'error' &&
              'bg-red-500/20 border border-red-500/50 text-red-300',
              notification.type === 'warning' &&
              'bg-amber-500/20 border border-amber-500/50 text-amber-300',
              notification.type === 'info' &&
              'bg-blue-500/20 border border-blue-500/50 text-blue-300'
            )}
          >
            {notification.message}
          </div>
        ))}
      </div>

      {/* Game Logs Panel (if in-game) */}
      {isLaunching && gameLogs.length > 0 && (
        <div className="fixed bottom-4 left-4 max-w-md max-h-48 bg-black/80 border border-cyan-500/30 rounded-lg overflow-hidden z-40">
          <div className="bg-cyan-500/20 px-4 py-2 border-b border-cyan-500/30">
            <p className="text-xs font-bold text-cyan-400">Game Logs</p>
          </div>
          <div className="overflow-y-auto max-h-40 p-3 text-xs font-mono text-green-400 space-y-1">
            {gameLogs.slice(-10).map((log, i) => (
              <div key={i}>{log}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface NavButtonProps {
  active: boolean;
  onClick: () => void;
  icon: any;
  label: string;
}

function NavButton({ active, onClick, icon: Icon, label }: NavButtonProps) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'group flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 w-full text-left relative overflow-hidden',
        active
          ? 'bg-cyan-500/10 text-cyan-400 shadow-inner ring-1 ring-cyan-500/30'
          : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'
      )}
    >
      {active && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-cyan-400 rounded-r-full shadow-[0_0_10px_2px_rgba(34,211,238,0.5)]" />
      )}
      <Icon
        size={22}
        className={clsx(
          'transition-transform group-active:scale-90',
          active ? 'text-cyan-400' : 'text-current'
        )}
      />
      <span className="hidden lg:block font-medium tracking-wide text-sm">{label}</span>
    </button>
  );
}

export default App;

