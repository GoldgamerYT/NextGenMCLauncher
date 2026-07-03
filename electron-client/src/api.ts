import axios from 'axios';

const API_URL = 'http://localhost:35555/api';

// ─── MODELS ───────────────────────────────────────────────────────────────────

export interface Profile {
    name:             string;
    version:          string;
    modLoader:        string;
    ramMb:            number;   // profile-specific max RAM (used when useGlobalRam=false)
    loaderVersion?:   string;
    javaPath?:        string;
    gameDir?:         string;
    iconPath?:        string;
    cardColor?:       string;   // gradient preset key e.g. "blue", "red", null = loader default
    useGlobalRam?:    boolean;  // true = use global RAM defaults (default)
    profileMinRamMb?: number;   // profile-specific min RAM (used when useGlobalRam=false)
}

export interface LauncherSettings {
    autostart:            boolean;
    minimizeAfterLaunch:  boolean;
    sleepModeOnMinimize:  boolean;
    closeAfterLaunch:     boolean;
    language:             string;
    theme:                string;
    animations:           boolean;
    discordRpc:           boolean;
    autoSaveLogs:         boolean;
    autoDeleteLogsDays:   number;
    debugMode:            boolean;
    logLevel:             string;
    defaultInstance:      string;
    consoleBounds?: { x: number | null; y: number | null; width: number; height: number };
}

/** Matches the LogEntry the Java backend returns from GET /api/logs/history */
export interface BackendLogEntry {
    timestamp:  string;  // ISO-8601
    level:      string;  // INFO | WARN | ERROR | DEBUG
    source:     string;  // Launcher | Minecraft | Backend
    instanceId: string | null;
    message:    string;
}

// ─── IPC BRIDGE (Electron-only via contextBridge preload) ────────────────────

/** Returns window.electronAPI exposed by preload.js, or null when running in a browser. */
function ea(): any {
    return (window as any).electronAPI ?? null;
}

export const launcherApi = {
    // Settings
    getSettings:     (): Promise<LauncherSettings>  => ea().getSettings(),
    saveSettings:    (data: LauncherSettings): Promise<boolean> => ea().saveSettings(data),

    // Console window
    openConsoleWindow: (): Promise<void> => ea().openConsoleWindow(),

    // DevTools / paths
    openDevTools:     (): Promise<void>          => ea().openDevTools(),
    openPath:         (p: string): Promise<void> => ea().openPath(p),
    openLogFile:      (): Promise<void>          => ea().openLogFile(),
    openLogsDir:      (): Promise<void>          => ea().openLogsDir(),
    openCrashReports: (): Promise<void>          => ea().openCrashReports(),
    getLogPath:       (): Promise<string>        => ea().getLogPath(),
    getLogsDir:       (): Promise<string>        => ea().getLogsDir(),
    getUserDataPath:  (): Promise<string>        => ea().getUserDataPath(),

    // File pickers
    selectDirectory: (): Promise<string | null> => ea().selectDirectory(),
    selectJava:      (): Promise<string | null> => ea().selectJava(),
    selectLogSave:   (): Promise<string | null> => ea().selectLogSave(),
    saveLogToFile:   (filePath: string, content: string): Promise<boolean> =>
        ea().saveLogToFile(filePath, content),

    // Minecraft lifecycle signals
    notifyMinecraftRunning: (profileName?: string) => ea()?.notifyMinecraftRunning(profileName),
    notifyMinecraftStopped: () => ea()?.notifyMinecraftStopped(),

    // External browser
    openExternal: (url: string) => ea()?.openExternal(url),

    // Discord RPC
    setDiscordActivity: (activity: { playing?: boolean; details: string; state: string; version?: string }) =>
        ea()?.setDiscordActivity(activity),

    // Launcher log events from main process
    onLauncherLog: (cb: (data: { level: string; source: string; message: string }) => void) =>
        ea()?.onLauncherLog(cb),
    offLauncherLog: () =>
        ea()?.offLauncherLog(),
};

// ─── HTTP API ─────────────────────────────────────────────────────────────────

export const api = {
    // ── Profiles ──────────────────────────────────────────────────────────────
    getProfiles: async (): Promise<Profile[]> => {
        const res = await axios.get<Profile[]>(`${API_URL}/profiles`);
        return res.data;
    },

    createProfile: async (p: Profile) => {
        await axios.post(`${API_URL}/profiles`, p);
    },

    updateProfile: async (name: string, p: Profile): Promise<Profile> => {
        const res = await axios.put<Profile>(`${API_URL}/profiles/${encodeURIComponent(name)}`, p);
        return res.data;
    },

    deleteProfile: async (name: string) => {
        await axios.delete(`${API_URL}/profiles/${encodeURIComponent(name)}`);
    },

    duplicateProfile: async (name: string) => {
        await axios.post(`${API_URL}/profiles/${encodeURIComponent(name)}/duplicate`);
    },

    reinstallProfile: async (name: string) => {
        await axios.post(`${API_URL}/profiles/${encodeURIComponent(name)}/reinstall`);
    },

    openFolder: async (name: string) => {
        await axios.post(`${API_URL}/profiles/${encodeURIComponent(name)}/folder`);
    },

    // ── Launch ────────────────────────────────────────────────────────────────
    launch: async (name: string) => {
        const res = await axios.post(`${API_URL}/launch/${encodeURIComponent(name)}`);
        return res.data;
    },

    stop: async (name: string) => {
        const res = await axios.post(`${API_URL}/launch/${encodeURIComponent(name)}`);
        return res.data;
    },

    // ── Versions ──────────────────────────────────────────────────────────────
    getVersions: async (): Promise<string[]> => {
        const res = await axios.get<string[]>(`${API_URL}/versions/game`);
        return res.data;
    },

    getLoaderVersions: async (type: string, version: string): Promise<string[]> => {
        if (type === 'vanilla') return [];
        try {
            const res = await axios.get<string[]>(`${API_URL}/versions/loader/${type}/${version}`);
            return Array.isArray(res.data) ? res.data : [];
        } catch { return []; }
    },

    // ── Config ────────────────────────────────────────────────────────────────
    getConfig: async () => {
        const res = await axios.get(`${API_URL}/config`);
        return res.data;
    },

    updateConfig: async (config: any) => {
        await axios.post(`${API_URL}/config`, config);
    },

    // ── System ────────────────────────────────────────────────────────────────
    getSystemMemory: async (): Promise<number> => {
        try {
            const res = await axios.get(`${API_URL}/system/memory`);
            return parseInt(res.data);
        } catch { return 8192 * 1024 * 1024; }
    },

    getBackendHealth: async () => {
        try {
            const res = await axios.get(`${API_URL}/health`);
            return res.data;
        } catch { return null; }
    },

    checkJava: async (javaPath?: string): Promise<{ ok: boolean; version?: string; error?: string }> => {
        try {
            const url = javaPath
                ? `${API_URL}/java/check?path=${encodeURIComponent(javaPath)}`
                : `${API_URL}/java/check`;
            const res = await axios.get(url);
            return res.data;
        } catch { return { ok: false, error: 'Request failed' }; }
    },

    // ── Logs ──────────────────────────────────────────────────────────────────
    getLogHistory: async (limit = 500): Promise<BackendLogEntry[]> => {
        try {
            const res = await axios.get<BackendLogEntry[]>(`${API_URL}/logs/history?limit=${limit}`);
            return Array.isArray(res.data) ? res.data : [];
        } catch { return []; }
    },

    getInstanceLogHistory: async (name: string): Promise<BackendLogEntry[]> => {
        try {
            const res = await axios.get<BackendLogEntry[]>(`${API_URL}/logs/instance/${name}`);
            return Array.isArray(res.data) ? res.data : [];
        } catch { return []; }
    },

    // ── Account ───────────────────────────────────────────────────────────────
    getAccount: async (): Promise<{ username: string; uuid: string; type: string } | null> => {
        try {
            const res = await axios.get(`${API_URL}/account`);
            return res.data;
        } catch { return null; }
    },

    getAccounts: async (): Promise<{ username: string; uuid: string; type: string; active: boolean }[]> => {
        try {
            const res = await axios.get(`${API_URL}/accounts`);
            return Array.isArray(res.data) ? res.data : [];
        } catch { return []; }
    },

    setActiveAccount: async (uuid: string): Promise<boolean> => {
        try {
            await axios.post(`${API_URL}/accounts/active`, { uuid });
            return true;
        } catch { return false; }
    },

    removeAccount: async (uuid: string): Promise<boolean> => {
        try {
            await axios.delete(`${API_URL}/accounts/${uuid}`);
            return true;
        } catch { return false; }
    },

    // ── Mods ──────────────────────────────────────────────────────────────────
    installMod: async (profileName: string, url: string, fileName: string) => {
        await axios.post(`${API_URL}/profiles/${encodeURIComponent(profileName)}/mods`, { url, fileName });
    },

    getInstalledMods: async (profileName: string): Promise<string[]> => {
        try {
            const res = await axios.get<string[]>(`${API_URL}/profiles/${encodeURIComponent(profileName)}/mods`);
            return res.data;
        } catch { return []; }
    },

    deleteMod: async (profileName: string, fileName: string) => {
        await axios.delete(`${API_URL}/profiles/${encodeURIComponent(profileName)}/mods/${encodeURIComponent(fileName)}`);
    },

    getDetailedMods: async (profileName: string): Promise<{ fileName: string; sha1: string; size: number; enabled: boolean }[]> => {
        const res = await axios.get(`${API_URL}/profiles/${encodeURIComponent(profileName)}/mods/detailed`);
        return res.data;
    },

    toggleMod: async (profileName: string, fileName: string) => {
        await axios.post(`${API_URL}/profiles/${encodeURIComponent(profileName)}/mods/${encodeURIComponent(fileName)}/toggle`);
    },

    openModsFolder: async (profileName: string) => {
        await axios.post(`${API_URL}/profiles/${encodeURIComponent(profileName)}/mods/folder`);
    },

    getModsPath: async (profileName: string): Promise<string> => {
        const res = await axios.get(`${API_URL}/profiles/${encodeURIComponent(profileName)}/mods/path`);
        return res.data;
    },

    importLocalMod: async (profileName: string, sourcePath: string): Promise<string> => {
        const res = await axios.post(`${API_URL}/profiles/${encodeURIComponent(profileName)}/mods/import`, { sourcePath });
        return res.data.fileName;
    },

    // ── Microsoft Auth ────────────────────────────────────────────────────────
    startMicrosoftLogin: async (): Promise<{ userCode: string; verificationUri: string; expiresIn: number }> => {
        const res = await axios.post(`${API_URL}/auth/microsoft/start`);
        return res.data;
    },

    pollMicrosoftLogin: async (): Promise<{ done: boolean; account?: { username: string; uuid: string; type: string } }> => {
        const res = await axios.get(`${API_URL}/auth/microsoft/poll`);
        return res.data;
    },

    logoutAccount: async (): Promise<void> => {
        await axios.delete(`${API_URL}/account`);
    },

    // ── Java Auto-Install ─────────────────────────────────────────────────────
    installJava: async (version: number): Promise<{ ok: boolean; javaPath?: string; error?: string }> => {
        try {
            const res = await axios.post(`${API_URL}/java/install/sync?version=${version}`, {}, { timeout: 180000 });
            return res.data;
        } catch (e: any) {
            return { ok: false, error: e?.message ?? 'Install failed' };
        }
    },

    getInstalledJavas: async (): Promise<{ version: number; path: string }[]> => {
        try {
            const res = await axios.get(`${API_URL}/java/installed`);
            return Array.isArray(res.data) ? res.data : [];
        } catch { return []; }
    },

    // ── File picker (legacy) ──────────────────────────────────────────────────
    pickFile: async (): Promise<string | null> => {
        const electronAPI = (window as any).electronAPI;
        if (electronAPI?.selectImage) return electronAPI.selectImage();
        try {
            const res = await axios.post(`${API_URL}/sys/pick-file`);
            return res.data || null;
        } catch { return null; }
    },
};
