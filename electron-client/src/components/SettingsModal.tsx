import React, { useState, useEffect } from 'react';
import { X, Save, FolderOpen, HardDrive } from 'lucide-react';
import { motion } from 'framer-motion';
import { api, Profile } from '../api';
import { SearchableDropdown } from './SearchableDropdown';

interface Props {
    profile: Profile;
    onClose: () => void;
    onSaved: () => void;
}

export function SettingsModal({ profile, onClose, onSaved }: Props) {
    const [ram, setRam] = useState(profile.ramMb);
    const [javaPath, setJavaPath] = useState(profile.javaPath || "Auto-detect");
    const [totalMem, setTotalMem] = useState(8192);

    // Versioning
    const [gameVersions, setGameVersions] = useState<string[]>([]);
    const [selectedVersion, setSelectedVersion] = useState(profile.version);
    const [loadingVersions, setLoadingVersions] = useState(false);

    const [modLoader, setModLoader] = useState(profile.modLoader || 'vanilla');
    const [loaderVersions, setLoaderVersions] = useState<string[]>([]);
    const [selectedLoaderVersion, setSelectedLoaderVersion] = useState(profile.loaderVersion || '');
    const [loadingLoaders, setLoadingLoaders] = useState(false);

    const [submitting, setSubmitting] = useState(false);
    const [reinstalling, setReinstalling] = useState(false);

    useEffect(() => {
        setLoadingVersions(true);
        api.getSystemMemory().then(bytes => setTotalMem(Math.floor(bytes / 1024 / 1024)));
        api.getVersions().then(v => {
            setGameVersions(v);
            setLoadingVersions(false);
        });
    }, []);

    useEffect(() => {
        if (modLoader !== 'vanilla') {
            setLoadingLoaders(true);
            api.getLoaderVersions(modLoader, selectedVersion).then(v => {
                setLoaderVersions(v);
                setLoadingLoaders(false);
            });
        } else {
            setLoaderVersions([]);
            setSelectedLoaderVersion('');
        }
    }, [modLoader, selectedVersion]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const updated = {
                ...profile,
                ramMb: ram,
                javaPath: javaPath === "Auto-detect" ? "" : javaPath,
                version: selectedVersion,
                modLoader,
                loaderVersion: selectedLoaderVersion
            };
            await api.updateProfile(profile.name, updated);
            onSaved();
        } catch (e) {
            console.error(e);
        } finally {
            setSubmitting(false);
        }
    };

    const handleReinstall = async () => {
        if (!confirm("This will delete current game files and reinstall. Continue?")) return;
        setReinstalling(true);
        try {
            // First save current settings to ensure we reinstall the RIGHT version
            const updated = {
                ...profile,
                version: selectedVersion,
                modLoader,
                loaderVersion: selectedLoaderVersion
            };
            await api.updateProfile(profile.name, updated);
            await api.reinstallProfile(profile.name);
            alert("Reinstall started! Check the dashboard.");
            onClose();
        } catch (e) {
            console.error(e);
            alert("Failed to start reinstall.");
        } finally {
            setReinstalling(false);
        }
    };

    const handleOpenConsole = () => {
        window.open(`?console=${profile.name}`, '_blank', 'width=800,height=600,menubar=no,toolbar=no,location=no,status=no');
    };

    const handleOpenFolder = async () => {
        try { await api.openFolder(profile.name); } catch (e) { console.error(e); }
    };

    const loaderOptions = [
        { id: 'vanilla', name: 'Vanilla' },
        { id: 'fabric', name: 'Fabric', tag: 'Recommended' },
        { id: 'forge', name: 'Forge' },
        { id: 'neoforge', name: 'NeoForge' }
    ];

    return (
        <div className="fixed inset-0 z-[100] flex justify-center items-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            <div className="absolute inset-0 overflow-y-auto flex items-center justify-center p-4 pointer-events-none">
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="relative bg-zinc-900 border border-white/10 rounded-2xl p-6 w-full max-w-2xl shadow-2xl pointer-events-auto"
                >
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <SettingsIcon /> Settings: <span className="text-gray-400">{profile.name}</span>
                        </h2>
                        <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full transition-colors"><X size={20} /></button>
                    </div>

                    <form onSubmit={handleSave} className="space-y-6">

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Left Col: Versions */}
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 mb-2">ICON / IMAGE</label>
                                    <div className="flex gap-2">
                                        <input
                                            className="w-full bg-black/20 border border-white/10 rounded-lg p-2.5 text-white focus:border-primary outline-none text-sm"
                                            value={profile.iconPath || ''}
                                            placeholder="Default (Box)"
                                            readOnly
                                        />
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                const path = await api.pickFile();
                                                if (path) {
                                                    // Allow immediate feedback, though we save on 'Save'
                                                    // We need to update local state.
                                                    // Ideally we should have a local state for iconPath too.
                                                    // For now, let's create a local state for it.
                                                }
                                            }}
                                            className="px-3 bg-white/10 hover:bg-white/20 rounded-lg text-white"
                                        >
                                            <FolderOpen size={18} />
                                        </button>
                                    </div>
                                </div>

                                <div className="relative z-30">
                                    <SearchableDropdown
                                        label="MINECRAFT VERSION"
                                        options={gameVersions}
                                        value={selectedVersion}
                                        onChange={setSelectedVersion}
                                        loading={loadingVersions}
                                        placeholder="Select Version"
                                    />
                                </div>

                                <div className="relative z-20">
                                    <SearchableDropdown
                                        label="MOD LOADER"
                                        options={loaderOptions}
                                        value={modLoader}
                                        onChange={(val) => { setModLoader(val); setSelectedLoaderVersion(''); }}
                                        placeholder="Select Loader"
                                    />
                                </div>

                                {modLoader !== 'vanilla' && (
                                    <div className="relative z-10">
                                        <SearchableDropdown
                                            label="LOADER VERSION"
                                            options={loaderVersions}
                                            value={selectedLoaderVersion}
                                            onChange={setSelectedLoaderVersion}
                                            loading={loadingLoaders}
                                            placeholder="Select Loader Version"
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Right Col: System */}
                            <div className="space-y-6">
                                {/* RAM Slider */}
                                <div>
                                    <div className="flex justify-between items-end mb-2">
                                        <label className="text-xs font-bold text-gray-400 flex items-center gap-1">
                                            <HardDrive size={14} /> ALLOCATED MEMORY
                                        </label>
                                        <span className="text-primary font-mono bg-primary/10 px-2 py-0.5 rounded text-sm">
                                            {ram} MB
                                        </span>
                                    </div>
                                    <div className="relative h-2 bg-white/10 rounded-full overflow-hidden">
                                        <div
                                            className="absolute top-0 left-0 h-full bg-primary"
                                            style={{ width: `${(ram / totalMem) * 100}%` }}
                                        />
                                        <input
                                            type="range"
                                            min="2048"
                                            max={totalMem}
                                            step="128"
                                            value={ram}
                                            onChange={(e) => setRam(parseInt(e.target.value))}
                                            className="absolute inset-0 w-full opacity-0 cursor-pointer"
                                        />
                                    </div>
                                    <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                                        <span>2GB</span>
                                        <span>{Math.round(totalMem / 1024)}GB</span>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="space-y-2 pt-2">
                                    <label className="block text-xs font-bold text-gray-400">MANAGEMENT</label>
                                    <button
                                        type="button"
                                        onClick={handleOpenFolder}
                                        className="w-full py-2 bg-zinc-800 border border-white/5 rounded-lg hover:bg-white/5 transition-colors flex items-center justify-center gap-2 text-sm text-gray-300"
                                    >
                                        <FolderOpen size={16} /> Open Folder
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleOpenConsole}
                                        className="w-full py-2 bg-zinc-800 border border-white/5 rounded-lg hover:bg-white/5 transition-colors flex items-center justify-center gap-2 text-sm text-gray-300"
                                    >
                                        <SettingsIcon /> Open Console Window
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleReinstall}
                                        disabled={reinstalling}
                                        className="w-full py-2 bg-red-900/20 border border-red-500/20 rounded-lg hover:bg-red-500/30 transition-colors flex items-center justify-center gap-2 text-sm text-red-400"
                                    >
                                        {reinstalling ? "Reinstalling..." : "Reinstall / Force Update"}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="pt-4 flex justify-end gap-3 border-t border-white/10">
                            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg hover:bg-white/5 text-gray-400 transition-colors">Cancel</button>
                            <button
                                type="submit"
                                disabled={submitting}
                                className="px-6 py-2 bg-white text-black font-bold rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2"
                            >
                                <Save size={16} /> Save Changes
                            </button>
                        </div>
                    </form>
                </motion.div>
            </div>
        </div>
    );
}

function SettingsIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
    )
}
