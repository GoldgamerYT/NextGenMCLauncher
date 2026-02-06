import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Search, Box, Download, User, AlertTriangle, Loader2 } from 'lucide-react';
import './ModCenter.css';
import { Profile, api } from '../api';
import axios from 'axios';
import { ModDetailModal, InstallButton, Mod, ModVersion } from './ModDetailModal';
import { InstalledModsView } from './InstalledModsView';

interface Props {
    profile: Profile;
    onClose: () => void;
}

const ROW_HEIGHT = 200;
const MIN_COL_WIDTH = 340;

export function ModCenter({ profile, onClose }: Props) {
    const [activeView, setActiveView] = useState<'search' | 'installed'>('search');
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [mods, setMods] = useState<Mod[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [offset, setOffset] = useState(0);
    const [totalHits, setTotalHits] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [selectedMod, setSelectedMod] = useState<Mod | null>(null);

    // NEW STATE: Centralized Installed Data
    const [installedDetails, setInstalledDetails] = useState<any[]>([]);
    const [installedProjectIds, setInstalledProjectIds] = useState<Set<string>>(new Set());
    const [installedFilenames, setInstalledFilenames] = useState<Set<string>>(new Set());
    const [loadingInstalled, setLoadingInstalled] = useState(false);

    // Initial Load
    useEffect(() => {
        refreshInstalledData();
        // Polling
        const interval = setInterval(() => refreshInstalledData(true), 5000);
        return () => clearInterval(interval);
    }, [profile.name]);

    const refreshInstalledData = async (silent = false) => {
        if (!silent) setLoadingInstalled(true);
        try {
            // 1. Get Local Files
            const localMods = await api.getDetailedMods(profile.name);
            const filenames = new Set(localMods.map(m => m.fileName));
            setInstalledFilenames(filenames);

            // 2. Resolve IDs (only if we have hashes)
            const hashes = localMods.filter(m => m.sha1).map(m => m.sha1);
            let modrinthData: any = {};
            if (hashes.length > 0) {
                try {
                    const res = await axios.post('https://api.modrinth.com/v2/version_files', {
                        hashes: hashes,
                        algorithm: 'sha1'
                    });
                    modrinthData = res.data;
                } catch (e) { }
            }

            // 3. Merge & Build Sets
            const pIds = new Set<string>();
            const details = await Promise.all(localMods.map(async (local: any) => {
                const remoteVer = modrinthData[local.sha1];
                let meta = {
                    id: local.projectId || '',
                    projectId: local.projectId || '',
                    remoteId: remoteVer ? remoteVer.id : undefined,
                    slug: local.slug || '',
                    title: local.name || local.fileName,
                    name: local.name || local.fileName,
                    desc: local.description || '',
                    icon: local.iconUrl || 'https://cdn.modrinth.com/assets/unknown_server.png',
                    author: local.author || 'Unknown',
                    dl: '0',
                    versions: []
                };

                if (remoteVer) {
                    pIds.add(remoteVer.project_id);
                    // Fetch project details for full data
                    try {
                        const projectRes = await axios.get(`https://api.modrinth.com/v2/project/${remoteVer.project_id}`);
                        meta = {
                            id: projectRes.data.id,
                            projectId: projectRes.data.id,
                            remoteId: remoteVer.id,
                            slug: projectRes.data.slug,
                            title: projectRes.data.title,
                            name: projectRes.data.title,
                            desc: projectRes.data.description,
                            icon: projectRes.data.icon_url || meta.icon,
                            author: projectRes.data.author,
                            dl: formatDlCount(projectRes.data.downloads),
                            versions: []
                        };
                    } catch (e) {
                        // Fallback to what we have
                    }
                }
                return { ...local, ...meta };
            }));

            setInstalledDetails(details);
            setInstalledProjectIds(pIds);

        } catch (e) { console.error(e); }
        finally { if (!silent) setLoadingInstalled(false); }
    };

    // Debounce search term
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(searchTerm);
        }, 300);
        return () => clearTimeout(handler);
    }, [searchTerm]);

    useEffect(() => {
        if (activeView === 'search') {
            setMods([]);
            setOffset(0);
            setHasMore(true);
            fetchMods(0, debouncedSearch, true);
        }
    }, [debouncedSearch, profile.version, profile.modLoader, activeView]);

    const fetchMods = async (currentOffset: number, query: string, reset: boolean) => {
        if (loading) return;

        setLoading(true);
        setError(null);

        try {
            const params: any = {
                query: query,
                facets: `[["versions:${profile.version}"],["project_type:mod"],["categories:${profile.modLoader ? profile.modLoader.toLowerCase() : 'vanilla'}"]]`,
                offset: currentOffset,
                limit: 20
            };

            const res = await axios.get('https://api.modrinth.com/v2/search', { params });

            if (res.data.hits) {
                const newMods = res.data.hits.map((hit: any) => ({
                    id: hit.project_id,
                    slug: hit.slug,
                    title: hit.title,
                    desc: hit.description,
                    icon: hit.icon_url || 'https://cdn.modrinth.com/assets/unknown_server.png',
                    author: hit.author,
                    dl: formatDlCount(hit.downloads),
                    versions: []
                }));
                setMods(prev => reset ? newMods : [...prev, ...newMods]);
                setTotalHits(res.data.total_hits);
                setHasMore(res.data.hits.length === 20);
            }
        } catch (e: any) {
            console.error("Failed to fetch mods", e);
            setError(e.response?.data?.description || e.message || "An unknown error occurred.");
        } finally {
            setLoading(false);
        }
    };

    const formatDlCount = (count: number) => {
        if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
        if (count >= 1000) return (count / 1000).toFixed(1) + 'K';
        return count.toString();
    };

    // --- SMART INSTALL LOGIC (Auto-Cleanup) ---
    const handleInstall = async (mod: Mod, versionInvoked?: ModVersion, currentFilename?: string) => {
        let targetVersion = versionInvoked;

        // 1. Fetch Latest if needed (Direct Card Install)
        if (!targetVersion) {
            try {
                const res = await axios.get(`https://api.modrinth.com/v2/project/${mod.id}/version`, {
                    params: {
                        loaders: `["${profile.modLoader ? profile.modLoader.toLowerCase() : 'vanilla'}"]`,
                        game_versions: `["${profile.version}"]`
                    }
                });
                if (res.data && res.data.length > 0) {
                    const v = res.data[0];
                    targetVersion = {
                        id: v.id,
                        ver: v.version_number,
                        type: v.version_type,
                        date: new Date(v.date_published).toLocaleDateString(),
                        url: v.files[0]?.url,
                        filename: v.files[0]?.filename
                    };
                } else {
                    alert("No compatible version found.");
                    return;
                }
            } catch (e) {
                console.error("Version fetch failed", e);
                return;
            }
        }

        if (targetVersion && targetVersion.url) {
            const fname = targetVersion.filename || `${mod.slug}-${targetVersion.ver}.jar`;

            // 2. CLEANUP OLD VERSIONS
            const toDelete = new Set<string>();

            // A. Explicit File Passed
            if (currentFilename && currentFilename !== fname) {
                toDelete.add(currentFilename);
            }

            // B. Fuzzy Match (Fallback/Safety) - Modrinth slugs
            const oldFiles = Array.from(installedFilenames).filter(file => {
                return file.toLowerCase().startsWith(mod.slug.toLowerCase());
            });
            oldFiles.forEach(f => {
                if (f !== fname) toDelete.add(f);
            });

            if (toDelete.size > 0) {
                for (const old of Array.from(toDelete)) {
                    try {
                        await api.deleteMod(profile.name, old);
                    } catch (e) {
                        console.error("Failed to delete old mod", old, e);
                    }
                }
            }

            // 3. INSTALL NEW
            try {
                await api.installMod(profile.name, targetVersion.url, fname);
                // Instant refresh
                await refreshInstalledData();
            } catch (e) {
                console.error("Install failed", e);
                alert("Install Failed: " + e);
            }
        }
    };


    const containerRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

    useEffect(() => {
        const updateSize = () => {
            if (containerRef.current) {
                setContainerSize({ width: containerRef.current.clientWidth - 40, height: containerRef.current.clientHeight });
            }
        };
        window.addEventListener('resize', updateSize);
        setTimeout(updateSize, 100);
        return () => window.removeEventListener('resize', updateSize);
    }, []);

    const { cols, totalRows, visibleItems, startRow, paddingTop } = useMemo(() => {
        const width = Math.max(containerSize.width, MIN_COL_WIDTH);
        const cols = Math.max(1, Math.floor(width / MIN_COL_WIDTH));
        const totalRows = Math.ceil(mods.length / cols);
        const startRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 1);
        const visibleRows = Math.ceil(containerSize.height / ROW_HEIGHT) + 2;
        const startIndex = startRow * cols;
        const endIndex = Math.min(mods.length, (startRow + visibleRows) * cols);

        return { cols, totalRows, visibleItems: mods.slice(startIndex, endIndex), startRow, paddingTop: startRow * ROW_HEIGHT };
    }, [mods, scrollTop, containerSize]);


    useEffect(() => {
        if (activeView === 'search' && !loading && hasMore && containerRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
            if (scrollTop + clientHeight >= scrollHeight - 300) {
                const nextOffset = offset + 20;
                setOffset(nextOffset);
                fetchMods(nextOffset, debouncedSearch, false);
            }
        }
    }, [scrollTop, loading, hasMore, offset, debouncedSearch, activeView]);


    const gridStyle = {
        gridTemplateColumns: `repeat(${cols}, minmax(340px, 1fr))`,
        marginTop: `${paddingTop}px`
    };

    return (
        <div className="mod-center-container fixed inset-0 z-[50] flex flex-col bg-[#0f0f13] font-sans text-white">
            <header className="mod-header">
                <div className="profile-info">
                    <div className="profile-icon"><Box size={24} /></div>
                    <div className="profile-details">
                        <h1>Mod Center</h1>
                        <div className="profile-badges">
                            <span className="p-badge">{profile.name}</span>
                            <span className="p-badge highlight">{profile.version} / {profile.modLoader}</span>
                        </div>
                    </div>
                </div>

                {/* TABS */}
                <div className="flex gap-4 mx-8">
                    <button
                        className={`text-sm font-bold pb-1 border-b-2 transition-colors ${activeView === 'search' ? 'border-[#10b981] text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                        onClick={() => setActiveView('search')}
                    >
                        Search
                    </button>
                    <button
                        className={`text-sm font-bold pb-1 border-b-2 transition-colors ${activeView === 'installed' ? 'border-[#10b981] text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                        onClick={() => setActiveView('installed')}
                    >
                        My Mods ({installedFilenames.size})
                    </button>
                </div>

                <button className="close-btn" onClick={onClose}><X size={24} /></button>
            </header>

            {/* SHARED CONTROLS */}
            <div className="controls">
                <div className="search-wrapper">
                    <input
                        type="text"
                        className="search-input"
                        placeholder={activeView === 'search' ? `Search ${profile.modLoader} mods...` : "Filter installed mods..."}
                        autoFocus={true}
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>

                {/* Right Side Stats */}
                <div className="flex gap-3">
                    {activeView === 'search' && totalHits > 0 && (
                        <div className="stats-badge text-gray-500">
                            {totalHits} Results
                        </div>
                    )}
                    <div className="stats-badge text-[#10b981] bg-[#10b981]/10 border-[#10b981]/20">
                        {installedFilenames.size} Installed
                    </div>
                </div>
            </div>

            {/* VIEWS */}
            {activeView === 'search' ? (
                <>
                    {/* Error State */}
                    {error && (
                        <div className="flex-1 flex flex-col items-center justify-center text-red-400 gap-2">
                            <AlertTriangle size={32} />
                            <span>{error}</span>
                        </div>
                    )}

                    {!error && (
                        <div id="virtualContainer" ref={containerRef} onScroll={e => setScrollTop(e.currentTarget.scrollTop)}>
                            <div style={{ height: `${totalRows * ROW_HEIGHT + 40}px` }}>
                                <div className="mod-grid" style={gridStyle}>
                                    {visibleItems.map(mod => {
                                        // 100% ACCURATE CHECK via Project ID
                                        const isInstalled = installedProjectIds.has(mod.id);

                                        return (
                                            <div key={mod.id} className="mod-card" onClick={() => setSelectedMod(mod)}>
                                                <img src={mod.icon} className="mod-icon" loading="lazy" alt="" />
                                                <div className="mod-content">
                                                    <div className="overflow-hidden bg-transparent">
                                                        <div className="mod-title" title={mod.title}>{mod.title}</div>
                                                        <div className="mod-desc line-clamp-2" title={mod.desc}>{mod.desc}</div>
                                                    </div>
                                                    <div className="mod-footer">
                                                        <div className="mod-meta">
                                                            <span><Download size={10} /> {mod.dl}</span>
                                                            <span className="truncate max-w-[80px]"><User size={10} /> {mod.author}</span>
                                                        </div>
                                                        {/* DIRECT INSTALL BUTTON */}
                                                        <InstallButton
                                                            isInstalled={isInstalled}
                                                            onClick={() => handleInstall(mod)}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            {loading && (
                                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/50 px-4 py-2 rounded-full backdrop-blur">
                                    <Loader2 size={16} className="animate-spin" />
                                    <span className="text-xs">Loading...</span>
                                </div>
                            )}
                        </div>
                    )}
                </>
            ) : (
                <InstalledModsView
                    profile={profile}
                    onClose={onClose}
                    filter={searchTerm}
                    details={installedDetails}
                    loading={loadingInstalled}
                    onRefresh={() => refreshInstalledData(true)}
                />
            )}

            {selectedMod && (
                <ModDetailModal
                    mod={selectedMod}
                    profile={profile}
                    packages={installedFilenames}
                    onClose={() => setSelectedMod(null)}
                    onInstall={handleInstall}

                />
            )}
        </div>
    );
}
