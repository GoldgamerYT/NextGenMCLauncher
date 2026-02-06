import React, { useState, useEffect } from 'react';
import { Save, HardDrive, Cpu, Settings, Monitor, LayoutGrid } from 'lucide-react';
import { api } from '../api';

export function GlobalSettings() {
    const [ram, setRam] = useState(4096);
    const [gridScale, setGridScale] = useState(1.0);
    const [totalMem, setTotalMem] = useState(8192);
    const [submitting, setSubmitting] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            try {
                const config = await api.getConfig();
                setRam(config.defaultRamMb || 4096);
                setGridScale(config.gridScale || 1.0);

                const mem = await api.getSystemMemory();
                setTotalMem(Math.floor(mem / 1024 / 1024));
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await api.updateConfig({ defaultRamMb: ram, gridScale });
        } catch (e) {
            console.error(e);
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return (
        <div className="flex h-full items-center justify-center text-gray-500 gap-2">
            <Settings className="animate-spin" size={20} /> Loading settings...
        </div>
    );

    return (
        <div className="max-w-3xl mx-auto py-8 px-4">
            <h2 className="text-3xl font-bold mb-8 text-white flex items-center gap-3">
                <Settings className="text-gray-400" size={32} />
                Launcher Settings
            </h2>

            <form onSubmit={handleSave} className="space-y-6">

                {/* --- RAM SECTION --- */}
                <section className="bg-zinc-900/40 border border-white/5 rounded-2xl p-6 lg:p-8 backdrop-blur-sm">
                    <div className="flex items-start justify-between mb-8">
                        <div>
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <Cpu size={20} className="text-blue-400" /> Java Memory (RAM)
                            </h3>
                            <p className="text-sm text-gray-500 mt-1">
                                Standard RAM für <strong>neue Profile</strong>.
                            </p>
                        </div>
                        <div className="text-right">
                            <div className="text-2xl font-bold text-blue-400 font-mono">{ram} MB</div>
                            <div className="text-xs text-gray-500 font-mono">MAX: {Math.round(totalMem / 1024)} GB</div>
                        </div>
                    </div>

                    <FancySlider
                        value={ram}
                        min={2048}
                        max={totalMem}
                        step={128}
                        onChange={(val) => setRam(val)}
                        color="blue"
                    />

                    <div className="flex justify-between text-xs text-gray-600 font-mono mt-3 px-1">
                        <span>2 GB</span>
                        <span>{Math.round(totalMem / 2048)} GB</span>
                        <span>{Math.round(totalMem / 1024)} GB</span>
                    </div>
                </section>

                {/* --- UI SCALE SECTION --- */}
                <section className="bg-zinc-900/40 border border-white/5 rounded-2xl p-6 lg:p-8 backdrop-blur-sm">
                    <div className="flex items-start justify-between mb-8">
                        <div>
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <LayoutGrid size={20} className="text-purple-400" /> Interface Scale
                            </h3>
                            <p className="text-sm text-gray-500 mt-1">
                                Größe der Profilkarten im Dashboard.
                            </p>
                        </div>
                        <div className="text-right">
                            <div className="text-2xl font-bold text-purple-400 font-mono">{Math.round(gridScale * 100)}%</div>
                            <div className="text-xs text-gray-500">ZOOM</div>
                        </div>
                    </div>

                    <FancySlider
                        value={gridScale}
                        min={0.7}
                        max={1.3}
                        step={0.1}
                        onChange={(val) => setGridScale(val)}
                        color="purple"
                    />

                    <div className="relative h-6 mt-3 text-xs text-gray-600 font-mono">
                        <span className="absolute left-0 -translate-x-0">70%</span>
                        <span className="absolute left-1/2 -translate-x-1/2 font-bold text-gray-400">Normal (100%)</span>
                        <span className="absolute right-0 translate-x-0">130%</span>
                    </div>
                </section>

                <div className="pt-4 flex justify-end">
                    <button
                        type="submit"
                        disabled={submitting}
                        className="px-8 py-4 bg-white text-black font-bold rounded-xl hover:bg-gray-200 active:scale-95 transition-all flex items-center gap-2 shadow-[0_0_20px_-5px_rgba(255,255,255,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {submitting ? (
                            <><Settings className="animate-spin" size={20} /> Saving...</>
                        ) : (
                            <><Save size={20} /> Save Changes</>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}

// --- FANCY SLIDER COMPONENT ---

interface SliderProps {
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (val: number) => void;
    color?: 'blue' | 'purple' | 'green';
}

function FancySlider({ value, min, max, step, onChange, color = 'blue' }: SliderProps) {
    const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

    // Color Maps
    const colors = {
        blue: { track: "from-blue-600 to-cyan-400", shadow: "shadow-blue-500/50", border: "border-blue-500" },
        purple: { track: "from-purple-600 to-fuchsia-400", shadow: "shadow-purple-500/50", border: "border-purple-500" },
        green: { track: "from-emerald-600 to-green-400", shadow: "shadow-emerald-500/50", border: "border-emerald-500" },
    };

    const theme = colors[color];

    return (
        <div className="relative h-12 flex items-center group touch-none select-none">
            {/* Track Background */}
            <div className="absolute w-full h-3 bg-black/40 rounded-full overflow-hidden border border-white/5 shadow-inner">
                {/* Optional Grid Pattern or texture inside track */}
            </div>

            {/* Active Fill with Glow */}
            <div
                className={`absolute h-3 rounded-full bg-gradient-to-r ${theme.track} shadow-[0_0_15px_-2px] ${theme.shadow} transition-all duration-75 ease-out`}
                style={{ width: `${percentage}%` }}
            />

            {/* Thumb Knob */}
            <div
                className={`absolute h-7 w-7 bg-zinc-900 rounded-full border-2 ${theme.border} shadow-lg flex items-center justify-center hover:scale-110 active:scale-95 transition-transform cursor-grab active:cursor-grabbing z-10`}
                style={{ left: `calc(${percentage}% - 14px)` }}
            >
                <div className={`w-2 h-2 rounded-full bg-white shadow-[0_0_5px_rgba(255,255,255,0.8)]`} />
            </div>

            {/* Native Invisible Input */}
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="absolute inset-0 w-full opacity-0 cursor-pointer z-20"
            />
        </div>
    );
}