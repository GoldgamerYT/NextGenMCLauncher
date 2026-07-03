import React from 'react';
import { X, Minus } from 'lucide-react';
import logoIcon from '../assets/logo-icon.svg';

export function TitleBar() {
    const ea = (window as any).electronAPI;

    return (
        <div className="h-10 backdrop-blur-md flex items-center justify-between select-none fixed top-0 w-full z-50 border-b"
            style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', opacity: 0.95 }}>
            <div className="flex items-center px-4 titlebar-drag w-full h-full gap-3">
                <img src={logoIcon} className="h-5 w-5 drop-shadow-[0_0_5px_rgba(34,197,94,0.3)]" alt="" />
                <span className="text-xs font-bold tracking-[0.2em]" style={{ color: 'var(--text-muted)' }}>
                    ATLAS CRAFT
                </span>
            </div>
            <div className="flex h-full no-drag">
                <button
                    className="px-4 hover:bg-white/10 transition-colors flex items-center"
                    style={{ color: 'var(--text-muted)' }}
                    onClick={() => ea?.minimize()}
                    title="Minimize"
                >
                    <Minus size={14} />
                </button>
                <button
                    className="px-4 hover:bg-red-500 hover:text-white transition-colors flex items-center"
                    style={{ color: 'var(--text-muted)' }}
                    onClick={() => ea?.close()}
                    title="Close"
                >
                    <X size={14} />
                </button>
            </div>
        </div>
    );
}
