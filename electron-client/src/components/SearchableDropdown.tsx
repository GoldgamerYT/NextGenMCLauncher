import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Option {
    id: string;
    name: string;
    tag?: string;
}

interface Props {
    options: string[] | Option[];
    value: string;
    onChange: (value: string) => void;
    label?: string;
    placeholder?: string;
    loading?: boolean;
}

export function SearchableDropdown({ options, value, onChange, label, placeholder = "Select...", loading = false }: Props) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Normalize options to Option[]
    const normalizedOptions: Option[] = (Array.isArray(options) ? options : []).map(opt =>
        typeof opt === 'string' ? { id: opt, name: opt } : opt
    );

    const selectedOption = normalizedOptions.find(o => o.id === value);

    const filteredOptions = normalizedOptions.filter(opt =>
        opt.name.toLowerCase().includes(search.toLowerCase()) ||
        opt.id.toLowerCase().includes(search.toLowerCase())
    );

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Focus input on open
    useEffect(() => {
        if (isOpen) {
            setSearch('');
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    return (
        <div className="relative" ref={dropdownRef}>
            {label && <label className="block text-xs font-medium text-gray-400 mb-1">{label}</label>}

            <div
                onClick={() => !loading && setIsOpen(!isOpen)}
                className={`
                    w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white 
                    cursor-pointer flex justify-between items-center transition-all duration-300
                    hover:bg-white/10 hover:border-white/20
                    ${isOpen ? 'ring-1 ring-primary border-primary' : ''}
                `}
            >
                <span className={!selectedOption ? "text-gray-400" : ""}>
                    {loading ? "Loading..." : (selectedOption?.name || placeholder)}
                </span>
                {loading ? <Loader2 size={16} className="animate-spin text-gray-400" /> : <ChevronDown size={16} className={`text-gray-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />}
            </div>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="absolute z-50 top-[calc(100%+8px)] left-0 w-full bg-[#18181b] border border-white/10 rounded-xl shadow-2xl overflow-hidden"
                    >
                        {/* Search Bar */}
                        <div className="p-2 border-b border-white/5 bg-white/[0.02]">
                            <input
                                ref={inputRef}
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search..."
                                className="w-full bg-black/20 border border-transparent rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 placeholder-white/30"
                            />
                        </div>

                        {/* Options List */}
                        <ul className="max-h-56 overflow-y-auto p-1 custom-scrollbar">
                            {filteredOptions.length === 0 ? (
                                <li className="p-3 text-center text-sm text-gray-500">No results found</li>
                            ) : (
                                filteredOptions.map((opt) => (
                                    <li
                                        key={opt.id}
                                        onClick={() => {
                                            onChange(opt.id);
                                            setIsOpen(false);
                                        }}
                                        className={`
                                            px-3 py-2.5 rounded-lg text-sm cursor-pointer flex justify-between items-center group
                                            transition-colors duration-150
                                            ${opt.id === value ? 'bg-blue-500/20 text-blue-400 font-medium' : 'text-gray-300 hover:bg-white/10 hover:text-white'}
                                        `}
                                    >
                                        <span className="truncate mr-2" title={opt.name}>{opt.name}</span>
                                        {opt.tag && (
                                            <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-gray-400 whitespace-nowrap">
                                                {opt.tag}
                                            </span>
                                        )}
                                    </li>
                                ))
                            )}
                        </ul>
                    </motion.div>
                )}
            </AnimatePresence>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background-color: rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background-color: rgba(255, 255, 255, 0.2);
                }
            `}</style>
        </div>
    );
}
