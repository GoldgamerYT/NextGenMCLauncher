import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CustomSlider } from './CustomSlider';
import {
    Settings, Cpu, LayoutGrid, Zap, User, Layers, Code,
    FolderOpen, Trash2, Save, Terminal, ExternalLink,
    ChevronRight, RefreshCw, Loader, AlertTriangle, Check, Copy,
    Download, Shield, Coffee, X, Gamepad2,
} from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import { api, launcherApi, LauncherSettings } from '../api';
import { useTranslation, Locale } from '../i18n';
import { useTheme, Theme } from '../theme';

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface ApiConfig {
    defaultRamMb:    number;
    minRamMb:        number;
    gridScale:       number;
    defaultJavaPath: string;
    defaultGameDir:  string;
    jvmArgs:         string;
    windowWidth:     number;
    windowHeight:    number;
    fullscreen:      boolean;
    autoStartLast:   boolean;
    microsoftClientId: string;
    curseForgeApiKey:  string;
}

const DEFAULT_API_CONFIG: ApiConfig = {
    defaultRamMb:    4096,
    minRamMb:        512,
    gridScale:       1.0,
    defaultJavaPath: '',
    defaultGameDir:  '',
    jvmArgs:         '',
    windowWidth:     854,
    windowHeight:    480,
    fullscreen:      false,
    autoStartLast:   false,
    microsoftClientId: '',
    curseForgeApiKey:  '',
};

const DEFAULT_LAUNCHER_SETTINGS: LauncherSettings = {
    autostart:           false,
    minimizeAfterLaunch: false,
    sleepModeOnMinimize: false,
    closeAfterLaunch:    false,
    language:            'en',
    theme:               'dark',
    animations:          true,
    discordRpc:          false,
    autoSaveLogs:        true,
    autoDeleteLogsDays:  30,
    debugMode:           false,
    logLevel:            'info',
    defaultInstance:     '',
};

// ─── CATEGORIES ───────────────────────────────────────────────────────────────

const CATEGORY_IDS = ['general', 'minecraft', 'performance', 'accounts', 'instances', 'gametweaks', 'developer'] as const;
type CategoryId = typeof CATEGORY_IDS[number];

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export function GlobalSettings() {
    const { t } = useTranslation();
    const { theme, setTheme } = useTheme();

    const [activeCategory, setActiveCategory] = useState<CategoryId>('general');
    const [ls, setLs]         = useState<LauncherSettings>(DEFAULT_LAUNCHER_SETTINGS);
    const [cfg, setCfg]       = useState<ApiConfig>(DEFAULT_API_CONFIG);
    const [totalMem, setTotalMem] = useState(8192);
    const [profiles, setProfiles] = useState<string[]>([]);
    const [account, setAccount]   = useState<{ username: string; uuid: string; type: string; active: boolean } | null>(null);
    const [loading, setLoading]   = useState(true);
    const [saving, setSaving]     = useState(false);
    const [savedAt, setSavedAt]   = useState<number | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);

    // Scroll-to-top when switching category — fixes layout jump
    const contentRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (contentRef.current) contentRef.current.scrollTop = 0;
    }, [activeCategory]);

    useEffect(() => {
        const load = async () => {
            try {
                const [launcherSettings, apiConfig, mem, profileList, acc] = await Promise.all([
                    launcherApi.getSettings().catch(() => DEFAULT_LAUNCHER_SETTINGS),
                    api.getConfig().catch(() => ({})),
                    api.getSystemMemory().catch(() => 8192 * 1024 * 1024),
                    api.getProfiles().catch(() => []),
                    api.getAccount().catch(() => null),
                ]);
                setLs({ ...DEFAULT_LAUNCHER_SETTINGS, ...launcherSettings });
                setCfg({ ...DEFAULT_API_CONFIG, ...apiConfig });
                setTotalMem(Math.floor(mem / 1024 / 1024));
                setProfiles(profileList.map((p: any) => p.name));
                setAccount(acc ? { ...acc, active: true } : null);
            } catch (e) {
                console.error('Failed to load settings', e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        setSaveError(null);
        try {
            const [lsResult, cfgResult] = await Promise.allSettled([
                launcherApi.saveSettings(ls),
                api.updateConfig(cfg),
            ]);
            const errors: string[] = [];
            if (lsResult.status === 'rejected') errors.push('Launcher: ' + (lsResult.reason?.message ?? 'error'));
            if (cfgResult.status === 'rejected') errors.push('Config: ' + (cfgResult.reason?.message ?? 'error'));
            if (errors.length > 0) {
                setSaveError(errors.join(' | '));
            } else {
                // Reload to verify — only update state if non-empty responses are returned.
                // An empty/failed reload should NOT reset state to defaults.
                try {
                    const [reloadedLs, reloadedCfg] = await Promise.all([
                        launcherApi.getSettings(),
                        api.getConfig(),
                    ]);
                    if (reloadedLs && Object.keys(reloadedLs).length > 0)
                        setLs(prev => ({ ...prev, ...reloadedLs }));
                    if (reloadedCfg && Object.keys(reloadedCfg).length > 0)
                        setCfg(prev => ({ ...prev, ...reloadedCfg }));
                } catch { /* best-effort verify — saved values stay in local state */ }
                setSavedAt(Date.now());
                setTimeout(() => setSavedAt(null), 3000);
            }
        } catch (e: any) {
            setSaveError(e?.message ?? 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const setL = useCallback(<K extends keyof LauncherSettings>(key: K, val: LauncherSettings[K]) => {
        setLs(prev => ({ ...prev, [key]: val }));
    }, []);

    const setC = useCallback(<K extends keyof ApiConfig>(key: K, val: ApiConfig[K]) => {
        setCfg(prev => ({ ...prev, [key]: val }));
    }, []);

    const CATEGORIES: { id: CategoryId; labelKey: string; icon: React.ElementType }[] = [
        { id: 'general',     labelKey: 'settings.general',     icon: Settings  },
        { id: 'minecraft',   labelKey: 'settings.minecraft',   icon: Cpu       },
        { id: 'performance', labelKey: 'settings.performance', icon: Zap       },
        { id: 'accounts',    labelKey: 'settings.accounts',    icon: User      },
        { id: 'instances',   labelKey: 'settings.instances',   icon: Layers    },
        { id: 'gametweaks',  labelKey: 'settings.gametweaks',  icon: Gamepad2  },
        { id: 'developer',   labelKey: 'settings.developer',   icon: Code      },
    ];

    if (loading) {
        return (
            <div className="flex h-full min-h-[60vh] items-center justify-center gap-3" style={{ color: 'var(--text-muted)' }}>
                <Settings className="animate-spin" size={20} /> {t('common.loading')}
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto py-8 px-4">
            {/* Header */}
            <div className="flex items-end justify-between mb-8">
                <div>
                    <h2 className="text-3xl font-bold flex items-center gap-3" style={{ color: 'var(--text)' }}>
                        <Settings size={28} style={{ color: 'var(--text-muted)' }} /> {t('settings.title')}
                    </h2>
                    <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>{t('settings.subtitle')}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className={clsx(
                            'px-6 py-2.5 font-bold rounded-xl active:scale-95 transition-all flex items-center gap-2 shadow-lg disabled:opacity-50',
                            saveError
                                ? 'bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30'
                                : 'bg-white text-black hover:bg-zinc-200'
                        )}
                    >
                        {saving ? (
                            <><Loader size={16} className="animate-spin" /> {t('settings.saving')}</>
                        ) : saveError ? (
                            <><AlertTriangle size={16} /> {t('settings.retrySave')}</>
                        ) : savedAt ? (
                            <><Check size={16} className="text-green-600" /> {t('settings.saved')}</>
                        ) : (
                            <><Save size={16} /> {t('settings.saveChanges')}</>
                        )}
                    </button>
                    {saveError && <div className="text-xs text-red-400 max-w-xs text-right">{saveError}</div>}
                </div>
            </div>

            <div className="flex gap-6">
                {/* ── Sidebar nav — NOTE: relative + overflow-hidden on each button to contain the green indicator ── */}
                <nav className="w-48 flex-shrink-0 flex flex-col gap-0.5 sticky top-0 self-start">
                    {CATEGORIES.map(({ id, labelKey, icon: Icon }) => {
                        const active = activeCategory === id;
                        return (
                            <button
                                key={id}
                                onClick={() => setActiveCategory(id)}
                                className={clsx(
                                    'relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left w-full overflow-hidden',
                                )}
                                style={{
                                    backgroundColor: active ? 'rgba(255,255,255,0.08)' : undefined,
                                    color: active ? 'var(--text)' : 'var(--text-muted)',
                                }}
                                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.04)'; }}
                                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
                            >
                                {/* Green indicator — INSIDE the button (relative), left edge */}
                                {active && (
                                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-green-500 rounded-r shadow-[0_0_6px_1px_rgba(34,197,94,0.6)]" />
                                )}
                                <Icon size={15} className={active ? 'text-green-400' : ''} />
                                <span>{t(labelKey)}</span>
                                {active && <ChevronRight size={13} className="ml-auto opacity-60" />}
                            </button>
                        );
                    })}
                </nav>

                {/* ── Content — outer App container handles scroll ── */}
                <div ref={contentRef} className="flex-1 min-w-0 space-y-4 pb-16">
                    {activeCategory === 'general'     && <CategoryGeneral     ls={ls} setL={setL} cfg={cfg} setC={setC} theme={theme} setTheme={setTheme} />}
                    {activeCategory === 'minecraft'   && <CategoryMinecraft   cfg={cfg} setC={setC} totalMem={totalMem} />}
                    {activeCategory === 'performance' && <CategoryPerformance ls={ls} setL={setL} />}
                    {activeCategory === 'accounts'    && <CategoryAccounts    account={account} setAccount={setAccount} />}
                    {activeCategory === 'instances'   && <CategoryInstances   ls={ls} setL={setL} profiles={profiles} />}
                    {activeCategory === 'gametweaks'  && <CategoryGameTweaks />}
                    {activeCategory === 'developer'   && <CategoryDeveloper   ls={ls} setL={setL} cfg={cfg} setC={setC} />}
                </div>
            </div>
        </div>
    );
}

// ─── SECTION WRAPPER ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="rounded-2xl p-5 border backdrop-blur-sm" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
            <h3 className="text-[10px] font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--text-subtle)' }}>{title}</h3>
            <div className="space-y-4">{children}</div>
        </div>
    );
}

// ─── REUSABLE ROWS ────────────────────────────────────────────────────────────

function SliderRow({ label, value, min, max, step, display, onChange }: {
    label: string; value: number; min: number; max: number; step: number;
    display: (v: number) => string; onChange: (v: number) => void;
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
                <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{label}</span>
                <span className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>{display(value)}</span>
            </div>
            <input
                type="range"
                min={min} max={max} step={step}
                value={value}
                onChange={e => onChange(Number(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-green-500"
                style={{ backgroundColor: 'var(--surface2)' }}
            />
            <div className="flex justify-between text-[10px]" style={{ color: 'var(--text-subtle)' }}>
                <span>{display(min)}</span><span>{display(max)}</span>
            </div>
        </div>
    );
}

function ToggleRow({ label, description, value, onChange }: {
    label: string; description?: string; value: boolean; onChange: (v: boolean) => void;
}) {
    return (
        <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
                <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{label}</div>
                {description && <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{description}</div>}
            </div>
            <button
                type="button"
                onClick={() => onChange(!value)}
                className={clsx('relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200', value ? 'bg-green-500' : 'bg-zinc-700')}
            >
                <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200', value ? 'translate-x-5' : 'translate-x-0')} />
            </button>
        </div>
    );
}

function SelectRow({ label, description, value, onChange, options }: {
    label: string; description?: string; value: string;
    onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
    return (
        <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
                <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{label}</div>
                {description && <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{description}</div>}
            </div>
            <select
                value={value}
                onChange={e => onChange(e.target.value)}
                className="text-sm rounded-lg px-3 py-1.5 outline-none flex-shrink-0 border"
                style={{ backgroundColor: 'var(--surface2)', color: 'var(--text)', borderColor: 'var(--border)' }}
            >
                {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
        </div>
    );
}

function InputRow({ label, description, value, onChange, placeholder, type = 'text' }: {
    label: string; description?: string; value: string | number;
    onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
    return (
        <div>
            <div className="flex items-center justify-between mb-1.5">
                <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{label}</div>
                {description && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{description}</div>}
            </div>
            <input
                type={type}
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full text-sm rounded-lg px-3 py-2 outline-none border"
                style={{ backgroundColor: 'var(--surface2)', color: 'var(--text)', borderColor: 'var(--border)' }}
            />
        </div>
    );
}

function PathRow({ label, description, value, onChange, onBrowse }: {
    label: string; description?: string; value: string;
    onChange: (v: string) => void; onBrowse: () => void;
}) {
    const { t } = useTranslation();
    return (
        <div>
            <div className="text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>{label}</div>
            {description && <div className="text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>{description}</div>}
            <div className="flex gap-2">
                <input
                    type="text"
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    placeholder="Auto-detect"
                    className="flex-1 min-w-0 text-sm rounded-lg px-3 py-2 outline-none font-mono border"
                    style={{ backgroundColor: 'var(--surface2)', color: 'var(--text)', borderColor: 'var(--border)' }}
                />
                <button
                    type="button"
                    onClick={onBrowse}
                    className="px-3 py-2 rounded-lg text-sm flex items-center gap-1.5 flex-shrink-0 border transition-colors"
                    style={{ backgroundColor: 'var(--surface2)', color: 'var(--text-muted)', borderColor: 'var(--border)' }}
                >
                    <FolderOpen size={14} /> {t('settings.minecraft.browse')}
                </button>
            </div>
        </div>
    );
}

function ActionButton({ label, description, onClick, variant = 'default', icon, disabled }: {
    label: string; description?: string; onClick: () => void;
    variant?: 'default' | 'danger'; icon?: React.ReactNode; disabled?: boolean;
}) {
    return (
        <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
                <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{label}</div>
                {description && <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{description}</div>}
            </div>
            <button
                type="button"
                onClick={onClick}
                disabled={disabled}
                className={clsx(
                    'flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border disabled:opacity-50',
                    variant === 'danger'
                        ? 'bg-red-900/20 border-red-500/20 text-red-400 hover:bg-red-500/20'
                        : 'border-white/10 hover:bg-white/10'
                )}
                style={variant !== 'danger' ? { backgroundColor: 'var(--surface2)', color: 'var(--text-muted)' } : {}}
            >
                {icon}{label}
            </button>
        </div>
    );
}

function RamSlider({ label, description, value, min, max, step, onChange, color = 'blue' }: {
    label: string; description?: string; value: number; min: number; max: number;
    step: number; onChange: (v: number) => void; color?: 'blue' | 'green' | 'purple';
    /** @deprecated kept for call-site compat, no longer used */
    totalMem?: number;
}) {
    const gradients: Record<string, string> = {
        blue:   'from-blue-600 to-cyan-400',
        green:  'from-emerald-600 to-green-400',
        purple: 'from-purple-600 to-fuchsia-400',
    };
    return (
        <div>
            <div className="flex items-center justify-between mb-3">
                <div>
                    <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{label}</div>
                    {description && <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{description}</div>}
                </div>
                <span className="font-mono text-sm px-2 py-1 rounded" style={{ backgroundColor: 'var(--surface2)', color: 'var(--text-muted)' }}>{value} MB</span>
            </div>
            <CustomSlider
                min={min} max={max} step={step} value={value} onChange={onChange}
                fillClassName={gradients[color]}
            />
            <div className="flex justify-between text-[10px] font-mono mt-1" style={{ color: 'var(--text-subtle)' }}>
                <span>{min} MB</span><span>{Math.round(max / 1024)} GB max</span>
            </div>
        </div>
    );
}

// ─── CATEGORY: GENERAL ────────────────────────────────────────────────────────

function CategoryGeneral({ ls, setL, cfg, setC, theme, setTheme }: any) {
    const { t, locale, setLocale } = useTranslation();
    const [updateCheck, setUpdateCheck] = useState<'idle' | 'checking' | 'available' | 'latest' | 'error'>('idle');
    const [updateVer, setUpdateVer]     = useState('');

    const checkForUpdates = async () => {
        const ea = (window as any).electronAPI;
        if (!ea?.checkForUpdates) { setUpdateCheck('latest'); return; }
        setUpdateCheck('checking');
        const cleanup = () => ea.offUpdateStatus?.();
        ea.onUpdateStatus?.((d: any) => {
            if (d.status === 'available')     { setUpdateCheck('available'); setUpdateVer(d.version); cleanup(); }
            if (d.status === 'not-available') { setUpdateCheck('latest'); cleanup(); }
            if (d.status === 'error')         { setUpdateCheck('error'); cleanup(); }
        });
        try { await ea.checkForUpdates(); } catch { setUpdateCheck('error'); cleanup(); }
    };

    return (
        <>
            <Section title={t('settings.general.startup')}>
                <ToggleRow label={t('settings.general.launchAtStartup')} description={t('settings.general.launchAtStartupDesc')} value={ls.autostart} onChange={v => setL('autostart', v)} />
                <ToggleRow label={t('settings.general.minimizeAfterLaunch')} description={t('settings.general.minimizeAfterLaunchDesc')} value={ls.minimizeAfterLaunch}
                    onChange={v => {
                        setL('minimizeAfterLaunch', v);
                        if (v) setL('closeAfterLaunch', false);
                        if (!v) setL('sleepModeOnMinimize', false);
                    }} />

                {/* Sleep mode — sub-option, animated in/out */}
                <AnimatePresence initial={false}>
                {ls.minimizeAfterLaunch && (
                    <motion.div
                        key="sleep-mode"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1, transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] } }}
                        exit={{    height: 0, opacity: 0, transition: { duration: 0.18, ease: [0.4, 0, 1, 1] } }}
                        style={{ overflow: 'hidden' }}
                    >
                    <div className="ml-4 pl-4 border-l-2" style={{ borderColor: 'var(--border)' }}>
                        <ToggleRow
                            label={t('settings.general.sleepMode')}
                            description={t('settings.general.sleepModeDesc')}
                            value={ls.sleepModeOnMinimize ?? false}
                            onChange={v => setL('sleepModeOnMinimize', v)}
                        />
                    </div>
                    </motion.div>
                )}
                </AnimatePresence>

                <ToggleRow label={t('settings.general.closeAfterLaunch')} description={t('settings.general.closeAfterLaunchDesc')} value={ls.closeAfterLaunch}
                    onChange={v => { setL('closeAfterLaunch', v); if (v) setL('minimizeAfterLaunch', false); }} />
            </Section>

            <Section title={t('settings.general.appearance')}>
                <SelectRow label={t('settings.general.language')} value={locale}
                    onChange={v => { setLocale(v as Locale); setL('language', v); }}
                    options={[
                        { value: 'en', label: 'English' },
                        { value: 'de', label: 'Deutsch' },
                        { value: 'fr', label: 'Français' },
                        { value: 'it', label: 'Italiano' },
                    ]}
                />
                <SelectRow label={t('settings.general.theme')} description={t('settings.general.themeDesc')} value={theme}
                    onChange={v => { setTheme(v as Theme); setL('theme', v); }}
                    options={[
                        { value: 'dark',   label: t('settings.general.themeDark')   },
                        { value: 'light',  label: t('settings.general.themeLight')  },
                        { value: 'system', label: t('settings.general.themeSystem') },
                    ]}
                />
                <ToggleRow label={t('settings.general.animations')} description={t('settings.general.animationsDesc')} value={ls.animations} onChange={v => setL('animations', v)} />
            </Section>

            <Section title={t('settings.general.interfaceScale')}>
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{t('settings.general.cardSize')}</div>
                        <span className="font-mono text-sm px-2 py-1 rounded" style={{ backgroundColor: 'var(--surface2)', color: 'var(--text-muted)' }}>{Math.round(cfg.gridScale * 100)}%</span>
                    </div>
                    <div className="relative h-10 flex items-center">
                        <div className="absolute w-full h-2 rounded-full border" style={{ backgroundColor: 'rgba(0,0,0,0.3)', borderColor: 'var(--border)' }} />
                        <div className="absolute h-2 rounded-full bg-gradient-to-r from-purple-600 to-fuchsia-400 transition-all duration-75" style={{ width: `${((cfg.gridScale - 0.7) / 0.6) * 100}%` }} />
                        <div className="absolute h-5 w-5 rounded-full border-2 shadow-lg z-10 pointer-events-none" style={{ left: `calc(${((cfg.gridScale - 0.7) / 0.6) * 100}% - 10px)`, backgroundColor: 'var(--surface2)', borderColor: 'var(--border)' }} />
                        <input type="range" min={0.7} max={1.3} step={0.1} value={cfg.gridScale} onChange={e => setC('gridScale', parseFloat(e.target.value))} className="absolute inset-0 w-full opacity-0 cursor-pointer z-20" />
                    </div>
                    <div className="flex justify-between text-[10px] font-mono mt-1" style={{ color: 'var(--text-subtle)' }}>
                        <span>70%</span><span>100%</span><span>130%</span>
                    </div>
                </div>
            </Section>

            <Section title="Updates">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>Atlas Craft {(window as any).__ATLAS_VERSION__ ?? ''}</div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            {updateCheck === 'idle'      && 'Klicke um nach Updates zu suchen'}
                            {updateCheck === 'checking'  && 'Suche nach Updates…'}
                            {updateCheck === 'latest'    && 'Du verwendest die neueste Version'}
                            {updateCheck === 'available' && <span className="text-green-400">Update verfügbar: v{updateVer}</span>}
                            {updateCheck === 'error'     && <span className="text-red-400">Fehler beim Prüfen auf Updates</span>}
                        </div>
                    </div>
                    <button
                        onClick={checkForUpdates}
                        disabled={updateCheck === 'checking'}
                        className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                        style={{ backgroundColor: 'var(--surface2)', color: 'var(--text)' }}
                    >
                        {updateCheck === 'checking' ? 'Prüfe…' : 'Nach Updates suchen'}
                    </button>
                </div>
            </Section>
        </>
    );
}

// ─── CATEGORY: MINECRAFT ──────────────────────────────────────────────────────

function CategoryMinecraft({ cfg, setC, totalMem }: any) {
    const { t } = useTranslation();
    const [javaStatus, setJavaStatus]   = useState<{ ok: boolean; version?: string; error?: string } | null>(null);
    const [checkingJava, setCheckingJava] = useState(false);
    const [installingJava, setInstallingJava] = useState(false);
    const [javaInstallResult, setJavaInstallResult] = useState<{ ok: boolean; javaPath?: string; error?: string } | null>(null);

    const handleCheckJava = async () => {
        setCheckingJava(true);
        setJavaStatus(null);
        try {
            const result = await api.checkJava(cfg.defaultJavaPath || undefined);
            setJavaStatus(result);
        } catch (e: any) {
            setJavaStatus({ ok: false, error: e?.message ?? 'Check failed' });
        } finally {
            setCheckingJava(false);
        }
    };

    const handleInstallJava = async () => {
        setInstallingJava(true);
        setJavaInstallResult(null);
        try {
            const result = await api.installJava(21); // Java 21 — supports all current MC versions
            setJavaInstallResult(result);
            if (result.ok && result.javaPath) {
                setC('defaultJavaPath', result.javaPath);
            }
        } finally {
            setInstallingJava(false);
        }
    };

    return (
        <>
            <Section title={t('settings.minecraft.memory')}>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border text-[11px]"
                    style={{ backgroundColor: 'var(--surface2)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                    These are global defaults. Individual profiles can override them in their own settings.
                </div>
                <RamSlider label={t('settings.minecraft.maxRam')} description={t('settings.minecraft.maxRamDesc')}
                    value={cfg.defaultRamMb}
                    min={512}
                    max={Math.max(totalMem, cfg.defaultRamMb)}
                    step={128}
                    onChange={v => setC('defaultRamMb', v)} color="blue" />
                <RamSlider label={t('settings.minecraft.minRam')} description={t('settings.minecraft.minRamDesc')}
                    value={cfg.minRamMb}
                    min={256}
                    max={Math.max(cfg.defaultRamMb, cfg.minRamMb)}
                    step={128}
                    onChange={v => setC('minRamMb', v)} color="green" />
            </Section>

            <Section title={t('settings.minecraft.java')}>
                <PathRow
                    label={t('settings.minecraft.javaPath')} description={t('settings.minecraft.javaPathDesc')}
                    value={cfg.defaultJavaPath} onChange={v => setC('defaultJavaPath', v)}
                    onBrowse={async () => { const p = await launcherApi.selectJava().catch(() => null); if (p) setC('defaultJavaPath', p); }}
                />
                <InputRow label={t('settings.minecraft.jvmArgs')} description={t('settings.minecraft.jvmArgsDesc')}
                    value={cfg.jvmArgs} onChange={v => setC('jvmArgs', v)} placeholder="-XX:+UseG1GC -XX:MaxGCPauseMillis=50" />

                {/* Check Java */}
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{t('settings.minecraft.verifyJava')}</div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{t('settings.minecraft.verifyJavaDesc')}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <button
                            type="button"
                            onClick={handleCheckJava}
                            disabled={checkingJava}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border disabled:opacity-50"
                            style={{ backgroundColor: 'var(--surface2)', color: 'var(--text-muted)', borderColor: 'var(--border)' }}
                        >
                            {checkingJava ? <><Loader size={13} className="animate-spin" /> {t('settings.minecraft.checking')}</> : <><Check size={13} /> {t('settings.minecraft.checkJava')}</>}
                        </button>
                        {javaStatus && (
                            <div className={clsx('text-[11px] font-mono max-w-xs text-right', javaStatus.ok ? 'text-green-400' : 'text-red-400')}>
                                {javaStatus.ok ? javaStatus.version : (javaStatus.error ?? 'Not found')}
                            </div>
                        )}
                    </div>
                </div>

                {/* Auto-install Java */}
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{t('settings.minecraft.installJava')}</div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Downloads Eclipse Temurin JDK 17 to launcher folder</div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <button
                            type="button"
                            onClick={handleInstallJava}
                            disabled={installingJava}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border disabled:opacity-50 bg-green-500/10 border-green-500/20 text-green-400 hover:bg-green-500/20"
                        >
                            {installingJava
                                ? <><Loader size={13} className="animate-spin" /> {t('settings.minecraft.installingJava')}</>
                                : <><Download size={13} /> {t('settings.minecraft.installJava')}</>
                            }
                        </button>
                        {javaInstallResult && (
                            <div className={clsx('text-[11px] font-mono max-w-xs text-right', javaInstallResult.ok ? 'text-green-400' : 'text-red-400')}>
                                {javaInstallResult.ok ? `Installed → ${javaInstallResult.javaPath}` : (javaInstallResult.error ?? 'Failed')}
                            </div>
                        )}
                    </div>
                </div>
            </Section>

            <Section title={t('settings.minecraft.defaults')}>
                <PathRow
                    label={t('settings.minecraft.defaultGameDir')} description={t('settings.minecraft.defaultGameDirDesc')}
                    value={cfg.defaultGameDir} onChange={v => setC('defaultGameDir', v)}
                    onBrowse={async () => { const p = await launcherApi.selectDirectory().catch(() => null); if (p) setC('defaultGameDir', p); }}
                />
                <ToggleRow label={t('settings.minecraft.autoStartLast')} description={t('settings.minecraft.autoStartLastDesc')} value={cfg.autoStartLast} onChange={v => setC('autoStartLast', v)} />
            </Section>

            <Section title={t('settings.minecraft.window')}>
                <div className="grid grid-cols-2 gap-3">
                    <InputRow label={t('settings.minecraft.windowWidth')} type="number" value={cfg.windowWidth} onChange={v => setC('windowWidth', parseInt(v) || 854)} placeholder="854" />
                    <InputRow label={t('settings.minecraft.windowHeight')} type="number" value={cfg.windowHeight} onChange={v => setC('windowHeight', parseInt(v) || 480)} placeholder="480" />
                </div>
                <ToggleRow label={t('settings.minecraft.fullscreen')} value={cfg.fullscreen} onChange={v => setC('fullscreen', v)} />
            </Section>
        </>
    );
}

// ─── CATEGORY: PERFORMANCE ────────────────────────────────────────────────────

function CategoryPerformance({ ls, setL }: any) {
    const { t } = useTranslation();
    const [clearing, setClearing]   = useState(false);
    const [clearDone, setClearDone] = useState(false);
    const [clearError, setClearError] = useState<string | null>(null);
    const [tempClearing, setTempClearing] = useState(false);
    const [tempDone, setTempDone]   = useState(false);
    const [tempError, setTempError] = useState<string | null>(null);

    const handleClearCache = async () => {
        setClearing(true); setClearError(null);
        try {
            const res = await fetch('http://localhost:35555/api/cache/clear', { method: 'POST' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setClearDone(true); setTimeout(() => setClearDone(false), 3000);
        } catch (e: any) {
            setClearError(e?.message ?? 'Failed'); setTimeout(() => setClearError(null), 4000);
        } finally { setClearing(false); }
    };

    const handleClearTemp = async () => {
        if (!confirm('Delete all temporary files? This cannot be undone.')) return;
        setTempClearing(true); setTempError(null);
        try {
            const res = await fetch('http://localhost:35555/api/temp/clear', { method: 'POST' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setTempDone(true); setTimeout(() => setTempDone(false), 3000);
        } catch (e: any) {
            setTempError(e?.message ?? 'Failed'); setTimeout(() => setTempError(null), 4000);
        } finally { setTempClearing(false); }
    };

    return (
        <>
            <Section title={t('settings.performance.integration')}>
                <ToggleRow label={t('settings.performance.discordRpc')} description={t('settings.performance.discordRpcDesc')} value={ls.discordRpc} onChange={v => setL('discordRpc', v)} />
            </Section>

            <Section title={t('settings.performance.logging')}>
                <ToggleRow label={t('settings.performance.autoSaveLogs')} description={t('settings.performance.autoSaveLogsDesc')} value={ls.autoSaveLogs} onChange={v => setL('autoSaveLogs', v)} />
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{t('settings.performance.deleteLogsAfter')}</div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{t('settings.performance.deleteLogsNever')}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <input type="number" min={0} max={365} value={ls.autoDeleteLogsDays}
                            onChange={e => setL('autoDeleteLogsDays', parseInt(e.target.value) || 0)}
                            className="w-16 text-sm rounded-lg px-2 py-1.5 outline-none text-center border"
                            style={{ backgroundColor: 'var(--surface2)', color: 'var(--text)', borderColor: 'var(--border)' }} />
                        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('settings.performance.days')}</span>
                    </div>
                </div>
                <ActionButton label={t('settings.performance.openLogsFolder')} description={t('settings.performance.openLogsFolderDesc')}
                    icon={<FolderOpen size={14} className="mr-1" />}
                    onClick={() => launcherApi.openLogsDir().catch(console.error)} />
            </Section>

            <Section title={t('settings.performance.storage')}>
                <div className="space-y-1">
                    <ActionButton
                        label={clearDone ? t('settings.performance.cacheCleared') : clearing ? t('common.loading') : t('settings.performance.clearCache')}
                        description={t('settings.performance.clearCacheDesc')}
                        icon={clearDone ? <Check size={14} className="mr-1" /> : clearing ? <Loader size={14} className="animate-spin mr-1" /> : <Trash2 size={14} className="mr-1" />}
                        onClick={handleClearCache} disabled={clearing}
                    />
                    {clearError && <div className="text-xs text-red-400 text-right">{clearError}</div>}
                </div>
                <div className="space-y-1">
                    <ActionButton
                        label={tempDone ? t('settings.performance.tempCleared') : tempClearing ? t('common.loading') : t('settings.performance.clearTemp')}
                        description={t('settings.performance.clearTempDesc')} variant="danger"
                        icon={tempDone ? <Check size={14} className="mr-1" /> : tempClearing ? <Loader size={14} className="animate-spin mr-1" /> : <Trash2 size={14} className="mr-1" />}
                        onClick={handleClearTemp} disabled={tempClearing}
                    />
                    {tempError && <div className="text-xs text-red-400 text-right">{tempError}</div>}
                </div>
            </Section>
        </>
    );
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * Convert any value (string, Axios error, Javalin error object, …) to a
 * displayable string.  Prevents "Objects are not valid as a React child" crashes.
 *
 * Javalin returns structured errors like:
 *   { title: "...", status: 500, type: "...", details: { ... } }
 */
function extractErrorString(value: unknown): string {
    if (value == null) return 'Unknown error';
    if (typeof value === 'string') return value || 'Unknown error';
    if (typeof value !== 'object') return String(value);

    // Axios error — check response.data first
    const axiosData = (value as any)?.response?.data;
    if (axiosData) {
        const s = extractErrorString(axiosData);
        if (s && s !== 'Unknown error') return s;
    }

    const obj = value as Record<string, unknown>;
    if (typeof obj.details  === 'string' && obj.details)  return obj.details;
    if (typeof obj.message  === 'string' && obj.message)  return obj.message;
    if (typeof obj.error    === 'string' && obj.error)    return obj.error;
    if (typeof obj.title    === 'string' && obj.title) {
        if (typeof obj.status === 'number') return `${obj.title} (HTTP ${obj.status})`;
        return obj.title;
    }
    if (typeof (value as any).message === 'string') return (value as any).message;

    try { return JSON.stringify(value); } catch { return 'Unknown error'; }
}

// ─── CATEGORY: ACCOUNTS ───────────────────────────────────────────────────────

type AccountEntry = { username: string; uuid: string; type: string; active: boolean };

function CategoryAccounts({ account, setAccount }: {
    account: AccountEntry | null;
    setAccount: (a: AccountEntry | null) => void;
}) {
    const { t } = useTranslation();

    // All loaded accounts (for multi-account list)
    const [accounts, setAccounts] = useState<AccountEntry[]>([]);
    const [loadingAccounts, setLoadingAccounts] = useState(false);

    // Device-code flow state
    const [loginFlow, setLoginFlow]     = useState<{ userCode: string; verificationUri: string; expiresIn: number } | null>(null);
    const [loginError, setLoginError]   = useState<string | null>(null);
    const [loginDone, setLoginDone]     = useState(false);

    // Use refs to avoid stale closures in intervals
    const pollRef         = React.useRef<ReturnType<typeof setInterval> | null>(null);
    const expiryRef       = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const loginActiveRef  = React.useRef(false);

    const loadAccounts = React.useCallback(async () => {
        setLoadingAccounts(true);
        try {
            const list = await api.getAccounts();
            setAccounts(list);
            const active = list.find(a => a.active) ?? null;
            setAccount(active);
        } catch (e) {
            console.error('[Accounts] Failed to load accounts:', e);
        } finally {
            setLoadingAccounts(false);
        }
    }, [setAccount]);

    React.useEffect(() => {
        loadAccounts();
    }, [loadAccounts]);

    const stopPolling = React.useCallback(() => {
        loginActiveRef.current = false;
        if (pollRef.current)   { clearInterval(pollRef.current);   pollRef.current   = null; }
        if (expiryRef.current) { clearTimeout(expiryRef.current);  expiryRef.current = null; }
    }, []);

    React.useEffect(() => () => stopPolling(), [stopPolling]);

    const startLogin = async () => {
        setLoginError(null);
        setLoginDone(false);
        stopPolling();

        console.log('[Accounts] Starting Microsoft login flow via POST /api/auth/microsoft/start');
        try {
            const flow = await api.startMicrosoftLogin();
            console.log('[Accounts] Device code received — userCode:', flow.userCode, 'uri:', flow.verificationUri);
            setLoginFlow(flow);
            loginActiveRef.current = true;

            // Auto-open browser with the verification URL
            const ea = (window as any).electronAPI;
            if (ea?.openExternal) {
                ea.openExternal(flow.verificationUri);
            } else {
                window.open(flow.verificationUri, '_blank');
            }
            // Auto-copy the user code to clipboard
            try { await navigator.clipboard.writeText(flow.userCode); } catch (_) {}

            // Poll every 5 s
            pollRef.current = setInterval(async () => {
                if (!loginActiveRef.current) return;
                try {
                    const result = await api.pollMicrosoftLogin();
                    console.log('[Accounts] Poll result:', result.done, result.account ? 'account received' : 'pending');
                    if (result.done) {
                        stopPolling();
                        if (result.account) {
                            setLoginDone(true);
                            setLoginFlow(null);
                            await loadAccounts();   // refresh full list
                            setTimeout(() => setLoginDone(false), 3000);
                        } else {
                            const errVal = (result as any).error;
                            setLoginError(typeof errVal === 'string' ? errVal : 'Login failed');
                            setLoginFlow(null);
                        }
                    }
                } catch (e) {
                    console.warn('[Accounts] Poll error (will retry):', e);
                }
            }, 5000);

            // Auto-cancel when device code expires
            expiryRef.current = setTimeout(() => {
                if (!loginActiveRef.current) return;
                stopPolling();
                setLoginFlow(null);
                setLoginError('Login timed out — please try again.');
            }, (flow.expiresIn || 900) * 1000);

        } catch (e: any) {
            const msg = extractErrorString(e);
            console.error('[Accounts] startMicrosoftLogin failed:', msg, 'status:', e?.response?.status);
            setLoginError(msg);
        }
    };

    const handleRemoveAccount = async (uuid: string) => {
        if (!confirm('Remove this account from the launcher?')) return;
        try {
            await api.removeAccount(uuid);
            console.log('[Accounts] Removed account:', uuid);
            await loadAccounts();
        } catch (e: any) {
            alert('Remove failed: ' + (e?.message ?? 'Unknown error'));
        }
    };

    const handleSwitchAccount = async (uuid: string) => {
        try {
            await api.setActiveAccount(uuid);
            console.log('[Accounts] Switched active account to:', uuid);
            await loadAccounts();
        } catch (e: any) {
            alert('Switch failed: ' + (e?.message ?? 'Unknown error'));
        }
    };

    return (
        <Section title={t('accounts.currentAccount')}>
            {/* Account list */}
            {loadingAccounts ? (
                <div className="flex items-center gap-2 py-4" style={{ color: 'var(--text-muted)' }}>
                    <Loader size={14} className="animate-spin" /> {t('common.loading')}
                </div>
            ) : accounts.length === 0 && !loginFlow ? (
                <div className="flex flex-col items-center py-6 text-center gap-3">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center border" style={{ backgroundColor: 'var(--surface2)', borderColor: 'var(--border)' }}>
                        <User size={20} style={{ color: 'var(--text-subtle)' }} />
                    </div>
                    <div>
                        <div className="font-medium text-sm" style={{ color: 'var(--text-muted)' }}>{t('accounts.noAccount')}</div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--text-subtle)' }}>{t('accounts.noAccountDesc')}</div>
                    </div>
                </div>
            ) : (
                <div className="space-y-2">
                    {accounts.map(acc => (
                        <div
                            key={acc.uuid}
                            className={clsx(
                                'flex items-center gap-3 p-3 rounded-xl border transition-colors',
                                acc.active
                                    ? 'border-green-500/30 bg-green-500/5'
                                    : 'border-transparent hover:border-white/5'
                            )}
                            style={{ backgroundColor: acc.active ? undefined : 'var(--surface2)' }}
                        >
                            <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: 'var(--surface)' }}>
                                <img
                                    src={`https://mc-heads.net/avatar/${acc.uuid}/40`}
                                    alt={acc.username}
                                    className="w-10 h-10"
                                    onError={(e: any) => { e.target.style.display = 'none'; }}
                                />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>{acc.username}</div>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-[10px] font-mono" style={{ color: 'var(--text-subtle)' }}>
                                        {acc.uuid.substring(0, 8)}…
                                    </span>
                                    {acc.active && (
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                                            ACTIVE
                                        </span>
                                    )}
                                    <span className="text-[10px] font-mono uppercase" style={{ color: 'var(--text-subtle)' }}>
                                        {acc.type}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                                {!acc.active && (
                                    <button
                                        onClick={() => handleSwitchAccount(acc.uuid)}
                                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
                                        style={{ backgroundColor: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                                    >
                                        {t('accounts.use')}
                                    </button>
                                )}
                                <button
                                    onClick={() => handleRemoveAccount(acc.uuid)}
                                    className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors"
                                    title="Remove account"
                                >
                                    <Trash2 size={13} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Login flow card — compact, no scrolling needed */}
            {loginFlow ? (
                <div className="mt-3 p-3 rounded-xl border space-y-2.5" style={{ backgroundColor: 'var(--surface2)', borderColor: 'var(--border)' }}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                            <Loader size={12} className="animate-spin flex-shrink-0" />
                            <span>{t('accounts.loginWaiting')}</span>
                        </div>
                        <button
                            onClick={() => { stopPolling(); setLoginFlow(null); }}
                            className="p-0.5 rounded opacity-50 hover:opacity-100 transition-opacity"
                            style={{ color: 'var(--text-muted)' }}
                            title={t('common.cancel')}
                        >
                            <X size={13} />
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        <span className="text-xl font-bold font-mono tracking-[0.25em] select-all" style={{ color: 'var(--text)' }}>
                            {loginFlow.userCode}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-green-400">
                            <Check size={11} /> {t('accounts.copiedToClipboard')}
                        </span>
                        <button
                            onClick={() => navigator.clipboard.writeText(loginFlow.userCode)}
                            className="p-1 rounded transition-colors ml-auto"
                            style={{ color: 'var(--text-subtle)' }}
                            title={t('accounts.copyAgain')}
                        >
                            <Copy size={12} />
                        </button>
                    </div>

                    <div className="text-xs" style={{ color: 'var(--text-subtle)' }}>
                        {t('accounts.loginBrowserHint')}
                    </div>
                </div>
            ) : loginDone ? (
                <div className="mt-3 flex items-center gap-2 text-green-400 text-sm py-1">
                    <Check size={15} /> <span>{t('accounts.loginSuccess')}</span>
                </div>
            ) : (
                <button
                    onClick={startLogin}
                    className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-colors shadow-lg text-sm"
                >
                    <Shield size={15} /> {t('accounts.addMicrosoftAccount')}
                </button>
            )}

            {/* Error */}
            {loginError && (
                <div className="mt-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
                    <div className="flex items-start justify-between gap-2">
                        <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed flex-1">{loginError}</pre>
                        <button onClick={() => setLoginError(null)} className="opacity-50 hover:opacity-100 flex-shrink-0 mt-0.5">
                            <X size={13} />
                        </button>
                    </div>
                </div>
            )}
        </Section>
    );
}

// ─── CATEGORY: INSTANCES ──────────────────────────────────────────────────────

function CategoryInstances({ ls, setL, profiles }: any) {
    const { t } = useTranslation();
    return (
        <>
            <Section title={t('settings.instances.defaults')}>
                <SelectRow label={t('settings.instances.defaultInstance')} description={t('settings.instances.defaultInstanceDesc')}
                    value={ls.defaultInstance} onChange={v => setL('defaultInstance', v)}
                    options={[{ value: '', label: t('settings.instances.none') }, ...profiles.map((p: string) => ({ value: p, label: p }))]}
                />
            </Section>

            {profiles.length > 0 ? (
                <Section title={t('settings.instances.actions')}>
                    <div className="space-y-2">
                        {profiles.map((name: string) => <InstanceRow key={name} name={name} />)}
                    </div>
                </Section>
            ) : (
                <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
                    <Layers size={36} className="mx-auto mb-3 opacity-40" />
                    <div className="text-sm">{t('settings.instances.empty')}</div>
                </div>
            )}
        </>
    );
}

function InstanceRow({ name }: { name: string }) {
    const { t } = useTranslation();
    const [busy, setBusy]   = useState(false);
    const [error, setError] = useState<string | null>(null);

    const run = async (action: () => Promise<Response>) => {
        setBusy(true); setError(null);
        try {
            const res = await action();
            if (!res.ok) {
                const msg = await res.text().catch(() => `HTTP ${res.status}`);
                setError(msg || `HTTP ${res.status}`);
                setTimeout(() => setError(null), 4000);
            }
        } catch (e: any) {
            setError(e?.message ?? t('common.error')); setTimeout(() => setError(null), 4000);
        } finally { setBusy(false); }
    };

    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3 p-3 rounded-xl border" style={{ backgroundColor: 'var(--surface2)', borderColor: 'var(--border)' }}>
                <div className="flex-1 text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{name}</div>
                <div className="flex gap-1 flex-shrink-0">
                    {[
                        { title: t('instances.openFolder'), icon: <FolderOpen size={13} />, fn: () => fetch(`http://localhost:35555/api/profiles/${encodeURIComponent(name)}/folder`, { method: 'POST' }) },
                        { title: t('instances.repair'), icon: <RefreshCw size={13} />, fn: () => { if (!confirm(`${t('instances.reinstallConfirm')} "${name}"?`)) return Promise.reject('cancelled'); return fetch(`http://localhost:35555/api/profiles/${encodeURIComponent(name)}/reinstall`, { method: 'POST' }); } },
                        { title: t('instances.duplicate'), icon: <Copy size={13} />, fn: () => fetch(`http://localhost:35555/api/profiles/${encodeURIComponent(name)}/duplicate`, { method: 'POST' }) },
                        { title: t('instances.delete'), icon: <Trash2 size={13} />, danger: true, fn: () => { if (!confirm(`${t('instances.deleteConfirm')} "${name}"?`)) return Promise.reject('cancelled'); return fetch(`http://localhost:35555/api/profiles/${encodeURIComponent(name)}`, { method: 'DELETE' }); } },
                    ].map(({ title, icon, danger, fn }) => (
                        <button key={title} type="button" title={title} onClick={() => run(fn as any)}
                            className={clsx('p-1.5 rounded-lg transition-colors', danger ? 'text-red-500 hover:bg-red-500/10' : 'hover:bg-white/10')}
                            style={!danger ? { color: 'var(--text-muted)' } : {}}
                        >
                            {icon}
                        </button>
                    ))}
                </div>
                {busy && <Loader size={13} className="animate-spin flex-shrink-0" style={{ color: 'var(--text-subtle)' }} />}
            </div>
            {error && <div className="text-xs text-red-400 pl-3">{error}</div>}
        </div>
    );
}

// ─── CATEGORY: GAME TWEAKS ───────────────────────────────────────────────────

interface GameTweaks {
    musicVolume: number;   // 0–100  → soundCategory_music:0.0–1.0
    fov:         number;   // 30–110 → fov:30–110
    autoJump:    boolean;  // autoJump:true/false
    fullscreen:  boolean;  // fullscreen:true/false
    guiScale:    number;   // 0–4
}

const DEFAULT_TWEAKS: GameTweaks = {
    musicVolume: 100,
    fov:         70,
    autoJump:    true,
    fullscreen:  false,
    guiScale:    0,
};

function parseTweaks(text: string): GameTweaks {
    const lines: Record<string, string> = {};
    for (const line of text.split('\n')) {
        const idx = line.indexOf(':');
        if (idx > 0) lines[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    return {
        musicVolume: lines['soundCategory_music'] != null ? Math.round(parseFloat(lines['soundCategory_music']) * 100) : DEFAULT_TWEAKS.musicVolume,
        fov:         lines['fov']                 != null ? parseInt(lines['fov'], 10)                                  : DEFAULT_TWEAKS.fov,
        autoJump:    lines['autoJump']            != null ? lines['autoJump'] === 'true'                                : DEFAULT_TWEAKS.autoJump,
        fullscreen:  lines['fullscreen']          != null ? lines['fullscreen'] === 'true'                              : DEFAULT_TWEAKS.fullscreen,
        guiScale:    lines['guiScale']            != null ? parseInt(lines['guiScale'], 10)                             : DEFAULT_TWEAKS.guiScale,
    };
}

function buildOptionsText(tw: GameTweaks): string {
    return [
        `soundCategory_music:${(tw.musicVolume / 100).toFixed(2)}`,
        `fov:${tw.fov}`,
        `autoJump:${tw.autoJump}`,
        `fullscreen:${tw.fullscreen}`,
        `guiScale:${tw.guiScale}`,
    ].join('\n');
}

function CategoryGameTweaks() {
    const { t } = useTranslation();
    const [tweaks, setTweaks]   = useState<GameTweaks>(DEFAULT_TWEAKS);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving]   = useState(false);
    const [saved,  setSaved]    = useState(false);
    const [error,  setError]    = useState<string | null>(null);

    useEffect(() => {
        fetch('http://localhost:35555/api/options-template')
            .then(r => r.ok ? r.text() : '')
            .then(text => { if (text.trim()) setTweaks(parseTweaks(text)); setLoading(false); })
            .catch(() => setLoading(false));
    }, []);

    const set = <K extends keyof GameTweaks>(key: K, val: GameTweaks[K]) =>
        setTweaks(prev => ({ ...prev, [key]: val }));

    const save = async () => {
        setSaving(true); setError(null);
        try {
            const res = await fetch('http://localhost:35555/api/options-template', {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: buildOptionsText(tweaks),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setSaved(true); setTimeout(() => setSaved(false), 2500);
        } catch (e: any) {
            setError(e?.message ?? 'Save failed');
        } finally { setSaving(false); }
    };

    const GUI_LABELS = [
        t('gametweaks.guiAuto'),
        t('gametweaks.guiSmall'),
        t('gametweaks.guiNormal'),
        t('gametweaks.guiLarge'),
        t('gametweaks.guiHuge'),
    ];

    if (loading) return (
        <div className="flex items-center gap-2 py-8 justify-center" style={{ color: 'var(--text-muted)' }}>
            <Loader size={16} className="animate-spin" /> {t('common.loading')}
        </div>
    );

    return (
        <>
            <Section title={t('gametweaks.title')}>
                <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                    {t('gametweaks.desc')}
                </p>

                <div className="space-y-5">
                    <SliderRow
                        label={t('gametweaks.music')}
                        value={tweaks.musicVolume}
                        min={0} max={100} step={1}
                        display={v => `${v}%`}
                        onChange={v => set('musicVolume', v)}
                    />
                    <SliderRow
                        label={t('gametweaks.fov')}
                        value={tweaks.fov}
                        min={30} max={110} step={1}
                        display={v => `${v}°`}
                        onChange={v => set('fov', v)}
                    />
                </div>
            </Section>

            <Section title={t('gametweaks.toggles')}>
                <div className="space-y-3">
                    <ToggleRow
                        label={t('gametweaks.autoJump')}
                        description={t('gametweaks.autoJumpDesc')}
                        value={tweaks.autoJump}
                        onChange={v => set('autoJump', v)}
                    />
                    <ToggleRow
                        label={t('gametweaks.fullscreen')}
                        description={t('gametweaks.fullscreenDesc')}
                        value={tweaks.fullscreen}
                        onChange={v => set('fullscreen', v)}
                    />
                </div>
            </Section>

            <Section title={t('gametweaks.guiScale')}>
                <div className="flex gap-2 flex-wrap">
                    {GUI_LABELS.map((label, idx) => (
                        <button
                            key={idx}
                            onClick={() => set('guiScale', idx)}
                            className={clsx(
                                'px-4 py-2 rounded-xl text-sm font-medium border transition-colors',
                                tweaks.guiScale === idx
                                    ? 'bg-green-500/20 border-green-500/40 text-green-400'
                                    : 'border-white/10 hover:border-white/20'
                            )}
                            style={tweaks.guiScale !== idx ? { color: 'var(--text-muted)', backgroundColor: 'var(--surface2)' } : {}}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </Section>

            {/* Save */}
            <div className="flex items-center gap-3">
                <button
                    onClick={save}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-bold transition-colors bg-white text-black hover:bg-zinc-200 disabled:opacity-50"
                >
                    {saving ? <Loader size={13} className="animate-spin" /> : saved ? <Check size={13} /> : <Save size={13} />}
                    {saved ? t('settings.saved') : t('common.save')}
                </button>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('gametweaks.saveHint')}</span>
                {error && <span className="text-xs text-red-400">{error}</span>}
            </div>
        </>
    );
}

// ─── CATEGORY: DEVELOPER ──────────────────────────────────────────────────────

function CategoryDeveloper({ ls, setL, cfg, setC }: any) {
    const { t } = useTranslation();
    return (
        <>
            <Section title={t('settings.developer.debug')}>
                <ToggleRow label={t('settings.developer.debugMode')} description={t('settings.developer.debugModeDesc')} value={ls.debugMode} onChange={v => setL('debugMode', v)} />
                <SelectRow label={t('settings.developer.logLevel')} description={t('settings.developer.logLevelDesc')} value={ls.logLevel}
                    onChange={v => setL('logLevel', v)}
                    options={[
                        { value: 'debug', label: 'Debug (all)' },
                        { value: 'info',  label: 'Info' },
                        { value: 'warn',  label: 'Warnings' },
                        { value: 'error', label: 'Errors only' },
                    ]}
                />
            </Section>

            <Section title={t('settings.developer.console')}>
                <ActionButton label={t('settings.developer.openConsole')} description={t('settings.developer.openConsoleDesc')}
                    icon={<Terminal size={14} className="mr-1" />}
                    onClick={() => launcherApi.openConsoleWindow().catch(console.error)} />
            </Section>

            <Section title={t('settings.developer.tools')}>
                <ActionButton label={t('settings.developer.openDevTools')} description={t('settings.developer.openDevToolsDesc')}
                    icon={<Code size={14} className="mr-1" />}
                    onClick={() => launcherApi.openDevTools().catch(console.error)} />
                <ActionButton label={t('settings.developer.openLogFile')} description={t('settings.developer.openLogFileDesc')}
                    icon={<ExternalLink size={14} className="mr-1" />}
                    onClick={() => launcherApi.openLogFile().catch(console.error)} />
                <ActionButton label={t('settings.developer.openLogsFolder')} description={t('settings.developer.openLogsFolderDesc')}
                    icon={<FolderOpen size={14} className="mr-1" />}
                    onClick={() => launcherApi.openLogsDir().catch(console.error)} />
                <ActionButton label={t('settings.developer.openCrashReports')} description={t('settings.developer.openCrashReportsDesc')}
                    icon={<AlertTriangle size={14} className="mr-1" />}
                    onClick={() => launcherApi.openCrashReports().catch(console.error)} />
            </Section>

            <Section title={t('settings.developer.apiKeys')}>
                <InputRow label={t('settings.developer.msClientId')} description={t('settings.developer.msClientIdDesc')}
                    value={cfg?.microsoftClientId ?? ''} onChange={v => setC('microsoftClientId', v)}
                    placeholder="00000000-0000-0000-0000-000000000000" />
                <InputRow label={t('settings.developer.cfApiKey')} description={t('settings.developer.cfApiKeyDesc')}
                    value={cfg?.curseForgeApiKey ?? ''} onChange={v => setC('curseForgeApiKey', v)}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
            </Section>
        </>
    );
}
