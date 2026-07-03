import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
    Terminal, Trash2, Download, Search, X, Copy, Check,
    Pause, Play, Wifi, WifiOff, FileText, ChevronDown, Loader,
} from 'lucide-react';
import clsx from 'clsx';
import { api, launcherApi, BackendLogEntry } from '../api';

// ─── TYPES ───────────────────────────────────────────────────────────────────

type LogLevel  = 'info' | 'warn' | 'error' | 'debug';
type LogSource = 'launcher' | string; // string = instance name

interface LogEntry {
    id:      number;
    time:    string;     // display time HH:mm:ss
    level:   LogLevel;
    source:  LogSource;
    message: string;
    isoTime: string;     // for sort stability
}

let _id = 0;
function nextId() { return ++_id; }

function formatTime(isoOrDate?: string): string {
    try {
        const d = isoOrDate ? new Date(isoOrDate) : new Date();
        return d.toLocaleTimeString('de-DE', { hour12: false });
    } catch { return new Date().toLocaleTimeString('de-DE', { hour12: false }); }
}

function mapLevel(level: string, type?: string): LogLevel {
    if (type === 'error' || level === 'ERROR') return 'error';
    if (level === 'WARN')  return 'warn';
    if (level === 'DEBUG') return 'debug';
    return 'info';
}

function detectLevelFromText(type: string, message: string): LogLevel {
    if (type === 'error') return 'error';
    const l = message.toLowerCase();
    if (l.includes('[warn]') || l.includes('warning')) return 'warn';
    if (l.includes('[error]') || l.includes('exception') || l.includes('crash')) return 'error';
    return 'info';
}

function backendEntryToLog(e: BackendLogEntry): LogEntry {
    return {
        id:      nextId(),
        time:    formatTime(e.timestamp),
        isoTime: e.timestamp,
        level:   mapLevel(e.level),
        source:  e.instanceId ?? 'launcher',
        message: e.message,
    };
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────

interface Props {
    standalone?: boolean; // true when rendered in its own Electron window
}

export function ConsolePage({ standalone = false }: Props) {
    const [logs,         setLogs        ] = useState<LogEntry[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(true);
    const [autoScroll,   setAutoScroll  ] = useState(true);
    const [searchTerm,   setSearchTerm  ] = useState('');
    const [levelFilter,  setLevelFilter ] = useState<'all' | LogLevel>('all');
    const [sourceFilter, setSourceFilter] = useState<'all' | 'launcher' | string>('all');
    const [wsState,      setWsState     ] = useState<'connecting' | 'open' | 'closed'>('connecting');
    const [copyAllDone,  setCopyAllDone ] = useState(false);

    const bottomRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const wsRef     = useRef<WebSocket | null>(null);
    const reconnRef = useRef<ReturnType<typeof setTimeout>>();

    const addLog = useCallback((entry: Omit<LogEntry, 'id'>) => {
        setLogs(prev => {
            const next = [...prev, { ...entry, id: nextId() }];
            return next.length > 3000 ? next.slice(next.length - 3000) : next;
        });
    }, []);

    // ── 1. Load history from backend on mount ──────────────────────────────
    useEffect(() => {
        let cancelled = false;
        api.getLogHistory(500).then(entries => {
            if (cancelled) return;
            const mapped = entries.map(backendEntryToLog);
            setLogs(mapped);
            setLoadingHistory(false);
        }).catch(() => setLoadingHistory(false));
        return () => { cancelled = true; };
    }, []);

    // ── 2. WebSocket for live logs ─────────────────────────────────────────
    const connect = useCallback(() => {
        setWsState('connecting');
        const ws = new WebSocket('ws://localhost:35555/api/ws');
        wsRef.current = ws;

        ws.onopen  = () => setWsState('open');
        ws.onclose = () => {
            setWsState('closed');
            reconnRef.current = setTimeout(connect, 3000);
        };
        ws.onerror = () => ws.close();

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type !== 'log' && data.type !== 'error') return;

                const source = data.profile ?? data.instanceId ?? 'launcher';
                const level  = data.level
                    ? mapLevel(data.level)
                    : detectLevelFromText(data.type, data.payload ?? '');

                addLog({
                    time:    data.timestamp ? formatTime(data.timestamp) : formatTime(),
                    isoTime: data.timestamp ?? new Date().toISOString(),
                    level,
                    source,
                    message: data.payload ?? data.message ?? '',
                });
            } catch { /* ignore parse errors */ }
        };
    }, [addLog]);

    useEffect(() => {
        // Wait for history load before opening WS to avoid duplicates
        if (loadingHistory) return;
        connect();
        return () => {
            wsRef.current?.close();
            if (reconnRef.current) clearTimeout(reconnRef.current);
        };
    }, [connect, loadingHistory]);

    // ── Auto-scroll ────────────────────────────────────────────────────────
    useEffect(() => {
        if (autoScroll && bottomRef.current)
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }, [logs, autoScroll]);

    const handleScroll = () => {
        if (!scrollRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        const atBottom = scrollHeight - scrollTop - clientHeight < 60;
        if (atBottom !== autoScroll) setAutoScroll(atBottom);
    };

    // ── Sources list ──────────────────────────────────────────────────────
    const sources = useMemo(() => {
        const set = new Set<string>();
        logs.forEach(l => { if (l.source !== 'launcher') set.add(l.source); });
        return Array.from(set);
    }, [logs]);

    // ── Filtered logs ──────────────────────────────────────────────────────
    const filteredLogs = useMemo(() => {
        return logs.filter(l => {
            if (levelFilter  !== 'all' && l.level  !== levelFilter)  return false;
            if (sourceFilter === 'launcher' && l.source !== 'launcher') return false;
            if (sourceFilter !== 'all' && sourceFilter !== 'launcher' && l.source !== sourceFilter) return false;
            if (searchTerm) {
                const lc = searchTerm.toLowerCase();
                if (!l.message.toLowerCase().includes(lc) && !l.source.toLowerCase().includes(lc)) return false;
            }
            return true;
        });
    }, [logs, levelFilter, sourceFilter, searchTerm]);

    // ── Level counts ──────────────────────────────────────────────────────
    const levelCounts = useMemo(() => ({
        warn:  logs.filter(l => l.level === 'warn').length,
        error: logs.filter(l => l.level === 'error').length,
    }), [logs]);

    // ── Actions ───────────────────────────────────────────────────────────
    const handleCopyAll = () => {
        const text = filteredLogs.map(
            l => `[${l.time}] [${l.level.toUpperCase()}] [${l.source}] ${l.message}`
        ).join('\n');
        navigator.clipboard.writeText(text);
        setCopyAllDone(true);
        setTimeout(() => setCopyAllDone(false), 2000);
    };

    const handleSave = async () => {
        const content = filteredLogs.map(
            l => `[${l.isoTime}] [${l.level.toUpperCase()}] [${l.source}] ${l.message}`
        ).join('\n');
        try {
            const fp = await launcherApi.selectLogSave().catch(() => null);
            if (fp) { await launcherApi.saveLogToFile(fp, content); return; }
        } catch { /* fallback */ }
        const blob = new Blob([content], { type: 'text/plain' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = `launcher-${Date.now()}.log`; a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className={clsx(
            'flex flex-col bg-[#09090b] font-mono text-sm overflow-hidden',
            standalone
                ? 'h-screen w-full'
                : 'h-full rounded-2xl border border-white/5'
        )}>
            {/* ── TOOLBAR ── */}
            <div className="bg-zinc-900/80 backdrop-blur-md p-3 flex flex-wrap items-center gap-2 border-b border-white/5 flex-shrink-0">

                {/* Title + WS */}
                <div className="flex items-center gap-3 mr-2">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800/50 rounded-lg border border-white/5">
                        <Terminal size={14} className="text-emerald-500" />
                        <span className="font-bold text-zinc-100 tracking-tight text-xs">Console</span>
                    </div>
                    <WsBadge state={wsState} />
                    {loadingHistory && (
                        <div className="flex items-center gap-1 text-[10px] text-zinc-500">
                            <Loader size={10} className="animate-spin" /> Loading history…
                        </div>
                    )}
                </div>

                {/* Level filters */}
                <div className="flex items-center gap-1 bg-zinc-800/50 rounded-lg p-1 border border-white/5">
                    {(['all', 'info', 'warn', 'error'] as const).map(lvl => (
                        <button
                            key={lvl}
                            onClick={() => setLevelFilter(lvl)}
                            className={clsx(
                                'px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors',
                                levelFilter === lvl
                                    ? lvl === 'error'  ? 'bg-red-500/20 text-red-400'
                                        : lvl === 'warn' ? 'bg-yellow-500/20 text-yellow-400'
                                            : 'bg-white/10 text-white'
                                    : 'text-zinc-500 hover:text-zinc-300'
                            )}
                        >
                            {lvl}
                            {lvl === 'warn'  && levelCounts.warn  > 0 && <span className="ml-1 px-1 bg-yellow-500/20 text-yellow-400 rounded text-[9px]">{levelCounts.warn}</span>}
                            {lvl === 'error' && levelCounts.error > 0 && <span className="ml-1 px-1 bg-red-500/20 text-red-400 rounded text-[9px]">{levelCounts.error}</span>}
                        </button>
                    ))}
                </div>

                {/* Source filter */}
                <div className="relative">
                    <select
                        value={sourceFilter}
                        onChange={e => setSourceFilter(e.target.value)}
                        className="appearance-none bg-zinc-800/50 border border-white/5 text-zinc-300 text-[11px] rounded-lg px-3 py-1.5 pr-7 outline-none focus:border-green-500/50 cursor-pointer"
                    >
                        <option value="all">All sources</option>
                        <option value="launcher">Launcher</option>
                        {sources.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                </div>

                {/* Search */}
                <div className="flex items-center gap-1.5 bg-zinc-800/50 border border-white/5 rounded-lg px-2 py-1.5 flex-1 min-w-[140px]">
                    <Search size={12} className="text-zinc-500 flex-shrink-0" />
                    <input
                        type="text"
                        placeholder="Search logs…"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="bg-transparent border-none outline-none text-[11px] text-white placeholder-zinc-600 w-full"
                    />
                    {searchTerm && (
                        <button onClick={() => setSearchTerm('')} className="text-zinc-500 hover:text-white">
                            <X size={11} />
                        </button>
                    )}
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1 ml-auto">
                    <ToolBtn onClick={() => setAutoScroll(v => !v)} title={autoScroll ? 'Pause auto-scroll' : 'Resume'} active={autoScroll} icon={autoScroll ? <Pause size={14} /> : <Play size={14} />} color="yellow" />
                    <ToolBtn onClick={handleCopyAll}  title="Copy all visible logs"  icon={copyAllDone ? <Check size={14} /> : <Copy size={14} />}  color="blue" />
                    <ToolBtn onClick={handleSave}     title="Save logs to file"      icon={<Download size={14} />}  color="blue" />
                    <ToolBtn onClick={() => launcherApi.openLogFile().catch(console.error)} title="Open launcher.log" icon={<FileText size={14} />} color="blue" />
                    <ToolBtn onClick={() => setLogs([])} title="Clear view (files kept)" icon={<Trash2 size={14} />}   color="red" />
                </div>
            </div>

            {/* ── LOG AREA ── */}
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-3 space-y-px bg-[#09090b] selection:bg-zinc-700"
            >
                {loadingHistory ? (
                    <div className="flex flex-col items-center justify-center h-full text-zinc-700 gap-3 py-20">
                        <Loader size={32} className="animate-spin" />
                        <span className="text-xs">Loading log history…</span>
                    </div>
                ) : filteredLogs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-zinc-700 gap-3 py-20">
                        <Terminal size={40} strokeWidth={1} />
                        <span className="text-xs">No logs to display</span>
                    </div>
                ) : (
                    filteredLogs.map(log => <ConsoleLine key={log.id} log={log} />)
                )}
                <div ref={bottomRef} />
            </div>

            {/* ── STATUS BAR ── */}
            <div className="bg-zinc-900 border-t border-white/5 px-4 py-1 text-[10px] text-zinc-600 flex justify-between items-center select-none flex-shrink-0">
                <span>
                    {filteredLogs.length} / {logs.length} lines
                    {searchTerm && ` · filtered by "${searchTerm}"`}
                </span>
                <span>{autoScroll ? '↓ AUTO-SCROLL' : '⏸ PAUSED'}</span>
            </div>
        </div>
    );
}

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────

function WsBadge({ state }: { state: 'connecting' | 'open' | 'closed' }) {
    const map = {
        open:       { icon: <Wifi size={11} />,                             label: 'Connected',    cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
        connecting: { icon: <Wifi size={11} className="animate-pulse" />,   label: 'Connecting',   cls: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'   },
        closed:     { icon: <WifiOff size={11} />,                          label: 'Disconnected', cls: 'bg-red-500/10 text-red-400 border-red-500/20'             },
    }[state];
    return (
        <div className={clsx('flex items-center gap-1.5 px-2 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider', map.cls)}>
            {map.icon}<span className="hidden sm:inline">{map.label}</span>
        </div>
    );
}

function ToolBtn({ onClick, title, icon, active, color }: {
    onClick: () => void; title: string; icon: React.ReactNode; active?: boolean; color: string;
}) {
    const colors: Record<string, string> = {
        yellow: 'hover:bg-yellow-400/10 hover:text-yellow-400',
        blue:   'hover:bg-blue-400/10 hover:text-blue-400',
        red:    'hover:bg-red-400/10 hover:text-red-400',
    };
    return (
        <button onClick={onClick} title={title}
            className={clsx('p-2 rounded-lg transition-colors text-zinc-500', active ? 'bg-white/10 text-white' : colors[color])}>
            {icon}
        </button>
    );
}

function ConsoleLine({ log }: { log: LogEntry }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(log.message);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const srcColor = log.source === 'launcher' || log.source === 'Launcher'
        ? 'text-blue-400/70'
        : log.source === 'Backend' ? 'text-cyan-400/70' : 'text-purple-400/70';

    return (
        <div className="group flex items-start gap-2 hover:bg-white/[0.025] py-0.5 px-2 rounded -mx-2 transition-colors">
            <span className="text-zinc-700 text-[10px] select-none shrink-0 w-[58px] pt-[2px] font-medium">{log.time}</span>
            {log.level === 'error' && (
                <span className="shrink-0 text-[9px] px-1 py-px rounded bg-red-500/10 text-red-500 border border-red-500/20 font-bold uppercase mt-[2px]">ERR</span>
            )}
            {log.level === 'warn' && (
                <span className="shrink-0 text-[9px] px-1 py-px rounded bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 font-bold uppercase mt-[2px]">WRN</span>
            )}
            {log.level === 'debug' && (
                <span className="shrink-0 text-[9px] px-1 py-px rounded bg-zinc-500/10 text-zinc-500 border border-zinc-500/20 font-bold uppercase mt-[2px]">DBG</span>
            )}
            <span className={clsx('shrink-0 text-[10px] font-medium mt-[2px] max-w-[90px] truncate', srcColor)}>
                [{log.source}]
            </span>
            <div className={clsx(
                'flex-1 break-words leading-tight text-[12px] min-w-0',
                log.level === 'error' ? 'text-red-400' :
                log.level === 'warn'  ? 'text-yellow-400' :
                log.level === 'debug' ? 'text-zinc-500' : 'text-zinc-300'
            )}>
                {log.message}
            </div>
            <button
                onClick={handleCopy}
                className={clsx('opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-white/10 shrink-0',
                    copied ? 'text-emerald-400 opacity-100' : 'text-zinc-600')}
                title="Copy line"
            >
                {copied ? <Check size={11} /> : <Copy size={11} />}
            </button>
        </div>
    );
}
