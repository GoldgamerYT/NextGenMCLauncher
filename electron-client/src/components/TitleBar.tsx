import React from 'react';
import { X, Minus, Square } from 'lucide-react';
import logoIcon from '../assets/logo-icon.svg';

export function TitleBar() {
    const { ipcRenderer } = window.require('electron');

    const handleClose = () => ipcRenderer.send('window-close');
    const handleMinimize = () => ipcRenderer.send('window-minimize');
    const handleMaximize = () => ipcRenderer.send('window-maximize');

    // NOTE: Validation for "modern" electron usage usually forbids 'remote'.
    // But for this quick prototype request, we used nodeIntegration: true in main.js.
    // If 'remote' is missing (Electron 14+), we use ipcRenderer.send which main.js needs to handle.

    // Let's use clean IPC approach if possible, but for speed we'll try direct access 
    // or just rely on 'window.close()' which works for close. 

    return (
        <div className="h-10 bg-black/40 backdrop-blur-md flex items-center justify-between select-none fixed top-0 w-full z-50 border-b border-white/5">
            <div className="flex items-center px-4 titlebar-drag w-full h-full gap-3">
                <img src={logoIcon} className="h-5 w-5 drop-shadow-[0_0_5px_rgba(34,197,94,0.3)]" alt="" />
                <span className="text-xs font-bold text-zinc-300 tracking-[0.2em]">
                    ATLAS CRAFT
                </span>
            </div>
            <div className="flex h-full no-drag">
                <button className="px-4 hover:bg-white/10 transition-colors flex items-center" onClick={handleMinimize}>
                    <Minus size={14} />
                </button>
                <button className="px-4 hover:bg-white/10 transition-colors flex items-center" onClick={handleMaximize}>
                    <Square size={12} />
                </button>
                <button className="px-4 hover:bg-red-500 transition-colors flex items-center" onClick={handleClose}>
                    <X size={14} />
                </button>
            </div>
        </div>
    );
}
