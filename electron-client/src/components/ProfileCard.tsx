import React, { useState } from 'react';
import { Play, Settings, Trash2, Box, RotateCcw, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Profile, api } from '../api';
import clsx from 'clsx';

interface Props {
    profile: Profile;
    status?: { state: 'running' | 'installing' | 'stopped', message?: string };
    onDelete: () => void;
    onSettings: () => void;
    onMods: () => void;
}

export function ProfileCard({ profile, status, onDelete, onSettings, onMods }: Props) {
    const isRunning = status?.state === 'running';
    const isInstalling = status?.state === 'installing';
    const [isDeleteMode, setIsDeleteMode] = useState(false);

    const handleLaunch = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await api.launch(profile.name);
        } catch (err) {
            console.error(err);
        }
    };

    const confirmDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        onDelete();
        setIsDeleteMode(false);
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -5 }}
            className={clsx(
                "relative group overflow-hidden rounded-xl border border-white/5 bg-surface p-4 transition-colors hover:border-white/10 hover:bg-white/5",
                isRunning && "border-green-500/50 shadow-[0_0_30px_-5px_rgba(34,197,94,0.3)]",
                isInstalling && "border-yellow-500/50 shadow-[0_0_30px_-5px_rgba(234,179,8,0.3)]"
            )}
        >
            {/* Delete Confirmation Overlay */}
            <AnimatePresence>
                {isDeleteMode && (
                    <motion.div
                        key="delete-overlay"
                        initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
                        animate={{ opacity: 1, backdropFilter: "blur(8px)" }}
                        exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
                        className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-zinc-950/80 p-4 rounded-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <motion.div
                            initial={{ scale: 0.8, y: 10 }}
                            animate={{ scale: 1, y: 0 }}
                            className="flex flex-col items-center text-center w-full"
                        >
                            <div className="bg-red-500/20 p-3 rounded-full mb-2 text-red-500">
                                <AlertTriangle size={24} />
                            </div>
                            <h4 className="font-bold text-white mb-1">Delete Profile?</h4>
                            <p className="text-[10px] text-gray-400 mb-4">This action cannot be undone.</p>

                            <div className="flex gap-2 w-full">
                                <button
                                    onClick={(e) => { e.stopPropagation(); setIsDeleteMode(false); }}
                                    className="flex-1 py-2 px-3 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-white"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmDelete}
                                    className="flex-1 py-2 px-3 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-bold text-white shadow-lg shadow-red-900/20"
                                >
                                    Delete
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Background Glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100 pointer-events-none" />

            <div className="relative z-10 flex flex-col h-full">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                    <div className="p-3 rounded-lg bg-zinc-800/50 text-gray-300 overflow-hidden w-16 h-16 flex items-center justify-center relative">
                        {profile.iconPath ? (
                            <img
                                src={`http://localhost:35555/api/profiles/${profile.name}/icon?t=${Date.now()}`}
                                alt={profile.name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                }}
                            />
                        ) : null}
                        <div className={clsx("flex items-center justify-center w-full h-full", profile.iconPath ? "hidden" : "")}>
                            <Box size={24} />
                        </div>
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            onClick={(e) => { e.stopPropagation(); setIsDeleteMode(true); }}
                            className="p-2 rounded-lg hover:bg-red-500/20 hover:text-red-500 text-gray-400 transition-colors"
                        >
                            <Trash2 size={16} />
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onSettings(); }}
                            className="p-2 rounded-lg hover:bg-white/10 text-gray-400 transition-colors"
                        >
                            <Settings size={16} />
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onMods(); }}
                            className="p-2 rounded-lg hover:bg-white/10 text-gray-400 transition-colors"
                            title="Mod Center"
                        >
                            <Box size={16} />
                        </button>
                    </div>
                </div>

                {/* Info */}
                <div className="mb-6">
                    <h3 className="text-lg font-bold text-white mb-1 truncate">{profile.name}</h3>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                        <span className="bg-white/5 px-2 py-0.5 rounded text-gray-300">{profile.version}</span>
                        {profile.modLoader && (
                            <span className="bg-primary/20 text-primary px-2 py-0.5 rounded uppercase">{profile.modLoader}</span>
                        )}
                    </div>
                </div>

                {/* Action Button */}
                <div className="mt-auto">
                    <button
                        onClick={handleLaunch}
                        disabled={isInstalling}
                        className={clsx(
                            "w-full py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all",
                            isRunning ? "bg-red-500/10 text-red-500 hover:bg-red-500/20" :
                                isInstalling ? "bg-yellow-500/10 text-yellow-500 cursor-wait" :
                                    "bg-white text-black hover:bg-gray-200"
                        )}
                    >
                        {isRunning ? (
                            <> <RotateCcw size={18} /> STOP </>
                        ) : isInstalling ? (
                            <> <Settings size={18} className="animate-spin" /> INSTALLING </>
                        ) : (
                            <> <Play size={18} fill="currentColor" /> LAUNCH </>
                        )}
                    </button>

                    {/* Status Message */}
                    {status?.message && (
                        <p className="text-[10px] text-center mt-2 text-gray-500 truncate font-mono">
                            {status.message}
                        </p>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
