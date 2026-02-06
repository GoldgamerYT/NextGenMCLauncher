import React, { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { api, Profile } from '../api';
import { SearchableDropdown } from './SearchableDropdown';

interface Props {
    onClose: () => void;
    onCreated: () => void;
}

export function AddProfileModal({ onClose, onCreated }: Props) {
    const [name, setName] = useState('');
    const [version, setVersion] = useState<string>('');
    const [loader, setLoader] = useState('vanilla');
    const [loaderVersion, setLoaderVersion] = useState(''); // Specific loader version

    const [versions, setVersions] = useState<string[]>([]);
    const [loaderVersions, setLoaderVersions] = useState<string[]>([]);

    const [loadingVersions, setLoadingVersions] = useState(false);
    const [loadingLoaders, setLoadingLoaders] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Initial Fetch (Game Versions)
    useEffect(() => {
        setLoadingVersions(true);
        api.getVersions().then((v) => {
            setVersions(v);
            if (v.length > 0) setVersion(v[0]);
        }).finally(() => setLoadingVersions(false));
    }, []);

    // Fetch Loader Versions when Game Version or Type changes
    useEffect(() => {
        if (loader === 'vanilla') {
            setLoaderVersions([]);
            setLoaderVersion('');
            return;
        }

        if (!version) return;

        setLoadingLoaders(true);
        setLoaderVersions([]);
        setLoaderVersion(''); // Reset selection

        api.getLoaderVersions(loader, version).then(v => {
            setLoaderVersions(v);
            if (v.length > 0) setLoaderVersion(v[0]);
        }).finally(() => setLoadingLoaders(false));
    }, [version, loader]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const newProfile: Profile = {
                name,
                version,
                modLoader: loader,
                loaderVersion: loaderVersion, // Include specific version
                ramMb: 4096
            };
            await api.createProfile(newProfile);
            onCreated();
        } catch (e) {
            console.error(e);
        } finally {
            setSubmitting(false);
        }
    };

    const loaderOptions = [
        { id: 'vanilla', name: 'Vanilla' },
        { id: 'fabric', name: 'Fabric', tag: 'Recommended' },
        { id: 'forge', name: 'Forge' },
        { id: 'neoforge', name: 'NeoForge' }
    ];

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="relative bg-zinc-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl"
            >
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">Create Profile</h2>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full transition-colors"><X size={20} /></button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">PROFILE NAME</label>
                        <input
                            autoFocus
                            required
                            value={name}
                            onChange={e => setName(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-primary transition-colors"
                            placeholder="My Awesome Server"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <SearchableDropdown
                                label="GAME VERSION"
                                options={versions}
                                value={version}
                                onChange={setVersion}
                                loading={loadingVersions}
                                placeholder="Select Version"
                            />
                        </div>
                        <div>
                            <SearchableDropdown
                                label="MOD LOADER"
                                options={loaderOptions}
                                value={loader}
                                onChange={setLoader}
                                placeholder="Select Loader"
                            />
                        </div>
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
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg hover:bg-white/5 text-gray-400 transition-colors">Cancel</button>
                        <button
                            type="submit"
                            disabled={submitting || (loader !== 'vanilla' && !loaderVersion)}
                            className="px-6 py-2 bg-white text-black font-bold rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {submitting && <Loader2 size={16} className="animate-spin" />}
                            Create
                        </button>
                    </div>
                </form>
            </motion.div>
        </div>
    );
}
