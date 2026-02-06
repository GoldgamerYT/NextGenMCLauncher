import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Loader2, Trash2, List, RefreshCw, ArrowUpCircle, AlertTriangle, Power } from 'lucide-react';
import { Profile, api } from '../api';
import { ModDetailModal, Mod, ModVersion } from './ModDetailModal';
import axios from 'axios';
import './ModCenter.css'; // Re-use the CSS

// --- INSTALLED MODS VIEW (GRID LAYOUT) ---

interface InstalledViewProps {
    profile: Profile;
    onClose: () => void;
    filter: string;
    details: any[];
    loading: boolean;
    onRefresh: () => void;
}

export function InstalledModsView({ profile, onClose, filter, details, loading, onRefresh }: InstalledViewProps) {
    const [selectedModForVersions, setSelectedModForVersions] = useState<Mod | null>(null);
    const [currentEditingFilename, setCurrentEditingFilename] = useState<string | undefined>(undefined);

    // Updates
    const [updates, setUpdates] = useState<Record<string, ModVersion>>({});
    const [updating, setUpdating] = useState(false);

    // Optimistic UI
    const [keepingAlive, setKeepingAlive] = useState<Record<string, any>>({});

    useEffect(() => {
        checkUpdates(details);
    }, [details]);

    const checkUpdates = async (mods: any[]) => {
        const newUpdates: Record<string, ModVersion> = {};
        const checkable = mods.filter(m => m.projectId);

        for (const mod of checkable) {
            try {
                const res = await axios.get(`https://api.modrinth.com/v2/project/${mod.projectId}/version`, {
                    params: {
                        loaders: `["${profile.modLoader ? profile.modLoader.toLowerCase() : 'vanilla'}"]`,
                        game_versions: `["${profile.version}"]`
                    }
                });

                if (res.data && res.data.length > 0) {
                    const latest = res.data[0];
                    if (latest.id !== mod.remoteId) {
                        newUpdates[mod.fileName] = {
                            id: latest.id,
                            ver: latest.version_number,
                            type: latest.version_type,
                            date: latest.date_published,
                            url: latest.files[0]?.url,
                            filename: latest.files[0]?.filename
                        };
                    }
                }
            } catch (e) { }
        }
        setUpdates(newUpdates);
    };

    const handleUpdate = async (mod: any) => {
        const updateInfo = updates[mod.fileName];
        if (!updateInfo) return;

        const modObj: Mod = {
            id: mod.projectId,
            title: mod.name,
            desc: mod.desc,
            author: mod.author,
            dl: '0',
            icon: mod.icon,
            slug: mod.slug,
            versions: []
        };

        await handleInstall(modObj, updateInfo, mod.fileName);
    };

    const handleUpdateAll = async () => {
        if (updating) return;
        setUpdating(true);
        try {
            const updatableMods = details.filter(d => updates[d.fileName]);
            for (const mod of updatableMods) {
                await handleUpdate(mod);
            }
        } finally {
            setUpdating(false);
        }
    };

    const handleToggle = async (fileName: string) => {
        await api.toggleMod(profile.name, fileName);
        onRefresh();
    };

    const handleDelete = async (fileName: string) => {
        await api.deleteMod(profile.name, fileName);
        onRefresh();
    };

    const handleInstall = async (mod: Mod, versionInvoked?: ModVersion, currentFilename?: string) => {
        // OPTIMISTIC
        if (mod.id) {
            setKeepingAlive(prev => ({
                ...prev,
                [mod.id]: {
                    fileName: currentFilename || 'Updating...',
                    name: mod.title || mod.id,
                    icon: mod.icon,
                    version: 'Updating...',
                    projectId: mod.id,
                    enabled: true,
                    isGhost: true
                }
            }));
        }

        try {
            if (versionInvoked && versionInvoked.url) {
                const fname = versionInvoked.filename || `${mod.slug}-${versionInvoked.ver}.jar`;

                if (currentFilename && currentFilename !== fname) {
                    try { await api.deleteMod(profile.name, currentFilename); } catch (e) { }
                } else {
                    const sameMod = details.find(d => d.projectId === mod.id);
                    if (sameMod && sameMod.fileName !== fname) {
                        try { await api.deleteMod(profile.name, sameMod.fileName); } catch (e) { }
                    }
                }

                await api.installMod(profile.name, versionInvoked.url, fname);
                onRefresh();
            }
        } catch (e) {
            alert("Install Failed: " + e);
            if (mod.id) {
                setKeepingAlive(prev => { const next = { ...prev }; delete next[mod.id]; return next; });
            }
        } finally {
            // OPTIMISTIC END
            if (mod.id) {
                setTimeout(() => {
                    setKeepingAlive(prev => { const next = { ...prev }; delete next[mod.id]; return next; });
                }, 2000);
            }
        }
    };

    // MERGE & FILTER
    const displayedMods = [...details];
    Object.keys(keepingAlive).forEach(pid => {
        if (!displayedMods.some(d => d.projectId === pid)) {
            displayedMods.push(keepingAlive[pid]);
        }
    });

    const filtered = displayedMods.filter(d => d.name.toLowerCase().includes(filter.toLowerCase()));

    // De-dupe
    const uniqueFiltered = Array.from(new Map(filtered.map(item => [item.fileName, item])).values());
    const updateCount = Object.keys(updates).length;

    // List Layout (No Grid Calculation needed)
    return (
        <div className="flex flex-col flex-1 h-full min-h-0 bg-[#0f0f13] text-white">

            {/* Action Bar */}
            {updateCount > 0 && (
                <div className="flex justify-end px-8 py-4 bg-white/5 border-b border-white/10 shrink-0">
                    <button
                        className="flex items-center gap-2 px-4 py-2 bg-[#10b981] hover:bg-[#059669] text-black font-bold rounded-lg shadow-lg shadow-green-900/20 transition-all active:scale-95"
                        onClick={handleUpdateAll}
                        disabled={updating}
                    >
                        {updating ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                        Update All ({updateCount})
                    </button>
                </div>
            )}

            {/* List Content */}
            <div className="flex-1 overflow-y-auto p-8 min-h-0 scrollbar-thin scrollbar-thumb-zinc-800">
                {loading && details.length === 0 ? (
                    <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#10b981]" size={32} /></div>
                ) : uniqueFiltered.length === 0 ? (
                    <div className="text-center text-gray-500 py-20">Keine Mods gefunden.</div>
                ) : (
                    <div className="flex flex-col gap-2 max-w-5xl mx-auto">
                        {uniqueFiltered.map(mod => {
                            const updateAvailable = updates[mod.fileName];
                            const isGhost = mod.isGhost || false;

                            return (
                                <div key={mod.fileName} className={`
                                    group flex items-center gap-4 p-4 rounded-xl border border-white/5 bg-white/[0.02] 
                                    hover:bg-white/[0.06] hover:border-white/10 transition-all
                                    ${!mod.enabled ? 'opacity-60 grayscale' : ''}
                                    ${isGhost ? 'animate-pulse pointer-events-none' : ''}
                                `}>
                                    {/* Icon */}
                                    <img src={mod.icon} className="w-12 h-12 rounded-lg bg-[#202022] object-cover shadow-sm" loading="lazy" alt="" />

                                    {/* Info */}
                                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                                        <div className="flex items-center gap-3">
                                            <span className="font-bold text-base truncate" title={mod.name}>{mod.name}</span>
                                            {updateAvailable && (
                                                <span className="px-2 py-0.5 rounded text-[10px] bg-[#10b981]/20 text-[#10b981] font-bold border border-[#10b981]/20 animate-pulse">
                                                    UPDATE
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-gray-400 font-mono mt-0.5">
                                            <span>{mod.fileName}</span>
                                            <span className="w-1 h-1 rounded-full bg-gray-600" />
                                            <span className={mod.enabled ? "text-[#10b981]" : ""}>{mod.version}</span>
                                            {updateAvailable && (
                                                <>
                                                    <span>→</span>
                                                    <span className="text-[#10b981] font-bold">{updateAvailable.ver}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-2 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">

                                        {/* Update Button */}
                                        {updateAvailable && (
                                            <button
                                                className="px-3 py-1.5 bg-[#10b981] text-black text-xs font-bold rounded-lg hover:bg-[#059669] flex items-center gap-1.5 shadow-lg shadow-green-900/20"
                                                onClick={() => handleUpdate(mod)}
                                                title={`Update to ${updateAvailable.ver}`}
                                            >
                                                <ArrowUpCircle size={14} />
                                                <span className="hidden lg:inline">Update</span>
                                            </button>
                                        )}

                                        {/* Toggle */}
                                        <button
                                            className={`p-2 rounded-lg transition-colors ${mod.enabled ? 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10' : 'bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white'}`}
                                            onClick={() => handleToggle(mod.fileName)}
                                            title={mod.enabled ? "Disable Mod" : "Enable Mod"}
                                        >
                                            <Power size={18} />
                                        </button>

                                        {/* Versions */}
                                        {mod.projectId && (
                                            <button
                                                className="p-2 rounded-lg bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                                                onClick={() => {
                                                    setSelectedModForVersions({
                                                        id: mod.projectId,
                                                        title: mod.name,
                                                        desc: mod.desc,
                                                        author: mod.author,
                                                        dl: '0',
                                                        icon: mod.icon,
                                                        slug: mod.slug,
                                                        versions: []
                                                    });
                                                    setCurrentEditingFilename(mod.fileName);
                                                }}
                                                title="Versions"
                                            >
                                                <List size={18} />
                                            </button>
                                        )}

                                        {/* Delete */}
                                        <button
                                            className="p-2 rounded-lg bg-white/5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                            onClick={() => handleDelete(mod.fileName)}
                                            title="Delete Mod"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Version Selection Modal */}
            {selectedModForVersions && (
                <ModDetailModal
                    mod={selectedModForVersions}
                    profile={profile}
                    packages={new Set(uniqueFiltered.map(m => m.fileName))}
                    onClose={() => { setSelectedModForVersions(null); setCurrentEditingFilename(undefined); }}
                    onInstall={handleInstall}

                />
            )}
        </div>
    );
}
