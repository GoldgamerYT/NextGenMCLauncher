import React, { useState, useEffect, useMemo } from 'react';
import { X, ExternalLink, Loader2, Download, Check } from 'lucide-react';
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
}

export interface Mod {
    id: string; // Project ID
    title: string;
    desc: string;
    author: string;
    dl: string;
    icon: string;
    slug: string;
    versions: ModVersion[];
}

export function InstallButton({ isInstalled, onClick }: { isInstalled: boolean, onClick: () => Promise<void> }) {
    const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle');

    useEffect(() => {
        if (isInstalled) {
            setStatus('done');
        } else {
            setStatus('idle');
        }
    }, [isInstalled]);

    const handleClick = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (status === 'loading') return;
        setStatus('loading');
        await onClick();
        setStatus('done');
    };

    return (
        <button
            className={`
                px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2
                ${status === 'done' ? 'bg-[#10b981]/10 text-[#10b981]' : 'bg-white text-black hover:bg-[#10b981] hover:scale-105 active:scale-95'}
            `}
            onClick={handleClick}
            disabled={status === 'loading'}
        >
            {status === 'idle' && <><Download size={12} /> Install</>}
            {status === 'loading' && <><Loader2 size={12} className="animate-spin" /> Load</>}
            {status === 'done' && <><Check size={12} /> Inst</>}
        </button>
    );
}


export function ModDetailModal({ mod, profile, packages, onClose, onInstall }: {
    mod: Mod,
    profile: Profile,
    packages: Set<string>, // Set of filenames installed
    onClose: () => void,
    onInstall: (m: Mod, v: ModVersion) => Promise<void>
}) {
    const [activeTab, setActiveTab] = useState<'versions' | 'desc'>('versions');
    const [versions, setVersions] = useState<ModVersion[]>([]);
    const [loadingVersions, setLoadingVersions] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showAllVersions, setShowAllVersions] = useState(false);

    useEffect(() => {
        if (versions.length === 0) fetchVersions();
    }, []);

    const fetchVersions = async () => {
        setLoadingVersions(true);
        try {
            const res = await axios.get(`https://api.modrinth.com/v2/project/${mod.id}/version`, {
                params: {
                    loaders: `["${profile.modLoader ? profile.modLoader.toLowerCase() : 'vanilla'}"]`,
                    game_versions: `["${profile.version}"]`
                }
            });

            const fetchedVersions: ModVersion[] = res.data.map((v: any) => ({
                id: v.id,
                ver: v.version_number,
                type: v.version_type,
                date: new Date(v.date_published).toLocaleDateString(),
                url: v.files[0]?.url,
                filename: v.files[0]?.filename
            }));

            setVersions(fetchedVersions);
        } catch (e) {
            setError("Could not load versions.");
        } finally {
            setLoadingVersions(false);
        }
    };

    const displayedVersions = useMemo(() => {
        if (showAllVersions) return versions;
        return versions.filter(v => v.type === 'release');
    }, [versions, showAllVersions]);


    return (
        <div className="modal-overlay active" onClick={onClose} style={{ zIndex: 100 }}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <img src={mod.icon} className="modal-icon-lg" alt="" />
                    <div className="modal-title-area">
                        <h2>{mod.title}</h2>
                        <p>by {mod.author}</p>
                    </div>
                    <div className="modal-actions">
                        <button className="btn-circle" title="View on Modrinth" onClick={() => window.open(`https://modrinth.com/mod/${mod.slug}`, '_blank')}>
                            <ExternalLink size={18} />
                        </button>
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
                            <div className="version-controls mb-4 flex items-center justify-between border-b border-white/10 pb-4">
                                <label className="toggle-switch flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" className="toggle-input hidden"
                                        checked={showAllVersions} onChange={e => setShowAllVersions(e.target.checked)}
                                    />
                                    <div className={`w-11 h-6 rounded-full relative transition-colors ${showAllVersions ? 'bg-[#10b981]' : 'bg-[#3f3f46]'}`}>
                                        <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${showAllVersions ? 'translate-x-[20px]' : ''}`} />
                                    </div>
                                    <span className="text-sm text-gray-400 font-medium">Alle Versionen (inkl. Beta)</span>
                                </label>
                                <span className="text-sm text-[#a1a1aa]">Kompatibel mit: <b className="text-white">{profile.version}</b></span>
                            </div>

                            {loadingVersions && <div className="text-center py-10"><Loader2 className="animate-spin mx-auto" /> Loading...</div>}

                            <div className="version-list flex flex-col gap-2">
                                {displayedVersions.map((v) => {
                                    const isInstalled = packages.has(v.filename || `${mod.slug}-${v.ver}.jar`);
                                    return (
                                        <div key={v.id} className="version-row flex items-center justify-between p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
                                            <div className="v-info flex items-center gap-4">
                                                <span className="font-mono text-sm font-semibold text-white">{v.ver}</span>
                                                <span className={`text-[10px] uppercase px-2 py-0.5 rounded text-gray-400 ${v.type === 'release' ? 'bg-[#10b981]/20 text-[#10b981]' : 'bg-gray-800'}`}>
                                                    {v.type}
                                                </span>
                                            </div>

                                            <InstallButton
                                                isInstalled={isInstalled}
                                                onClick={() => onInstall(mod, v)}
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
            </div>
        </div>
    );
}
