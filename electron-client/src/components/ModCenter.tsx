import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { X, Search, Box, Download, User, AlertTriangle, Loader2, Filter } from 'lucide-react';
import './ModCenter.css';
import { Profile, api } from '../api';
import axios from 'axios';
import { ModDetailModal, InstallButton, Mod, ModVersion } from './ModDetailModal';
import { InstalledModsView } from './InstalledModsView';

interface Props {
    profile: Profile;
    onClose: () => void;
}

const CF_LOADER_MAP: Record<string, number> = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 };
// CurseForge requests are proxied through the local backend to avoid CORS
const CF_PROXY_BASE = 'http://localhost:35555/api/cf';

const MR_CATEGORIES = [
    { key: 'optimization', label: 'Optimization' },
    { key: 'utility',      label: 'Utility' },
    { key: 'technology',   label: 'Technology' },
    { key: 'magic',        label: 'Magic' },
    { key: 'adventure',    label: 'Adventure' },
    { key: 'decoration',   label: 'Decoration' },
    { key: 'food',         label: 'Food' },
    { key: 'storage',      label: 'Storage' },
    { key: 'worldgen',     label: 'World Gen' },
    { key: 'mobs',         label: 'Mobs' },
    { key: 'library',      label: 'Library' },
    { key: 'social',       label: 'Social' },
];

function normalizeTitle(t: string) {
    return t.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function ModCenter({ profile, onClose }: Props) {
    const [activeView, setActiveView] = useState<'search' | 'installed'>('search');
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [sourceFilter, setSourceFilter] = useState<'both' | 'modrinth' | 'curseforge'>('both');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [showFilters, setShowFilters] = useState(false);

    // Modrinth state
    const [mrMods, setMrMods] = useState<Mod[]>([]);
    const [mrLoading, setMrLoading] = useState(false);
    const [mrOffset, setMrOffset] = useState(0);
    const [mrHasMore, setMrHasMore] = useState(true);
    const [mrTotal, setMrTotal] = useState(0);

    // CurseForge state
    const [cfMods, setCfMods] = useState<Mod[]>([]);
    const [cfLoading, setCfLoading] = useState(false);
    const [cfOffset, setCfOffset] = useState(0);
    const [cfHasMore, setCfHasMore] = useState(true);

    // In-memory cache: survives re-renders, cleared on new search
    const cacheRef = useRef<Map<string, Mod[]>>(new Map());
    const mrLoadingRef = useRef(false);
    const cfLoadingRef = useRef(false);

    const [error, setError] = useState<string | null>(null);
    const [cfError, setCfError] = useState<string | null>(null);
    const [selectedMod, setSelectedMod] = useState<Mod | null>(null);

    // NEW STATE: Centralized Installed Data
    const [installedDetails, setInstalledDetails] = useState<any[]>([]);
    const [installedProjectIds, setInstalledProjectIds] = useState<Set<string>>(new Set());
    const [installedFilenames, setInstalledFilenames] = useState<Set<string>>(new Set());
    const [outdatedProjectIds, setOutdatedProjectIds] = useState<Set<string>>(new Set());
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
                    versions: [] as string[]
                };

                if (remoteVer) {
                    pIds.add(remoteVer.project_id);
                    // Fetch project details for full data
                    try {
                        const [projectRes, membersRes] = await Promise.all([
                            axios.get(`https://api.modrinth.com/v2/project/${remoteVer.project_id}`),
                            axios.get(`https://api.modrinth.com/v2/project/${remoteVer.project_id}/members`).catch(() => ({ data: [] })),
                        ]);
                        const owner = membersRes.data.find((m: any) => m.role === 'Owner') || membersRes.data[0];
                        meta = {
                            id: projectRes.data.id,
                            projectId: projectRes.data.id,
                            remoteId: remoteVer.id,
                            slug: projectRes.data.slug,
                            title: projectRes.data.title,
                            name: projectRes.data.title,
                            desc: projectRes.data.description,
                            icon: projectRes.data.icon_url || meta.icon,
                            author: owner?.user?.username || local.author || '',
                            dl: formatDlCount(projectRes.data.downloads),
                            versions: [remoteVer.version_number]
                        };
                    } catch (e) {
                        // Fallback to what we have
                    }
                }
                return { ...local, ...meta };
            }));

            setInstalledDetails(details);
            setInstalledProjectIds(pIds);

            // Check which installed mods are outdated (not latest version)
            const outdated = new Set<string>();
            for (const d of details) {
                if (!d.projectId || !d.remoteId) continue;
                try {
                    const res = await axios.get(`https://api.modrinth.com/v2/project/${d.projectId}/version`, {
                        params: {
                            loaders: `["${profile.modLoader ? profile.modLoader.toLowerCase() : 'vanilla'}"]`,
                            game_versions: `["${profile.version}"]`
                        }
                    });
                    if (res.data && res.data.length > 0 && res.data[0].id !== d.remoteId) {
                        outdated.add(d.projectId);
                    }
                } catch (e) { }
            }
            setOutdatedProjectIds(outdated);

        } catch (e) { console.error(e); }
        finally { if (!silent) setLoadingInstalled(false); }
    };

    // Debounce search term
    useEffect(() => {
        const h = setTimeout(() => setDebouncedSearch(searchTerm), 350);
        return () => clearTimeout(h);
    }, [searchTerm]);

    const makeCacheKey = (source: string, query: string, off: number, cat: string) =>
        `${source}|${query}|${profile.version}|${profile.modLoader}|${cat}|${off}`;

    const resetAndFetch = useCallback(() => {
        cacheRef.current.clear();
        setMrMods([]); setMrOffset(0); setMrHasMore(true);
        setCfMods([]); setCfOffset(0); setCfHasMore(true);
        setError(null);
        setCfError(null);
        if (sourceFilter !== 'curseforge') fetchMrMods(0, debouncedSearch, categoryFilter, true);
        if (sourceFilter !== 'modrinth')   fetchCfMods(0, debouncedSearch, true);
    }, [debouncedSearch, sourceFilter, categoryFilter, profile.version, profile.modLoader]);

    useEffect(() => {
        if (activeView === 'search') resetAndFetch();
    }, [debouncedSearch, sourceFilter, categoryFilter, profile.version, profile.modLoader, activeView]);

    const fetchMrMods = async (off: number, query: string, cat: string, reset: boolean) => {
        if (mrLoadingRef.current) return;
        const key = makeCacheKey('mr', query, off, cat);
        const cached = cacheRef.current.get(key);
        if (cached) {
            setMrMods(prev => reset ? cached : [...prev, ...cached]);
            setMrHasMore(cached.length === 50);
            return;
        }
        mrLoadingRef.current = true;
        setMrLoading(true);
        try {
            const loader = profile.modLoader?.toLowerCase() || 'vanilla';
            const facetParts = [
                `["versions:${profile.version}"]`,
                `["project_type:mod"]`,
                `["categories:${loader}"]`,
            ];
            if (cat) facetParts.push(`["categories:${cat}"]`);

            const res = await axios.get('https://api.modrinth.com/v2/search', {
                params: { query, facets: `[${facetParts.join(',')}]`, offset: off, limit: 50 }
            });

            if (res.data.hits) {
                const newMods: Mod[] = res.data.hits.map((hit: any) => ({
                    id: hit.project_id,
                    mrId: hit.project_id,
                    slug: hit.slug,
                    title: hit.title,
                    desc: hit.description,
                    icon: hit.icon_url || 'https://cdn.modrinth.com/assets/unknown_server.png',
                    author: hit.author,
                    dl: formatDlCount(hit.downloads),
                    versions: [],
                    sources: ['modrinth'] as const
                }));
                cacheRef.current.set(key, newMods);
                setMrMods(prev => reset ? newMods : [...prev, ...newMods]);
                setMrTotal(res.data.total_hits);
                setMrHasMore(res.data.hits.length === 50);
            }
        } catch (e: any) {
            if (reset) {
                setError(e.response?.data?.message || e.response?.data?.description || e.message || 'Modrinth Fehler');
            }
            // On pagination failure: don't change hasMore — user can click "Mehr laden" to retry
        } finally {
            mrLoadingRef.current = false;
            setMrLoading(false);
        }
    };

    const fetchCfMods = async (off: number, query: string, reset: boolean) => {
        if (cfLoadingRef.current) return;
        const key = makeCacheKey('cf', query, off, '');
        const cached = cacheRef.current.get(key);
        if (cached) {
            setCfMods(prev => reset ? cached : [...prev, ...cached]);
            setCfHasMore(cached.length === 20);
            return;
        }
        cfLoadingRef.current = true;
        setCfLoading(true);
        try {
            const loader = profile.modLoader?.toLowerCase() || 'vanilla';
            const lt = CF_LOADER_MAP[loader] ?? 0;
            const res = await axios.get(`${CF_PROXY_BASE}/search`, {
                params: { query, version: profile.version, loader: lt, offset: off, limit: 20 }
            });
            const hits: Mod[] = ((res.data.data) || []).map((h: any) => ({
                id: `cf-${h.id}`,
                cfId: h.id,
                slug: h.slug,
                title: h.name,
                desc: h.summary,
                icon: h.logo?.url || 'https://cdn.modrinth.com/assets/unknown_server.png',
                author: h.authors?.[0]?.name || '',
                dl: formatDlCount(h.downloadCount || 0),
                versions: [],
                sources: ['curseforge'] as const,
            }));
            cacheRef.current.set(key, hits);
            setCfMods(prev => reset ? hits : [...prev, ...hits]);
            setCfHasMore(hits.length === 20);
        } catch (e: any) {
            if (reset) {
                setCfError(e?.message || 'CurseForge nicht verfügbar');
                setCfHasMore(false);
            }
        }
        finally { cfLoadingRef.current = false; setCfLoading(false); }
    };

    const loadMore = () => {
        if (sourceFilter !== 'curseforge' && mrHasMore && !mrLoading) {
            const next = mrOffset + 50;
            setMrOffset(next);
            fetchMrMods(next, debouncedSearch, categoryFilter, false);
        }
        if (sourceFilter !== 'modrinth' && cfHasMore && !cfLoading) {
            const next = cfOffset + 20;
            setCfOffset(next);
            fetchCfMods(next, debouncedSearch, false);
        }
    };

    const formatDlCount = (count: number) => {
        if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
        if (count >= 1000) return (count / 1000).toFixed(1) + 'K';
        return count.toString();
    };

    // Merge + dedup by normalized title
    const mergedMods = useMemo<Mod[]>(() => {
        if (sourceFilter === 'modrinth') return mrMods;
        if (sourceFilter === 'curseforge') return cfMods;

        const map = new Map<string, Mod>();
        for (const m of mrMods) {
            map.set(normalizeTitle(m.title), { ...m, sources: ['modrinth'] });
        }
        for (const c of cfMods) {
            const key = normalizeTitle(c.title);
            if (map.has(key)) {
                const ex = map.get(key)!;
                map.set(key, { ...ex, sources: ['modrinth', 'curseforge'], cfId: c.cfId });
            } else {
                map.set(key, c);
            }
        }
        return Array.from(map.values());
    }, [mrMods, cfMods, sourceFilter]);

    const handleUninstall = async (mod: Mod) => {
        const detail = installedDetails.find(d => d.projectId === mod.id || d.id === mod.id);
        if (detail?.fileName) {
            await api.deleteMod(profile.name, detail.fileName);
            await refreshInstalledData();
        }
    };

    // --- SMART INSTALL LOGIC (Auto-Cleanup) ---
    const handleInstall = async (mod: Mod, versionInvoked?: ModVersion, currentFilename?: string) => {
        let targetVersion = versionInvoked;

        // 1. Fetch Latest if needed (Direct Card Install — always Modrinth)
        if (!targetVersion) {
            const mrId = mod.mrId || mod.id;
            try {
                const res = await axios.get(`https://api.modrinth.com/v2/project/${mrId}/version`, {
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
                        source: 'modrinth' as const,
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

                // 4. AUTO-INSTALL REQUIRED DEPENDENCIES (Modrinth only)
                try { if (targetVersion.source !== 'modrinth') throw new Error('skip');
                    const verRes = await axios.get(`https://api.modrinth.com/v2/version/${targetVersion.id}`);
                    const deps: any[] = verRes.data.dependencies?.filter((d: any) => d.dependency_type === 'required') || [];
                    for (const dep of deps) {
                        if (installedProjectIds.has(dep.project_id)) continue;
                        try {
                            let depUrl: string | undefined, depFilename: string | undefined;
                            if (dep.version_id) {
                                const dv = await axios.get(`https://api.modrinth.com/v2/version/${dep.version_id}`);
                                depUrl = dv.data.files[0]?.url;
                                depFilename = dv.data.files[0]?.filename;
                            } else {
                                const dv = await axios.get(`https://api.modrinth.com/v2/project/${dep.project_id}/version`, {
                                    params: {
                                        loaders: `["${profile.modLoader ? profile.modLoader.toLowerCase() : 'vanilla'}"]`,
                                        game_versions: `["${profile.version}"]`
                                    }
                                });
                                if (dv.data.length > 0) { depUrl = dv.data[0].files[0]?.url; depFilename = dv.data[0].files[0]?.filename; }
                            }
                            if (depUrl && depFilename) await api.installMod(profile.name, depUrl, depFilename);
                        } catch (e) { console.error('Dependency install failed', dep.project_id, e); }
                    }
                } catch (e) { /* dependency check failed silently */ }

                await refreshInstalledData();
            } catch (e) {
                console.error("Install failed", e);
                alert("Install Failed: " + e);
            }
        }
    };


    const containerRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [vpHeight, setVpHeight] = useState(600);
    const [vpWidth, setVpWidth]  = useState(1200);
    const loading = mrLoading || cfLoading;

    // Measure container on mount + resize
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(([e]) => {
            setVpHeight(e.contentRect.height);
            setVpWidth(e.contentRect.width);
        });
        ro.observe(el);
        setVpHeight(el.clientHeight);
        setVpWidth(el.clientWidth);
        return () => ro.disconnect();
    }, []);

    // Virtual grid constants
    const CARD_H   = 130;   // fixed card height px
    const GAP      = 8;     // gap-2
    const ROW_H    = CARD_H + GAP;
    const COLS     = vpWidth >= 1280 ? 3 : 2;
    const BUFFER   = 6;     // extra rows above/below viewport (pre-load more)

    // Split mods into rows
    const rows = useMemo(() => {
        const out: Mod[][] = [];
        for (let i = 0; i < mergedMods.length; i += COLS) out.push(mergedMods.slice(i, i + COLS));
        return out;
    }, [mergedMods, COLS]);

    const startRow     = Math.max(0, Math.floor(scrollTop / ROW_H) - BUFFER);
    const endRow       = Math.min(rows.length, Math.ceil((scrollTop + vpHeight) / ROW_H) + BUFFER);
    const visibleRows  = rows.slice(startRow, endRow);
    const padTop       = startRow * ROW_H;
    const padBottom    = Math.max(0, (rows.length - endRow) * ROW_H);
    const totalH       = rows.length * ROW_H + 16; // +16 = p-4 top

    // Trigger loadMore when near bottom of scroll container
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const onScroll = () => {
            const { scrollTop, scrollHeight, clientHeight } = container;
            if (scrollHeight - scrollTop - clientHeight < 600) loadMore();
        };
        container.addEventListener('scroll', onScroll, { passive: true });
        return () => container.removeEventListener('scroll', onScroll);
    }, [mrHasMore, cfHasMore, mrLoading, cfLoading, mrOffset, cfOffset, debouncedSearch, categoryFilter, sourceFilter]);


    return (
        <div className="fixed inset-0 z-[100] flex flex-col bg-[#09090b] font-sans text-white" style={{ WebkitAppRegion: 'no-drag' } as any}>
            {/* Header */}
            <header className="flex items-center justify-between px-8 py-4 bg-[#09090b]/95 backdrop-blur-md border-b border-white/5 shrink-0">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center shadow-lg shadow-green-900/30 shrink-0">
                        <Box size={20} />
                    </div>
                    <div>
                        <h1 className="text-base font-bold leading-tight">Mod Center</h1>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-[11px] px-2 py-0.5 rounded-md bg-white/[0.06] text-gray-400 border border-white/5 font-medium">{profile.name}</span>
                            <span className="text-[11px] px-2 py-0.5 rounded-md bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20 font-medium">{profile.version} · {profile.modLoader}</span>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 bg-white/[0.04] rounded-xl p-1 border border-white/5">
                    <button
                        className={`text-sm font-semibold px-5 py-1.5 rounded-lg transition-all ${activeView === 'search' ? 'bg-white/10 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                        onClick={() => setActiveView('search')}
                    >
                        Suche
                    </button>
                    <button
                        className={`text-sm font-semibold px-5 py-1.5 rounded-lg transition-all flex items-center gap-2 ${activeView === 'installed' ? 'bg-white/10 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                        onClick={() => setActiveView('installed')}
                    >
                        Meine Mods
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md ${activeView === 'installed' ? 'bg-[#10b981]/20 text-[#10b981]' : 'bg-white/5 text-gray-500'}`}>
                            {installedFilenames.size}
                        </span>
                    </button>
                </div>

                <button className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors" onClick={onClose}>
                    <X size={20} />
                </button>
            </header>

            {/* Controls */}
            <div className="px-8 py-3 border-b border-white/5 bg-white/[0.01] shrink-0 flex flex-col gap-2">
                <div className="flex gap-2">
                    {/* Search */}
                    <div className="relative flex-1">
                        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                        <input
                            type="text"
                            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-[#10b981]/40 focus:bg-white/[0.06] transition-all"
                            placeholder={activeView === 'search' ? `${profile.modLoader}-Mods suchen...` : 'Installierte Mods filtern...'}
                            autoFocus
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>

                    {activeView === 'search' && (
                        <>
                            {/* Source filter */}
                            <div className="flex bg-white/[0.04] border border-white/5 rounded-xl p-1 shrink-0">
                                {(['both', 'modrinth', 'curseforge'] as const).map(s => (
                                    <button key={s} onClick={() => setSourceFilter(s)}
                                        className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${sourceFilter === s
                                            ? s === 'curseforge' ? 'bg-orange-500 text-black' : 'bg-[#10b981] text-black'
                                            : 'text-gray-400 hover:text-white'
                                        }`}>
                                        {s === 'both' ? 'Alle' : s === 'modrinth' ? 'Modrinth' : 'CurseForge'}
                                    </button>
                                ))}
                            </div>

                            {/* Filter toggle */}
                            <button onClick={() => setShowFilters(f => !f)}
                                className={`shrink-0 px-3 py-2 rounded-xl border transition-colors flex items-center gap-2 text-sm font-medium ${showFilters ? 'bg-white/10 border-white/10 text-white' : 'bg-white/[0.04] border-white/5 text-gray-400 hover:text-white'}`}>
                                <Filter size={15} />
                            </button>

                            {/* Result count */}
                            {mrTotal > 0 && (
                                <div className="shrink-0 flex items-center px-3 text-xs text-gray-500 bg-white/[0.02] rounded-xl border border-white/5 font-mono">
                                    {mrTotal.toLocaleString()} Ergebnisse
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Category pills */}
                {activeView === 'search' && showFilters && (
                    <div className="flex flex-wrap gap-1.5 pb-1">
                        <button onClick={() => setCategoryFilter('')}
                            className={`text-xs px-3 py-1 rounded-full font-medium transition-all border ${!categoryFilter ? 'bg-white/10 border-white/20 text-white' : 'border-white/10 text-gray-500 hover:text-gray-300'}`}>
                            Alle
                        </button>
                        {MR_CATEGORIES.map(c => (
                            <button key={c.key} onClick={() => setCategoryFilter(cat => cat === c.key ? '' : c.key)}
                                className={`text-xs px-3 py-1 rounded-full font-medium transition-all border ${categoryFilter === c.key ? 'bg-[#10b981]/20 border-[#10b981]/40 text-[#10b981]' : 'border-white/10 text-gray-500 hover:text-gray-300'}`}>
                                {c.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Views */}
            {activeView === 'search' ? (
                error ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-red-400 gap-3">
                        <AlertTriangle size={32} />
                        <span className="text-sm">{error}</span>
                    </div>
                ) : (
                    <div
                        ref={containerRef}
                        className="flex-1 overflow-y-auto"
                        onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
                    >
                        {/* Initial load spinner */}
                        {loading && mergedMods.length === 0 && (
                            <div className="flex justify-center py-16">
                                <Loader2 size={28} className="animate-spin text-[#10b981]" />
                            </div>
                        )}

                        {/* CurseForge unavailable notice (non-blocking) */}
                        {cfError && sourceFilter !== 'modrinth' && (
                            <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs flex items-center gap-2">
                                <AlertTriangle size={13} />
                                CurseForge nicht verfügbar — nur Modrinth-Ergebnisse werden angezeigt.
                            </div>
                        )}

                        {/* Empty state */}
                        {!loading && mergedMods.length === 0 && (
                            <div className="text-center text-gray-500 py-24 text-sm">
                                Keine Mods gefunden.
                            </div>
                        )}

                        {/* Virtual scroll container — total height keeps scrollbar correct */}
                        {mergedMods.length > 0 && (
                            <div style={{ height: `${totalH}px`, position: 'relative' }}>
                                {/* Visible rows only */}
                                <div style={{
                                    position: 'absolute',
                                    top: `${padTop + 16}px`,
                                    left: '16px',
                                    right: '16px',
                                    display: 'grid',
                                    gridTemplateColumns: `repeat(${COLS}, 1fr)`,
                                    gap: `${GAP}px`,
                                }}>
                                    {visibleRows.flat().map(mod => {
                                        const isInstalled = installedProjectIds.has(mod.mrId || mod.id) || installedProjectIds.has(mod.id);
                                        const isOutdated  = isInstalled && (outdatedProjectIds.has(mod.mrId || mod.id) || outdatedProjectIds.has(mod.id));
                                        return (
                                            <div
                                                key={mod.id}
                                                onClick={() => setSelectedMod(mod)}
                                                style={{ height: `${CARD_H}px` }}
                                                className="group flex gap-3 p-3.5 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/10 transition-all cursor-pointer overflow-hidden"
                                            >
                                                <img src={mod.icon} className="w-14 h-14 rounded-xl bg-zinc-800 object-cover shrink-0 shadow-sm" loading="lazy" alt="" />
                                                <div className="flex flex-col flex-1 min-w-0 justify-between">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <span className="font-bold text-sm truncate">{mod.title}</span>
                                                            {mod.sources?.includes('modrinth') && (
                                                                <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#10b981]/15 text-[#10b981]">M</span>
                                                            )}
                                                            {mod.sources?.includes('curseforge') && (
                                                                <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400">CF</span>
                                                            )}
                                                            {isOutdated && (
                                                                <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20">↑</span>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">{mod.desc}</p>
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2 text-[11px] text-gray-500">
                                                            <span className="flex items-center gap-1"><Download size={9} />{mod.dl}</span>
                                                            <span className="flex items-center gap-1 truncate max-w-[80px]"><User size={9} />{mod.author}</span>
                                                        </div>
                                                        <div onClick={e => e.stopPropagation()}>
                                                            <InstallButton
                                                                isInstalled={isInstalled}
                                                                onClick={() => handleInstall(mod)}
                                                                onUninstall={() => handleUninstall(mod)}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                            </div>
                        )}

                        {/* Scroll-bottom loading indicator */}
                        {loading && mergedMods.length > 0 && (
                            <div className="flex justify-center py-4">
                                <Loader2 size={18} className="animate-spin text-[#10b981]/60" />
                            </div>
                        )}
                    </div>
                )
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
