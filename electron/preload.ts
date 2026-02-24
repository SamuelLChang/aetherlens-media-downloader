import { ipcRenderer, contextBridge } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
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
})
