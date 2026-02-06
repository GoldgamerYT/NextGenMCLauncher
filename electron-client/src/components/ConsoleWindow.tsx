import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Terminal, Download, Trash2, Pause, Play, Search, X, Wifi, WifiOff, Copy, Check } from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

// WebSocket ReadyState Constants for Native Implementation
const ReadyState = {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
    UNINSTANTIATED: -1,
};

export function ConsoleWindow() {
    // --- STATE ---
    const [logs, setLogs] = useState<{ type: 'log' | 'error' | 'warn', message: string, time: string, id: number }[]>([]);
    const [autoScroll, setAutoScroll] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [readyState, setReadyState] = useState<number>(ReadyState.CLOSED);

    const bottomRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

    // --- CONFIG ---
    const params = new URLSearchParams(window.location.search);
    const profileName = params.get('console') || 'Unknown Profile';

    // --- WEBSOCKET LOGIC (Native) ---
    const connect = () => {
        try {
            setReadyState(ReadyState.CONNECTING);
            const ws = new WebSocket('ws://localhost:35555/api/ws');
            wsRef.current = ws;

            ws.onopen = () => {
                setReadyState(ReadyState.OPEN);
                // Optional: Send handshake if needed
                // ws.send(JSON.stringify({ type: 'subscribe', profile: profileName }));
            };

            ws.onclose = () => {
                setReadyState(ReadyState.CLOSED);
                // Reconnect attempt
                reconnectTimeoutRef.current = setTimeout(() => {
                    connect();
                }, 3000);
            };

            ws.onerror = (error) => {
                console.error("WebSocket Error:", error);
                ws.close();
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);

                    // Filter für aktuelles Profil
                    if (data.profile && data.profile !== profileName) return;

                    if (data.type === 'log' || data.type === 'error') {
                        const now = new Date().toLocaleTimeString('de-DE', { hour12: false });

                        // Auto-Detect Warning based on text content
                        let type = data.type;
                        if (type === 'log' && (data.payload && (data.payload.toLowerCase().includes('warn') || data.payload.includes('[WARN]')))) {
                            type = 'warn';
                        }

                        setLogs(prev => {
                            // Limit history to 1000 lines for performance
                            const newLogs = [...prev, { type, message: data.payload, time: now, id: Date.now() + Math.random() }];
                            if (newLogs.length > 1000) return newLogs.slice(newLogs.length - 1000);
                            return newLogs;
                        });
                    }
                } catch (e) {
                    console.error("WS Parse Error", e);
                }
            };
        } catch (err) {
            console.error("Connection failed", err);
            setReadyState(ReadyState.CLOSED);
        }
    };

    useEffect(() => {
        connect();
        return () => {
            if (wsRef.current) wsRef.current.close();
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        };
    }, [profileName]);

    const connectionStatus = {
        [ReadyState.CONNECTING]: 'Connecting',
        [ReadyState.OPEN]: 'Connected',
        [ReadyState.CLOSING]: 'Closing',
        [ReadyState.CLOSED]: 'Disconnected',
        [ReadyState.UNINSTANTIATED]: 'Uninstantiated',
    }[readyState];

    // --- UI LOGIC ---

    // Auto-Scroll Logic
    useEffect(() => {
        if (autoScroll && bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs, autoScroll]);

    // Detect user scroll to pause auto-scroll
    const handleScroll = () => {
        if (!scrollContainerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;

        // Only toggle if state actually changes to avoid re-renders
        if (isAtBottom && !autoScroll) setAutoScroll(true);
        if (!isAtBottom && autoScroll) setAutoScroll(false);
    };

    // Filter Logs
    const filteredLogs = useMemo(() => {
        if (!searchTerm) return logs;
        const lowerTerm = searchTerm.toLowerCase();
        return logs.filter(l =>
            l.message.toLowerCase().includes(lowerTerm) ||
            l.type.includes(lowerTerm)
        );
    }, [logs, searchTerm]);

    // Actions
    const handleDownload = () => {
        const content = logs.map(l => `[${l.time}] [${l.type.toUpperCase()}] ${l.message}`).join('\n');
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${profileName}-${new Date().toISOString()}.log`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleCopyLine = (text: string) => {
        navigator.clipboard.writeText(text);
        // Optional: Toast notification here
    };

    if (!profileName) return <div className="flex items-center justify-center h-screen text-gray-500 bg-zinc-950">No profile specified.</div>;

    return (
        <div className="h-screen w-full bg-[#09090b] text-zinc-300 flex flex-col font-mono text-sm overflow-hidden relative">

            {/* --- TOOLBAR --- */}
            <div className="bg-zinc-900/80 backdrop-blur-md p-3 flex items-center justify-between border-b border-white/5 z-10 shadow-sm">

                {/* Left: Title & Status */}
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800/50 rounded-lg border border-white/5">
                        <Terminal size={14} className="text-emerald-500" />
                        <span className="font-bold text-zinc-100 tracking-tight">{profileName}</span>
                    </div>

                    {/* Connection Badge */}
                    <div className={clsx(
                        "flex items-center gap-2 text-xs px-2 py-1 rounded-full transition-colors",
                        readyState === ReadyState.OPEN ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                    )}>
                        {readyState === ReadyState.OPEN ? <Wifi size={12} /> : <WifiOff size={12} />}
                        <span className="hidden sm:inline font-medium uppercase text-[10px] tracking-wider">{connectionStatus}</span>
                    </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2">

                    {/* Search Bar Animation */}
                    <div className={clsx(
                        "flex items-center bg-zinc-800/50 border border-white/5 rounded-lg overflow-hidden transition-all duration-300",
                        isSearchOpen ? "w-48 sm:w-64 px-2" : "w-8 p-0 border-transparent bg-transparent"
                    )}>
                        <button onClick={() => setIsSearchOpen(!isSearchOpen)} className="p-2 text-gray-400 hover:text-white">
                            <Search size={16} />
                        </button>
                        <input
                            type="text"
                            placeholder="Filter logs..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className={clsx(
                                "bg-transparent border-none outline-none text-xs text-white placeholder-zinc-500 w-full",
                                !isSearchOpen && "hidden"
                            )}
                        />
                        {searchTerm && isSearchOpen && (
                            <button onClick={() => setSearchTerm('')} className="p-1 text-gray-500 hover:text-white">
                                <X size={12} />
                            </button>
                        )}
                    </div>

                    <div className="h-4 w-[1px] bg-white/10 mx-2 hidden sm:block"></div>

                    <ControlButton
                        onClick={() => setAutoScroll(!autoScroll)}
                        active={autoScroll}
                        icon={autoScroll ? <Pause size={16} /> : <Play size={16} />}
                        tooltip={autoScroll ? "Pause Scroll" : "Resume Scroll"}
                        colorClass="text-yellow-400 hover:bg-yellow-400/10"
                    />

                    <ControlButton
                        onClick={() => setLogs([])}
                        icon={<Trash2 size={16} />}
                        tooltip="Clear Console"
                        colorClass="text-red-400 hover:bg-red-400/10"
                    />

                    <ControlButton
                        onClick={handleDownload}
                        icon={<Download size={16} />}
                        tooltip="Save Log"
                        colorClass="text-blue-400 hover:bg-blue-400/10"
                    />
                </div>
            </div>

            {/* --- LOG AREA --- */}
            <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-4 space-y-[2px] scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent bg-[#09090b] selection:bg-zinc-700 selection:text-white"
            >
                <AnimatePresence initial={false}>
                    {filteredLogs.map((log) => (
                        <LogLine key={log.id} log={log} onCopy={() => handleCopyLine(log.message)} />
                    ))}
                </AnimatePresence>

                {filteredLogs.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-2 opacity-50">
                        <Terminal size={48} strokeWidth={1} />
                        <span className="text-sm">Waiting for logs...</span>
                    </div>
                )}

                <div ref={bottomRef} />
            </div>

            {/* --- FOOTER STATUS --- */}
            <div className="bg-zinc-900 border-t border-white/5 px-4 py-1 text-[10px] text-zinc-500 flex justify-between items-center select-none">
                <span>Total Lines: {logs.length}</span>
                <span>{autoScroll ? 'AUTO-SCROLL' : 'SCROLL LOCKED'}</span>
            </div>
        </div>
    );
}

// --- SUB-COMPONENTS ---

function ControlButton({ onClick, icon, tooltip, active, colorClass = "text-zinc-400 hover:bg-white/5 hover:text-white" }: any) {
    return (
        <button
            onClick={onClick}
            title={tooltip}
            className={clsx(
                "p-2 rounded-lg transition-all duration-200",
                active ? "bg-white/10 text-white" : colorClass
            )}
        >
            {icon}
        </button>
    );
}

function LogLine({ log, onCopy }: { log: any, onCopy: () => void }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        onCopy();
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Determine colors
    const isError = log.type === 'error';
    const isWarn = log.type === 'warn';

    return (
        <div className="group flex items-start gap-3 hover:bg-white/[0.03] py-0.5 px-2 rounded -mx-2 transition-colors">
            {/* Timestamp */}
            <span className="text-zinc-600 text-xs select-none shrink-0 w-[60px] font-medium pt-[2px]">
                {log.time}
            </span>

            {/* Message */}
            <div className={clsx(
                "flex-1 break-words leading-tight text-[13px]",
                isError ? "text-red-400 font-medium" :
                    isWarn ? "text-yellow-400" : "text-zinc-300"
            )}>
                {/* Optional Badge for Type */}
                {isError && <span className="bg-red-500/10 text-red-500 text-[10px] px-1 rounded mr-2 border border-red-500/20">ERROR</span>}
                {isWarn && <span className="bg-yellow-500/10 text-yellow-500 text-[10px] px-1 rounded mr-2 border border-yellow-500/20">WARN</span>}

                {log.message}
            </div>

            {/* Copy Button (Hidden unless hovered) */}
            <button
                onClick={handleCopy}
                className={clsx(
                    "opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-white/10 text-zinc-500 shrink-0",
                    copied ? "text-emerald-500 opacity-100" : ""
                )}
                title="Copy line"
            >
                {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
        </div>
    );
}