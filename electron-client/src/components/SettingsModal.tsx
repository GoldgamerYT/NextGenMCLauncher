import React, { useState, useEffect } from 'react';
import { X, Save, FolderOpen, HardDrive, Copy, Wrench, Loader, Palette } from 'lucide-react';
import { CARD_COLOR_PRESETS } from './ProfileCard';
import { motion, AnimatePresence } from 'framer-motion';
import { api, Profile } from '../api';
import { SearchableDropdown } from './SearchableDropdown';
import { CustomSlider } from './CustomSlider';
import clsx from 'clsx';

interface Props {
    profile: Profile;
    onClose: () => void;
    onSaved: (updated: Profile) => void;
    onDuplicate?: () => void;
}

export function SettingsModal({ profile, onClose, onSaved, onDuplicate }: Props) {
    const [ram, setRam] = useState(profile.ramMb || 4096);
    const [profileMinRam, setProfileMinRam] = useState(profile.profileMinRamMb || 512);
    const [useGlobalRam, setUseGlobalRam] = useState<boolean>(profile.useGlobalRam ?? true);
    const [javaPath, setJavaPath] = useState(profile.javaPath || "Auto-detect");
    const [iconPath, setIconPath] = useState(profile.iconPath || '');
    const [cardColor, setCardColor] = useState(profile.cardColor || '');
    const [totalMem, setTotalMem] = useState(8192);

    // Versioning
    const [gameVersions, setGameVersions] = useState<string[]>([]);
    const [selectedVersion, setSelectedVersion] = useState(profile.version);
    const [loadingVersions, setLoadingVersions] = useState(false);

    const [modLoader, setModLoader] = useState(profile.modLoader || 'vanilla');
    const [loaderVersions, setLoaderVersions] = useState<string[]>([]);
    const [selectedLoaderVersion, setSelectedLoaderVersion] = useState(profile.loaderVersion || '');
    const [loadingLoaders, setLoadingLoaders] = useState(false);

    const [submitting, setSubmitting]         = useState(false);
    const [reinstalling, setReinstalling]     = useState(false);
    const [duplicating, setDuplicating]       = useState(false);
    const [actionMsg, setActionMsg]           = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [showReinstallConfirm, setShowReinstallConfirm] = useState(false);
    const [reinstallCountdown, setReinstallCountdown]     = useState(10);

    useEffect(() => {
        console.log('[SettingsModal] Loaded profile RAM settings:',
            'profileId=' + profile.name,
            'useGlobalRam=' + profile.useGlobalRam,
            'minRamMb=' + profile.profileMinRamMb,
            'maxRamMb=' + profile.ramMb
        );
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
        // Validate profile-specific RAM before saving
        if (!useGlobalRam) {
            if (ram < 512) {
                showMsg('error', 'Max RAM must be at least 512 MB.');
                return;
            }
            if (profileMinRam > ram) {
                showMsg('error', `Min RAM (${profileMinRam} MB) cannot exceed Max RAM (${ram} MB).`);
                return;
            }
        }

        console.log('[SettingsModal] Saving profile RAM settings:',
            'profileId=' + profile.name,
            'useGlobalRam=' + useGlobalRam,
            'minRamMb=' + profileMinRam,
            'maxRamMb=' + ram
        );

        setSubmitting(true);
        try {
            const payload: Profile = {
                ...profile,
                ramMb: ram,
                profileMinRamMb: profileMinRam,
                useGlobalRam,
                javaPath: javaPath === "Auto-detect" ? "" : javaPath,
                iconPath: iconPath || undefined,
                cardColor: cardColor || undefined,
                version: selectedVersion,
                modLoader,
                loaderVersion: selectedLoaderVersion
            };
            // Use the backend response — it contains the authoritative saved state
            const savedProfile = await api.updateProfile(profile.name, payload);

            console.log('[SettingsModal] Profile RAM settings saved:',
                'profileId=' + profile.name,
                'useGlobalRam=' + savedProfile.useGlobalRam
            );

            showMsg('success', 'Settings saved.');
            // Pass the backend-confirmed profile to the parent so it can update state immediately
            setTimeout(() => onSaved(savedProfile), 700);
        } catch (err: any) {
            const data = err?.response?.data;
            let msg: string;
            if (typeof data === 'string') msg = data;
            else if (data && typeof data === 'object')
                msg = data.details ?? data.message ?? data.error ?? data.title ?? JSON.stringify(data);
            else
                msg = err?.message ?? 'Save failed — check the console.';
            console.error('[SettingsModal] Save failed:', err);
            showMsg('error', msg);
        } finally {
            setSubmitting(false);
        }
    };

    const showMsg = (type: 'success' | 'error', text: string) => {
        setActionMsg({ type, text });
        setTimeout(() => setActionMsg(null), 3500);
    };

    // Countdown effect — ticks while confirm dialog is open
    useEffect(() => {
        if (!showReinstallConfirm) return;
        setReinstallCountdown(10);
        const id = setInterval(() => {
            setReinstallCountdown(prev => {
                if (prev <= 1) { clearInterval(id); return 0; }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(id);
    }, [showReinstallConfirm]);

    const handleReinstall = async () => {
        setShowReinstallConfirm(false);
        setReinstalling(true);
        try {
            const updated = { ...profile, version: selectedVersion, modLoader, loaderVersion: selectedLoaderVersion };
            await api.updateProfile(profile.name, updated);
            await api.reinstallProfile(profile.name);
            showMsg('success', 'Repair gestartet — Fortschritt in der Library.');
        } catch (e: any) {
            console.error(e);
            showMsg('error', 'Repair fehlgeschlagen: ' + (e?.message ?? 'Unknown error'));
        } finally {
            setReinstalling(false);
        }
    };

    const handleDuplicate = async () => {
        setDuplicating(true);
        try {
            await api.duplicateProfile(profile.name);
            showMsg('success', 'Profile duplicated successfully.');
            onDuplicate?.();
        } catch (e: any) {
            showMsg('error', 'Duplicate failed: ' + (e?.message ?? 'Unknown error'));
        } finally {
            setDuplicating(false);
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
                                            value={iconPath}
                                            placeholder="Standard-Icon"
                                            readOnly
                                        />
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                const path = await api.pickFile();
                                                if (path) setIconPath(path);
                                            }}
                                            className="px-3 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
                                        >
                                            <FolderOpen size={18} />
                                        </button>
                                        {iconPath && (
                                            <button
                                                type="button"
                                                onClick={() => setIconPath('')}
                                                className="px-3 bg-white/10 hover:bg-red-500/20 hover:text-red-400 rounded-lg text-gray-400 transition-colors"
                                                title="Icon entfernen"
                                            >
                                                <X size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* ── Card Color ── */}
                                <div>
                                    <label className="flex items-center gap-1.5 text-xs font-bold text-gray-400 mb-2">
                                        <Palette size={13} /> KARTEN-FARBE
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        {/* "Auto" — uses loader default */}
                                        <button
                                            type="button"
                                            onClick={() => setCardColor('')}
                                            title="Loader-Standard"
                                            className={clsx(
                                                'w-7 h-7 rounded-full border-2 transition-all relative overflow-hidden',
                                                !cardColor ? 'border-white scale-110' : 'border-white/20 hover:border-white/50'
                                            )}
                                            style={{ background: 'conic-gradient(#3b82f6 0% 25%, #a855f7 25% 50%, #22c55e 50% 75%, #f97316 75%)' }}
                                        >
                                            {!cardColor && (
                                                <span className="absolute inset-0 flex items-center justify-center text-white text-[10px] font-bold bg-black/40">A</span>
                                            )}
                                        </button>

                                        {Object.entries(CARD_COLOR_PRESETS).map(([key, preset]) => (
                                            <button
                                                key={key}
                                                type="button"
                                                onClick={() => setCardColor(key)}
                                                title={preset.label}
                                                className={clsx(
                                                    'w-7 h-7 rounded-full border-2 transition-all',
                                                    cardColor === key ? 'border-white scale-110' : 'border-transparent hover:border-white/50'
                                                )}
                                                style={{ backgroundColor: preset.swatch }}
                                            />
                                        ))}
                                    </div>
                                    <p className="text-[10px] mt-1.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                                        {cardColor ? `${CARD_COLOR_PRESETS[cardColor]?.label ?? cardColor} gewählt` : 'Automatisch (Loader-Farbe)'}
                                    </p>
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
                                {/* RAM Section */}
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-bold text-gray-400 flex items-center gap-1">
                                            <HardDrive size={14} /> MEMORY
                                        </label>
                                    </div>

                                    {/* Global RAM toggle */}
                                    <label className="flex items-center gap-2.5 cursor-pointer group">
                                        <div className="relative flex-shrink-0">
                                            <input
                                                type="checkbox"
                                                checked={useGlobalRam}
                                                onChange={e => setUseGlobalRam(e.target.checked)}
                                                className="sr-only"
                                            />
                                            <div className={clsx(
                                                'w-8 h-4 rounded-full transition-colors',
                                                useGlobalRam ? 'bg-emerald-500' : 'bg-white/10'
                                            )} />
                                            <div className={clsx(
                                                'absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform',
                                                useGlobalRam ? 'translate-x-4' : 'translate-x-0.5'
                                            )} />
                                        </div>
                                        <span className="text-xs text-gray-300 group-hover:text-white transition-colors">
                                            Use global RAM settings
                                        </span>
                                    </label>

                                    {useGlobalRam ? (
                                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                                            <HardDrive size={12} className="text-emerald-400 flex-shrink-0" />
                                            <span className="text-[11px] text-emerald-300">
                                                Using global RAM defaults (set in Settings → Minecraft)
                                            </span>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {/* Min RAM */}
                                            <div>
                                                <div className="flex justify-between items-center mb-1.5">
                                                    <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Min RAM (Xms)</span>
                                                    <span className="text-xs font-mono text-gray-300">{profileMinRam} MB</span>
                                                </div>
                                                <CustomSlider
                                                    min={256}
                                                    max={Math.max(256, ram)}
                                                    step={128}
                                                    value={profileMinRam}
                                                    onChange={setProfileMinRam}
                                                    fillClassName="from-emerald-600 to-green-400"
                                                />
                                                <div className="flex justify-between text-[10px] text-gray-600 mt-1">
                                                    <span>256 MB</span><span>≤ Max</span>
                                                </div>
                                            </div>

                                            {/* Max RAM */}
                                            <div>
                                                <div className="flex justify-between items-center mb-1.5">
                                                    <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Max RAM (Xmx)</span>
                                                    <span className="text-xs font-mono text-gray-300">{ram} MB</span>
                                                </div>
                                                <CustomSlider
                                                    min={512}
                                                    max={Math.max(totalMem, ram)}
                                                    step={128}
                                                    value={ram}
                                                    onChange={v => {
                                                        setRam(v);
                                                        if (profileMinRam > v) setProfileMinRam(v);
                                                    }}
                                                    fillClassName="from-blue-600 to-cyan-400"
                                                />
                                                <div className="flex justify-between text-[10px] text-gray-600 mt-1">
                                                    <span>512 MB</span>
                                                    <span>{Math.round(Math.max(totalMem, ram) / 1024)} GB max</span>
                                                </div>
                                            </div>

                                            {profileMinRam > ram && (
                                                <p className="text-[10px] text-red-400 font-medium">
                                                    Min RAM cannot exceed Max RAM.
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="space-y-2 pt-2">
                                    <label className="block text-xs font-bold text-gray-400">MANAGEMENT</label>

                                    <AnimatePresence>
                                        {actionMsg && (
                                            <motion.div
                                                initial={{ opacity: 0, y: -4 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0 }}
                                                className={clsx(
                                                    'px-3 py-2 rounded-lg text-xs font-medium',
                                                    actionMsg.type === 'success'
                                                        ? 'bg-green-500/15 text-green-400 border border-green-500/20'
                                                        : 'bg-red-500/15 text-red-400 border border-red-500/20'
                                                )}
                                            >
                                                {actionMsg.text}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    <button
                                        type="button"
                                        onClick={handleOpenFolder}
                                        className="w-full py-2 bg-zinc-800 border border-white/5 rounded-lg hover:bg-white/5 transition-colors flex items-center justify-center gap-2 text-sm text-gray-300"
                                    >
                                        <FolderOpen size={15} /> Open Folder
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleOpenConsole}
                                        className="w-full py-2 bg-zinc-800 border border-white/5 rounded-lg hover:bg-white/5 transition-colors flex items-center justify-center gap-2 text-sm text-gray-300"
                                    >
                                        <SettingsIcon /> Open Console
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleDuplicate}
                                        disabled={duplicating}
                                        className="w-full py-2 bg-zinc-800 border border-white/5 rounded-lg hover:bg-white/5 transition-colors flex items-center justify-center gap-2 text-sm text-gray-300 disabled:opacity-50"
                                    >
                                        {duplicating ? <Loader size={14} className="animate-spin" /> : <Copy size={15} />}
                                        {duplicating ? 'Duplicating…' : 'Duplicate Profile'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setReinstallCountdown(10); setShowReinstallConfirm(true); }}
                                        disabled={reinstalling}
                                        className="w-full py-2 bg-red-900/20 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2 text-sm text-red-400 disabled:opacity-50"
                                    >
                                        {reinstalling ? <Loader size={14} className="animate-spin" /> : <Wrench size={15} />}
                                        {reinstalling ? 'Repairing…' : 'Repair / Force Reinstall'}
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

                    {/* ── Reinstall confirmation popup ── */}
                    <AnimatePresence>
                        {showReinstallConfirm && (
                            <motion.div
                                key="reinstall-confirm"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className="absolute inset-0 z-40 flex items-center justify-center rounded-2xl"
                                style={{ backgroundColor: 'rgba(9,9,11,0.92)', backdropFilter: 'blur(10px)' }}
                            >
                                <motion.div
                                    initial={{ scale: 0.92, opacity: 0, y: 8 }}
                                    animate={{ scale: 1,    opacity: 1, y: 0 }}
                                    exit={{    scale: 0.92, opacity: 0, y: 8 }}
                                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                                    className="flex flex-col items-center px-8 py-7 max-w-xs text-center"
                                >
                                    {/* Icon */}
                                    <div className="bg-red-500/15 border border-red-500/25 p-3.5 rounded-2xl mb-4 text-red-400">
                                        <Wrench size={22} />
                                    </div>

                                    <h3 className="text-white font-bold text-base mb-1">Wirklich neu installieren?</h3>
                                    <p className="text-xs mb-6" style={{ color: 'rgba(255,255,255,0.4)' }}>
                                        Alle Spieldateien werden heruntergeladen und überschrieben. Mods und Einstellungen bleiben erhalten.
                                    </p>

                                    {/* Countdown ring */}
                                    <div className="relative w-16 h-16 mb-6">
                                        <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
                                            <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
                                            <circle
                                                cx="32" cy="32" r="28" fill="none"
                                                stroke={reinstallCountdown === 0 ? '#ef4444' : '#f97316'}
                                                strokeWidth="4"
                                                strokeLinecap="round"
                                                strokeDasharray={`${2 * Math.PI * 28}`}
                                                strokeDashoffset={`${2 * Math.PI * 28 * (1 - reinstallCountdown / 10)}`}
                                                style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
                                            />
                                        </svg>
                                        <span className="absolute inset-0 flex items-center justify-center font-bold text-lg"
                                            style={{ color: reinstallCountdown === 0 ? '#ef4444' : 'rgba(255,255,255,0.7)' }}>
                                            {reinstallCountdown}
                                        </span>
                                    </div>

                                    {/* Buttons */}
                                    <div className="flex gap-2 w-full">
                                        <button
                                            onClick={() => { setShowReinstallConfirm(false); setReinstallCountdown(10); }}
                                            className="flex-1 py-2.5 rounded-xl text-xs font-medium text-white/60 hover:text-white transition-colors"
                                            style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
                                        >
                                            Abbrechen
                                        </button>
                                        <button
                                            onClick={handleReinstall}
                                            disabled={reinstallCountdown > 0}
                                            className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                            style={{
                                                backgroundColor: reinstallCountdown === 0 ? '#ef4444' : 'rgba(239,68,68,0.3)',
                                                color: 'white',
                                            }}
                                        >
                                            {reinstallCountdown > 0 ? `Bitte warten… (${reinstallCountdown}s)` : 'Jetzt neu installieren'}
                                        </button>
                                    </div>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>
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
