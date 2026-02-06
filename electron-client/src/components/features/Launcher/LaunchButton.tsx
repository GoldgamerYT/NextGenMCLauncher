import React, { useEffect } from 'react';
import { Play, StopCircle, AlertCircle } from 'lucide-react';
import { useProfileStore } from '../../../stores/profileStore';
import { useAccountStore } from '../../../stores/accountStore';
import { useUIStore } from '../../../stores/uiStore';
import { gameService } from '../../../services/api';

interface LaunchButtonProps {
  onLaunchStart?: () => void;
  onLaunchComplete?: () => void;
}

export const LaunchButton: React.FC<LaunchButtonProps> = ({
  onLaunchStart,
  onLaunchComplete,
}) => {
  const { currentProfile } = useProfileStore();
  const { currentAccount } = useAccountStore();
  const {
    isLaunching,
    launchProgress,
    setIsLaunching,
    setLaunchProgress,
    addNotification,
    addGameLog,
  } = useUIStore();

  const canLaunch = !!currentProfile && !!currentAccount;

  const handleLaunch = async () => {
    if (!currentProfile) {
      addNotification({
        type: 'warning',
        message: 'Please select a profile first',
        duration: 3000,
      });
      return;
    }

    if (!currentAccount) {
      addNotification({
        type: 'warning',
        message: 'Please log in with Microsoft account first',
        duration: 3000,
      });
      return;
    }

    try {
      setIsLaunching(true);
      setLaunchProgress(0);
      addGameLog(`[${new Date().toLocaleTimeString()}] Launching ${currentProfile.name}...`);
      onLaunchStart?.();

      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setLaunchProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + Math.random() * 15;
        });
      }, 500);

      const result = await gameService.launch(currentProfile.id);

      clearInterval(progressInterval);
      setLaunchProgress(100);

      addNotification({
        type: 'success',
        message: `${currentProfile.name} is running`,
        duration: 3000,
      });

      addGameLog(`[${new Date().toLocaleTimeString()}] Game launched successfully`);

      // Reset after 2 seconds
      setTimeout(() => {
        setIsLaunching(false);
        setLaunchProgress(0);
        onLaunchComplete?.();
      }, 2000);
    } catch (error: any) {
      clearInterval(undefined as any);
      setIsLaunching(false);
      setLaunchProgress(0);

      const errorMessage = error?.response?.data?.error || 'Failed to launch game';
      addNotification({
        type: 'error',
        message: errorMessage,
        duration: 5000,
      });

      addGameLog(`[ERROR] ${errorMessage}`);
    }
  };

  const handleStop = async () => {
    try {
      await gameService.stop();
      setIsLaunching(false);
      setLaunchProgress(0);
      addGameLog(`[${new Date().toLocaleTimeString()}] Game stopped`);
      addNotification({
        type: 'info',
        message: 'Game stopped',
        duration: 2000,
      });
    } catch (error) {
      addNotification({
        type: 'error',
        message: 'Failed to stop game',
        duration: 3000,
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Main Launch Button */}
      <button
        onClick={isLaunching ? handleStop : handleLaunch}
        disabled={!canLaunch && !isLaunching}
        className={`w-full py-4 rounded-xl font-bold text-lg transition-all active:scale-95 flex items-center justify-center gap-2 ${
          isLaunching
            ? 'bg-red-600 hover:bg-red-700 text-white'
            : canLaunch
            ? 'bg-gradient-atlas text-white hover:shadow-lg hover:shadow-atlas-cyan/30'
            : 'bg-atlas-dark-2 text-atlas-dark-4 cursor-not-allowed opacity-50'
        }`}
      >
        {isLaunching ? (
          <>
            <StopCircle size={24} />
            <span>STOP GAME</span>
          </>
        ) : (
          <>
            <Play size={24} fill="currentColor" />
            <span>LAUNCH GAME</span>
          </>
        )}
      </button>

      {/* Warnings */}
      {!currentProfile && (
        <div className="p-3 bg-yellow-900/30 border border-yellow-600/50 rounded-lg flex items-center gap-2 text-yellow-400 text-sm">
          <AlertCircle size={16} />
          Select a profile to launch
        </div>
      )}

      {!currentAccount && (
        <div className="p-3 bg-yellow-900/30 border border-yellow-600/50 rounded-lg flex items-center gap-2 text-yellow-400 text-sm">
          <AlertCircle size={16} />
          Log in with Microsoft to play
        </div>
      )}

      {/* Progress Bar */}
      {isLaunching && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-white font-medium">Launching...</p>
            <p className="text-sm text-atlas-cyan font-bold">{Math.round(launchProgress)}%</p>
          </div>
          <div className="w-full h-2 bg-atlas-dark-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-atlas transition-all duration-300"
              style={{ width: `${launchProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Profile Info */}
      {currentProfile && (
        <div className="p-4 bg-atlas-dark-1 border border-atlas-dark-2 rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-atlas-dark-4">Profile</p>
            <p className="text-sm font-bold text-white">{currentProfile.name}</p>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-atlas-dark-4">Version</p>
            <p className="text-sm font-bold text-atlas-cyan">{currentProfile.mcVersion}</p>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-atlas-dark-4">Loader</p>
            <p className="text-sm font-bold text-white capitalize">{currentProfile.loader}</p>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-atlas-dark-4">RAM Allocated</p>
            <p className="text-sm font-bold text-white">{currentProfile.ramMb} MB</p>
          </div>
          {currentProfile.mods && currentProfile.mods.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-atlas-dark-4">Mods</p>
              <p className="text-sm font-bold text-atlas-cyan">{currentProfile.mods.length}</p>
            </div>
          )}
        </div>
      )}

      {/* Account Info */}
      {currentAccount && (
        <div className="p-4 bg-atlas-dark-1 border border-atlas-dark-2 rounded-lg">
          <div className="flex items-center gap-3">
            {currentAccount.skinUrl && (
              <img
                src={currentAccount.skinUrl}
                alt={currentAccount.name}
                className="w-10 h-10 rounded-lg"
              />
            )}
            <div>
              <p className="text-xs text-atlas-dark-4">Logged in as</p>
              <p className="text-sm font-bold text-white">{currentAccount.name}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LaunchButton;
