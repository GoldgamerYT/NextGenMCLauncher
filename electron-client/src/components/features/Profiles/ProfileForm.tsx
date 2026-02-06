import React, { useState, useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { useProfileStore, Profile } from '../../../stores/profileStore';
import { useVersionStore, MCVersion } from '../../../stores/versionStore';
import { useUIStore } from '../../../stores/uiStore';
import { VersionSelector } from './VersionSelector';

interface ProfileFormProps {
  initialProfile?: Profile | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export const ProfileForm: React.FC<ProfileFormProps> = ({
  initialProfile = null,
  onClose,
  onSuccess,
}) => {
  const [formData, setFormData] = useState<Partial<Profile>>(
    initialProfile || {
      name: '',
      mcVersion: '',
      loader: 'vanilla',
      mods: [],
      jvmArgs: '',
      ramMb: 4096,
      createdAt: new Date(),
    }
  );

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { addProfile, updateProfile } = useProfileStore();
  const { versions } = useVersionStore();
  const { addNotification } = useUIStore();

  // Validation
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name || formData.name.trim().length === 0) {
      newErrors.name = 'Profile name is required';
    }
    if (!formData.mcVersion) {
      newErrors.mcVersion = 'Minecraft version is required';
    }
    if ((formData.ramMb || 0) < 512 || (formData.ramMb || 0) > 65536) {
      newErrors.ramMb = 'RAM must be between 512 MB and 65536 MB';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const profile: Profile = {
        id: initialProfile?.id || Math.random().toString(36).substr(2, 9),
        name: formData.name || '',
        mcVersion: formData.mcVersion || '',
        loader: (formData.loader as any) || 'vanilla',
        mods: formData.mods || [],
        jvmArgs: formData.jvmArgs || '',
        ramMb: formData.ramMb || 4096,
        createdAt: initialProfile?.createdAt || new Date(),
        lastPlayed: initialProfile?.lastPlayed,
      };

      if (initialProfile) {
        updateProfile(initialProfile.id, profile);
        addNotification({
          type: 'success',
          message: `Profile "${profile.name}" updated successfully`,
          duration: 3000,
        });
      } else {
        addProfile(profile);
        addNotification({
          type: 'success',
          message: `Profile "${profile.name}" created successfully`,
          duration: 3000,
        });
      }

      onSuccess?.();
      onClose();
    } catch (error) {
      addNotification({
        type: 'error',
        message: `Failed to ${initialProfile ? 'update' : 'create'} profile`,
        duration: 5000,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-atlas-dark-1 rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto border border-atlas-dark-2">
        {/* Header */}
        <div className="sticky top-0 bg-atlas-dark-1 border-b border-atlas-dark-2 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white font-montserrat">
            {initialProfile ? 'Edit Profile' : 'Create New Profile'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-atlas-dark-2 rounded-lg transition-colors"
          >
            <X size={20} className="text-atlas-dark-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Profile Name */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Profile Name *
            </label>
            <input
              type="text"
              value={formData.name || ''}
              onChange={(e) => {
                setFormData({ ...formData, name: e.target.value });
                if (errors.name) setErrors({ ...errors, name: '' });
              }}
              placeholder="e.g., Vanilla Survival"
              className="w-full px-4 py-2 bg-atlas-dark-0 border border-atlas-dark-2 rounded-lg text-white placeholder-atlas-dark-4 focus:outline-none focus:border-atlas-cyan focus:ring-1 focus:ring-atlas-cyan/30 transition-colors font-montserrat"
            />
            {errors.name && (
              <div className="mt-1 flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle size={14} />
                {errors.name}
              </div>
            )}
          </div>

          {/* Minecraft Version */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Minecraft Version *
            </label>
            <VersionSelector
              value={formData.mcVersion || ''}
              onChange={(version) => {
                setFormData({ ...formData, mcVersion: version });
                if (errors.mcVersion) setErrors({ ...errors, mcVersion: '' });
              }}
            />
            {errors.mcVersion && (
              <div className="mt-1 flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle size={14} />
                {errors.mcVersion}
              </div>
            )}
          </div>

          {/* Loader */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Loader
            </label>
            <select
              value={formData.loader || 'vanilla'}
              onChange={(e) =>
                setFormData({ ...formData, loader: e.target.value as any })
              }
              className="w-full px-4 py-2 bg-atlas-dark-0 border border-atlas-dark-2 rounded-lg text-white focus:outline-none focus:border-atlas-cyan focus:ring-1 focus:ring-atlas-cyan/30 transition-colors font-montserrat"
            >
              <option value="vanilla">Vanilla</option>
              <option value="forge">Forge</option>
              <option value="fabric">Fabric</option>
              <option value="neoforge">NeoForge</option>
            </select>
          </div>

          {/* RAM Allocation */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              RAM Allocation: {formData.ramMb} MB
            </label>
            <input
              type="range"
              min="512"
              max="65536"
              step="256"
              value={formData.ramMb || 4096}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                setFormData({ ...formData, ramMb: val });
                if (errors.ramMb) setErrors({ ...errors, ramMb: '' });
              }}
              className="w-full h-2 bg-atlas-dark-0 rounded-lg appearance-none cursor-pointer accent-atlas-blue"
            />
            {errors.ramMb && (
              <div className="mt-1 flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle size={14} />
                {errors.ramMb}
              </div>
            )}
          </div>

          {/* JVM Arguments */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              JVM Arguments (Optional)
            </label>
            <textarea
              value={formData.jvmArgs || ''}
              onChange={(e) => setFormData({ ...formData, jvmArgs: e.target.value })}
              placeholder="-Xmx4G -XX:+UnlockExperimentalVMOptions"
              rows={3}
              className="w-full px-4 py-2 bg-atlas-dark-0 border border-atlas-dark-2 rounded-lg text-white placeholder-atlas-dark-4 focus:outline-none focus:border-atlas-cyan focus:ring-1 focus:ring-atlas-cyan/30 transition-colors font-mono text-sm"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-atlas-dark-2 text-white rounded-lg hover:bg-atlas-dark-3 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-gradient-atlas text-white rounded-lg hover:shadow-lg hover:shadow-atlas-cyan/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {isSubmitting ? 'Saving...' : initialProfile ? 'Update Profile' : 'Create Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProfileForm;
