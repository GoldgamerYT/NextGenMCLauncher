import { useEffect, useState } from 'react';
import { Download, RefreshCw, X, CheckCircle, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from '../i18n';

type UpdateStatus =
    | { status: 'idle' }
    | { status: 'available'; version: string }
    | { status: 'downloading'; percent: number }
    | { status: 'downloaded'; version: string }
    | { status: 'error'; message: string };

function ea(): any { return (window as any).electronAPI ?? null; }

export function UpdateBanner() {
    const { t } = useTranslation();
    const [state, setState] = useState<UpdateStatus>({ status: 'idle' });
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        const api = ea();
        if (!api?.onUpdateStatus) return;
        const handler = (data: any) => {
            if (data.status === 'available')   setState({ status: 'available',   version: data.version });
            if (data.status === 'downloading') setState({ status: 'downloading', percent: data.percent ?? 0 });
            if (data.status === 'downloaded')  setState({ status: 'downloaded',  version: data.version });
            if (data.status === 'error')       setState({ status: 'error',       message: data.message });
        };
        api.onUpdateStatus(handler);
        return () => api.offUpdateStatus?.();
    }, []);

    const download = () => {
        setState({ status: 'downloading', percent: 0 });
        ea()?.startDownload();
    };

    const install = () => ea()?.installUpdate();

    const visible = !dismissed && state.status !== 'idle';

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    initial={{ opacity: 0, y: -40 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -40 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute top-10 left-0 right-0 z-50 flex justify-center pointer-events-none"
                >
                    <div
                        className="pointer-events-auto flex items-center gap-3 px-4 py-2.5 rounded-xl border shadow-2xl text-sm"
                        style={{
                            background: 'rgba(9,9,11,0.95)',
                            borderColor: state.status === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)',
                            backdropFilter: 'blur(20px)',
                        }}
                    >
                        {/* Icon */}
                        {state.status === 'available' && <Download size={15} className="text-green-400 shrink-0" />}
                        {state.status === 'downloading' && <RefreshCw size={15} className="text-green-400 animate-spin shrink-0" />}
                        {state.status === 'downloaded' && <CheckCircle size={15} className="text-green-400 shrink-0" />}
                        {state.status === 'error' && <AlertTriangle size={15} className="text-red-400 shrink-0" />}

                        {/* Text */}
                        <span style={{ color: 'var(--text)' }}>
                            {state.status === 'available' && (
                                <>{t('update.available')} <span className="text-green-400 font-medium">v{state.version}</span></>
                            )}
                            {state.status === 'downloading' && (
                                <>{t('update.downloading')} <span className="text-green-400 font-medium">{state.percent}%</span></>
                            )}
                            {state.status === 'downloaded' && (
                                <>{t('update.downloaded')} <span className="text-green-400 font-medium">v{state.version}</span> {t('update.restartRequired')}</>
                            )}
                            {state.status === 'error' && (
                                <span className="text-red-400">{t('update.error')} {state.message}</span>
                            )}
                        </span>

                        {/* Progress bar for download */}
                        {state.status === 'downloading' && (
                            <div className="w-24 h-1.5 rounded-full bg-white/10 overflow-hidden">
                                <div
                                    className="h-full bg-green-400 rounded-full transition-all duration-300"
                                    style={{ width: `${state.percent}%` }}
                                />
                            </div>
                        )}

                        {/* Actions */}
                        {state.status === 'available' && (
                            <button
                                onClick={download}
                                className="px-3 py-1 rounded-lg bg-green-500 hover:bg-green-400 text-black text-xs font-semibold transition-colors"
                            >
                                {t('update.download')}
                            </button>
                        )}
                        {state.status === 'downloaded' && (
                            <button
                                onClick={install}
                                className="px-3 py-1 rounded-lg bg-green-500 hover:bg-green-400 text-black text-xs font-semibold transition-colors"
                            >
                                {t('update.installRestart')}
                            </button>
                        )}

                        {/* Dismiss */}
                        {(state.status === 'available' || state.status === 'error') && (
                            <button
                                onClick={() => setDismissed(true)}
                                className="p-1 rounded hover:bg-white/10 transition-colors"
                                style={{ color: 'var(--text-muted)' }}
                            >
                                <X size={13} />
                            </button>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
