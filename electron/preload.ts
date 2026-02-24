import { ipcRenderer, contextBridge } from 'electron'

const onChannels = new Set([
  'main-process-message',
  'download-progress',
  'download-complete',
  'download-error',
])

const sendChannels = new Set([
  'window-minimize',
  'window-maximize',
  'window-close',
])

const invokeChannels = new Set([
  'get-video-info',
  'start-download',
  'cancel-download',
  'pause-download',
  'resume-download',
  'open-downloads-folder',
  'open-folder',
  'get-download-location',
  'select-download-location',
  'pick-download-location-once',
  'reset-download-location',
  'get-playlist-info',
  'search-videos',
  'get-available-browsers',
  'validate-browser-cookies',
  'get-app-info',
  'check-for-updates',
  'get-runtime-dependencies-status',
  'open-external-url',
  'update-notification-settings',
])

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(channel: string, listener: (event: Electron.IpcRendererEvent, ...args: unknown[]) => void) {
    if (!onChannels.has(channel)) return
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(channel: string, listener: (event: Electron.IpcRendererEvent, ...args: unknown[]) => void) {
    if (!onChannels.has(channel)) return
    return ipcRenderer.off(channel, listener)
  },
  send(channel: string, ...args: unknown[]) {
    if (!sendChannels.has(channel)) return
    return ipcRenderer.send(channel, ...args)
  },
  invoke(channel: string, ...args: unknown[]) {
    if (!invokeChannels.has(channel)) {
      return Promise.reject(new Error(`Blocked IPC invoke channel: ${channel}`))
    }
    return ipcRenderer.invoke(channel, ...args)
  },
})

// Expose window control functions
contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // Download functions
  getVideoInfo: (url: string, cookiesBrowser?: string) => ipcRenderer.invoke('get-video-info', url, cookiesBrowser),
  startDownload: (options: any) => ipcRenderer.invoke('start-download', options),
  cancelDownload: (id: string) => ipcRenderer.invoke('cancel-download', id),
  pauseDownload: (id: string) => ipcRenderer.invoke('pause-download', id),
  resumeDownload: (id: string) => ipcRenderer.invoke('resume-download', id),
  openDownloadsFolder: () => ipcRenderer.invoke('open-downloads-folder'),
  openFolder: (folderPath?: string) => ipcRenderer.invoke('open-folder', folderPath),
  getDownloadLocation: () => ipcRenderer.invoke('get-download-location'),
  selectDownloadLocation: () => ipcRenderer.invoke('select-download-location'),
  pickDownloadLocationOnce: (initialPath?: string) => ipcRenderer.invoke('pick-download-location-once', initialPath),
  resetDownloadLocation: () => ipcRenderer.invoke('reset-download-location'),

  // Playlist/Channel functions
  getPlaylistInfo: (url: string) => ipcRenderer.invoke('get-playlist-info', url),

  // Search functions
  searchVideos: (query: string, platform: string, count: number) =>
    ipcRenderer.invoke('search-videos', query, platform, count),

  // Browser cookie functions (for authentication)
  getAvailableBrowsers: () => ipcRenderer.invoke('get-available-browsers'),
  validateBrowserCookies: (browser: string) => ipcRenderer.invoke('validate-browser-cookies', browser),

  // App info
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),

  // Setup wizard helpers
  getRuntimeDependenciesStatus: () => ipcRenderer.invoke('get-runtime-dependencies-status'),
  openExternalUrl: (url: string) => ipcRenderer.invoke('open-external-url', url),

  // Notification settings
  updateNotificationSettings: (enabled: boolean) => ipcRenderer.invoke('update-notification-settings', enabled),
})
