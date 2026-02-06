import { useState, useEffect } from 'react';
import useWebSocket from 'react-use-websocket';
import { Plus, LayoutGrid, Settings, Info, Loader } from 'lucide-react';
import logoDark from './assets/logo-dark.svg';
import { TitleBar } from './components/TitleBar';
import { ProfileCard } from './components/ProfileCard';
import { AddProfileModal } from './components/AddProfileModal';
import { SettingsModal } from './components/SettingsModal';
import { GlobalSettings } from './components/GlobalSettings';
import { ConsoleWindow } from './components/ConsoleWindow';
import { ModCenter } from './components/ModCenter';
import { api, Profile } from './api';
import clsx from 'clsx';

function App() {
    // Check for console window mode
    if (window.location.search.includes('console=')) {
        return <ConsoleWindow />;
    }

    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [statuses, setStatuses] = useState<Record<string, { state: 'running' | 'installing' | 'stopped', message?: string }>>({});
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
    const [modCenterProfile, setModCenterProfile] = useState<Profile | null>(null);
    const [activeTab, setActiveTab] = useState('profiles');
    const [gridScale, setGridScale] = useState(1.0);

    // WebSocket Connection
    const { lastMessage } = useWebSocket('ws://localhost:35555/api/ws', {
        shouldReconnect: () => true,
    });

    useEffect(() => {
        refreshProfiles();
        api.getConfig().then(c => {
            if (c.gridScale) setGridScale(c.gridScale);
        });
    }, [activeTab]);

    useEffect(() => {
        if (lastMessage !== null) {
            try {
                const data = JSON.parse(lastMessage.data);
                if (data.type === 'status') {
                    setStatuses(prev => ({
                        ...prev,
                        [data.profile]: { ...prev[data.profile], state: data.payload }
                    }));
                } else if (data.type === 'log' || data.type === 'error') {
                    setStatuses(prev => ({
                        ...prev,
                        [data.profile]: { ...prev[data.profile], message: data.payload }
                    }));
                }
            } catch (e) { console.error("WS Parse Error", e); }
        }
    }, [lastMessage]);

    const refreshProfiles = async () => {
        try {
            const p = await api.getProfiles();
            setProfiles(p);
            // Refresh config too, in case it changed
            const c = await api.getConfig();
            if (c.gridScale) setGridScale(c.gridScale);
        } catch (e) {
            console.error("Failed to load profiles", e);
        }
    };

    const handleDelete = async (name: string) => {
        await api.deleteProfile(name);
        refreshProfiles();
    };

    return (
        <div className="h-screen w-full bg-[#09090b] text-white flex flex-col font-sans overflow-hidden selection:bg-green-500/30">
            <TitleBar />

            {/* Ambient Background */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-green-500/5 blur-[120px]" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-purple-500/5 blur-[120px]" />
            </div>

            <div className="flex flex-1 pt-10 overflow-hidden z-10 relative">
                {/* Sidebar */}
                <div className="w-20 lg:w-64 flex-shrink-0 flex flex-col p-4 gap-2 border-r border-white/5 bg-black/20 backdrop-blur-xl">
                    <nav className="flex-1 flex flex-col gap-2">
                        <NavButton active={activeTab === 'profiles'} onClick={() => setActiveTab('profiles')} icon={LayoutGrid} label="Library" />
                        <NavButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={Settings} label="Settings" />
                    </nav>
                    <div className="mt-auto">
                        <NavButton active={activeTab === 'about'} onClick={() => setActiveTab('about')} icon={Info} label="About" />
                    </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 overflow-y-auto p-4 lg:p-8 scrollbar-hide">
                    <div className="max-w-[1600px] mx-auto">
                        {/* Header Section */}
                        {activeTab === 'profiles' && (
                            <div className="flex flex-col gap-8">
                                <div className="flex items-end justify-between">
                                    <div>
                                        <h1 className="text-4xl font-bold tracking-tight text-white mb-2">Library</h1>
                                        <p className="text-zinc-400 font-medium">Manage your instances</p>
                                    </div>
                                    <button
                                        onClick={() => setIsModalOpen(true)}
                                        className="group px-4 py-2.5 bg-white text-black font-bold rounded-xl hover:bg-zinc-200 transition-all active:scale-95 flex items-center gap-2 shadow-lg shadow-white/5 ring-1 ring-white/50"
                                    >
                                        <span className="bg-black/10 p-1 rounded-md group-hover:bg-black/20 transition-colors"><Plus size={16} /></span>
                                        <span>New Instance</span>
                                    </button>
                                </div>

                                {/* Grid */}
                                <div
                                    className="grid gap-6 pb-20 transition-all"
                                    style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${280 * gridScale}px, 1fr))` }}
                                >
                                    {profiles.map(p => (
                                        <ProfileCard
                                            key={p.name}
                                            profile={p}
                                            status={statuses[p.name]}
                                            onDelete={() => handleDelete(p.name)}
                                            onSettings={() => setEditingProfile(p)}
                                            onMods={() => setModCenterProfile(p)}
                                        />
                                    ))}

                                    {profiles.length === 0 && (
                                        <div className="col-span-full py-32 text-center border border-dashed border-white/10 rounded-3xl bg-white/[0.02]">
                                            <div className="inline-flex p-6 rounded-2xl bg-white/5 mb-6 ring-1 ring-white/10"><Plus size={48} className="text-zinc-600" /></div>
                                            <h3 className="text-2xl font-bold text-zinc-300 mb-2">No Profiles Yet</h3>
                                            <p className="text-zinc-500 mb-8 max-w-md mx-auto">Create your first Minecraft instance to get started. You can install mods, configure settings, and more.</p>
                                            <button onClick={() => setIsModalOpen(true)} className="px-6 py-3 bg-green-500 hover:bg-green-400 text-black font-bold rounded-xl transition-all shadow-lg shadow-green-500/20">Create Instance</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'settings' && <GlobalSettings />}

                        {activeTab === 'about' && (
                            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
                                <div className="w-24 h-24 bg-gradient-to-br from-green-400 to-blue-500 rounded-3xl mb-8 shadow-2xl shadow-green-500/20 rotate-12 blur-sm absolute opacity-20"></div>
                                <div className="w-32 h-32 mb-8 relative z-10">
                                    <img src={logoDark} className="w-full h-full object-contain drop-shadow-[0_0_25px_rgba(34,197,94,0.15)]" alt="Atlas Craft" />
                                </div>
                                <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">Atlas Craft</h1>
                                <div className="flex items-center gap-3 mb-8">
                                    <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-mono text-zinc-400">v1.0.0-Beta</span>
                                    <span className="px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-xs font-mono text-green-400">Stable</span>
                                </div>
                                <p className="text-zinc-500 max-w-md">The next generation Minecraft launcher. Built for performance, design, and usability.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {isModalOpen && <AddProfileModal onClose={() => setIsModalOpen(false)} onCreated={() => { setIsModalOpen(false); refreshProfiles(); }} />}
            {editingProfile && <SettingsModal profile={editingProfile} onClose={() => setEditingProfile(null)} onSaved={() => { setEditingProfile(null); refreshProfiles(); }} />}
            {modCenterProfile && <ModCenter profile={modCenterProfile} onClose={() => setModCenterProfile(null)} />}
        </div>
    );
}

function NavButton({ active, onClick, icon: Icon, label }: any) {
    return (
        <button
            onClick={onClick}
            className={clsx(
                "group flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 w-full text-left relative overflow-hidden",
                active ? "bg-white/10 text-white shadow-inner ring-1 ring-white/5" : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
            )}
        >
            {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-green-500 rounded-r-full shadow-[0_0_10px_2px_rgba(34,197,94,0.5)]" />}
            <Icon size={22} className={clsx("transition-transform group-active:scale-90", active ? "text-green-400" : "text-current")} />
            <span className="hidden lg:block font-medium tracking-wide text-sm">{label}</span>
        </button>
    )
}

export default App;
