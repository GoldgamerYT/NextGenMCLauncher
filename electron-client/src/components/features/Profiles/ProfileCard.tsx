import React from 'react';
import { Play, Edit3, Trash2, GamepadIcon } from 'lucide-react';
import { Profile } from '../../../stores/profileStore';

interface ProfileCardProps {
  profile: Profile;
  onPlay: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export const ProfileCard: React.FC<ProfileCardProps> = ({
  profile,
  onPlay,
  onEdit,
  onDelete,
}) => {
  const loaderColors = {
    vanilla: 'bg-gray-500',
    forge: '#FF6B35',
    fabric: '#90EE90',
    neoforge: '#9370DB',
  };

  const loaderColor = loaderColors[profile.loader as keyof typeof loaderColors];

  return (
    <div className="group bg-atlas-dark-1 border border-atlas-dark-2 rounded-xl overflow-hidden hover:border-atlas-cyan/50 hover:shadow-lg hover:shadow-atlas-cyan/10 transition-all duration-300 h-full flex flex-col">
      {/* Header - Loader Badge */}
      <div className="px-4 pt-4 pb-0 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <GamepadIcon size={20} className="text-atlas-cyan" />
          <span className="text-xs font-bold text-white px-2 py-1 rounded-full bg-atlas-dark-0 uppercase">
            {profile.loader}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-4 flex-1">
        <h3 className="text-lg font-bold text-white font-montserrat mb-1 truncate">
          {profile.name}
        </h3>
        <p className="text-sm text-atlas-dark-4 mb-3">
          Minecraft {profile.mcVersion}
        </p>

        {/* Mods Info */}
        <div className="text-xs text-atlas-dark-4 mb-4">
          {profile.mods.length > 0 ? (
            <p>{profile.mods.length} mod{profile.mods.length !== 1 ? 's' : ''} installed</p>
          ) : (
            <p>Vanilla installation</p>
          )}
        </div>

        {/* RAM Info */}
        <div className="text-xs text-atlas-cyan bg-atlas-dark-0 px-2 py-1 rounded inline-block mb-4">
          {profile.ramMb} MB RAM
        </div>

        {/* Last Played */}
        {profile.lastPlayed && (
          <p className="text-xs text-atlas-dark-4 mt-2">
            Last played: {new Date(profile.lastPlayed).toLocaleDateString()}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 pb-4 pt-0 grid grid-cols-3 gap-2">
        <button
          onClick={onPlay}
          className="p-2 bg-gradient-atlas text-white rounded-lg hover:shadow-lg hover:shadow-atlas-cyan/20 active:scale-95 transition-all flex items-center justify-center gap-1 font-medium text-sm group-hover:opacity-100 opacity-90"
        >
          <Play size={16} />
          <span className="hidden sm:inline">Play</span>
        </button>
        <button
          onClick={onEdit}
          className="p-2 bg-atlas-dark-2 text-atlas-cyan rounded-lg hover:bg-atlas-dark-3 active:scale-95 transition-all flex items-center justify-center gap-1 font-medium text-sm"
        >
          <Edit3 size={16} />
          <span className="hidden sm:inline">Edit</span>
        </button>
        <button
          onClick={onDelete}
          className="p-2 bg-red-900/30 text-red-400 rounded-lg hover:bg-red-900/50 active:scale-95 transition-all flex items-center justify-center gap-1 font-medium text-sm"
        >
          <Trash2 size={16} />
          <span className="hidden sm:inline">Delete</span>
        </button>
      </div>
    </div>
  );
};

export default ProfileCard;
