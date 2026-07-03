import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { api, Profile } from '../api';
import { SearchableDropdown } from './SearchableDropdown';
import { useTranslation } from '../i18n';

interface Props {
    onClose: () => void;
    onCreated: () => void;
    existingNames?: string[];
}

export function AddProfileModal({ onClose, onCreated, existingNames = [] }: Props) {
    const { t } = useTranslation();
    const [name, setName]               = useState('');
    const [version, setVersion]         = useState<string>('');
    const [loader, setLoader]           = useState('vanilla');
    const [loaderVersion, setLoaderVersion] = useState('');

    const [versions, setVersions]           = useState<string[]>([]);
    const [loaderVersions, setLoaderVersions] = useState<string[]>([]);

    const [loadingVersions, setLoadingVersions] = useState(false);
    const [loadingLoaders, setLoadingLoaders]   = useState(false);
    const [submitting, setSubmitting]           = useState(false);

    const [duplicateError, setDuplicateError] = useState(false);

    // Validation tooltip state
    const [tooltipPhase, setTooltipPhase] = useState<'hidden' | 'visible' | 'hiding'>('hidden');
    const [drainKey, setDrainKey]         = useState(0); // increment to restart SVG animation
    const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearDismissTimer = () => {
        if (dismissTimer.current) { clearTimeout(dismissTimer.current); dismissTimer.current = null; }
    };

    const hideTooltip = useCallback(() => {
        clearDismissTimer();
        setTooltipPhase(prev => {
            if (prev === 'hidden') return prev;
            setTimeout(() => setTooltipPhase('hidden'), 250);
            return 'hiding';
        });
    }, []);

    const showNameError = () => {
        clearDismissTimer();
        setDrainKey(k => k + 1);
        setTooltipPhase('visible');
        // Auto-dismiss after 10 s (same as drain animation duration)
        dismissTimer.current = setTimeout(() => {
            setTooltipPhase('hiding');
            setTimeout(() => setTooltipPhase('hidden'), 250);
        }, 10000);
    };

    // Hide tooltip / duplicate error when user starts typing
    useEffect(() => {
        if (name.trim()) hideTooltip();
        setDuplicateError(false);
    }, [name, hideTooltip]);

    useEffect(() => () => clearDismissTimer(), []);

    // Load game versions
    useEffect(() => {
        setLoadingVersions(true);
        api.getVersions().then(v => {
            setVersions(v);
            if (v.length > 0) setVersion(v[0]);
        }).finally(() => setLoadingVersions(false));
    }, []);

    // Load loader versions when game version or loader type changes
    useEffect(() => {
        if (loader === 'vanilla') { setLoaderVersions([]); setLoaderVersion(''); return; }
        if (!version) return;
        setLoadingLoaders(true);
        setLoaderVersions([]);
        setLoaderVersion('');
        api.getLoaderVersions(loader, version).then(v => {
            setLoaderVersions(v);
            if (v.length > 0) setLoaderVersion(v[0]);
        }).finally(() => setLoadingLoaders(false));
    }, [version, loader]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) { showNameError(); return; }
        if (existingNames.some(n => n.toLowerCase() === name.trim().toLowerCase())) {
            setDuplicateError(true);
            return;
        }
        setSubmitting(true);
        try {
            const newProfile: Profile = { name, version, modLoader: loader, loaderVersion, ramMb: 4096 };
            await api.createProfile(newProfile);
            // Silently apply options template to the new profile
            try {
                await fetch(
                    `http://localhost:35555/api/options-template/apply-one?profile=${encodeURIComponent(name.trim())}`,
                    { method: 'POST' }
                );
            } catch { /* ignore — options template is optional */ }
            onCreated();
        } catch (err) {
            console.error(err);
        } finally {
            setSubmitting(false);
        }
    };

    const loaderOptions = [
        { id: 'vanilla',    name: 'Vanilla' },
        { id: 'fabric',     name: 'Fabric',     tag: t('addProfile.recommended') },
        { id: 'forge',      name: 'Forge' },
        { id: 'neoforge',   name: 'NeoForge' },
        { id: 'quilt',      name: 'Quilt' },
        { id: 'liteloader', name: 'LiteLoader',  tag: t('addProfile.legacy') },
    ];

    const inputError = tooltipPhase !== 'hidden' || duplicateError;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="relative bg-zinc-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl"
            >
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                        {t('addProfile.title')}
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                    {/* Name field with custom validation tooltip */}
                    <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">{t('addProfile.profileName')}</label>
                        <div className="relative">
                            <input
                                autoFocus
                                value={name}
                                onChange={e => setName(e.target.value)}
                                style={{
                                    boxShadow: inputError ? '0 0 0 1px rgba(239,68,68,0.45)' : undefined,
                                    transition: 'box-shadow 0.3s ease, border-color 0.3s ease',
                                }}
                                className={[
                                    'w-full bg-black/40 border rounded-lg p-3 text-white focus:outline-none transition-colors',
                                    inputError
                                        ? 'border-red-500/50'
                                        : 'border-white/10 focus:border-primary',
                                ].join(' ')}
                                placeholder={t('addProfile.namePlaceholder')}
                            />

                            {/* Duplicate name error */}
                            {duplicateError && (
                                <div style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 50 }}>
                                    <div style={{
                                        padding: '6px 10px',
                                        background: '#1f1f22',
                                        borderRadius: 6,
                                        border: '1px solid rgba(239,68,68,0.4)',
                                        color: '#f87171',
                                        fontSize: 12,
                                        fontWeight: 500,
                                        whiteSpace: 'nowrap',
                                    }}>
                                        {t('addProfile.duplicateName')}
                                    </div>
                                </div>
                            )}

                            {/* Validation tooltip */}
                            {tooltipPhase !== 'hidden' && (
                                <div
                                    className={
                                        tooltipPhase === 'visible'
                                            ? 'validation-tooltip-in'
                                            : 'validation-tooltip-out'
                                    }
                                    style={{ position: 'absolute', top: 'calc(100% + 10px)', left: 0, zIndex: 50 }}
                                >
                                    {/* Solid box — parent of text so background is truly opaque */}
                                    <div style={{
                                        position: 'relative',
                                        width: 128,
                                        height: 36,
                                        background: '#1f1f22',
                                        borderRadius: 6,
                                        border: '1px solid rgba(255,255,255,0.08)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        overflow: 'hidden',
                                    }}>
                                        {/* SVG drain border — sits on top of the background, below the text */}
                                        <svg
                                            key={drainKey}
                                            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
                                        >
                                            <rect
                                                className="validation-rect-drain"
                                                x="0.75" y="0.75"
                                                width="calc(100% - 1.5px)"
                                                height="calc(100% - 1.5px)"
                                                rx="5"
                                                fill="none"
                                                stroke="#ef4444"
                                                strokeWidth="1.5"
                                                pathLength="100"
                                                style={{ strokeDasharray: 100, strokeDashoffset: 0 }}
                                            />
                                        </svg>

                                        {/* Text on top */}
                                        <span style={{ position: 'relative', zIndex: 1, color: '#f87171', fontSize: 12, fontWeight: 500 }}>
                                            Erforderlich.
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <SearchableDropdown
                            label="GAME VERSION"
                            options={versions}
                            value={version}
                            onChange={setVersion}
                            loading={loadingVersions}
                            placeholder="Select Version"
                        />
                        <SearchableDropdown
                            label="MOD LOADER"
                            options={loaderOptions}
                            value={loader}
                            onChange={setLoader}
                            placeholder="Select Loader"
                        />
                    </div>

                    {loader !== 'vanilla' && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="relative z-10"
                        >
                            <SearchableDropdown
                                label={`${loader.toUpperCase()} VERSION`}
                                options={loaderVersions}
                                value={loaderVersion}
                                onChange={setLoaderVersion}
                                loading={loadingLoaders}
                                placeholder="Select Loader Version"
                            />
                            {loaderVersions.length === 0 && !loadingLoaders && (
                                <p className="text-xs text-red-400 mt-1">No compatible loader versions found.</p>
                            )}
                        </motion.div>
                    )}

                    <div className="pt-4 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-lg hover:bg-white/5 text-gray-400 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting || (loader !== 'vanilla' && !loaderVersion)}
                            className="px-6 py-2 bg-white text-black font-bold rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {submitting && <Loader2 size={16} className="animate-spin" />}
                            {t('addProfile.create')}
                        </button>
                    </div>
                </form>
            </motion.div>
        </div>
    );
}
