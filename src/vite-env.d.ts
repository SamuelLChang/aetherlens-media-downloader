/// <reference types="vite/client" />

interface Window {
    ipcRenderer?: {
        invoke(channel: string, ...args: any[]): Promise<any>;
        on(channel: string, func: (_event: any, ...args: any[]) => void): any;
        off(channel: string, func: (...args: any[]) => void): void;
        send(channel: string, ...args: any[]): void;
    };
    electronAPI?: {
        // Window controls
        minimize: () => void;
        maximize: () => void;
        close: () => void;
        // Download functions
        getVideoInfo: (url: string, cookiesBrowser?: string) => Promise<any>;
        startDownload: (options: any) => Promise<any>;
        cancelDownload: (id: string) => Promise<any>;
        pauseDownload: (id: string) => Promise<any>;
        resumeDownload: (id: string) => Promise<any>;
        openDownloadsFolder: () => Promise<any>;
        openFolder: (folderPath?: string) => Promise<any>;
        getDownloadLocation: () => Promise<{
            success: boolean;
            data?: {
                path: string;
                defaultPath: string;
                isDefault: boolean;
            };
        }>;
        selectDownloadLocation: () => Promise<{
            success: boolean;
            canceled?: boolean;
            data?: {
                path: string;
                defaultPath: string;
                isDefault: boolean;
            };
        }>;
        pickDownloadLocationOnce: (initialPath?: string) => Promise<{
            success: boolean;
            canceled?: boolean;
            data?: {
                path: string;
            };
        }>;
        resetDownloadLocation: () => Promise<{
            success: boolean;
            data?: {
                path: string;
                defaultPath: string;
                isDefault: boolean;
            };
        }>;
        // Playlist/Channel functions
        getPlaylistInfo: (url: string) => Promise<any>;
        // Search functions
        searchVideos: (query: string, platform: string, count: number) => Promise<any>;
        // Browser cookie functions
        getAvailableBrowsers: () => Promise<any>;
        validateBrowserCookies: (browser: string) => Promise<{
            success: boolean;
            status: 'valid' | 'invalid' | 'unknown';
            isValid: boolean;
            browser: string;
            message: string;
        }>;
        // App info
        getAppInfo: () => Promise<{
            success: boolean;
            data?: {
                version: string;
                electron: string;
                node: string;
            };
        }>;
        checkForUpdates: () => Promise<{
            success: boolean;
            data?: {
                currentVersion: string;
                latestVersion: string;
                updateAvailable: boolean;
                releaseUrl: string;
                publishedAt: string | null;
            };
            error?: string;
        }>;
        getRuntimeDependenciesStatus: () => Promise<{
            success: boolean;
            data?: {
                platform: 'windows' | 'macos' | 'linux';
                dependencies: Array<{
                    id: string;
                    name: string;
                    required: boolean;
                    installed: boolean;
                    installCommand: string;
                    helpUrl: string;
                }>;
            };
        }>;
        openExternalUrl: (url: string) => Promise<{
            success: boolean;
            error?: string;
        }>;
    };
}
