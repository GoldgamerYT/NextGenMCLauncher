import React, { useState, useEffect } from 'react';
import { Play, Settings, Trash2, RotateCcw, AlertTriangle, Package, Loader } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Profile } from '../api';
import { useTranslation } from '../i18n';
import clsx from 'clsx';
import defaultIcon from '../assets/logo-icon.svg';

interface Props {
    profile:    Profile;
    index?:     number;
    status?:    { state: 'running' | 'installing' | 'stopped'; message?: string };
    onDelete:   () => void;
    onSettings: () => void;
    onMods:     () => void;
}

// Loader → fallback gradient (used when no cardColor is set)
const LOADER_GRADIENT: Record<string, { from: string; to: string; badge: string; badgeText: string; label: string }> = {
    vanilla:    { from: '#1c1c1f', to: '#111113', badge: '#3f3f46', badgeText: '#a1a1aa', label: 'Vanilla'    },
    fabric:     { from: '#1a1035', to: '#0d0820', badge: '#312e81', badgeText: '#a5b4fc', label: 'Fabric'     },
    forge:      { from: '#2c1003', to: '#160500', badge: '#7c2d12', badgeText: '#fb923c', label: 'Forge'      },
    neoforge:   { from: '#1e0a3c', to: '#0e041e', badge: '#4a1d96', badgeText: '#c084fc', label: 'NeoForge'   },
    quilt:      { from: '#220a3c', to: '#10041e', badge: '#581c87', badgeText: '#d8b4fe', label: 'Quilt'      },
    liteloader: { from: '#032030', to: '#011018', badge: '#164e63', badgeText: '#67e8f9', label: 'LiteLoader' },
};
const LOADER_FALLBACK = { from: '#18181b', to: '#09090b', badge: '#27272a', badgeText: '#71717a', label: 'Unknown' };

// Color presets — swatch = bright picker color, from/to = dark gradient on card
export const CARD_COLOR_PRESETS: Record<string, { from: string; to: string; swatch: string; label: string }> = {
    red:    { from: '#3d0808', to: '#1a0303', swatch: '#ef4444', label: 'Rot'     },
    orange: { from: '#3d1a05', to: '#1a0b02', swatch: '#f97316', label: 'Orange'  },
    amber:  { from: '#3d2c05', to: '#1a1202', swatch: '#f59e0b', label: 'Gelb'    },
    green:  { from: '#053d1a', to: '#021a0b', swatch: '#22c55e', label: 'Grün'    },
    teal:   { from: '#053d38', to: '#02181a', swatch: '#14b8a6', label: 'Türkis'  },
    cyan:   { from: '#053040', to: '#021520', swatch: '#06b6d4', label: 'Cyan'    },
    blue:   { from: '#05153d', to: '#020a1c', swatch: '#3b82f6', label: 'Blau'    },
    indigo: { from: '#110a3d', to: '#08051c', swatch: '#6366f1', label: 'Indigo'  },
    purple: { from: '#210a3d', to: '#0f051c', swatch: '#a855f7', label: 'Lila'    },
    pink:   { from: '#3d0530', to: '#1a0215', swatch: '#ec4899', label: 'Pink'    },
    rose:   { from: '#3d0515', to: '#1a020a', swatch: '#f43f5e', label: 'Rosa'    },
    slate:  { from: '#1e293b', to: '#0f172a', swatch: '#94a3b8', label: 'Grau'    },
};

const SPRING     = { type: 'spring', stiffness: 380, damping: 24 } as const;
const EASE_APPLE = [0.16, 1, 0.3, 1] as const;

export function ProfileCard({ profile, index = 0, status, onDelete, onSettings, onMods }: Props) {
    const { t }        = useTranslation();
    const state        = status?.state ?? 'stopped';
    const isRunning    = state === 'running';
    const isInstalling = state === 'installing';
    const [isDeleteMode,   setIsDeleteMode]   = useState(false);
    const [deleteCountdown, setDeleteCountdown] = useState(5);
    const [launchError,    setLaunchError]    = useState<string | null>(null);
    const [imgError,       setImgError]       = useState(false);

    useEffect(() => {
        if (!isDeleteMode) return;
        setDeleteCountdown(5);
        const id = setInterval(() => {
            setDeleteCountdown(prev => {
                if (prev <= 1) { clearInterval(id); return 0; }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(id);
    }, [isDeleteMode]);

    const loaderKey  = (profile.modLoader?.trim() || 'vanilla').toLowerCase();
    const loaderMeta = LOADER_GRADIENT[loaderKey] ?? LOADER_FALLBACK;

    // Resolve gradient: custom color preset > loader default
    const colorPreset  = profile.cardColor ? CARD_COLOR_PRESETS[profile.cardColor] : null;
    const gradFrom     = colorPreset ? colorPreset.from : loaderMeta.from;
    const gradTo       = colorPreset ? colorPreset.to   : loaderMeta.to;

    const hasIcon = profile.iconPath && !imgError;

    const handleLaunch = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setLaunchError(null);
        try {
            const { api } = await import('../api');
            await api.launch(profile.name);
        } catch (err: any) {
            const msg = err?.response?.data ?? err?.message ?? 'Launch failed';
            setLaunchError(msg);
            setTimeout(() => setLaunchError(null), 5000);
        }
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0,  scale: 1    }}
            exit={{    opacity: 0, y: 12, scale: 0.96  }}
            transition={{ duration: 0.3, ease: EASE_APPLE, delay: Math.min(index * 0.05, 0.25) }}
            whileHover={{ y: -2 }}
            style={{ willChange: 'transform' }}
            className="relative group rounded-2xl overflow-hidden flex flex-col cursor-default"
        >
            {/* Outer border */}
            <div
                className="absolute inset-0 rounded-2xl pointer-events-none z-10 transition-colors duration-200"
                style={{ border: `1px solid ${
                    isRunning    ? 'rgba(34,197,94,0.45)'  :
                    isInstalling ? 'rgba(234,179,8,0.45)'  :
                    'rgba(255,255,255,0.07)'
                }` }}
            />

            {/* ── Thumbnail ── */}
            <div className="relative w-full" style={{ paddingBottom: '62%' }}>
                <div className="absolute inset-0">

                    {hasIcon ? (
                        <img
                            src={`http://localhost:35555/api/profiles/${profile.name}/icon?t=${Date.now()}`}
                            alt={profile.name}
                            className="w-full h-full object-cover"
                            onError={() => setImgError(true)}
                        />
                    ) : (
                        <div
                            className="w-full h-full flex items-center justify-center"
                            style={{ background: `radial-gradient(ellipse at 60% 40%, ${gradFrom} 0%, ${gradTo} 100%)` }}
                        >
                            <img
                                src={defaultIcon}
                                alt=""
                                className="w-20 h-20"
                                style={{ opacity: 0.65, filter: 'brightness(1.4) drop-shadow(0 0 16px rgba(16,185,129,0.4))' }}
                            />
                        </div>
                    )}

                    {/* Bottom fade */}
                    <div
                        className="absolute inset-x-0 bottom-0 h-16 pointer-events-none"
                        style={{ background: 'linear-gradient(to bottom, transparent, var(--surface, #111113))' }}
                    />

                    {/* Running glow */}
                    {isRunning && (
                        <div className="absolute inset-0 pointer-events-none"
                            style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.08) 0%, transparent 60%)' }} />
                    )}

                    {/* Status badge — top left */}
                    {(isRunning || isInstalling) && (
                        <div className="absolute top-2.5 left-2.5">
                            <span
                                className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold"
                                style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
                                         color: isRunning ? '#4ade80' : '#facc15' }}
                            >
                                <span className={clsx(
                                    'w-1.5 h-1.5 rounded-full animate-pulse',
                                    isRunning ? 'bg-green-400' : 'bg-yellow-400'
                                )} />
                                {isRunning ? 'Running' : 'Installing'}
                            </span>
                        </div>
                    )}

                    {/* ── Hover action buttons — top right ── */}
                    <div className="absolute top-2.5 right-2.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-150 translate-y-1 group-hover:translate-y-0">
                        <HoverBtn title={t('profile.settings')} onClick={e => { e.stopPropagation(); onSettings(); }}>
                            <Settings size={13} />
                        </HoverBtn>
                        <HoverBtn title={t('profile.mods')} onClick={e => { e.stopPropagation(); onMods(); }}>
                            <Package size={13} />
                        </HoverBtn>
                        <HoverBtn title={t('profile.delete')} danger onClick={e => { e.stopPropagation(); setDeleteCountdown(5); setIsDeleteMode(true); }}>
                            <Trash2 size={13} />
                        </HoverBtn>
                    </div>
                </div>
            </div>

            {/* ── Card Body ── */}
            <div className="flex flex-col gap-3 px-4 pb-4 pt-2.5" style={{ backgroundColor: 'var(--surface, #111113)' }}>

                {/* Name + loader badge */}
                <div className="flex items-start justify-between gap-2">
                    <h3
                        className="text-sm font-bold leading-tight truncate text-white/90"
                        title={profile.name}
                    >
                        {profile.name}
                    </h3>
                    <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 uppercase mt-0.5"
                        style={{ backgroundColor: loaderMeta.badge, color: loaderMeta.badgeText, letterSpacing: '0.06em' }}
                    >
                        {loaderMeta.label}
                    </span>
                </div>

                <span className="text-[11px] -mt-1.5" style={{ color: 'rgba(255,255,255,0.35)', fontVariantNumeric: 'tabular-nums' }}>
                    {profile.version}
                </span>

                {/* Launch */}
                <motion.button
                    onClick={handleLaunch}
                    disabled={isInstalling}
                    whileTap={isInstalling ? {} : { scale: 0.97 }}
                    transition={SPRING}
                    style={{ willChange: 'transform' }}
                    className={clsx(
                        'w-full py-2 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors',
                        isRunning    ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25 ring-1 ring-red-500/25'   :
                        isInstalling ? 'bg-amber-500/10 text-amber-400 cursor-wait ring-1 ring-amber-500/20' :
                                       'bg-white/10 text-white hover:bg-white/[0.16] ring-1 ring-white/10'
                    )}
                >
                    {isRunning ? (
                        <><RotateCcw size={13} /> {t('profile.stop')}</>
                    ) : isInstalling ? (
                        <><Loader size={13} className="animate-spin" /> {t('profile.installing')}</>
                    ) : (
                        <><Play size={13} fill="currentColor" /> {t('profile.launch')}</>
                    )}
                </motion.button>

                {/* Status / error — fixed height so card never looks cut off */}
                <div className="h-4 flex items-center justify-center">
                    <AnimatePresence mode="wait">
                        {launchError ? (
                            <motion.p key="err"
                                initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                transition={{ duration: 0.18 }}
                                className="text-[10px] text-center text-red-400 truncate font-mono w-full px-2">
                                {launchError}
                            </motion.p>
                        ) : status?.message ? (
                            <motion.p key="msg"
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className="text-[10px] text-center truncate font-mono w-full px-2"
                                style={{ color: 'rgba(255,255,255,0.3)' }}>
                                {status.message}
                            </motion.p>
                        ) : null}
                    </AnimatePresence>
                </div>
            </div>

            {/* ── Delete overlay ── */}
            <AnimatePresence>
                {isDeleteMode && (
                    <motion.div
                        key="del"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-2xl px-5 py-6"
                        style={{ backgroundColor: 'rgba(9,9,11,0.95)', backdropFilter: 'blur(10px)' }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="bg-red-500/15 p-3 rounded-2xl mb-3 text-red-400 border border-red-500/20">
                            <AlertTriangle size={18} />
                        </div>
                        <h4 className="font-bold text-white mb-1 text-sm">{t('profile.deleteConfirm')}</h4>
                        <p className="text-[11px] mb-4 text-center" style={{ color: 'rgba(255,255,255,0.35)' }}>
                            {t('profile.deleteConfirmDesc')}
                        </p>

                        {/* Countdown ring */}
                        <div className="relative w-12 h-12 mb-4">
                            <svg className="w-full h-full -rotate-90" viewBox="0 0 48 48">
                                <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="3" />
                                <circle
                                    cx="24" cy="24" r="20" fill="none"
                                    stroke={deleteCountdown === 0 ? '#ef4444' : '#f97316'}
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                    strokeDasharray={`${2 * Math.PI * 20}`}
                                    strokeDashoffset={`${2 * Math.PI * 20 * (1 - deleteCountdown / 5)}`}
                                    style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
                                />
                            </svg>
                            <span className="absolute inset-0 flex items-center justify-center font-bold text-sm"
                                style={{ color: deleteCountdown === 0 ? '#ef4444' : 'rgba(255,255,255,0.7)' }}>
                                {deleteCountdown}
                            </span>
                        </div>

                        <div className="flex gap-2 w-full">
                            <button
                                onClick={e => { e.stopPropagation(); setIsDeleteMode(false); setDeleteCountdown(5); }}
                                className="flex-1 py-2 rounded-xl text-xs font-medium text-white/60 hover:text-white transition-colors"
                                style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
                            >
                                {t('profile.cancel')}
                            </button>
                            <button
                                onClick={e => { e.stopPropagation(); onDelete(); setIsDeleteMode(false); }}
                                disabled={deleteCountdown > 0}
                                className="flex-1 py-2 rounded-xl text-xs font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                style={{ backgroundColor: deleteCountdown === 0 ? '#ef4444' : 'rgba(239,68,68,0.3)' }}
                            >
                                {deleteCountdown > 0 ? `${deleteCountdown}s…` : t('profile.delete')}
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

function HoverBtn({ children, title, onClick, danger }: {
    children: React.ReactNode;
    title:    string;
    onClick:  (e: React.MouseEvent) => void;
    danger?:  boolean;
}) {
    return (
        <button
            type="button"
            title={title}
            onClick={onClick}
            className={clsx(
                'p-1.5 rounded-lg transition-all backdrop-blur-sm',
                danger
                    ? 'bg-black/50 text-red-400 hover:bg-red-500/30 hover:text-red-300'
                    : 'bg-black/50 text-white/60 hover:bg-white/20 hover:text-white'
            )}
        >
            {children}
        </button>
    );
}
