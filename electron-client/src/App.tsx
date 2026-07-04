import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useWebSocket from 'react-use-websocket';
import { Plus, LayoutGrid, Settings, Info, Search, ChevronDown, User, LogIn, ChevronRight } from 'lucide-react';
import logoDark from './assets/logo-dark.svg';
import { TitleBar } from './components/TitleBar';
import { UpdateBanner } from './components/UpdateBanner';
import { ProfileCard } from './components/ProfileCard';
import { AddProfileModal } from './components/AddProfileModal';
import { SettingsModal } from './components/SettingsModal';
import { GlobalSettings } from './components/GlobalSettings';
import { ConsoleWindow } from './components/ConsoleWindow';
import { ConsolePage } from './components/ConsolePage';
import { ModCenter } from './components/ModCenter';
import { api, launcherApi, Profile } from './api';
import { useTranslation } from './i18n';
import clsx from 'clsx';

// ── Standalone windows (opened via Electron IPC) ──────────────────────────────
const params = new URLSearchParams(window.location.search);

function App() {
    if (params.has('consolepanel')) return <ConsolePage standalone />;
    if (params.has('console'))      return <ConsoleWindow />;
    return <MainApp />;
}

type SortKey = 'name' | 'version' | 'recent' | 'loader';
type FilterLoader = 'all' | 'vanilla' | 'fabric' | 'forge' | 'neoforge' | 'quilt' | 'liteloader';

function MainApp() {
    const { t } = useTranslation();

    const [profiles, setProfiles]               = useState<Profile[]>([]);
    const [statuses, setStatuses]               = useState<Record<string, { state: 'running' | 'installing' | 'stopped'; message?: string }>>({});
    const [isModalOpen, setIsModalOpen]         = useState(false);
    const [editingProfile, setEditingProfile]   = useState<Profile | null>(null);
    const [modCenterProfile, setModCenterProfile] = useState<Profile | null>(null);
    const [activeTab, setActiveTab]             = useState('profiles');
    const [gridScale, setGridScale]             = useState(1.0);
    const contentRef                            = useRef<HTMLDivElement>(null);
    const [accounts, setAccounts]               = useState<any[]>([]);
    const [accountMenuOpen, setAccountMenuOpen] = useState(false);
    const accountMenuRef                        = useRef<HTMLDivElement>(null);

    // Library controls
    const [search, setSearch]                   = useState('');
    const [filterLoader, setFilterLoader]       = useState<FilterLoader>('all');
    const [sortKey, setSortKey]                 = useState<SortKey>('name');
    const [sortOpen, setSortOpen]               = useState(false);

    const { lastMessage } = useWebSocket('ws://localhost:35555/api/ws', {
        shouldReconnect: () => true,
    });

    useEffect(() => {
        // Reset scroll position so Settings/About are always visible from the top
        if (contentRef.current) contentRef.current.scrollTop = 0;
        refreshProfiles();
        api.getConfig().then(c => { if (c.gridScale) setGridScale(c.gridScale); });
    }, [activeTab]);

    // Load accounts for the switcher
    useEffect(() => {
        api.getAccounts().then(setAccounts).catch(() => {});
    }, []);

    // Close account menu on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node))
                setAccountMenuOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    useEffect(() => {
        if (!lastMessage) return;
        try {
            const data = JSON.parse(lastMessage.data);
            if (data.type === 'status') {
                setStatuses(prev => ({
                    ...prev,
                    [data.profile]: { ...prev[data.profile], state: data.payload },
                }));
                if (data.payload === 'running') {
                    const runningProfile = profiles.find(p => p.name === data.profile);
                    launcherApi.notifyMinecraftRunning(data.profile);
                    launcherApi.setDiscordActivity({
                        playing: true,
                        details: `Spielt Minecraft ${runningProfile?.version ?? ''}`.trim(),
                        state: `Profil: ${data.profile}`,
                        version: runningProfile?.version,
                    });
                } else if (data.payload === 'stopped') {
                    launcherApi.notifyMinecraftStopped();
                    launcherApi.setDiscordActivity({
                        playing: false,
                        details: 'Atlas Craft',
                        state: 'Im Launcher',
                    });
                }
            } else if (data.type === 'log' || data.type === 'error') {
                setStatuses(prev => ({
                    ...prev,
                    [data.profile]: { ...prev[data.profile], message: data.payload },
                }));
            }
        } catch { /* ignore */ }
    }, [lastMessage]);

    const refreshProfiles = async () => {
        try {
            const p = await api.getProfiles();
            setProfiles(p);
            const c = await api.getConfig();
            if (c.gridScale) setGridScale(c.gridScale);
        } catch (e) { console.error('Failed to load profiles', e); }
    };

    const handleDelete = async (name: string) => {
        await api.deleteProfile(name);
        refreshProfiles();
    };

    // ── Filtered + sorted profiles ────────────────────────────────────────────
    const displayProfiles = useMemo(() => {
        let list = [...profiles];
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(p =>
                p.name.toLowerCase().includes(q) ||
                p.version.toLowerCase().includes(q) ||
                (p.modLoader ?? '').toLowerCase().includes(q)
            );
        }
        if (filterLoader !== 'all') {
            list = list.filter(p => (p.modLoader?.trim() || 'vanilla').toLowerCase() === filterLoader);
        }
        list.sort((a, b) => {
            if (sortKey === 'name')    return a.name.localeCompare(b.name);
            if (sortKey === 'version') return b.version.localeCompare(a.version);
            if (sortKey === 'loader')  return (a.modLoader ?? 'vanilla').localeCompare(b.modLoader ?? 'vanilla');
            return 0; // 'recent' — keep server order
        });
        return list;
    }, [profiles, search, filterLoader, sortKey]);

    const sortLabels: Record<SortKey, string> = {
        name:    t('library.sortName'),
        version: t('library.sortVersion'),
        recent:  t('library.sortRecent'),
        loader:  'Loader',
    };

    const loaderFilters: { key: FilterLoader; label: string }[] = [
        { key: 'all',        label: t('library.filterAll') },
        { key: 'vanilla',    label: 'Vanilla' },
        { key: 'fabric',     label: 'Fabric' },
        { key: 'forge',      label: 'Forge' },
        { key: 'neoforge',   label: 'NeoForge' },
        { key: 'quilt',      label: 'Quilt' },
        { key: 'liteloader', label: 'LiteLoader' },
    ];

    return (
        <div
            className="h-screen w-full flex flex-col font-sans overflow-hidden selection:bg-green-500/30"
            style={{ backgroundColor: 'var(--bg)', color: 'var(--text)' }}
        >
            <TitleBar />
            <UpdateBanner />

            {/* Ambient glow */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-green-500/5 blur-[120px]" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-purple-500/5 blur-[120px]" />
            </div>

            <div className="flex flex-1 pt-10 overflow-hidden z-10 relative">
                {/* ── Sidebar ── */}
                <div
                    className="w-20 lg:w-64 flex-shrink-0 flex flex-col p-4 gap-2 border-r backdrop-blur-xl"
                    style={{ borderColor: 'var(--border)', backgroundColor: 'rgba(0,0,0,0.2)' }}
                >
                    <nav className="flex-1 flex flex-col gap-1">
                        <NavButton active={activeTab === 'profiles'} onClick={() => setActiveTab('profiles')} icon={LayoutGrid} label={t('nav.library')} />
                        <NavButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={Settings}   label={t('nav.settings')} />
                    </nav>
                    <div className="mt-auto">
                        <NavButton active={activeTab === 'about'} onClick={() => setActiveTab('about')} icon={Info} label={t('nav.about')} />
                    </div>
                </div>

                {/* ── Content ── */}
                <div ref={contentRef} className="flex-1 overflow-y-auto p-4 lg:p-8 scrollbar-hide">
                    <div className="max-w-[1600px] mx-auto h-full">

                        <AnimatePresence mode="wait">
                        <motion.div
                            key={activeTab}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0  }}
                            exit={{    opacity: 0, y: -6 }}
                            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                            style={{ willChange: 'transform' }}
                        >

                        {/* ─ Library tab ─ */}
                        {activeTab === 'profiles' && (
                            <div className="flex flex-col gap-6">
                                {/* Header */}
                                <div className="flex items-end justify-between">
                                    <div>
                                        <h1 className="text-4xl font-bold tracking-tight mb-2" style={{ color: 'var(--text)' }}>
                                            {t('library.title')}
                                        </h1>
                                        <p className="font-medium" style={{ color: 'var(--text-muted)' }}>
                                            {t('library.subtitle')}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {/* Account Switcher */}
                                        <div className="relative" ref={accountMenuRef}>
                                            {(() => {
                                                const active = accounts.find(a => a.active);
                                                return (
                                                    <button
                                                        onClick={() => setAccountMenuOpen(o => !o)}
                                                        className="flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors text-sm"
                                                        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                                                    >
                                                        {active ? (
                                                            <>
                                                                <img
                                                                    src={`https://mc-heads.net/avatar/${active.uuid}/20`}
                                                                    alt={active.username}
                                                                    className="w-5 h-5 rounded"
                                                                    onError={(e: any) => { e.target.style.display = 'none'; }}
                                                                />
                                                                <span className="max-w-[100px] truncate hidden lg:block font-medium" style={{ color: 'var(--text)' }}>
                                                                    {active.username}
                                                                </span>
                                                            </>
                                                        ) : (
                                                            <><User size={14} /> <span className="hidden lg:block">{t('accounts.noAccount')}</span></>
                                                        )}
                                                        <ChevronDown size={12} />
                                                    </button>
                                                );
                                            })()}

                                            <AnimatePresence>
                                            {accountMenuOpen && (
                                                <motion.div
                                                    initial={{ opacity: 0, scale: 0.94, y: -6 }}
                                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                                    exit={{ opacity: 0, scale: 0.94, y: -6 }}
                                                    transition={{ duration: 0.14 }}
                                                    style={{ transformOrigin: 'top right', backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
                                                    className="absolute right-0 mt-1 w-56 rounded-xl border shadow-xl z-30 overflow-hidden"
                                                >
                                                    {accounts.length === 0 ? (
                                                        <div className="px-3 py-3 text-xs text-center" style={{ color: 'var(--text-muted)' }}>
                                                            {t('accounts.noAccount')}
                                                        </div>
                                                    ) : (
                                                        accounts.map(acc => (
                                                            <button
                                                                key={acc.uuid}
                                                                onClick={async () => {
                                                                    if (!acc.active) {
                                                                        await api.setActiveAccount(acc.uuid).catch(() => {});
                                                                        const updated = await api.getAccounts().catch(() => accounts);
                                                                        setAccounts(updated);
                                                                    }
                                                                    setAccountMenuOpen(false);
                                                                }}
                                                                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors text-left"
                                                                style={{
                                                                    backgroundColor: acc.active ? 'var(--surface2)' : undefined,
                                                                    color: acc.active ? 'var(--text)' : 'var(--text-muted)',
                                                                }}
                                                                onMouseEnter={e => { if (!acc.active) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--surface2)'; }}
                                                                onMouseLeave={e => { if (!acc.active) (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
                                                            >
                                                                <img
                                                                    src={`https://mc-heads.net/avatar/${acc.uuid}/24`}
                                                                    alt={acc.username}
                                                                    className="w-6 h-6 rounded flex-shrink-0"
                                                                    onError={(e: any) => { e.target.style.display = 'none'; }}
                                                                />
                                                                <span className="flex-1 truncate font-medium">{acc.username}</span>
                                                                {acc.active && <span className="text-green-400 text-[10px] font-bold">AKTIV</span>}
                                                            </button>
                                                        ))
                                                    )}
                                                    <div className="border-t" style={{ borderColor: 'var(--border)' }}>
                                                        <button
                                                            onClick={() => { setAccountMenuOpen(false); setActiveTab('settings'); }}
                                                            className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors"
                                                            style={{ color: 'var(--text-subtle)' }}
                                                            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface2)')}
                                                            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
                                                        >
                                                            <LogIn size={12} /> Konten verwalten
                                                        </button>
                                                    </div>
                                                </motion.div>
                                            )}
                                            </AnimatePresence>
                                        </div>

                                        <motion.button
                                            onClick={() => setIsModalOpen(true)}
                                            whileHover={{ scale: 1.03 }}
                                            whileTap={{ scale: 0.95 }}
                                            transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                                            style={{ willChange: 'transform' }}
                                            className="group px-4 py-2.5 bg-white text-black font-bold rounded-xl hover:bg-zinc-200 transition-colors flex items-center gap-2 shadow-lg"
                                        >
                                            <span className="bg-black/10 p-1 rounded-md group-hover:bg-black/20 transition-colors">
                                                <Plus size={16} />
                                            </span>
                                            <span>{t('library.newInstance')}</span>
                                        </motion.button>
                                    </div>
                                </div>

                                {/* Search + Filter + Sort row */}
                                {profiles.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-3">
                                        {/* Search */}
                                        <div className="relative flex-1 min-w-[180px] max-w-xs">
                                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                                            <input
                                                type="text"
                                                value={search}
                                                onChange={e => setSearch(e.target.value)}
                                                placeholder={t('library.search')}
                                                className="w-full pl-9 pr-3 py-2 rounded-xl text-sm outline-none border"
                                                style={{
                                                    backgroundColor: 'var(--surface)',
                                                    borderColor: 'var(--border)',
                                                    color: 'var(--text)',
                                                }}
                                            />
                                        </div>

                                        {/* Loader filter pills */}
                                        <div className="flex gap-1.5 flex-wrap">
                                            {loaderFilters.map(f => (
                                                <motion.button
                                                    key={f.key}
                                                    onClick={() => setFilterLoader(f.key)}
                                                    whileTap={{ scale: 0.91 }}
                                                    transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                                                    style={{ willChange: 'transform', ...(filterLoader !== f.key ? { color: 'var(--text-muted)' } : {}) }}
                                                    className={clsx(
                                                        'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                                                        filterLoader === f.key
                                                            ? 'bg-green-500/20 border-green-500/40 text-green-400'
                                                            : 'border-transparent hover:border-white/10'
                                                    )}
                                                >
                                                    {f.label}
                                                </motion.button>
                                            ))}
                                        </div>

                                        {/* Sort dropdown */}
                                        <div className="relative ml-auto">
                                            <button
                                                onClick={() => setSortOpen(o => !o)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs border transition-colors"
                                                style={{
                                                    backgroundColor: 'var(--surface)',
                                                    borderColor: 'var(--border)',
                                                    color: 'var(--text-muted)',
                                                }}
                                            >
                                                {sortLabels[sortKey]} <ChevronDown size={12} />
                                            </button>
                                            <AnimatePresence>
                                            {sortOpen && (
                                                <motion.div
                                                    initial={{ opacity: 0, scale: 0.94, y: -6 }}
                                                    animate={{ opacity: 1, scale: 1,    y: 0  }}
                                                    exit={{    opacity: 0, scale: 0.94, y: -6 }}
                                                    transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                                                    style={{ transformOrigin: 'top right', willChange: 'transform', backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
                                                    className="absolute right-0 mt-1 w-40 rounded-xl border shadow-xl z-30 overflow-hidden"
                                                >
                                                    {(Object.keys(sortLabels) as SortKey[]).map(k => (
                                                        <button
                                                            key={k}
                                                            onClick={() => { setSortKey(k); setSortOpen(false); }}
                                                            className={clsx(
                                                                'w-full text-left px-3 py-2 text-xs transition-colors',
                                                                sortKey === k ? 'text-green-400' : ''
                                                            )}
                                                            style={{
                                                                color: sortKey === k ? undefined : 'var(--text-muted)',
                                                                backgroundColor: sortKey === k ? 'var(--surface2)' : undefined,
                                                            }}
                                                            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface2)')}
                                                            onMouseLeave={e => (e.currentTarget.style.backgroundColor = sortKey === k ? 'var(--surface2)' : '')}
                                                        >
                                                            {sortLabels[k]}
                                                        </button>
                                                    ))}
                                                </motion.div>
                                            )}
                                            </AnimatePresence>
                                        </div>
                                    </div>
                                )}

                                {/* Grid */}
                                <div
                                    className="grid gap-5 pb-20"
                                    style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${260 * gridScale}px, 1fr))` }}
                                >
                                    {displayProfiles.map((p, i) => (
                                        <ProfileCard
                                            key={p.name}
                                            index={i}
                                            profile={p}
                                            status={statuses[p.name]}
                                            onDelete={() => handleDelete(p.name)}
                                            onSettings={() => setEditingProfile(p)}
                                            onMods={() => setModCenterProfile(p)}
                                        />
                                    ))}

                                    {profiles.length === 0 && (
                                        <div
                                            className="col-span-full py-32 text-center border border-dashed rounded-3xl"
                                            style={{ borderColor: 'var(--border)', backgroundColor: 'rgba(255,255,255,0.01)' }}
                                        >
                                            <div className="inline-flex p-6 rounded-2xl mb-6 ring-1" style={{ backgroundColor: 'var(--surface2)' }}>
                                                <Plus size={48} style={{ color: 'var(--text-subtle)' }} />
                                            </div>
                                            <h3 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-muted)' }}>
                                                {t('library.noProfiles')}
                                            </h3>
                                            <p className="mb-8 max-w-md mx-auto" style={{ color: 'var(--text-subtle)' }}>
                                                {t('library.noProfilesDesc')}
                                            </p>
                                            <button
                                                onClick={() => setIsModalOpen(true)}
                                                className="px-6 py-3 bg-green-500 hover:bg-green-400 text-black font-bold rounded-xl transition-all shadow-lg shadow-green-500/20"
                                            >
                                                {t('library.createInstance')}
                                            </button>
                                        </div>
                                    )}

                                    {profiles.length > 0 && displayProfiles.length === 0 && (
                                        <div className="col-span-full py-20 text-center" style={{ color: 'var(--text-muted)' }}>
                                            <Search size={36} className="mx-auto mb-3 opacity-30" />
                                            <div className="text-sm">No instances match your search.</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ─ Settings tab ─ */}
                        {activeTab === 'settings' && <GlobalSettings />}

                        {/* ─ About tab ─ */}
                        {activeTab === 'about' && (
                            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
                                <div className="w-24 h-24 bg-gradient-to-br from-green-400 to-blue-500 rounded-3xl mb-8 shadow-2xl shadow-green-500/20 rotate-12 blur-sm absolute opacity-20" />
                                <div className="w-32 h-32 mb-8 relative z-10">
                                    <img src={logoDark} className="w-full h-full object-contain drop-shadow-[0_0_25px_rgba(34,197,94,0.15)]" alt="Atlas Craft" />
                                </div>
                                <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                                    Atlas Craft
                                </h1>
                                <div className="flex items-center gap-3 mb-8">
                                    <span className="px-3 py-1 rounded-full text-xs font-mono" style={{ backgroundColor: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                                        v1.0.4-Beta
                                    </span>
                                    <span className="px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-xs font-mono text-green-400">
                                        Stable
                                    </span>
                                </div>
                                <p className="max-w-md" style={{ color: 'var(--text-muted)' }}>
                                    The next generation Minecraft launcher. Built for performance, design, and usability.
                                </p>
                            </div>
                        )}

                        </motion.div>
                        </AnimatePresence>
                    </div>
                </div>
            </div>

            {/* Modals */}
            {isModalOpen     && <AddProfileModal existingNames={profiles.map(p => p.name)} onClose={() => setIsModalOpen(false)} onCreated={() => { setIsModalOpen(false); refreshProfiles(); }} />}
            {editingProfile  && <SettingsModal profile={editingProfile} onClose={() => setEditingProfile(null)} onSaved={(savedProfile) => {
                // Update profiles state immediately with the authoritative backend response.
                // This eliminates the race condition where the user could reopen settings
                // before the async refreshProfiles() completes and see stale data.
                setProfiles(prev => prev.map(p => p.name === savedProfile.name ? savedProfile : p));
                setEditingProfile(null);
                refreshProfiles(); // also refresh to stay in sync with backend
            }} onDuplicate={refreshProfiles} />}
            {modCenterProfile && <ModCenter profile={modCenterProfile} onClose={() => setModCenterProfile(null)} />}
        </div>
    );
}

function NavButton({ active, onClick, icon: Icon, label }: any) {
    return (
        <motion.button
            onClick={onClick}
            // Rule 1: only transform (x + scale)
            whileHover={{ x: active ? 0 : 2 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 500, damping: 28 }}
            style={{ willChange: 'transform', backgroundColor: active ? 'rgba(255,255,255,0.08)' : undefined, color: active ? 'var(--text)' : 'var(--text-subtle)' }}
            className={clsx(
                'flex items-center gap-3 px-3 py-3 rounded-xl transition-colors duration-200 w-full text-left relative overflow-hidden',
                active ? 'text-white' : 'hover:text-zinc-300'
            )}
        >
            {/* Active indicator — AnimatePresence for smooth mount/unmount */}
            <AnimatePresence>
                {active && (
                    <motion.div
                        key="indicator"
                        initial={{ opacity: 0, scaleY: 0.4 }}
                        animate={{ opacity: 1, scaleY: 1    }}
                        exit={{    opacity: 0, scaleY: 0.4  }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-green-500 rounded-r-full shadow-[0_0_8px_2px_rgba(34,197,94,0.5)]"
                    />
                )}
            </AnimatePresence>
            <Icon size={22} className={clsx(active ? 'text-green-400' : '')} />
            <span className="hidden lg:block font-medium tracking-wide text-sm">{label}</span>
        </motion.button>
    );
}

export default App;
