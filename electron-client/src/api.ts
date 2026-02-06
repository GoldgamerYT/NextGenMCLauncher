import axios from 'axios';

const API_URL = "http://localhost:35555/api";

export interface Profile {
    name: string;
    version: string;
    modLoader: string;
    ramMb: number;
    loaderVersion?: string;
    javaPath?: string;
    gameDir?: string;
    iconPath?: string;
}

export const api = {
    getProfiles: async () => {
        const res = await axios.get<Profile[]>(`${API_URL}/profiles`);
        return res.data;
    },

    launch: async (name: string) => {
        const res = await axios.post(`${API_URL}/launch/${name}`);
        return res.data;
    },

    stop: async (name: string) => {
        const res = await axios.post(`${API_URL}/launch/${name}`);
        return res.data;
    },

    getLoaderVersions: async (type: string, version: string): Promise<string[]> => {
        if (type === 'vanilla') return [];
        try {
            const res = await axios.get(`${API_URL}/versions/loader/${type}/${version}`);
            return Array.isArray(res.data) ? res.data : [];
        } catch (e) {
            console.error(e);
            return [];
        }
    },

    deleteProfile: async (name: string) => {
        await axios.delete(`${API_URL}/profiles/${name}`);
    },

    createProfile: async (p: Profile) => {
        await axios.post(`${API_URL}/profiles`, p);
    },

    updateProfile: async (name: string, p: Profile) => {
        await axios.put(`${API_URL}/profiles/${name}`, p);
    },

    openFolder: async (name: string) => {
        await axios.post(`${API_URL}/profiles/${name}/folder`);
    },

    getSystemMemory: async (): Promise<number> => {
        try {
            const res = await axios.get(`${API_URL}/system/memory`);
            return parseInt(res.data);
        } catch (e) {
            return 8192 * 1024 * 1024; // Default to 8GB if fails
        }
    },

    getConfig: async () => {
        const res = await axios.get(`${API_URL}/config`);
        return res.data;
    },

    updateConfig: async (config: any) => {
        await axios.post(`${API_URL}/config`, config);
    },

    getVersions: async () => {
        const res = await axios.get(`${API_URL}/versions/game`);
        return res.data;
    },

    reinstallProfile: async (name: string) => {
        await axios.post(`${API_URL}/profiles/${name}/reinstall`);
    },

    pickFile: async (): Promise<string | null> => {
        // Try Electron IPC (Native Dialog)
        try {
            // @ts-ignore
            if (window.require) {
                // @ts-ignore
                const { ipcRenderer } = window.require('electron');
                return await ipcRenderer.invoke('select-image');
            }
        } catch (e) {
            console.error("Electron IPC unavailable, falling back to API", e);
        }

        // Fallback to Backend (Legacy/Headless)
        try {
            const res = await axios.post(`${API_URL}/sys/pick-file`);
            return res.data || null;
        } catch (e) {
            console.error(e);
            return null;
        }
    },

    installMod: async (profileName: string, url: string, fileName: string) => {
        await axios.post(`${API_URL}/profiles/${profileName}/mods`, { url, fileName });
    },

    getInstalledMods: async (profileName: string): Promise<string[]> => {
        try {
            const res = await axios.get<string[]>(`${API_URL}/profiles/${profileName}/mods`);
            return res.data;
        } catch (e) {
            console.error("Failed to fetch installed mods", e);
            return [];
        }
    },

    deleteMod: async (profileName: string, fileName: string) => {
        await axios.delete(`${API_URL}/profiles/${profileName}/mods/${fileName}`);
    },

    getDetailedMods: async (profileName: string): Promise<{ fileName: string, sha1: string, size: number, enabled: boolean }[]> => {
        const res = await axios.get(`${API_URL}/profiles/${profileName}/mods/detailed`);
        return res.data;
    },

    toggleMod: async (profileName: string, fileName: string) => {
        await axios.post(`${API_URL}/profiles/${profileName}/mods/${fileName}/toggle`);
    }
};
