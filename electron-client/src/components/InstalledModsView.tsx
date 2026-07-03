import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, Trash2, RefreshCw, ArrowUpCircle, Power, FolderOpen, UploadCloud, Check, X } from 'lucide-react';
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
    const [currentInstalledVersionId, setCurrentInstalledVersionId] = useState<string | undefined>(undefined);

    // Updates
    const [updates, setUpdates] = useState<Record<string, ModVersion>>({});
    const [updating, setUpdating] = useState(false);

    // Optimistic UI
    const [keepingAlive, setKeepingAlive] = useState<Record<string, any>>({});

    // Drag & drop
    const [isDragOver, setIsDragOver] = useState(false);
    const [dropFiles, setDropFiles] = useState<{ name: string; path: string; status: 'pending' | 'importing' | 'done' | 'error'; modInfo?: any }[]>([]);
    const [showDropResult, setShowDropResult] = useState(false);
    const dropZoneRef = useRef<HTMLDivElement>(null);

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
                            filename: latest.files[0]?.filename,
                            source: 'modrinth' as const
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

                // Delete ALL existing files for this project to avoid duplicates
                const toDelete = new Set<string>();
                if (currentFilename && currentFilename !== fname) toDelete.add(currentFilename);
                details.filter(d => d.projectId === mod.id && d.fileName !== fname).forEach(d => toDelete.add(d.fileName));
                for (const f of toDelete) {
                    try { await api.deleteMod(profile.name, f); } catch (e) { }
                }

                await api.installMod(profile.name, versionInvoked.url, fname);
                // Update tracked version id so re-opening modal shows correct installed version
                setCurrentInstalledVersionId(versionInvoked.id);
                onRefresh();
            }
        } catch (e) {
            alert("Install Failed: " + e);
            if (mod.id) {
                setKeepingAlive(prev => { const next = { ...prev }; delete next[mod.id]; return next; });
            }
        } finally {
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

    // De-dupe by projectId (real entries first, ghosts only fill gaps)
    const seen = new Set<string>();
    const uniqueFiltered = filtered.filter(item => {
        const key = item.projectId || item.fileName;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Sort: Modrinth-resolved mods first, local-only (no projectId) at bottom
    uniqueFiltered.sort((a, b) => {
        const aLocal = !a.projectId;
        const bLocal = !b.projectId;
        if (aLocal === bLocal) return 0;
        return aLocal ? 1 : -1;
    });
    const updateCount = Object.keys(updates).length;

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        if ([...e.dataTransfer.items].some(i => i.kind === 'file')) setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        if (!dropZoneRef.current?.contains(e.relatedTarget as Node)) setIsDragOver(false);
    }, []);

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        const jarFiles = [...e.dataTransfer.files].filter(f => f.name.endsWith('.jar') || f.name.endsWith('.disabled'));
        if (jarFiles.length === 0) return;

        const entries = jarFiles.map(f => ({ name: f.name, path: (f as any).path, status: 'pending' as const }));
        setDropFiles(entries);
        setShowDropResult(true);

        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            setDropFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'importing' } : f));
            try {
                await api.importLocalMod(profile.name, entry.path);

                // Modrinth lookup for info
                let modInfo: any = undefined;
                try {
                    const fs = (window as any).require?.('fs');
                    if (fs) {
                        const crypto = (window as any).require('crypto');
                        const buf = fs.readFileSync(entry.path);
                        const sha1 = crypto.createHash('sha1').update(buf).digest('hex');
                        const res = await axios.post('https://api.modrinth.com/v2/version_files', { hashes: [sha1], algorithm: 'sha1' });
                        const ver = res.data[sha1];
                        if (ver) {
                            const proj = await axios.get(`https://api.modrinth.com/v2/project/${ver.project_id}`);
                            const members = await axios.get(`https://api.modrinth.com/v2/project/${ver.project_id}/members`).catch(() => ({ data: [] }));
                            const owner = members.data.find((m: any) => m.role === 'Owner') || members.data[0];
                            modInfo = {
                                title: proj.data.title,
                                author: owner?.user?.username || '',
                                icon: proj.data.icon_url,
                                version: ver.version_number,
                                desc: proj.data.description,
                            };
                        }
                    }
                } catch (e) { /* no modrinth info */ }

                setDropFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'done', modInfo } : f));
            } catch (e) {
                setDropFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'error' } : f));
            }
        }
        onRefresh();
    }, [profile.name, onRefresh]);

    // List Layout (No Grid Calculation needed)
    return (
        <div
            ref={dropZoneRef}
            className="flex flex-col flex-1 h-full min-h-0 bg-[#0f0f13] text-white relative"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >

            {/* Drag overlay */}
            {isDragOver && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0f0f13]/90 border-2 border-dashed border-[#10b981] rounded-xl pointer-events-none">
                    <UploadCloud size={48} className="text-[#10b981] mb-4" />
                    <p className="text-xl font-bold text-white">Mod hier ablegen</p>
                    <p className="text-sm text-gray-400 mt-1">.jar Dateien werden automatisch importiert</p>
                </div>
            )}

            {/* Drop result panel */}
            {showDropResult && dropFiles.length > 0 && (
                <div className="mx-8 mt-4 mb-2 rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden shrink-0">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
                        <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Importierte Mods</span>
                        <button onClick={() => setShowDropResult(false)} className="text-gray-500 hover:text-white"><X size={14} /></button>
                    </div>
                    <div className="divide-y divide-white/5">
                        {dropFiles.map((f, i) => (
                            <div key={i} className="flex items-center gap-3 px-4 py-3">
                                {f.modInfo?.icon
                                    ? <img src={f.modInfo.icon} className="w-9 h-9 rounded-lg object-cover bg-zinc-800" />
                                    : <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center text-gray-500"><UploadCloud size={16} /></div>
                                }
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-semibold truncate">{f.modInfo?.title || f.name}</div>
                                    {f.modInfo?.author && <div className="text-xs text-gray-400">by {f.modInfo.author} · {f.modInfo.version}</div>}
                                    {f.modInfo?.desc && <div className="text-xs text-gray-500 truncate mt-0.5">{f.modInfo.desc}</div>}
                                    {!f.modInfo && f.status === 'done' && <div className="text-xs text-gray-500">Nicht auf Modrinth gefunden</div>}
                                </div>
                                <div className="shrink-0 flex items-center gap-2">
                                    {f.status === 'pending'   && <div className="w-5 h-5 rounded-full border-2 border-white/10" />}
                                    {f.status === 'importing' && <Loader2 size={18} className="animate-spin text-[#10b981]" />}
                                    {f.status === 'done'      && <Check size={18} className="text-[#10b981]" />}
                                    {f.status === 'error'     && <X size={18} className="text-red-400" />}
                                    {/* Individual dismiss */}
                                    <button onClick={() => setDropFiles(prev => prev.filter((_, idx) => idx !== i))}
                                        className="text-gray-600 hover:text-gray-300 transition-colors ml-1">
                                        <X size={13} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Action Bar */}
            <div className="flex items-center justify-between px-8 py-3 shrink-0">
                <button
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                    onClick={async () => { try { await api.openModsFolder(profile.name); } catch {} }}
                    title="Mods-Ordner öffnen"
                >
                    <FolderOpen size={15} /> Mods-Ordner öffnen
                </button>
                {updateCount > 0 && (
                    <button
                        className="flex items-center gap-2 px-4 py-2 bg-[#10b981] hover:bg-[#059669] text-black font-bold rounded-lg shadow-lg shadow-green-900/20 transition-all active:scale-95"
                        onClick={handleUpdateAll}
                        disabled={updating}
                    >
                        {updating ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                        Update All ({updateCount})
                    </button>
                )}
            </div>

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

                            const openModal = () => {
                                setSelectedModForVersions({
                                    id: mod.projectId || mod.fileName,
                                    mrId: mod.projectId || undefined,
                                    title: mod.name || mod.fileName,
                                    desc: mod.desc || '',
                                    author: mod.author || '',
                                    dl: '0',
                                    icon: mod.icon,
                                    slug: mod.slug || mod.fileName.replace(/\.(jar|disabled)$/, ''),
                                    versions: [],
                                    sources: mod.projectId ? ['modrinth' as const] : []
                                });
                                setCurrentEditingFilename(mod.fileName);
                                setCurrentInstalledVersionId(mod.remoteId);
                            };

                            return (
                                <div
                                    key={mod.fileName}
                                    onClick={openModal}
                                    className={`
                                        group flex items-center gap-4 p-4 rounded-xl border border-white/5 bg-white/[0.02]
                                        hover:bg-white/[0.06] hover:border-white/10 transition-all
                                        cursor-pointer
                                        ${!mod.enabled ? 'opacity-60 grayscale' : ''}
                                        ${isGhost ? 'animate-pulse pointer-events-none' : ''}
                                    `}
                                >
                                    {/* Icon */}
                                    <img src={mod.icon} className="w-12 h-12 rounded-lg bg-[#202022] object-cover shadow-sm" loading="lazy" alt="" />

                                    {/* Info */}
                                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-base truncate" title={mod.name}>{mod.name}</span>
                                            {/* Source badge */}
                                            {mod.projectId
                                                ? <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#10b981]/15 text-[#10b981]">M</span>
                                                : <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/10 text-gray-400">Lokal</span>
                                            }
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

                                        {updateAvailable && (
                                            <button
                                                className="px-3 py-1.5 bg-[#10b981] text-black text-xs font-bold rounded-lg hover:bg-[#059669] flex items-center gap-1.5 shadow-lg shadow-green-900/20"
                                                onClick={e => { e.stopPropagation(); handleUpdate(mod); }}
                                                title={`Update to ${updateAvailable.ver}`}
                                            >
                                                <ArrowUpCircle size={14} />
                                                <span className="hidden lg:inline">Update</span>
                                            </button>
                                        )}

                                        <button
                                            className={`p-2 rounded-lg transition-colors ${mod.enabled ? 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10' : 'bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white'}`}
                                            onClick={e => { e.stopPropagation(); handleToggle(mod.fileName); }}
                                            title={mod.enabled ? "Disable Mod" : "Enable Mod"}
                                        >
                                            <Power size={18} />
                                        </button>

                                        <button
                                            className="p-2 rounded-lg bg-white/5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                            onClick={e => { e.stopPropagation(); handleDelete(mod.fileName); }}
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
                    installedVersionId={currentInstalledVersionId}
                    onClose={() => { setSelectedModForVersions(null); setCurrentEditingFilename(undefined); setCurrentInstalledVersionId(undefined); }}
                    onInstall={handleInstall}
                />
            )}
        </div>
    );
}
