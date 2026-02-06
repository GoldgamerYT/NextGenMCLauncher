import React, { useState } from 'react';
import { Plus, AlertCircle } from 'lucide-react';
import { useProfileStore } from '../../../stores/profileStore';
import { useUIStore } from '../../../stores/uiStore';
import { ProfileCard } from './ProfileCard';
import { ProfileForm } from './ProfileForm';

export const ProfileList: React.FC = () => {
  const { profiles, selectProfile, deleteProfile } = useProfileStore();
  const { addNotification } = useUIStore();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const handlePlay = (profileId: string) => {
    const profile = profiles.find(p => p.id === profileId);
    if (profile) {
      selectProfile(profileId);
      addNotification({
        type: 'info',
        message: `Selected profile: ${profile.name}`,
        duration: 2000,
      });
    }
  };

  const handleEdit = (profileId: string) => {
    const profile = profiles.find(p => p.id === profileId);
    if (profile) {
      setEditingProfile(profile);
      setIsFormOpen(true);
    }
  };

  const handleDelete = (profileId: string) => {
    const profile = profiles.find(p => p.id === profileId);
    if (profile) {
      setDeleteConfirm(profileId);
    }
  };

  const confirmDelete = (profileId: string) => {
    const profile = profiles.find(p => p.id === profileId);
    if (profile) {
      deleteProfile(profileId);
      addNotification({
        type: 'success',
        message: `Profile "${profile.name}" deleted`,
        duration: 3000,
      });
      setDeleteConfirm(null);
    }
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingProfile(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-white font-montserrat mb-2">
            Profiles
          </h1>
          <p className="text-atlas-dark-4 font-medium">
            Manage your Minecraft instances
          </p>
        </div>
        <button
          onClick={() => {
            setEditingProfile(null);
            setIsFormOpen(true);
          }}
          className="group px-4 py-2.5 bg-gradient-atlas text-white font-bold rounded-xl hover:shadow-lg hover:shadow-atlas-cyan/20 active:scale-95 transition-all flex items-center gap-2"
        >
          <Plus size={20} />
          <span>New Profile</span>
        </button>
      </div>

      {/* Profiles Grid */}
      {profiles.length > 0 ? (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {profiles.map((profile) => (
            <div key={profile.id} className="relative">
              <ProfileCard
                profile={profile}
                onPlay={() => handlePlay(profile.id)}
                onEdit={() => handleEdit(profile.id)}
                onDelete={() => handleDelete(profile.id)}
              />

              {/* Delete Confirmation */}
              {deleteConfirm === profile.id && (
                <div className="absolute inset-0 bg-black/80 rounded-xl flex items-center justify-center z-40 backdrop-blur-sm">
                  <div className="bg-atlas-dark-1 p-4 rounded-lg text-center border border-red-500/50">
                    <p className="text-white font-bold mb-3">Delete profile?</p>
                    <p className="text-sm text-atlas-dark-4 mb-4">
                      This action cannot be undone
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="flex-1 px-3 py-2 bg-atlas-dark-2 text-white rounded-lg hover:bg-atlas-dark-3 transition-colors text-sm font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => confirmDelete(profile.id)}
                        className="flex-1 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 border-2 border-dashed border-atlas-dark-2 rounded-2xl bg-atlas-dark-0/50">
          <AlertCircle size={48} className="mx-auto text-atlas-dark-4 mb-4 opacity-50" />
          <h3 className="text-xl font-bold text-white mb-2">No Profiles Yet</h3>
          <p className="text-atlas-dark-4 mb-6">
            Create your first Minecraft profile to get started
          </p>
          <button
            onClick={() => {
              setEditingProfile(null);
              setIsFormOpen(true);
            }}
            className="px-6 py-3 bg-gradient-atlas text-white font-bold rounded-xl hover:shadow-lg hover:shadow-atlas-cyan/20 transition-all"
          >
            Create Your First Profile
          </button>
        </div>
      )}

      {/* Profile Form Modal */}
      {isFormOpen && (
        <ProfileForm
          initialProfile={editingProfile}
          onClose={handleCloseForm}
          onSuccess={() => {
            handleCloseForm();
            addNotification({
              type: 'success',
              message: `Profile ${editingProfile ? 'updated' : 'created'} successfully`,
              duration: 3000,
            });
          }}
        />
      )}
    </div>
  );
};

export default ProfileList;
