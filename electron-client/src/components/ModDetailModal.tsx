import React, { useState, useEffect, useMemo } from 'react';
import { X, ExternalLink, Loader2, Download, Check, Trash2 } from 'lucide-react';
import { Profile } from '../api';
import axios from 'axios';

// Shared Interfaces
export interface ModVersion {
    ver: string;
    type: string;
    date: string;
    id: string;
    url: string;
    filename?: string;
    source: 'modrinth' | 'curseforge';
}

export interface Mod {
    id: string;
    title: string;
    desc: string;
    author: string;
    dl: string;
    icon: string;
    slug: string;
    versions: ModVersion[];
    sources?: ('modrinth' | 'curseforge')[];
    mrId?: string;
    cfId?: number;
}

export function InstallButton({ isInstalled, onClick, onUninstall }: {
    isInstalled: boolean;
    onClick: () => Promise<void>;
    onUninstall?: () => Promise<void>;
}) {
    const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle');
    const [hovering, setHovering] = useState(false);

    useEffect(() => {
        setStatus(isInstalled ? 'done' : 'idle');
    }, [isInstalled]);

    const handleClick = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (status === 'loading') return;
        if (status === 'done' && onUninstall) {
            setStatus('loading');
            await onUninstall();
            return;
        }
        if (status === 'done') return;
        setStatus('loading');
        await onClick();
        setStatus('done');
    };

    const showRemove = status === 'done' && hovering && !!onUninstall;

    return (
        <button
            className={`
                min-w-[92px] px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5
                ${status === 'done'
                    ? showRemove
                        ? 'bg-red-500/15 text-red-400 border border-red-500/20 hover:bg-red-500/25'
                        : 'bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20'
                    : 'bg-white text-black hover:bg-[#10b981] hover:scale-105 active:scale-95'}
            `}
            onClick={handleClick}
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
            disabled={status === 'loading'}
        >
            {status === 'idle'   && <><Download size={12} /> Install</>}
            {status === 'loading' && <Loader2 size={12} className="animate-spin" />}
            {status === 'done'   && (showRemove
                ? <><Trash2 size={12} /> Remove</>
                : <><Check size={12} /> Installed</>
            )}
        </button>
    );
}


const CF_LOADER_MAP: Record<string, number> = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 };

function openExternal(url: string) {
    const ea = (window as any).electronAPI;
    if (ea?.openExternal) { ea.openExternal(url); return; }
    window.open(url, '_blank');
}

export function ModDetailModal({ mod, profile, packages, installedVersionId, onClose, onInstall }: {
    mod: Mod,
    profile: Profile,
    packages: Set<string>,
    installedVersionId?: string,
    onClose: () => void,
    onInstall: (m: Mod, v: ModVersion) => Promise<void>
}) {
    const hasMr = !mod.sources || mod.sources.includes('modrinth');
    const hasCf = !!(mod.sources?.includes('curseforge') && mod.cfId);

    const [activeTab, setActiveTab] = useState<'versions' | 'desc'>('versions');
    const [versionSource, setVersionSource] = useState<'modrinth' | 'curseforge'>(hasMr ? 'modrinth' : 'curseforge');
    const [mrVersions, setMrVersions] = useState<ModVersion[]>([]);
    const [cfVersions, setCfVersions] = useState<ModVersion[]>([]);
    const [loadingVersions, setLoadingVersions] = useState(false);
    const [showAllVersions, setShowAllVersions] = useState(false);
    const [successToast, setSuccessToast] = useState<string | null>(null);

    useEffect(() => { fetchVersions(); }, []);

    const fetchVersions = async () => {
        setLoadingVersions(true);
        try {
            const ps: Promise<void>[] = [];
            const loader = profile.modLoader?.toLowerCase() || 'vanilla';

            if (hasMr) {
                const mrId = mod.mrId || mod.id;
                ps.push(
                    axios.get(`https://api.modrinth.com/v2/project/${mrId}/version`, {
                        params: { loaders: `["${loader}"]`, game_versions: `["${profile.version}"]` }
                    }).then(r => setMrVersions(r.data.map((v: any) => ({
                        id: v.id, ver: v.version_number, type: v.version_type,
                        date: new Date(v.date_published).toLocaleDateString(),
                        url: v.files[0]?.url, filename: v.files[0]?.filename, source: 'modrinth' as const
                    })))).catch(() => {})
                );
            }

            if (hasCf && mod.cfId) {
                const lt = CF_LOADER_MAP[loader] ?? 0;
                ps.push(
                    axios.get(`https://api.curse.tools/v1/cf/mods/${mod.cfId}/files`, {
                        params: { gameVersion: profile.version, modLoaderType: lt, pageSize: 50 }
                    }).then(r => setCfVersions((r.data.data || []).map((f: any) => {
                        // CF sometimes returns null downloadUrl — construct CDN fallback
                        const fid = f.id;
                        const url = f.downloadUrl ||
                            `https://edge.forgecdn.net/files/${Math.floor(fid / 1000)}/${fid % 1000}/${f.fileName}`;
                        return {
                            id: String(fid),
                            ver: f.displayName || f.fileName,
                            type: f.releaseType === 1 ? 'release' : f.releaseType === 2 ? 'beta' : 'alpha',
                            date: new Date(f.fileDate).toLocaleDateString(),
                            url, filename: f.fileName, source: 'curseforge' as const
                        };
                    }))).catch(() => {})
                );
            }

            await Promise.all(ps);
        } finally {
            setLoadingVersions(false);
        }
    };

    const activeVersions = versionSource === 'modrinth' ? mrVersions : cfVersions;
    const displayedVersions = useMemo(
        () => showAllVersions ? activeVersions : activeVersions.filter(v => v.type === 'release'),
        [activeVersions, showAllVersions]
    );

    return (
        <div className="modal-overlay active" onClick={onClose} style={{ zIndex: 100 }}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <img src={mod.icon} className="modal-icon-lg" alt="" />
                    <div className="modal-title-area">
                        <h2>{mod.title}</h2>
                        {mod.author && <p>by {mod.author}</p>}
                        <div className="flex items-center gap-1.5 mt-1.5">
                            {hasMr && (
                                <button onClick={() => openExternal(`https://modrinth.com/mod/${mod.slug}`)}
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/20 font-bold hover:bg-[#10b981]/25 transition-colors flex items-center gap-1">
                                    Modrinth <ExternalLink size={9} />
                                </button>
                            )}
                            {hasCf && (
                                <button onClick={() => openExternal(`https://www.curseforge.com/minecraft/mc-mods/${mod.slug}`)}
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400 border border-orange-500/20 font-bold hover:bg-orange-500/25 transition-colors flex items-center gap-1">
                                    CurseForge <ExternalLink size={9} />
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="modal-actions">
                        <button className="btn-circle" onClick={onClose}><X size={18} /></button>
                    </div>
                </div>

                <div className="modal-tabs">
                    <button className={`tab-btn ${activeTab === 'versions' ? 'active' : ''}`} onClick={() => setActiveTab('versions')}>Versions</button>
                    <button className={`tab-btn ${activeTab === 'desc' ? 'active' : ''}`} onClick={() => setActiveTab('desc')}>Description</button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 relative">
                    {activeTab === 'versions' && (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="version-controls mb-4 flex items-center justify-between border-b border-white/10 pb-4 gap-4">
                                {/* Platform selector */}
                                {hasMr && hasCf && (
                                    <div className="flex gap-1.5 bg-white/5 p-1 rounded-lg">
                                        <button onClick={() => setVersionSource('modrinth')}
                                            className={`text-xs px-3 py-1 rounded-md font-bold transition-all ${versionSource === 'modrinth' ? 'bg-[#10b981] text-black' : 'text-gray-400 hover:text-white'}`}>
                                            Modrinth
                                        </button>
                                        <button onClick={() => setVersionSource('curseforge')}
                                            className={`text-xs px-3 py-1 rounded-md font-bold transition-all ${versionSource === 'curseforge' ? 'bg-orange-500 text-black' : 'text-gray-400 hover:text-white'}`}>
                                            CurseForge
                                        </button>
                                    </div>
                                )}
                                <label className="toggle-switch flex items-center gap-2 cursor-pointer ml-auto">
                                    <input type="checkbox" className="toggle-input hidden" checked={showAllVersions} onChange={e => setShowAllVersions(e.target.checked)} />
                                    <div className={`w-9 h-5 rounded-full relative transition-colors ${showAllVersions ? 'bg-[#10b981]' : 'bg-[#3f3f46]'}`}>
                                        <div className={`absolute top-0.5 left-0.5 bg-white w-4 h-4 rounded-full transition-transform ${showAllVersions ? 'translate-x-[16px]' : ''}`} />
                                    </div>
                                    <span className="text-xs text-gray-400">Beta/Alpha</span>
                                </label>
                                <span className="text-sm text-[#a1a1aa] shrink-0">MC <b className="text-white">{profile.version}</b></span>
                            </div>

                            {loadingVersions && <div className="text-center py-10"><Loader2 className="animate-spin mx-auto" /></div>}

                            {!loadingVersions && displayedVersions.length === 0 && (
                                <div className="text-center py-10 text-gray-500 text-sm">
                                    Keine kompatiblen Versionen gefunden.
                                </div>
                            )}

                            <div className="version-list flex flex-col gap-2">
                                {displayedVersions.map((v) => {
                                    const isInstalled = installedVersionId
                                        ? v.id === installedVersionId
                                        : packages.has(v.filename || `${mod.slug}-${v.ver}.jar`);
                                    return (
                                        <div key={v.id} className={`version-row flex items-center justify-between p-3 rounded-lg transition-colors ${isInstalled ? 'bg-[#10b981]/8 border border-[#10b981]/20' : 'bg-white/5 hover:bg-white/10'}`}>
                                            <div className="v-info flex items-center gap-3 min-w-0 flex-1">
                                                <span className="font-mono text-sm font-semibold text-white min-w-0 break-all" title={v.ver}>{v.ver}</span>
                                                <span className={`shrink-0 text-[10px] uppercase px-2 py-0.5 rounded ${v.type === 'release' ? 'bg-[#10b981]/20 text-[#10b981]' : 'bg-gray-800 text-gray-400'}`}>
                                                    {v.type}
                                                </span>
                                                {isInstalled && <span className="shrink-0 text-[10px] text-[#10b981] font-bold">● Installiert</span>}
                                            </div>
                                            <InstallButton
                                                isInstalled={isInstalled}
                                                onClick={async () => {
                                                    await onInstall(mod, v);
                                                    setSuccessToast(`${v.ver} installiert`);
                                                    setTimeout(() => setSuccessToast(null), 2500);
                                                }}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {activeTab === 'desc' && (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <p className="text-[#a1a1aa] leading-relaxed whitespace-pre-line">{mod.desc}</p>
                        </div>
                    )}
                </div>

                {successToast && (
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-[#10b981] text-black text-xs font-bold px-4 py-2 rounded-full shadow-lg shadow-green-900/30 animate-in fade-in slide-in-from-bottom-2 duration-200">
                        <Check size={14} /> {successToast}
                    </div>
                )}
            </div>
        </div>
    );
}
