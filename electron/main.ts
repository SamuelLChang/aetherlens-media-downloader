import { app, BrowserWindow, ipcMain, shell, dialog, type OpenDialogOptions } from 'electron'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import * as fsPromises from 'node:fs/promises'

// The built directory structure
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

const UPDATE_REPO_OWNER = 'SamuelLChang';
const UPDATE_REPO_NAME = 'aetherlens-media-downloader';
const LATEST_RELEASE_API_URL = `https://api.github.com/repos/${UPDATE_REPO_OWNER}/${UPDATE_REPO_NAME}/releases/latest`;
const UPDATE_DOWNLOAD_PAGE_URL = 'https://samuellchang.github.io/aetherlens-media-downloader/download/';

let win: BrowserWindow | null

// Store active download processes with their options for resume capability
interface DownloadInfo {
  process: any;
  options: any;
  progress: number;
}
const activeDownloads = new Map<string, DownloadInfo>();
const pendingRetryTimers = new Map<string, NodeJS.Timeout>();
// Store paused downloads (killed but can be resumed)
const pausedDownloads = new Map<string, any>();
// Track intentionally paused downloads (so we don't send error events when killed)
const intentionallyPausedIds = new Set<string>();
// Track intentionally canceled downloads (so we don't emit failure noise after SIGTERM).
const intentionallyCanceledIds = new Set<string>();

const DOWNLOAD_LOCATION_CONFIG_FILE = 'download-location.json';
let customDownloadPath: string | null = null;
let downloadLocationLoaded = false;

const getDownloadLocationConfigPath = () => path.join(app.getPath('userData'), DOWNLOAD_LOCATION_CONFIG_FILE);
const getDefaultDownloadsPath = () => app.getPath('downloads');

const persistDownloadLocation = async (value: string | null) => {
  const configPath = getDownloadLocationConfigPath();
  const payload = { customPath: value };
  await fsPromises.writeFile(configPath, JSON.stringify(payload, null, 2), 'utf-8');
};

const ensureDownloadLocationLoaded = async () => {
  if (downloadLocationLoaded) return;

  downloadLocationLoaded = true;
  const configPath = getDownloadLocationConfigPath();

  try {
    const raw = await fsPromises.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as { customPath?: string | null };

    if (parsed.customPath) {
      await fsPromises.mkdir(parsed.customPath, { recursive: true });
      customDownloadPath = parsed.customPath;
    }
  } catch {
    customDownloadPath = null;
  }
};

const getActiveDownloadsPath = async () => {
  await ensureDownloadLocationLoaded();
  return customDownloadPath || getDefaultDownloadsPath();
};

// Get yt-dlp path - uses bundled or system yt-dlp
const getYtDlpPath = () => {
  // Try to find yt-dlp in common locations
  const possiblePaths = [
    'yt-dlp', // System PATH
    path.join(process.env.APP_ROOT || '', 'bin', 'yt-dlp'),
    path.join(process.env.APP_ROOT || '', 'node_modules', 'yt-dlp-exec', 'bin', 'yt-dlp'),
  ];
  return possiblePaths[0]; // Default to system PATH
};

let aria2Available: boolean | null = null;
let aria2PathCache: string | null = null;
let ffmpegAvailable: boolean | null = null;
let ytDlpAvailable: boolean | null = null;

const getAria2Candidates = (): string[] => {
  const exeName = process.platform === 'win32' ? 'aria2c.exe' : 'aria2c';
  const candidates = [
    path.join(process.resourcesPath, 'bin', exeName),
    path.join(process.env.APP_ROOT || '', 'bin', exeName),
    'aria2c',
  ];

  return candidates;
};

const resolveAria2Path = (): string | null => {
  if (aria2PathCache) return aria2PathCache;

  for (const candidate of getAria2Candidates()) {
    try {
      if (candidate !== 'aria2c' && !fs.existsSync(candidate)) {
        continue;
      }

      const probe = spawnSync(candidate, ['--version'], {
        stdio: 'ignore',
        windowsHide: true,
      });

      if (probe.status === 0) {
        aria2PathCache = candidate;
        return candidate;
      }
    } catch {
      // Try next candidate.
    }
  }

  return null;
};

const isAria2cAvailable = (): boolean => {
  if (aria2Available !== null) return aria2Available;

  aria2Available = Boolean(resolveAria2Path());

  return aria2Available;
};

const isFfmpegAvailable = (): boolean => {
  if (ffmpegAvailable !== null) return ffmpegAvailable;

  try {
    const probe = spawnSync('ffmpeg', ['-version'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    ffmpegAvailable = probe.status === 0;
  } catch {
    ffmpegAvailable = false;
  }

  return ffmpegAvailable;
};

const isYtDlpAvailable = (): boolean => {
  if (ytDlpAvailable !== null) return ytDlpAvailable;

  try {
    const probe = spawnSync(getYtDlpPath(), ['--version'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    ytDlpAvailable = probe.status === 0;
  } catch {
    ytDlpAvailable = false;
  }

  return ytDlpAvailable;
};

const getInstallCommandMap = () => {
  if (process.platform === 'win32') {
    return {
      ytDlp: 'winget install yt-dlp.yt-dlp',
      ffmpeg: 'winget install Gyan.FFmpeg',
      aria2: 'winget install aria2.aria2',
    };
  }

  if (process.platform === 'darwin') {
    return {
      ytDlp: 'brew install yt-dlp',
      ffmpeg: 'brew install ffmpeg',
      aria2: 'brew install aria2',
    };
  }

  return {
    ytDlp: 'Debian/Ubuntu: sudo apt install -y yt-dlp\nFedora: sudo dnf install -y yt-dlp\nArch: sudo pacman -S --needed yt-dlp',
    ffmpeg: 'Debian/Ubuntu: sudo apt install -y ffmpeg\nFedora: sudo dnf install -y ffmpeg\nArch: sudo pacman -S --needed ffmpeg',
    aria2: 'Debian/Ubuntu: sudo apt install -y aria2\nFedora: sudo dnf install -y aria2\nArch: sudo pacman -S --needed aria2',
  };
};

const normalizeVersion = (value: string): string => {
  return value
    .trim()
    .replace(/^v/i, '')
    .replace(/\+.*$/, '');
};

const parseSemver = (value: string): { core: number[]; prerelease?: string } => {
  const normalized = normalizeVersion(value);
  const [corePart, prerelease] = normalized.split('-', 2);
  const core = corePart
    .split('.')
    .map((segment) => Number.parseInt(segment, 10))
    .map((segment) => (Number.isFinite(segment) ? segment : 0));

  while (core.length < 3) {
    core.push(0);
  }

  return {
    core,
    prerelease: prerelease || undefined,
  };
};

const compareSemver = (left: string, right: string): number => {
  const a = parseSemver(left);
  const b = parseSemver(right);

  for (let i = 0; i < 3; i += 1) {
    const delta = a.core[i] - b.core[i];
    if (delta !== 0) return delta;
  }

  if (!a.prerelease && b.prerelease) return 1;
  if (a.prerelease && !b.prerelease) return -1;
  if (!a.prerelease && !b.prerelease) return 0;

  return String(a.prerelease).localeCompare(String(b.prerelease), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
};

const fetchLatestRelease = async (): Promise<{
  tag_name?: string;
  html_url?: string;
  published_at?: string;
}> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(LATEST_RELEASE_API_URL, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `${UPDATE_REPO_NAME}/${app.getVersion()}`,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('No published release found yet.');
      }

      throw new Error(`GitHub API returned ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
};

const clampTurboConnections = (value?: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 8;
  return Math.min(16, Math.max(1, Math.trunc(parsed)));
};

const calculateAdaptiveTurboConnections = (requested?: number): number => {
  const requestedConnections = clampTurboConnections(requested);
  const cpuCount = Math.max(2, os.cpus().length || 2);
  const inFlightDownloads = Math.max(1, activeDownloads.size + 1);

  // Keep per-download concurrency conservative as parallel downloads increase.
  const perDownloadShare = Math.max(2, Math.ceil(requestedConnections / inFlightDownloads));
  const cpuBoundCap = Math.max(4, Math.floor(cpuCount / 2));

  return Math.max(1, Math.min(requestedConnections, perDownloadShare, cpuBoundCap));
};

const clearPendingRetryTimer = (downloadId: string) => {
  const retryTimer = pendingRetryTimers.get(downloadId);
  if (retryTimer) {
    clearTimeout(retryTimer);
    pendingRetryTimers.delete(downloadId);
  }
};

const terminateProcessTree = (proc: any) => {
  const pid = Number(proc?.pid);
  if (!Number.isFinite(pid) || pid <= 0) {
    try {
      proc?.kill?.('SIGTERM');
    } catch {
      // Ignore kill errors.
    }
    return;
  }

  if (process.platform === 'win32') {
    try {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      return;
    } catch {
      // Fall back to direct kill below.
    }
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // Ignore kill errors.
  }
};

const decodeHtmlEntities = (value: string): string => {
  return value
    .replace(/\\\//g, '/')
    .replace(/\\u0026/g, '&')
    .replace(/\\u003d/g, '=')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
};

const sanitizeFileComponent = (value: string): string => {
  return value
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[\x00-\x1f]/g, '')
    .trim();
};

const isGenericStreamTitle = (value?: string): boolean => {
  if (!value) return true;
  const title = value.trim();
  if (!title) return true;

  // Common generic/template titles returned by direct m3u8/mp4 extraction paths.
  if (/^_tpl_/i.test(title)) return true;
  if (/\.(m3u8|mp4|webm)$/i.test(title) && !/\s-\s|\sby\s/i.test(title)) return true;

  return false;
};

const deriveTitleFromUrl = (targetUrl: string): string | undefined => {
  try {
    const parsed = new URL(targetUrl);
    const raw = parsed.pathname.split('/').filter(Boolean).pop() || '';
    if (!raw) return undefined;

    // Remove id-like suffixes frequently used by video sites.
    const withoutIdSuffix = raw
      .replace(/-x[a-zA-Z0-9]{5,}$/i, '')
      .replace(/-[0-9]{6,}$/i, '');

    const decoded = decodeURIComponent(withoutIdSuffix).replace(/[-_]+/g, ' ').trim();
    if (!decoded) return undefined;

    // Title-case rough slug words for better readability.
    return decoded
      .split(' ')
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  } catch {
    return undefined;
  }
};

const shouldUseGenericHtmlFallback = (targetUrl: string): boolean => {
  try {
    const host = new URL(targetUrl).hostname.toLowerCase();

    // Keep extractor-native flows for platforms where yt-dlp extractors are generally reliable.
    const extractorPreferredHosts = [
      'youtube.com',
      'youtu.be',
      'twitter.com',
      'x.com',
      'tiktok.com',
      'vm.tiktok.com',
      'm.tiktok.com',
    ];

    return !extractorPreferredHosts.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return true;
  }
};

const resolveMediaUrl = (candidate: string, pageUrl: string): string => {
  if (!candidate) return '';
  const cleaned = decodeHtmlEntities(candidate.trim());
  try {
    return new URL(cleaned, pageUrl).toString();
  } catch {
    return cleaned;
  }
};

const fetchPageHtml = async (targetUrl: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const { net } = require('electron');
    const request = net.request({
      method: 'GET',
      url: targetUrl,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });

    let data = '';
    request.on('response', (response: any) => {
      response.on('data', (chunk: any) => data += chunk.toString());
      response.on('end', () => resolve(data));
      response.on('error', (err: any) => reject(err));
    });
    request.on('error', (err: any) => reject(err));
    request.end();
  });
};

// Fetch page HTML using yt-dlp --dump-pages with browser cookies.
// Used as a generic fallback when plain HTTP fetch misses gated content.
const fetchPageHtmlWithCookies = async (targetUrl: string, cookiesBrowser: string): Promise<string> => {
  return new Promise((resolve) => {
    const args = [
      '--dump-pages',
      '--no-download',
      '--no-warnings',
      '--cookies-from-browser', cookiesBrowser,
      targetUrl,
    ];
    const proc = spawn(getYtDlpPath(), args);
    let output = '';
    proc.stdout.on('data', (data) => output += data.toString());
    proc.stderr.on('data', () => { }); // Ignore stderr
    proc.on('close', () => resolve(output));
    proc.on('error', () => resolve(''));
  });
};

const extractDirectMediaFromHtml = async (pageUrl: string, cookiesBrowser?: string): Promise<{ mediaUrl?: string; title?: string; thumbnail?: string; videoQualities?: number[]; extractedSources?: Record<string, string> }> => {
  const runExtraction = (html: string) => {
    if (!html) return {};

    const sourceMap = new Map<string, string>();
    const isPreviewLikeMediaUrl = (url: string): boolean => /(preview|trailer|teaser|sample)(?:[_./-]|$)/i.test(url);
    const isImageSidecarUrl = (url: string): boolean => /\.(?:mp4|webm|m3u8)\.(?:jpg|jpeg|png|webp|avif)(?:[?#]|$)/i.test(url);
    const estimateManifestMaxHeight = (mediaUrl: string): number | undefined => {
      const candidates: string[] = [mediaUrl];
      try {
        candidates.push(decodeURIComponent(mediaUrl));
      } catch {
        // Keep raw URL when decodeURIComponent fails on malformed fragments.
      }

      const heights = new Set<number>();
      for (const candidate of candidates) {
        for (const match of candidate.matchAll(/(?:\b|:)(\d{3,4})p(?::|\b)/gi)) {
          const parsed = parseInt(match[1], 10);
          if (Number.isFinite(parsed) && parsed > 0) {
            heights.add(parsed);
          }
        }

        for (const match of candidate.matchAll(/(\d{3,4})x(\d{3,4})/gi)) {
          const parsed = parseInt(match[2], 10);
          if (Number.isFinite(parsed) && parsed > 0) {
            heights.add(parsed);
          }
        }
      }

      if (heights.size > 0) {
        return Math.max(...heights);
      }

      return undefined;
    };

    const shouldReplaceForQuality = (existingUrl: string | undefined, candidateUrl: string): boolean => {
      if (!existingUrl) return true;
      if (isImageSidecarUrl(existingUrl)) return true;
      if (isImageSidecarUrl(candidateUrl)) return false;

      const existingIsManifest = isLikelyAdaptiveManifest(existingUrl);
      const candidateIsManifest = isLikelyAdaptiveManifest(candidateUrl);

      if (candidateIsManifest && !existingIsManifest) return true;
      if (!candidateIsManifest && existingIsManifest) return false;

      const existingHeight = estimateManifestMaxHeight(existingUrl) || estimateMediaHeightFromUrl(existingUrl) || 0;
      const candidateHeight = estimateManifestMaxHeight(candidateUrl) || estimateMediaHeightFromUrl(candidateUrl) || 0;
      if (candidateHeight === existingHeight) {
        const existingPreview = isPreviewLikeMediaUrl(existingUrl);
        const candidatePreview = isPreviewLikeMediaUrl(candidateUrl);
        if (existingPreview !== candidatePreview) {
          return existingPreview && !candidatePreview;
        }
      }

      return candidateHeight > existingHeight;
    };

    const addSource = (rawUrl: string, qualityHint?: string | number) => {
      const resolved = resolveMediaUrl(rawUrl, pageUrl);
      if (!resolved) return;
      if (isImageSidecarUrl(resolved)) return;

      let qualityKey = qualityHint ? String(qualityHint) : '';
      if (!qualityKey) {
        const manifestHeight = estimateManifestMaxHeight(resolved);
        if (manifestHeight) qualityKey = String(manifestHeight);
      }
      if (!qualityKey) {
        const fromUrl = resolved.match(/_(\d{3,4})p_(?:\d+K_)?\d+\.(?:mp4|webm)(?:\?|$)/i) || resolved.match(/_(\d{3,4})p\.(?:mp4|webm)(?:\?|$)/i);
        if (fromUrl?.[1]) qualityKey = fromUrl[1];
      }
      if (!qualityKey) {
        const fromUrl = resolved.match(/\/(\d{3,4})p(?:\.(?:mp4|webm))?(?:\/|\?|$)/i);
        if (fromUrl?.[1]) qualityKey = fromUrl[1];
      }
      if (!qualityKey) qualityKey = 'best';

      const current = sourceMap.get(qualityKey);
      if (!current || shouldReplaceForQuality(current, resolved)) {
        sourceMap.set(qualityKey, resolved);
      }
    };

    // KVS/legacy players may expose sources in flashvars either as
    // `var flashvars = { ... };` or nested as `flashvars: { ... }`.
    const parseFlashvarsBlock = (flashvarsBlock: string) => {
      if (!flashvarsBlock) return;

      const values = new Map<string, string>();
      const keyValueRegex = /["']?([a-z0-9_]+)["']?\s*:\s*(["'])([\s\S]*?)\2/gi;
      let keyValueMatch: RegExpExecArray | null;
      while ((keyValueMatch = keyValueRegex.exec(flashvarsBlock)) !== null) {
        const key = keyValueMatch[1]?.toLowerCase();
        const value = keyValueMatch[3] ? decodeHtmlEntities(keyValueMatch[3]) : '';
        if (key && value) {
          values.set(key, value);
        }
      }

      const getValue = (key: string): string | undefined => values.get(key.toLowerCase());

      const baseUrl = getValue('video_url');
      const baseText = getValue('video_url_text') || '';
      if (baseUrl) {
        const q = baseText.match(/(\d{3,4})p/i)?.[1] || undefined;
        addSource(baseUrl, q);
      }

      for (const [key, value] of values.entries()) {
        const altMatch = key.match(/^video_alt_url(\d*)$/i);
        if (!altMatch) continue;

        const index = altMatch[1] || '';
        const txt = getValue(`video_alt_url${index}_text`) || '';
        const q = txt.match(/(\d{3,4})p/i)?.[1] || undefined;
        addSource(value, q);
      }
    };

    const flashvarsPatterns = [
      /(?:var\s+)?flashvars\s*=\s*\{([\s\S]*?)\}\s*;?/i,
      /flashvars\s*:\s*\{([\s\S]*?)\}\s*[,)]/i,
    ];

    for (const pattern of flashvarsPatterns) {
      const flashvarsMatch = html.match(pattern);
      if (flashvarsMatch?.[1]) {
        parseFlashvarsBlock(flashvarsMatch[1]);
      }
    }

    const mediaPatterns = [
      /<source[^>]+src=["']([^"']+\.(?:m3u8|mp4|webm)(?:\/?(?:\?[^"']*)?)?)(?=["'])/gi,
      /(?:file|video_url|videoUrl|contentUrl)\s*[:=]\s*["']([^"']+\.(?:m3u8|mp4|webm)(?:\/?(?:\?[^"']*)?)?)(?=["'])/gi,
      /https?:\/\/[^"'\s>]+\.(?:m3u8|mp4|webm)(?:\/?(?:\?[^"'\s>]*)?)?(?=["'\s<]|$)/gi,
    ];

    const manifestUrls = new Set<string>();
    let mediaUrl = '';
    for (const pattern of mediaPatterns) {
      const matches = [...html.matchAll(pattern)];
      for (const match of matches) {
        const candidate = resolveMediaUrl(match[1] || match[0], pageUrl);
        if (!candidate) continue;

        addSource(candidate);
        if (/\.m3u8(?:\?|$)/i.test(candidate)) {
          manifestUrls.add(candidate);
        }

        if (!mediaUrl || shouldReplaceForQuality(mediaUrl, candidate)) {
          mediaUrl = candidate;
        }
      }
    }

    // Generic quality-ladder parsing for manifests that expose a multi= ladder.
    for (const manifestUrl of manifestUrls) {
      const multiMatch = manifestUrl.match(/multi=([^/]+)/);
      if (!multiMatch?.[1]) continue;

      const entries = multiMatch[1].split(',').filter(Boolean);
      for (const entry of entries) {
        const parts = entry.match(/(\d+)x(\d+):(\d+)p/);
        if (!parts) continue;

        const height = parseInt(parts[2], 10);
        const label = parts[3];
        const qualityUrl = manifestUrl.replace(/_TPL_/gi, `${label}p`);
        addSource(qualityUrl, height);
      }

      addSource(manifestUrl);
    }

    const qualityEntries = [...sourceMap.entries()]
      .filter(([k]) => /^\d{3,4}$/.test(k))
      .map(([k, v]) => ({ height: parseInt(k, 10), url: v }))
      .sort((a, b) => b.height - a.height);

    const extractedSources: Record<string, string> = {};
    for (const { height, url } of qualityEntries) {
      extractedSources[String(height)] = url;
    }

    const bestSource = qualityEntries[0]?.url || sourceMap.get('best') || mediaUrl;
    if (bestSource) mediaUrl = bestSource;

    if (!mediaUrl) return {};

    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is) || html.match(/property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    const thumbMatch = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i);

    const title = titleMatch ? decodeHtmlEntities((titleMatch[1] || '').trim()) : undefined;
    const thumbnail = thumbMatch?.[1] ? resolveMediaUrl(thumbMatch[1], pageUrl) : undefined;

    return {
      mediaUrl,
      title,
      thumbnail,
      videoQualities: qualityEntries.map((q) => q.height),
      extractedSources,
    };
  };

  try {
    // First attempt: plain HTTP fetch (no cookies).
    const html = await fetchPageHtml(pageUrl);
    const result = runExtraction(html);

    // If we found media, return immediately.
    if (result.mediaUrl) return result;

    // Second attempt: if cookies are available and first fetch yielded nothing
    // (likely an age-gated page), retry with cookie-aware fetch via yt-dlp.
    if (cookiesBrowser) {
      console.log('[extractDirectMedia] No media found without cookies, retrying with browser cookies...');
      const cookieHtml = await fetchPageHtmlWithCookies(pageUrl, cookiesBrowser);
      if (cookieHtml && cookieHtml.length > (html?.length || 0)) {
        const cookieResult = runExtraction(cookieHtml);
        if (cookieResult.mediaUrl) return cookieResult;
      }
    }

    return result; // Return whatever we got (possibly empty).
  } catch (e) {
    return {};
  }
};

const parseRequestedQuality = (quality?: string): number | undefined => {
  if (!quality || quality === 'best') return undefined;
  const parsed = parseInt(quality, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const estimateMediaHeightFromUrl = (mediaUrl?: string): number | undefined => {
  if (!mediaUrl) return undefined;

  const patterns = [
    /[_-](\d{3,4})p(?:[_./?]|$)/i,
    /\b(\d{3,4})p\b/i,
    /\/(\d{3,4})p(?:\.|\/|\?|$)/i,
    /(\d{3,4})P(?:[_./?]|$)/,
  ];

  for (const pattern of patterns) {
    const match = mediaUrl.match(pattern);
    const parsed = match?.[1] ? parseInt(match[1], 10) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return undefined;
};

const chooseDirectFallbackSource = (
  direct: { mediaUrl?: string; extractedSources?: Record<string, string> },
  requestedQuality?: number
): { mediaUrl?: string; estimatedHeight?: number } => {
  const entries = Object.entries(direct.extractedSources || {})
    .map(([key, value]) => ({ height: parseInt(key, 10), url: value }))
    .filter((entry) => Number.isFinite(entry.height) && entry.height > 0 && Boolean(entry.url))
    .sort((a, b) => b.height - a.height);

  if (entries.length > 0) {
    if (requestedQuality) {
      const capped = entries.find((entry) => entry.height <= requestedQuality) || entries[entries.length - 1];
      return { mediaUrl: capped.url, estimatedHeight: capped.height };
    }

    const best = entries[0];
    return { mediaUrl: best.url, estimatedHeight: best.height };
  }

  return {
    mediaUrl: direct.mediaUrl,
    estimatedHeight: estimateMediaHeightFromUrl(direct.mediaUrl),
  };
};

const isLikelyAdaptiveManifest = (mediaUrl?: string): boolean => {
  if (!mediaUrl) return false;

  // Adaptive manifests often include a quality ladder in query/path metadata.
  if (/\.m3u8(?:\?|$)/i.test(mediaUrl)) {
    if (/(multi=|master|variant|playlist)/i.test(mediaUrl)) return true;
    if (/\d{3,4}p:.*\d{3,4}p:/i.test(mediaUrl)) return true;
    return true;
  }

  return false;
};

const shouldUseDirectFallback = (
  requestedQuality: number | undefined,
  estimatedHeight: number | undefined,
  mediaUrl?: string
): boolean => {
  if (isLikelyAdaptiveManifest(mediaUrl)) return true;
  if (!estimatedHeight) return true;

  // Preview streams are commonly <=240p. Keep fallback only when the extracted stream
  // is reasonably useful, while still allowing low-quality explicit requests.
  const minimumAcceptableHeight = requestedQuality ? Math.min(requestedQuality, 480) : 480;
  return estimatedHeight >= minimumAcceptableHeight;
};

const normalizeDirectMediaUrl = (mediaUrl: string): string => {
  // Some pages expose media URLs with a trailing slash after extension, which can break downloads.
  return mediaUrl.replace(/(\.(?:mp4|webm|m3u8))\/(?=(\?|#|$))/i, '$1');
};

const probeDirectMediaUrl = async (mediaUrl: string, referer: string, cookiesBrowser?: string): Promise<boolean> => {
  return new Promise((resolve) => {
    const args = [
      '--no-playlist',
      '--simulate',
      '--no-warnings',
      '--no-check-certificates',
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      '--referer', referer,
      mediaUrl,
    ];

    if (cookiesBrowser) {
      args.splice(args.length - 1, 0, '--cookies-from-browser', cookiesBrowser);
    }

    const probe = spawn(getYtDlpPath(), args);
    let settled = false;

    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve(ok);
    };

    const timeoutId = setTimeout(() => {
      try {
        probe.kill('SIGTERM');
      } catch {
        // Ignore probe kill errors.
      }
      done(false);
    }, 8000);

    probe.on('close', (code) => done(code === 0));
    probe.on('error', () => done(false));
  });
};

interface MediaProbeResult {
  ok: boolean;
  maxHeight?: number;
  ladderCount: number;
  duration?: number;
  unknownHeightFormatIds: string[];
}

interface DownloadSourceCandidate {
  source: 'extractor' | 'direct';
  url: string;
  maxHeight?: number;
  ladderCount: number;
  duration?: number;
  probeOk: boolean;
  previewLike: boolean;
  score: number;
  reasons: string[];
}

interface DownloadFailureClassification {
  transient: boolean;
  geoBlocked: boolean;
  authRelated: boolean;
  message: string;
}

const classifyDownloadFailure = (stderrText: string, code: number | null): DownloadFailureClassification => {
  const text = (stderrText || '').toLowerCase();

  const geoBlocked = /(not available in your country|geo.?restricted|geo.?blocked|this video is unavailable in your country|http error 451)/i.test(text);
  const authRelated = /(sign in|login|cookies|authentication|403 forbidden|http error 401|requested format is not available due to restrictions)/i.test(text);
  const transient = /(timed out|timeout|temporar|connection reset|network is unreachable|name or service not known|proxy error|tls|ssl|429 too many requests|http error 5\d\d|unable to download webpage)/i.test(text);

  if (geoBlocked) {
    return {
      transient: false,
      geoBlocked: true,
      authRelated,
      message: 'Download is geo-restricted for the current network location. Reconnect the same VPN/location used when starting the download, then resume.',
    };
  }

  if (authRelated) {
    return {
      transient,
      geoBlocked: false,
      authRelated: true,
      message: 'Download requires valid session cookies or account access. Revalidate cookie source/browser and retry.',
    };
  }

  if (transient) {
    return {
      transient: true,
      geoBlocked: false,
      authRelated: false,
      message: 'Temporary network problem detected. Auto-retry attempts were used; you can resume to continue from partial data.',
    };
  }

  return {
    transient: false,
    geoBlocked: false,
    authRelated: false,
    message: `Download failed with code ${code}`,
  };
};

const parseYtDlpJsonOutput = (output: string): any | null => {
  if (!output) return null;
  try {
    return JSON.parse(output);
  } catch {
    const firstBrace = output.indexOf('{');
    const lastBrace = output.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return null;
    }

    try {
      return JSON.parse(output.slice(firstBrace, lastBrace + 1));
    } catch {
      return null;
    }
  }
};

const pickBestThumbnailUrl = (info: any): string | undefined => {
  const candidates: Array<{ url: string; score: number }> = [];

  const addCandidate = (url?: string, width?: number, height?: number, preference = 0) => {
    if (!url || !/^https?:\/\//i.test(url)) return;
    const w = Number(width) || 0;
    const h = Number(height) || 0;
    const area = w > 0 && h > 0 ? w * h : 0;
    const extBias = /\.(jpg|jpeg|png)(\?|$)/i.test(url) ? 400000 : 0;
    candidates.push({ url, score: area + extBias + preference });
  };

  addCandidate(info?.thumbnail, info?.thumbnail_width, info?.thumbnail_height, 500000);

  const thumbs = Array.isArray(info?.thumbnails) ? info.thumbnails : [];
  thumbs.forEach((thumb: any) => {
    addCandidate(thumb?.url, thumb?.width, thumb?.height, 0);
  });

  const sorted = candidates.sort((a, b) => b.score - a.score);
  return sorted[0]?.url;
};

const resolveDownloadOutputDir = async (requestedPath?: string): Promise<string> => {
  const fallbackPath = await getActiveDownloadsPath();
  if (!requestedPath) return fallbackPath;

  const trimmed = requestedPath.trim();
  if (!trimmed) return fallbackPath;

  const resolved = path.resolve(trimmed);
  await ensureDirectory(resolved);
  return resolved;
};

const runYtDlpInfoProbe = async (targetUrl: string, referer?: string, cookiesBrowser?: string): Promise<MediaProbeResult> => {
  return new Promise((resolve) => {
    const args = [
      '--no-playlist',
      '--dump-single-json',
      '--no-warnings',
      '--no-check-certificates',
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ];
    if (referer) {
      args.push('--referer', referer);
    }
    if (cookiesBrowser) {
      args.push('--cookies-from-browser', cookiesBrowser);
    }
    args.push(targetUrl);

    const subprocess = spawn(getYtDlpPath(), args);
    let stdout = '';
    let settled = false;

    const done = (value: MediaProbeResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve(value);
    };

    const timeoutId = setTimeout(() => {
      try {
        subprocess.kill('SIGTERM');
      } catch {
        // Ignore kill failures on timeout.
      }
      done({ ok: false, ladderCount: 0, unknownHeightFormatIds: [] });
    }, 12000);

    subprocess.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    subprocess.on('error', () => {
      done({ ok: false, ladderCount: 0, unknownHeightFormatIds: [] });
    });

    subprocess.on('close', (code: number | null) => {
      if (code !== 0) {
        done({ ok: false, ladderCount: 0, unknownHeightFormatIds: [] });
        return;
      }

      const parsed = parseYtDlpJsonOutput(stdout);
      if (!parsed) {
        done({ ok: false, ladderCount: 0, unknownHeightFormatIds: [] });
        return;
      }

      const heights = new Set<number>();
      if (Number.isFinite(parsed.height) && Number(parsed.height) > 0) {
        heights.add(Number(parsed.height));
      }

      const formats = Array.isArray(parsed.formats) ? parsed.formats : [];
      const unknownHeightFormatIds: string[] = [];
      for (const format of formats) {
        const fmtId = typeof format?.format_id === 'string' ? format.format_id : '';
        const rawHeight = Number(format?.height);
        if (Number.isFinite(rawHeight) && rawHeight > 0) {
          heights.add(rawHeight);
          continue;
        }

        const resolution = typeof format?.resolution === 'string' ? format.resolution : '';
        const match = resolution.match(/x(\d{3,4})/);
        if (match?.[1]) {
          const parsedHeight = parseInt(match[1], 10);
          if (Number.isFinite(parsedHeight) && parsedHeight > 0) {
            heights.add(parsedHeight);
            continue;
          }
        }

        const protocol = String(format?.protocol || '').toLowerCase();
        const adaptiveHints = [
          String(format?.manifest_url || ''),
          String(format?.format_id || ''),
          String(format?.format_note || ''),
          String(format?.format || ''),
          protocol,
        ].join(' ').toLowerCase();

        const likelyAdaptiveUnknown =
          Boolean(format?.manifest_url)
          || /(m3u8|hls|dash|mpd|manifest|adaptive|auto)/i.test(adaptiveHints)
          || /(m3u8|dash|mpd|ism)/i.test(protocol);

        // Only treat unknown-height formats as adaptive candidates when we
        // actually see manifest/adaptive hints; plain IDs like "LQ" should not
        // override known higher-quality formats.
        if (fmtId && likelyAdaptiveUnknown) {
          unknownHeightFormatIds.push(fmtId);
        }
      }

      const sortedHeights = [...heights].sort((a, b) => b - a);
      done({
        ok: true,
        maxHeight: sortedHeights[0],
        ladderCount: sortedHeights.length,
        unknownHeightFormatIds,
        duration: Number.isFinite(Number(parsed.duration)) ? Number(parsed.duration) : undefined,
      });
    });
  });
};

const isLikelyPreviewSource = (
  candidateUrl: string,
  candidateProbe: MediaProbeResult,
  requestedQuality: number | undefined,
  extractorProbe: MediaProbeResult
): boolean => {
  const lowerUrl = candidateUrl.toLowerCase();
  if (/(preview|trailer|sample|teaser|thumb|sprite)/i.test(lowerUrl)) {
    return true;
  }

  const candidateHeight = candidateProbe.maxHeight || 0;
  const extractorHeight = extractorProbe.maxHeight || 0;
  const qualityExpectation = requestedQuality || extractorHeight;

  if (candidateHeight > 0 && qualityExpectation > 0) {
    const minimumUsefulHeight = Math.min(qualityExpectation, 720);
    if (candidateHeight < minimumUsefulHeight && extractorHeight >= minimumUsefulHeight) {
      return true;
    }
  }

  if (
    candidateHeight > 0 &&
    extractorHeight >= 1080 &&
    candidateHeight + 240 <= extractorHeight &&
    candidateProbe.ladderCount <= 1 &&
    extractorProbe.ladderCount >= 3
  ) {
    return true;
  }

  return false;
};

const scoreDownloadSourceCandidate = (
  candidate: DownloadSourceCandidate,
  requestedQuality: number | undefined,
  expectedDuration?: number
): number => {
  let score = 0;

  if (!candidate.probeOk) {
    return -100000;
  }

  score += (candidate.maxHeight || 0) * 10;
  score += Math.min(candidate.ladderCount, 8) * 60;

  if (candidate.duration && expectedDuration && expectedDuration > 0) {
    const deltaRatio = Math.abs(candidate.duration - expectedDuration) / expectedDuration;
    if (deltaRatio <= 0.08) {
      score += 220;
    } else if (deltaRatio <= 0.2) {
      score += 90;
    } else {
      score -= 700;
    }
  }

  if (candidate.source === 'extractor') {
    score += 40;
  }

  if (requestedQuality && candidate.maxHeight) {
    if (candidate.maxHeight >= requestedQuality) {
      score += 100;
    } else {
      score -= (requestedQuality - candidate.maxHeight) * 2;
    }
  }

  if (candidate.previewLike) {
    score -= 1200;
  }

  return score;
};

const getStagingDir = () => path.join(app.getPath('temp'), 'aetherlens-staging');

const ensureDirectory = async (dirPath: string) => {
  await fsPromises.mkdir(dirPath, { recursive: true });
};

const cleanStagedArtifacts = async (downloadId: string, stagingDir: string) => {
  try {
    await ensureDirectory(stagingDir);
    const prefix = `${downloadId}_`;
    const names = await fsPromises.readdir(stagingDir);
    const targets = names.filter((name) => name.startsWith(prefix));

    await Promise.all(targets.map(async (name) => {
      try {
        await fsPromises.unlink(path.join(stagingDir, name));
      } catch {
        // Ignore cleanup errors for already-removed files.
      }
    }));
  } catch {
    // Ignore staging cleanup errors.
  }
};

const moveFileWithFallback = async (sourcePath: string, destinationPath: string) => {
  try {
    await fsPromises.rename(sourcePath, destinationPath);
  } catch (error: any) {
    if (error?.code !== 'EXDEV') throw error;
    await fsPromises.copyFile(sourcePath, destinationPath);
    await fsPromises.unlink(sourcePath);
  }
};

const uniqueDestinationPath = async (baseDir: string, fileName: string) => {
  const ext = path.extname(fileName);
  const stem = path.basename(fileName, ext);

  let candidate = path.join(baseDir, fileName);
  let counter = 1;
  while (true) {
    try {
      await fsPromises.access(candidate);
      candidate = path.join(baseDir, `${stem} (${counter})${ext}`);
      counter += 1;
    } catch {
      return candidate;
    }
  }
};

const finalizeStagedDownload = async (
  downloadId: string,
  stagingDir: string,
  downloadsDir: string,
  options?: { includeImages?: boolean }
) => {
  await ensureDirectory(stagingDir);
  const prefix = `${downloadId}_`;
  const names = await fsPromises.readdir(stagingDir);

  const sidecarImageExts = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);

  // Move only completed artifacts; skip temp/partial metadata files.
  const completed = names.filter((name) => {
    if (!name.startsWith(prefix)) return false;
    const lower = name.toLowerCase();
    if (lower.includes('.part') || lower.endsWith('.ytdl') || lower.endsWith('.temp') || lower.endsWith('.tmp')) {
      return false;
    }

    // Keep thumbnail sidecars transient in staging; embedding is done by yt-dlp/ffmpeg.
    const ext = path.extname(lower);
    if (!options?.includeImages && sidecarImageExts.has(ext)) {
      return false;
    }

    return true;
  });

  if (completed.length === 0) {
    return;
  }

  await Promise.all(completed.map(async (name) => {
    const sourcePath = path.join(stagingDir, name);
    const outputName = name.substring(prefix.length) || name;
    const destinationPath = await uniqueDestinationPath(downloadsDir, outputName);
    await moveFileWithFallback(sourcePath, destinationPath);
  }));

  // Remove leftovers for this download after moving final artifacts.
  await cleanStagedArtifacts(downloadId, stagingDir);
};

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    icon: path.join(process.env.VITE_PUBLIC || '', 'branding', 'icon-256.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    },
    backgroundColor: '#09090b',
  })

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// ==================== WINDOW CONTROLS ====================
ipcMain.on('window-minimize', () => {
  win?.minimize();
});

ipcMain.on('window-maximize', () => {
  if (win?.isMaximized()) {
    win.unmaximize();
  } else {
    win?.maximize();
  }
});

ipcMain.on('window-close', () => {
  win?.close();
});

// ==================== VIDEO INFO ====================
// ==================== VIDEO INFO ====================
ipcMain.handle('get-video-info', async (_event, url: string, cookiesBrowser?: string) => {
  return new Promise(async (resolve) => {
    // Initial standard yt-dlp call
    const runYtDlp = (targetUrl: string, referer?: string): Promise<any> => {
      return new Promise((resolveInner) => {
        const args = [
          '--no-playlist',
          '--dump-single-json',
          '--no-warnings',
          '--no-check-certificates',
          '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ];
        if (referer) args.push('--referer', referer);
        if (cookiesBrowser) args.push('--cookies-from-browser', cookiesBrowser);
        args.push(targetUrl);

        const ytdlp = spawn(getYtDlpPath(), args);

        let output = '';
        let errorOutput = '';

        ytdlp.stdout.on('data', (data) => {
          output += data.toString();
        });

        ytdlp.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });

        ytdlp.on('close', (code) => {
          if (code === 0 && output) {
            try {
              resolveInner({ success: true, data: JSON.parse(output) });
            } catch (e) {
              // Some sites return extra lines around JSON; try to recover a JSON object from stdout.
              const firstBrace = output.indexOf('{');
              const lastBrace = output.lastIndexOf('}');
              if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                try {
                  const extracted = output.slice(firstBrace, lastBrace + 1);
                  resolveInner({ success: true, data: JSON.parse(extracted) });
                  return;
                } catch (_recoverErr) {
                  // Continue to return normal parse failure below.
                }
              }
              resolveInner({ success: false, error: 'Failed to parse JSON' });
            }
          } else {
            resolveInner({ success: false, error: errorOutput || 'Failed to fetch info' });
          }
        });
      });
    };

    // Helper to process formats and resolving the final promise
    const processAndResolve = (info: any) => {
      const durationSeconds = Number(info.duration) || 0;

      const estimateFormatBytes = (format: any): number => {
        const directSize = Number(format.filesize || format.filesize_approx || 0);
        if (Number.isFinite(directSize) && directSize > 0) {
          return directSize;
        }

        // tbr/abr is usually in Kbit/s in yt-dlp output.
        const totalBitrateKbps = Number(format.tbr || format.vbr || format.abr || 0);
        if (durationSeconds > 0 && Number.isFinite(totalBitrateKbps) && totalBitrateKbps > 0) {
          return Math.round((totalBitrateKbps * 1000 / 8) * durationSeconds);
        }

        return 0;
      };

      const heuristicBitrateForHeight = (height: number): number => {
        if (height >= 2160) return 16000;
        if (height >= 1440) return 9000;
        if (height >= 1080) return 5500;
        if (height >= 720) return 2800;
        if (height >= 480) return 1400;
        if (height >= 360) return 900;
        if (height >= 240) return 500;
        return 280;
      };

      // Extract available formats and derive height if missing
      const formats = info.formats?.map((f: any) => {
        let height = f.height;

        // Try to derive height if missing
        if (!height) {
          if (f.resolution) {
            const match = f.resolution.match(/x(\d+)/);
            if (match) height = parseInt(match[1]);
          }
          if (!height && f.format_note) {
            const match = f.format_note.match(/(\d{3,4})p/);
            if (match) height = parseInt(match[1]);
          }
        }

        return {
          format_id: f.format_id,
          ext: f.ext,
          quality: f.format_note || (height ? `${height}p` : 'audio'),
          filesize: f.filesize || f.filesize_approx,
          vcodec: f.vcodec,
          acodec: f.acodec,
          height: height,
          tbr: f.tbr,
          vbr: f.vbr,
          abr: f.abr,
          // Keep original resolution for reference if needed
          resolution: f.resolution
        };
      }) || [];

      // Get unique video qualities
      const videoQualities: number[] = [...new Set(formats
        .filter((f: any) => f.height && (f.vcodec !== 'none' || f.height > 0))
        .map((f: any) => f.height)
      )].map((v: any) => Number(v)).filter((v: number) => Number.isFinite(v)).sort((a, b) => b - a);

      // Derive an estimated filesize per quality (best known filesize for each height).
      const qualitySizeMap: Record<string, number> = {};

      const bestAudioBytes = formats
        .filter((f: any) => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'))
        .map((f: any) => estimateFormatBytes(f))
        .reduce((max: number, value: number) => Math.max(max, value), 0);

      videoQualities.forEach((height: number) => {
        const key = String(height);

        const bestVideoBytes = formats
          .filter((f: any) => f.height === height && f.vcodec && f.vcodec !== 'none')
          .map((f: any) => estimateFormatBytes(f))
          .reduce((max: number, value: number) => Math.max(max, value), 0);

        let estimate = bestVideoBytes + bestAudioBytes;

        // If metadata is incomplete, provide a duration + resolution based estimate.
        if (estimate <= 0 && durationSeconds > 0) {
          const combinedBitrateKbps = heuristicBitrateForHeight(height) + 128;
          estimate = Math.round((combinedBitrateKbps * 1000 / 8) * durationSeconds);
        }

        if (estimate > 0) {
          qualitySizeMap[key] = estimate;
        }
      });

      resolve({
        success: true,
        data: {
          id: info.id,
          title: info.title,
          thumbnail: info.thumbnail,
          duration: Number(info.duration) || 0,
          uploader: info.uploader || info.channel,
          view_count: info.view_count,
          upload_date: info.upload_date,
          description: info.description?.substring(0, 200),
          webpage_url: info.webpage_url || url,
          extractor: info.extractor_key || info.extractor,
          videoQualities,
          videoQualitySizes: qualitySizeMap,
          hasAudio: formats.some((f: any) => f.acodec && f.acodec !== 'none'),
          // Pass through HTML-extracted direct sources when available
          ...(info._directExtractedSources ? {
            extractedSources: info._directExtractedSources,
            extractedUrl: info._directMediaUrl,
          } : {}),
        }
      });
    };

    // 1) Standard extraction via yt-dlp extractor.
    let result: any = await runYtDlp(url);
    const initialTitle = result.success ? result.data?.title : undefined;

    const weakGenericSuccess = result.success && (
      !result.data?.formats ||
      result.data.formats.length === 0 ||
      ((result.data.extractor_key || result.data.extractor) === 'generic' && !result.data?.duration)
    );

    if ((!result.success || weakGenericSuccess) && shouldUseGenericHtmlFallback(url)) {
      // 2) Generic HTML media extraction, then try yt-dlp on the extracted direct URL.
      const direct = await extractDirectMediaFromHtml(url, cookiesBrowser);
      if (direct.mediaUrl) {
        const directResult = await runYtDlp(direct.mediaUrl, url);
        if (directResult.success) {
          directResult.data.webpage_url = url;
          // Keep title from original-link extraction to avoid page-source mismatch.
          if (direct.thumbnail && !directResult.data.thumbnail) {
            directResult.data.thumbnail = direct.thumbnail;
          }

          result = directResult;
        } else {
          // 3) Final fallback: return direct source details for the downloader pipeline.
          resolve({
            success: true,
            data: {
              id: `direct_${Date.now()}`,
              title: deriveTitleFromUrl(url) || 'Direct media source',
              thumbnail: direct.thumbnail,
              duration: 0,
              uploader: new URL(url).hostname,
              description: 'Video stream extracted directly from page source',
              webpage_url: url,
              extractor: 'html-direct',
              videoQualities: direct.videoQualities || [],
              hasAudio: true,
              extractedUrl: direct.mediaUrl,
              extractedSources: direct.extractedSources || {},
            }
          });
          return;
        }
      }
    }

    // 4) Even when yt-dlp succeeded, also run HTML extraction to discover
    // additional quality tiers (e.g. 4K m3u8 streams=
    // yt-dlp's extractor may not expose.
    if (result.success && /^https?:\/\//i.test(url) && shouldUseGenericHtmlFallback(url)) {
      try {
        const supplementary = await extractDirectMediaFromHtml(url, cookiesBrowser);
        if (supplementary.extractedSources && Object.keys(supplementary.extractedSources).length > 0) {
          // Attach extracted sources so processAndResolve and the download
          // handler can use them.
          result.data._directExtractedSources = supplementary.extractedSources;
          result.data._directMediaUrl = supplementary.mediaUrl;

          // Merge extracted qualities into yt-dlp's format list so
          // the UI quality selector shows all available tiers.
          const existingFormats = Array.isArray(result.data.formats) ? result.data.formats : [];
          const existingHeights = new Set<number>(
            existingFormats
              .map((f: any) => Number(f.height))
              .filter((h: number) => Number.isFinite(h) && h > 0)
          );

          for (const [heightStr, streamUrl] of Object.entries(supplementary.extractedSources)) {
            const height = parseInt(heightStr, 10);
            if (Number.isFinite(height) && height > 0 && !existingHeights.has(height)) {
              // Inject a synthetic format entry so processAndResolve picks it up.
              existingFormats.push({
                format_id: `html-direct-${height}p`,
                ext: 'mp4',
                format_note: `${height}p`,
                height,
                vcodec: 'unknown',
                acodec: 'unknown',
                url: streamUrl,
              });
              existingHeights.add(height);
            }
          }
          result.data.formats = existingFormats;

          console.log('[get-video-info] Merged HTML-extracted qualities:', Object.keys(supplementary.extractedSources));
        }
      } catch (e) {
        // Non-fatal: HTML extraction is best-effort supplementary data.
        console.warn('[get-video-info] Supplementary HTML extraction failed:', e);
      }
    }

    if (result.success) {
      if (isGenericStreamTitle(result.data?.title)) {
        const fallbackTitleCandidates = [
          initialTitle,
          deriveTitleFromUrl(url),
        ];

        const fallbackTitle = fallbackTitleCandidates.find((candidate) => !isGenericStreamTitle(candidate));
        if (fallbackTitle) {
          result.data.title = fallbackTitle;
        }
      }

      processAndResolve(result.data);
    } else {
      resolve(result);
    }
  });
});

// ==================== PLAYLIST/CHANNEL INFO ====================
ipcMain.handle('get-playlist-info', async (_event, url: string) => {
  return new Promise((resolve) => {
    const ytdlp = spawn(getYtDlpPath(), [
      '--dump-single-json',
      '--flat-playlist',
      '--no-warnings',
      '--no-check-certificates',
      url
    ]);

    let output = '';
    let errorOutput = '';

    ytdlp.stdout.on('data', (data) => {
      output += data.toString();
    });

    ytdlp.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    ytdlp.on('close', (code) => {
      if (code === 0 && output) {
        try {
          const info = JSON.parse(output);

          // Check if it's a playlist
          const isPlaylist = info._type === 'playlist' || info.entries;

          if (isPlaylist && info.entries) {
            const videos = info.entries.map((entry: any) => ({
              id: entry.id,
              title: entry.title,
              thumbnail: entry.thumbnail || entry.thumbnails?.[0]?.url,
              duration: entry.duration,
              url: entry.url || entry.webpage_url || `https://www.youtube.com/watch?v=${entry.id}`,
              filesize_approx: entry.filesize_approx || entry.filesize || null,
            }));

            resolve({
              success: true,
              data: {
                isPlaylist: true,
                id: info.id,
                title: info.title,
                thumbnail: info.thumbnail || info.thumbnails?.[0]?.url,
                uploader: info.uploader || info.channel,
                videoCount: videos.length,
                videos,
              }
            });
          } else {
            // Single video, return as single-item playlist
            resolve({
              success: true,
              data: {
                isPlaylist: false,
                id: info.id,
                title: info.title,
                thumbnail: info.thumbnail,
                uploader: info.uploader || info.channel,
                videoCount: 1,
                videos: [{
                  id: info.id,
                  title: info.title,
                  thumbnail: info.thumbnail,
                  duration: info.duration,
                  url: info.webpage_url || url,
                  filesize_approx: info.filesize_approx || info.filesize || null,
                }],
              }
            });
          }
        } catch (e: any) {
          resolve({
            success: false,
            error: 'Failed to parse playlist information'
          });
        }
      } else {
        resolve({
          success: false,
          error: errorOutput || 'Failed to fetch playlist information'
        });
      }
    });

    ytdlp.on('error', (err) => {
      resolve({
        success: false,
        error: err.message || 'yt-dlp not found'
      });
    });
  });
});

// ==================== SEARCH VIDEOS ====================
ipcMain.handle('search-videos', async (_event, query: string, platform: string = 'youtube', count: number = 20) => {
  return new Promise((resolve) => {
    // Generic search strategy
    const searchQuery = `ytsearch${count}:${query}`;

    const ytdlp = spawn(getYtDlpPath(), [
      '--dump-single-json',
      '--flat-playlist',
      '--no-warnings',
      '--no-check-certificates',
      searchQuery
    ]);

    let output = '';
    let errorOutput = '';

    ytdlp.stdout.on('data', (data) => {
      output += data.toString();
    });

    ytdlp.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    ytdlp.on('close', (code) => {
      if (code === 0 && output) {
        try {
          const info = JSON.parse(output);

          const results = (info.entries || []).map((entry: any) => ({
            id: entry.id,
            title: entry.title,
            thumbnail: entry.thumbnail || entry.thumbnails?.[0]?.url,
            duration: entry.duration,
            uploader: entry.uploader || entry.channel,
            view_count: entry.view_count,
            url: entry.url || entry.webpage_url || `https://www.youtube.com/watch?v=${entry.id}`,
            filesize_approx: entry.filesize_approx || entry.filesize || null,
            platform,
          }));

          resolve({
            success: true,
            data: {
              query,
              platform,
              results,
            }
          });
        } catch (e: any) {
          resolve({
            success: false,
            error: 'Failed to parse search results'
          });
        }
      } else {
        resolve({
          success: false,
          error: errorOutput || 'Search failed'
        });
      }
    });

    ytdlp.on('error', (err) => {
      resolve({
        success: false,
        error: err.message || 'yt-dlp not found'
      });
    });
  });
});

// ==================== BROWSER COOKIES ====================
ipcMain.handle('get-available-browsers', async () => {
  // Return list of commonly supported browsers
  return {
    success: true,
    browsers: [
      { id: 'chrome', name: 'Google Chrome' },
      { id: 'firefox', name: 'Mozilla Firefox' },
      { id: 'edge', name: 'Microsoft Edge' },
      { id: 'brave', name: 'Brave' },
      { id: 'opera', name: 'Opera' },
      { id: 'chromium', name: 'Chromium' },
    ]
  };
});

ipcMain.handle('validate-browser-cookies', async (_event, browser: string) => {
  return new Promise((resolve) => {
    let settled = false;

    const finalize = (payload: {
      success: boolean;
      status: 'valid' | 'invalid' | 'unknown';
      isValid: boolean;
      browser: string;
      message: string;
    }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve(payload);
    };

    // Try to access a YouTube video that requires login to check if cookies work
    const ytdlp = spawn(getYtDlpPath(), [
      '--cookies-from-browser', browser,
      '--dump-single-json',
      '--no-download',
      '--no-warnings',
      'https://www.youtube.com/feed/subscriptions' // This page requires login
    ]);

    let output = '';
    let errorOutput = '';

    ytdlp.stdout.on('data', (data) => {
      output += data.toString();
    });

    ytdlp.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    ytdlp.on('close', (code) => {
      const normalizedError = errorOutput.toLowerCase();

      if (code === 0) {
        finalize({
          success: true,
          status: 'valid',
          isValid: true,
          browser,
          message: 'Cookies are valid'
        });
        return;
      }

      const looksInvalid =
        normalizedError.includes('login') ||
        normalizedError.includes('cookies') ||
        normalizedError.includes('not found') ||
        normalizedError.includes('permission');

      finalize({
        success: looksInvalid,
        status: looksInvalid ? 'invalid' : 'unknown',
        isValid: false,
        browser,
        message: looksInvalid
          ? 'Could not validate cookies'
          : 'Cookie validation was inconclusive'
      });
    });

    ytdlp.on('error', () => {
      finalize({
        success: false,
        status: 'unknown',
        isValid: false,
        browser,
        message: 'Failed to validate cookies'
      });
    });

    // Timeout after 10 seconds
    const timeoutId = setTimeout(() => {
      try {
        ytdlp.kill();
      } catch (e) { }
      finalize({
        success: true,
        status: 'unknown',
        isValid: false,
        browser,
        message: 'Cookie validation timed out; status unknown'
      });
    }, 10000);
  });
});

ipcMain.handle('get-app-info', async () => {
  return {
    success: true,
    data: {
      version: app.getVersion(),
      electron: process.versions.electron,
      node: process.versions.node,
    }
  };
});

ipcMain.handle('check-for-updates', async () => {
  try {
    const currentVersion = normalizeVersion(app.getVersion());
    const latestRelease = await fetchLatestRelease();
    const latestVersion = normalizeVersion(latestRelease.tag_name || '');

    if (!latestVersion) {
      return {
        success: false,
        error: 'Latest release version could not be determined.',
      };
    }

    const updateAvailable = compareSemver(currentVersion, latestVersion) < 0;

    return {
      success: true,
      data: {
        currentVersion,
        latestVersion,
        updateAvailable,
        releaseUrl: UPDATE_DOWNLOAD_PAGE_URL,
        publishedAt: latestRelease.published_at || null,
      }
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'Failed to check for updates.',
    };
  }
});

ipcMain.handle('get-download-location', async () => {
  const activePath = await getActiveDownloadsPath();
  const defaultPath = getDefaultDownloadsPath();

  return {
    success: true,
    data: {
      path: activePath,
      defaultPath,
      isDefault: activePath === defaultPath,
    }
  };
});

ipcMain.handle('select-download-location', async () => {
  const currentPath = await getActiveDownloadsPath();

  const pickerOptions: OpenDialogOptions = {
    title: 'Choose download folder',
    defaultPath: currentPath,
    properties: ['openDirectory', 'createDirectory'],
  };

  const result = win
    ? await dialog.showOpenDialog(win, pickerOptions)
    : await dialog.showOpenDialog(pickerOptions);

  if (result.canceled || result.filePaths.length === 0) {
    return {
      success: true,
      canceled: true,
      data: {
        path: currentPath,
        defaultPath: getDefaultDownloadsPath(),
        isDefault: currentPath === getDefaultDownloadsPath(),
      }
    };
  }

  const selectedPath = result.filePaths[0];
  await fsPromises.mkdir(selectedPath, { recursive: true });
  customDownloadPath = selectedPath;
  await persistDownloadLocation(customDownloadPath);

  return {
    success: true,
    canceled: false,
    data: {
      path: selectedPath,
      defaultPath: getDefaultDownloadsPath(),
      isDefault: selectedPath === getDefaultDownloadsPath(),
    }
  };
});

ipcMain.handle('pick-download-location-once', async (_event, initialPath?: string) => {
  const fallbackPath = await getActiveDownloadsPath();
  const defaultPath = initialPath && initialPath.trim() ? initialPath : fallbackPath;

  const pickerOptions: OpenDialogOptions = {
    title: 'Choose folder for this download',
    defaultPath,
    properties: ['openDirectory', 'createDirectory'],
  };

  const result = win
    ? await dialog.showOpenDialog(win, pickerOptions)
    : await dialog.showOpenDialog(pickerOptions);

  if (result.canceled || result.filePaths.length === 0) {
    return {
      success: true,
      canceled: true,
      data: {
        path: defaultPath,
      }
    };
  }

  const selectedPath = result.filePaths[0];
  await ensureDirectory(selectedPath);

  return {
    success: true,
    canceled: false,
    data: {
      path: selectedPath,
    }
  };
});

ipcMain.handle('reset-download-location', async () => {
  customDownloadPath = null;
  await persistDownloadLocation(null);

  return {
    success: true,
    data: {
      path: getDefaultDownloadsPath(),
      defaultPath: getDefaultDownloadsPath(),
      isDefault: true,
    }
  };
});

// Download helper using net library (better for Electron main process)
const downloadFile = async (
  fileUrl: string,
  outputPath: string,
  downloadId: string,
  win: BrowserWindow | null,
  headers?: Record<string, string>,
  registerAbort?: (abort: () => void) => void
): Promise<boolean> => {
  const { net } = require('electron');
  const fs = require('fs');

  return new Promise((resolve) => {
    let activeRequest: any;
    let activeFileStream: any;
    let aborted = false;
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    const abort = () => {
      if (aborted || settled) return;
      aborted = true;
      try {
        activeRequest?.abort?.();
      } catch {
        // Ignore abort errors.
      }
      try {
        activeFileStream?.destroy?.();
      } catch {
        // Ignore stream destroy errors.
      }
      finish(false);
    };

    registerAbort?.(abort);

    const startRequest = (target: string) => {
      if (aborted) {
        finish(false);
        return;
      }

      const request = net.request({
        method: 'GET',
        url: target,
        headers,
      });
      activeRequest = request;

      request.on('response', (response: any) => {
        // Handle redirects
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          const redirectUrl = Array.isArray(response.headers.location)
            ? response.headers.location[0]
            : response.headers.location;
          startRequest(redirectUrl);
          return;
        }

        // Robust content-length parsing
        const rawLen = response.headers['content-length'];
        const lenStr = Array.isArray(rawLen) ? rawLen[0] : rawLen;
        const totalBytes = parseInt(lenStr || '0');
        console.log('[Direct Download] Content-Length:', totalBytes);
        let receivedBytes = 0;
        const fileStream = fs.createWriteStream(outputPath);
        activeFileStream = fileStream;

        response.on('data', (chunk: any) => {
          if (aborted) return;
          receivedBytes += chunk.length;
          fileStream.write(chunk);

          if (totalBytes > 0) {
            const progress = (receivedBytes / totalBytes) * 100;
            win?.webContents.send('download-progress', {
              id: downloadId,
              progress: Math.round(progress * 10) / 10,
              speed: 'High Speed' // Simple placeholder
            });
          }
        });

        response.on('end', () => {
          if (aborted) {
            fileStream.destroy();
            return;
          }

          fileStream.end(() => {
            win?.webContents.send('download-progress', {
              id: downloadId,
              progress: 100,
              speed: undefined,
              eta: undefined,
            });
            finish(true);
          });
        });

        response.on('error', () => {
          fileStream.destroy();
          finish(false);
        });

        fileStream.on('error', () => finish(false));
      });
      request.on('error', () => finish(false));
      request.end();
    };

    startRequest(fileUrl);
  });
};
interface DownloadOptions {
  id?: string;
  url: string;
  titleOverride?: string;
  format: 'video' | 'audio' | 'photo';
  quality?: string; // '1080', '720', '480', 'best'
  audioFormat?: string; // 'mp3', 'best'
  // Enhanced options
  embedSubtitles?: boolean;
  subtitleLanguages?: string[]; // ['en', 'tr', 'auto']
  embedMetadata?: boolean;
  preserveThumbnail?: boolean;
  embedAltAudio?: boolean;
  preferredAudioLang?: string;
  cookiesFromBrowser?: string; // 'chrome', 'firefox', 'edge', etc.
  referer?: string;
  enableTurboDownload?: boolean;
  adaptiveTurboDownload?: boolean;
  turboConnections?: number;
  outputDir?: string;
}

const deriveDirectDownloadExtension = (sourceUrl: string, format: DownloadOptions['format']): string => {
  const fromPath = (() => {
    try {
      const parsed = new URL(sourceUrl);
      const ext = path.extname(parsed.pathname || '').replace('.', '').toLowerCase();
      if (ext) return ext;
    } catch {
      // Ignore URL parsing failures and fall back to format defaults.
    }
    return '';
  })();

  if (fromPath && /^[a-z0-9]{2,5}$/i.test(fromPath)) {
    return fromPath;
  }

  if (format === 'audio') {
    return 'm4a';
  }

  if (format === 'photo') {
    return 'jpg';
  }

  return 'mp4';
};

const getDirectEngineDisqualifiers = (context: {
  opts: DownloadOptions;
  isDirectExtractedUrl: boolean;
  targetUrl: string;
  ffmpegReady: boolean;
}): string[] => {
  const { opts, isDirectExtractedUrl, targetUrl, ffmpegReady } = context;
  const reasons: string[] = [];

  if (opts.format !== 'video') {
    reasons.push('only-video-fast-path');
  }

  if (!isDirectExtractedUrl) {
    reasons.push('not-direct-extracted-url');
  }

  if (opts.embedSubtitles) reasons.push('embed-subs-enabled');
  if (opts.embedMetadata) reasons.push('embed-metadata-enabled');
  if (opts.embedAltAudio) reasons.push('alt-audio-enabled');
  if (opts.preserveThumbnail !== false) reasons.push('thumbnail-preservation-enabled');
  if (opts.enableTurboDownload) reasons.push('turbo-enabled');
  if (opts.id) reasons.push('resume-sensitive-download');
  if (/\.m3u8(\?|$)/i.test(targetUrl)) reasons.push('manifest-stream');

  // Keep ffmpeg-enhanced post-processing on yt-dlp path for parity.
  if (ffmpegReady && opts.audioFormat && opts.audioFormat !== 'best') {
    reasons.push('audio-transcode-preference');
  }

  return reasons;
};

ipcMain.handle('start-download', async (_event, options: DownloadOptions | string) => {
  // Support both old string API and new options API
  const opts: DownloadOptions = typeof options === 'string'
    ? { url: options, format: 'video', quality: 'best' }
    : options;

  const downloadId = opts.id || Math.random().toString(36).substr(2, 9);
  const downloadsPath = await resolveDownloadOutputDir(opts.outputDir);

  // ==================== PHOTO DOWNLOAD HANDLER ====================
  if (opts.format === 'photo') {
    console.log('[Photo Download] Fetching metadata for photo download...');

    return new Promise(async (resolve) => {
      const direct = await extractDirectMediaFromHtml(opts.url, opts.cookiesFromBrowser);

      // Fast path: use HTML-extracted thumbnail/image when available.
      if (direct.thumbnail || direct.mediaUrl) {
        const preferredImageUrl = direct.thumbnail || direct.mediaUrl;
        if (preferredImageUrl) {
          const extMatch = preferredImageUrl.match(/\.([a-zA-Z0-9]+)(\?|$)/);
          const ext = extMatch ? extMatch[1] : 'jpg';
          const safeTitle = sanitizeFileComponent(opts.titleOverride || direct.title || `photo_${Date.now()}`);
          const outputPath = path.join(downloadsPath, `${safeTitle}.${ext}`);

          activeDownloads.set(downloadId, {
            process: { kill: () => { } },
            options: opts,
            progress: 0
          });

          const success = await downloadFile(preferredImageUrl, outputPath, downloadId, win);
          activeDownloads.delete(downloadId);

          if (success) {
            console.log('[Photo Download] Success via HTML extraction');
            win?.webContents.send('download-complete', { id: downloadId });
            resolve({ id: downloadId, status: 'completed' });
            return;
          }

          console.warn('[Photo Download] HTML-extracted image download failed, falling back to yt-dlp metadata');
        }
      }

      // Generic photo flow: use yt-dlp metadata for the best thumbnail/image URL.
      // Use yt-dlp to get the highest quality thumbnail/image URL
      const photoArgs = [
        '--dump-single-json',
        '--no-warnings',
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        '--referer', opts.url,
        opts.url
      ];

      if (opts.cookiesFromBrowser) {
        photoArgs.splice(2, 0, '--cookies-from-browser', opts.cookiesFromBrowser);
      }

      const ytdlp = spawn(getYtDlpPath(), photoArgs);

      let output = '';

      ytdlp.stdout.on('data', (data) => {
        output += data.toString();
      });

      ytdlp.on('close', async (code) => {
        if (code === 0 && output) {
          try {
            const info = parseYtDlpJsonOutput(output);
            const thumbnailUrl = pickBestThumbnailUrl(info);

            if (thumbnailUrl) {
              console.log('[Photo Download] Found thumbnail URL:', thumbnailUrl);

              // Determine extension or default to jpg
              const extMatch = thumbnailUrl.match(/\.([a-zA-Z0-9]+)(\?|$)/);
              const ext = extMatch ? extMatch[1] : 'jpg';

              const safeTitle = sanitizeFileComponent(opts.titleOverride || info.title || `photo_${Date.now()}`);
              const outputPath = path.join(downloadsPath, `${safeTitle}.${ext}`);

              // Track as active
              activeDownloads.set(downloadId, {
                process: { kill: () => { } },
                options: opts,
                progress: 0
              });

              const success = await downloadFile(thumbnailUrl, outputPath, downloadId, win);

              activeDownloads.delete(downloadId);

              if (success) {
                console.log('[Photo Download] Success!');
                win?.webContents.send('download-complete', { id: downloadId });
                resolve({ id: downloadId, status: 'completed' });
              } else {
                console.warn('[Photo Download] Direct thumbnail fetch failed, falling back to yt-dlp --write-thumbnail');

                const stagingDir = getStagingDir();
                await ensureDirectory(stagingDir);
                const photoOutputTemplate = opts.titleOverride
                  ? `${downloadId}_${sanitizeFileComponent(opts.titleOverride)}.%(ext)s`
                  : `${downloadId}_%(title)s.%(ext)s`;
                const photoOutputPath = path.join(stagingDir, photoOutputTemplate);

                const fallbackArgs: string[] = [
                  opts.url,
                  '-o', photoOutputPath,
                  '--skip-download',
                  '--write-thumbnail',
                  '--convert-thumbnails', 'jpg',
                  '--no-playlist',
                  '--no-warnings',
                  '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  '--referer', opts.referer || opts.url,
                ];

                if (opts.cookiesFromBrowser) {
                  fallbackArgs.push('--cookies-from-browser', opts.cookiesFromBrowser);
                }

                const fallbackProc = spawn(getYtDlpPath(), fallbackArgs);
                fallbackProc.on('close', async (fallbackCode: number | null) => {
                  if (fallbackCode === 0) {
                    try {
                      await finalizeStagedDownload(downloadId, stagingDir, downloadsPath, { includeImages: true });
                      win?.webContents.send('download-complete', { id: downloadId });
                      resolve({ id: downloadId, status: 'completed' });
                    } catch {
                      win?.webContents.send('download-error', {
                        id: downloadId,
                        error: 'Thumbnail was extracted but could not be finalized'
                      });
                      resolve({ id: downloadId, status: 'error' });
                    }
                  } else {
                    await cleanStagedArtifacts(downloadId, stagingDir);
                    win?.webContents.send('download-error', {
                      id: downloadId,
                      error: 'Failed to download image file'
                    });
                    resolve({ id: downloadId, status: 'error' });
                  }
                });

                fallbackProc.on('error', async () => {
                  await cleanStagedArtifacts(downloadId, getStagingDir());
                  win?.webContents.send('download-error', {
                    id: downloadId,
                    error: 'Failed to run thumbnail fallback'
                  });
                  resolve({ id: downloadId, status: 'error' });
                });
              }
            } else {
              win?.webContents.send('download-error', {
                id: downloadId,
                error: 'No image found for this URL'
              });
              resolve({ id: downloadId, status: 'error' });
            }
          } catch (e) {
            console.error('[Photo Download] JSON Parse error:', e);
            win?.webContents.send('download-error', {
              id: downloadId,
              error: 'Failed to parse media info'
            });
            resolve({ id: downloadId, status: 'error' });
          }
        } else {
          win?.webContents.send('download-error', {
            id: downloadId,
            error: 'Failed to fetch media info'
          });
          resolve({ id: downloadId, status: 'error' });
        }
      });
    });
  }

  // ==================== STANDARD YT-DLP DOWNLOAD ====================
  const stagingDir = getStagingDir();
  await ensureDirectory(stagingDir);
  const preferredTitle = sanitizeFileComponent(opts.titleOverride || '');
  const outputTemplate = preferredTitle
    ? `${downloadId}_${preferredTitle}.%(ext)s`
    : `${downloadId}_%(title)s.%(ext)s`;
  const outputPath = path.join(stagingDir, outputTemplate);

  // Build yt-dlp arguments
  // Build yt-dlp arguments
  let targetUrl = opts.url;
  let finalOutputPath = outputPath;

  // Smart direct-media fallback for all page URLs.
  // We compare extractor and direct candidates, then choose the highest-confidence quality path.
  const requestedQuality = parseRequestedQuality(opts.quality);
  let extractorProbe: MediaProbeResult = { ok: false, ladderCount: 0, unknownHeightFormatIds: [] };
  if (!opts.referer
    && /^https?:\/\//i.test(targetUrl)
    && !/\.(mp4|m3u8|webm)(\?|$)/i.test(targetUrl)
    && shouldUseGenericHtmlFallback(targetUrl)
    && (opts.format === 'video' || opts.format === 'audio')) {
    const direct = await extractDirectMediaFromHtml(targetUrl, opts.cookiesFromBrowser);
    const selectedDirect = chooseDirectFallbackSource(direct, requestedQuality);
    if (opts.format === 'video' || opts.format === 'audio') {
      extractorProbe = await runYtDlpInfoProbe(targetUrl, undefined, opts.cookiesFromBrowser);
    }

    if (selectedDirect.mediaUrl) {
      const normalizedDirectUrl = normalizeDirectMediaUrl(selectedDirect.mediaUrl);
      const useDirectFallback = opts.format === 'audio'
        ? !extractorProbe.ok
        : shouldUseDirectFallback(
          requestedQuality,
          selectedDirect.estimatedHeight,
          normalizedDirectUrl
        );

      if (useDirectFallback) {
        const directProbeOk = await probeDirectMediaUrl(normalizedDirectUrl, targetUrl, opts.cookiesFromBrowser);

        if (opts.format === 'audio') {
          if (directProbeOk) {
            console.log('[Direct Fallback][Audio] Using extracted media URL for download:', normalizedDirectUrl);
            opts.referer = targetUrl;
            targetUrl = normalizedDirectUrl;
          } else {
            console.log('[Direct Fallback][Audio] Probe failed, keeping extractor URL:', targetUrl);
          }
        } else {
          let directProbe: MediaProbeResult = { ok: false, ladderCount: 0, unknownHeightFormatIds: [] };
          if (directProbeOk) {
            directProbe = await runYtDlpInfoProbe(normalizedDirectUrl, targetUrl, opts.cookiesFromBrowser);
          }

          const numericDirectCount = Object.keys(direct.extractedSources || {}).filter((key) => /^\d{3,4}$/.test(key)).length;
          const directMaxHeight = directProbe.maxHeight || selectedDirect.estimatedHeight;
          const directLadderCount = Math.max(directProbe.ladderCount, numericDirectCount);

          const extractorCandidate: DownloadSourceCandidate = {
            source: 'extractor',
            url: targetUrl,
            maxHeight: extractorProbe.maxHeight,
            ladderCount: extractorProbe.ladderCount,
            duration: extractorProbe.duration,
            probeOk: extractorProbe.ok,
            previewLike: false,
            score: 0,
            reasons: [],
          };

          const directCandidate: DownloadSourceCandidate = {
            source: 'direct',
            url: normalizedDirectUrl,
            maxHeight: directMaxHeight,
            ladderCount: directLadderCount,
            duration: directProbe.duration,
            probeOk: directProbeOk && directProbe.ok,
            previewLike: isLikelyPreviewSource(normalizedDirectUrl, { ...directProbe, maxHeight: directMaxHeight, ladderCount: directLadderCount }, requestedQuality, extractorProbe),
            score: 0,
            reasons: [],
          };

          const expectedDuration = extractorProbe.duration;
          extractorCandidate.score = scoreDownloadSourceCandidate(extractorCandidate, requestedQuality, expectedDuration);
          directCandidate.score = scoreDownloadSourceCandidate(directCandidate, requestedQuality, expectedDuration);

          extractorCandidate.reasons.push(
            `maxHeight=${extractorCandidate.maxHeight || 'unknown'}`,
            `ladder=${extractorCandidate.ladderCount}`,
            `probeOk=${extractorCandidate.probeOk}`
          );
          directCandidate.reasons.push(
            `maxHeight=${directCandidate.maxHeight || 'unknown'}`,
            `ladder=${directCandidate.ladderCount}`,
            `probeOk=${directCandidate.probeOk}`,
            `previewLike=${directCandidate.previewLike}`
          );

          const bestCandidate = [extractorCandidate, directCandidate]
            .sort((a, b) => b.score - a.score)[0];

          console.log('[Source Selection] Candidate comparison:', {
            requestedQuality,
            extractor: {
              score: extractorCandidate.score,
              reasons: extractorCandidate.reasons,
              url: extractorCandidate.url,
            },
            direct: {
              score: directCandidate.score,
              reasons: directCandidate.reasons,
              url: directCandidate.url,
            },
            selected: bestCandidate.source,
          });

          if (bestCandidate.source === 'direct') {
            console.log('[Direct Fallback] Using extracted media URL for download:', normalizedDirectUrl);
            opts.referer = targetUrl;
            targetUrl = normalizedDirectUrl;
          } else {
            console.log('[Direct Fallback] Keeping extractor URL after quality comparison:', targetUrl);
          }
        }
      } else {
        console.log('[Direct Fallback] Skipping low-quality extracted stream:', {
          extractedHeight: selectedDirect.estimatedHeight,
          requestedQuality,
          extractedUrl: normalizedDirectUrl,
        });
      }
    }

    // Preserve original-link metadata/title to avoid source-page mismatches.
  }

  const ffmpegReady = isFfmpegAvailable();

  const isDirectExtractedUrl = (() => {
    if (!/^https?:\/\//i.test(targetUrl)) return false;
    if (!/^https?:\/\//i.test(opts.url)) return false;

    // Referer can match opts.url after canonicalization; direct-mode should depend
    // on whether the active target URL differs from the original page URL.
    return normalizeDirectMediaUrl(targetUrl) !== normalizeDirectMediaUrl(opts.url);
  })();

  const directDisqualifiers = getDirectEngineDisqualifiers({
    opts,
    isDirectExtractedUrl,
    targetUrl,
    ffmpegReady,
  });
  const selectedEngine: 'yt-dlp' | 'electron-net' = directDisqualifiers.length === 0 ? 'electron-net' : 'yt-dlp';

  console.log('[Engine Selection]', {
    id: downloadId,
    selectedEngine,
    isDirectExtractedUrl,
    targetUrl,
    disqualifiers: directDisqualifiers,
  });

  const args: string[] = [
    targetUrl,
    '-o', finalOutputPath,
    '--no-playlist',
    '--continue',
    '--newline', // Important for progress parsing
    '--no-warnings',
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    '--referer', opts.referer || opts.url, // Pass original page URL as referer when downloading extracted media
  ];

  const directOutputExtension = deriveDirectDownloadExtension(targetUrl, opts.format);
  const directFallbackTitle = preferredTitle || sanitizeFileComponent(deriveTitleFromUrl(opts.url) || `media_${Date.now()}`);
  const directOutputPath = path.join(stagingDir, `${downloadId}_${directFallbackTitle}.${directOutputExtension}`);

  if (opts.format === 'audio') {
    // AUDIO-ONLY: Prefer MP3 conversion when ffmpeg is available.
    args.push('-f', 'bestaudio/best');
    if (ffmpegReady) {
      args.push('-x');
      args.push('--audio-format', opts.audioFormat || 'mp3');
    } else {
      console.warn('[Audio Download] ffmpeg not found, downloading original audio stream without conversion');
    }
  } else {
    if (isDirectExtractedUrl) {
      // Direct media links rarely expose format variants like normal extractor pages.
      args.push('-f', 'best');
    } else {
      // VIDEO: Select based on quality
      // When the extractor reports unknown-height "auto" formats (likely adaptive HLS/DASH
      // manifests that may contain higher quality tiers than the explicitly listed formats),
      // prepend them to the format expression so yt-dlp tries them first.
      const hasLimitedExtractor = extractorProbe.ok
        && (extractorProbe.maxHeight || 0) <= 720
        && extractorProbe.unknownHeightFormatIds.length > 0;

      if (hasLimitedExtractor) {
        // Sort unknown format IDs to prefer av1 codec over h264 for better quality at same bitrate.
        const sorted = [...extractorProbe.unknownHeightFormatIds].sort((a, b) => {
          const aIsAv1 = /av1/i.test(a) ? 0 : 1;
          const bIsAv1 = /av1/i.test(b) ? 0 : 1;
          return aIsAv1 - bIsAv1;
        });
        const autoFormats = sorted.join('/');
        if (opts.quality && opts.quality !== 'best') {
          const q = opts.quality;
          args.push('-f', `${autoFormats}/bestvideo[height<=${q}]+bestaudio/bestvideo[format_note*=${q}]+bestaudio/best[height<=${q}]/best`);
        } else {
          args.push('-f', `${autoFormats}/bestvideo+bestaudio/best`);
        }
        console.log('[Format Selection] Using adaptive auto-format IDs first:', sorted);
      } else if (opts.quality && opts.quality !== 'best') {
        const q = opts.quality;
        args.push('-f', `bestvideo[height<=${q}]+bestaudio/bestvideo[format_note*=${q}]+bestaudio/best[height<=${q}]/best`);
      } else {
        args.push('-f', 'bestvideo+bestaudio/best');
      }
    }

    // Bias yt-dlp toward the highest available visual quality on generic extractors
    // that expose custom labels (e.g. HQ/LQ) without explicit quality ranks.
    args.push('-S', 'res,br');
  }

  // Enhanced options: Subtitles
  if (opts.embedSubtitles) {
    if (ffmpegReady) {
      args.push('--embed-subs');
      args.push('--sub-langs', opts.subtitleLanguages?.join(',') || 'en,tr');
    } else {
      console.warn('[Subtitles] ffmpeg not found, skipping subtitle embedding');
    }
  }

  // Enhanced options: Metadata
  if (opts.embedMetadata) {
    args.push('--embed-metadata');
  }

  // Preserve the webpage thumbnail in local files when the container/toolchain supports it.
  if (opts.preserveThumbnail !== false) {
    args.push('--write-thumbnail');
    args.push('--convert-thumbnails', 'jpg');
    if (ffmpegReady) {
      args.push('--embed-thumbnail');
    } else {
      console.warn('[Thumbnail] ffmpeg not found, thumbnail will be saved as sidecar image only');
    }
  }

  // Enhanced options: Alternative audio tracks
  if (opts.embedAltAudio) {
    args.push('--audio-multistreams');

    // Best-effort language preference: keep this conservative to avoid invalid yt-dlp argument usage.
    // Some sites expose per-track language metadata, but behavior is extractor-dependent.
    if (opts.preferredAudioLang && opts.preferredAudioLang !== 'original') {
      args.push('--format-sort', `lang:${opts.preferredAudioLang}`);
    }
  }

  // Enhanced options: Browser cookies for authentication
  if (opts.cookiesFromBrowser) {
    args.push('--cookies-from-browser', opts.cookiesFromBrowser);
  }

  // Turbo mode: parallel fragment fetching + optional aria2c multi-connection downloader.
  if (opts.enableTurboDownload) {
    const requestedConnections = clampTurboConnections(opts.turboConnections);
    const turboConnections = opts.adaptiveTurboDownload === false
      ? requestedConnections
      : calculateAdaptiveTurboConnections(opts.turboConnections);
    args.push('--concurrent-fragments', String(turboConnections));

    if (opts.adaptiveTurboDownload !== false && turboConnections < requestedConnections) {
      console.log('[Turbo Download] Adaptive throttle applied:', {
        requested: requestedConnections,
        effective: turboConnections,
        activeDownloads: activeDownloads.size + 1,
        cpuCores: os.cpus().length || 2,
      });
    }

    if (isAria2cAvailable()) {
      const aria2Path = resolveAria2Path();
      args.push('--downloader', aria2Path || 'aria2c');
      args.push(
        '--downloader-args',
        `aria2c:-x${turboConnections} -s${turboConnections} -k1M --summary-interval=1 --download-result=hide --file-allocation=none`
      );
    } else {
      console.warn('[Turbo Download] aria2c not found, using yt-dlp fragment concurrency only');
    }
  }

  // Network resilience defaults for unstable links/VPN transitions.
  args.push('--retries', '8');
  args.push('--fragment-retries', '20');
  args.push('--retry-sleep', '3');
  args.push('--socket-timeout', '30');

  const buildArgsForUrl = (url: string) => {
    const attemptArgs = [...args];
    attemptArgs[0] = url;
    return attemptArgs;
  };

  const MAX_AUTO_RETRIES = 2;
  const MAX_DIRECT_RETRIES = 1;
  let currentTargetUrl = targetUrl;

  const launchDirectAttempt = (attempt: number) => {
    let abortFn: (() => void) | null = null;
    activeDownloads.set(downloadId, {
      process: {
        abort: () => abortFn?.(),
        kill: () => abortFn?.(),
      },
      options: opts,
      progress: activeDownloads.get(downloadId)?.progress || 0,
    });

    void (async () => {
      const ok = await downloadFile(
        currentTargetUrl,
        directOutputPath,
        downloadId,
        win,
        {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': opts.referer || opts.url,
        },
        (abort) => {
          abortFn = abort;
        }
      );

      clearPendingRetryTimer(downloadId);
      activeDownloads.delete(downloadId);

      if (intentionallyCanceledIds.has(downloadId)) {
        intentionallyCanceledIds.delete(downloadId);
        return;
      }

      if (intentionallyPausedIds.has(downloadId)) {
        intentionallyPausedIds.delete(downloadId);
        return;
      }

      if (ok) {
        win?.webContents.send('download-progress', {
          id: downloadId,
          progress: 99.9,
          speed: undefined,
          eta: 'finalizing',
        });

        try {
          await finalizeStagedDownload(downloadId, stagingDir, downloadsPath, {
            includeImages: false,
          });
          win?.webContents.send('download-complete', { id: downloadId });
        } catch (moveError: any) {
          await cleanStagedArtifacts(downloadId, stagingDir);
          win?.webContents.send('download-error', {
            id: downloadId,
            error: moveError?.message || 'Direct download finished but failed to finalize output file',
          });
        }
        return;
      }

      if (attempt < MAX_DIRECT_RETRIES) {
        const nextAttempt = attempt + 1;
        const retryDelayMs = 2000 * nextAttempt;
        win?.webContents.send('download-progress', {
          id: downloadId,
          progress: 0,
          speed: undefined,
          eta: `retrying in ${Math.ceil(retryDelayMs / 1000)}s`,
        });

        pendingRetryTimers.set(downloadId, setTimeout(() => {
          pendingRetryTimers.delete(downloadId);
          if (intentionallyCanceledIds.has(downloadId) || intentionallyPausedIds.has(downloadId)) {
            return;
          }
          launchDirectAttempt(nextAttempt);
        }, retryDelayMs));
        return;
      }

      console.warn('[Direct Engine] Fast path failed; falling back to yt-dlp execution');
      currentTargetUrl = opts.url;
      launchAttempt(0);
    })();
  };

  const launchAttempt = (attempt: number) => {
    const attemptArgs = buildArgsForUrl(currentTargetUrl);
    console.log('[start-download] Spawning yt-dlp with args:', attemptArgs.join(' '));

    const subprocess = spawn(getYtDlpPath(), attemptArgs);
    activeDownloads.set(downloadId, {
      process: subprocess,
      options: opts,
      progress: activeDownloads.get(downloadId)?.progress || 0,
    });

    let stderrCombined = '';

    const emitProgressFromText = (text: string) => {
      let percent: number | undefined;
      let speed: string | undefined;
      let eta: string | undefined;

      // yt-dlp format: [download] 45.2% of ... at 1.23MiB/s ETA 00:05
      const ytPercent = text.match(/(\d+\.?\d*)%/);
      if (ytPercent?.[1]) {
        percent = parseFloat(ytPercent[1]);
      }

      const ytSpeed = text.match(/at\s+(\d+\.?\d*\s*[KMG]?i?B\/s)/i);
      if (ytSpeed?.[1]) {
        speed = ytSpeed[1];
      }

      const ytEta = text.match(/ETA\s+(\d+:\d+)/i);
      if (ytEta?.[1]) {
        eta = ytEta[1];
      }

      // aria2 format includes: (34%) ... DL:1.2MiB ETA:12s
      if (percent === undefined) {
        const ariaPercent = text.match(/\((\d{1,3})%\)/);
        if (ariaPercent?.[1]) {
          percent = parseFloat(ariaPercent[1]);
        }
      }

      if (!speed) {
        const ariaSpeed = text.match(/DL:([0-9.]+\s*[KMG]?i?B)/i);
        if (ariaSpeed?.[1]) {
          speed = `${ariaSpeed[1]}/s`;
        }
      }

      if (!eta) {
        const ariaEta = text.match(/ETA:([^\s]+)/i);
        if (ariaEta?.[1]) {
          eta = ariaEta[1];
        }
      }

      if (percent === undefined || Number.isNaN(percent)) {
        return;
      }

      win?.webContents.send('download-progress', {
        id: downloadId,
        progress: percent,
        speed,
        eta
      });

      const downloadInfo = activeDownloads.get(downloadId);
      if (downloadInfo) {
        downloadInfo.progress = percent;
      }
    };

    subprocess.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      emitProgressFromText(text);
    });

    subprocess.stderr.on('data', (data: Buffer) => {
      const stderrText = data.toString();
      stderrCombined += stderrText;
      console.error('[yt-dlp stderr]:', stderrText);
      emitProgressFromText(stderrText);

      // yt-dlp/ffmpeg post-processing often happens after transfer reaches ~99%.
      // Surface this as an explicit finalizing state to avoid "stuck at 99%" confusion.
      if (/(\[Merger\]|\[Metadata\]|\[EmbedThumbnail\]|\[ExtractAudio\]|Post-process|Deleting original file)/i.test(stderrText)) {
        win?.webContents.send('download-progress', {
          id: downloadId,
          progress: 99.9,
          speed: undefined,
          eta: 'finalizing',
        });
      }

      // Windows Explorer thumbnail generation depends on shell codecs/cache.
      // This warning helps distinguish OS limitations from yt-dlp/ffmpeg failures.
      if (opts.preserveThumbnail !== false && /(thumbnail|ffmpeg)/i.test(stderrText)) {
        console.warn('[thumbnail diagnostics] Thumbnail embedding may be limited on this system:', stderrText.trim());
      }
    });

    subprocess.on('close', (code: number | null) => {
      clearPendingRetryTimer(downloadId);
      activeDownloads.delete(downloadId);

      // Intentional cancel should be silent from the queue perspective.
      if (intentionallyCanceledIds.has(downloadId)) {
        intentionallyCanceledIds.delete(downloadId);
        return;
      }

      // Check if this was an intentional pause (not an error)
      if (intentionallyPausedIds.has(downloadId)) {
        intentionallyPausedIds.delete(downloadId);
        return; // Don't send complete or error events for paused downloads
      }

      void (async () => {
        if (code === 0) {
          win?.webContents.send('download-progress', {
            id: downloadId,
            progress: 99.9,
            speed: undefined,
            eta: 'finalizing',
          });

          try {
            await finalizeStagedDownload(downloadId, stagingDir, downloadsPath, {
              includeImages: opts.preserveThumbnail !== false && !ffmpegReady,
            });
            win?.webContents.send('download-complete', { id: downloadId });
          } catch (moveError: any) {
            await cleanStagedArtifacts(downloadId, stagingDir);
            win?.webContents.send('download-error', {
              id: downloadId,
              error: moveError?.message || 'Download finished but failed to finalize output file'
            });
          }
          return;
        }

        const unusualExtensionFailure = /extracted extension \('php'\) is unusual/i.test(stderrCombined);
        if (code !== 0 && isDirectExtractedUrl && unusualExtensionFailure && (opts.format === 'video' || opts.format === 'audio')) {
          console.warn('[Direct Fallback] yt-dlp rejected unusual redirected extension; retrying via direct HTTP download');

          const ext = deriveDirectDownloadExtension(currentTargetUrl, opts.format);
          const fallbackTitle = preferredTitle || sanitizeFileComponent(deriveTitleFromUrl(opts.url) || `media_${Date.now()}`);
          const directOutputPath = path.join(stagingDir, `${downloadId}_${fallbackTitle}.${ext}`);

          const ok = await downloadFile(
            currentTargetUrl,
            directOutputPath,
            downloadId,
            win,
            {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Referer': opts.referer || opts.url,
            }
          );

          if (ok) {
            try {
              await finalizeStagedDownload(downloadId, stagingDir, downloadsPath, {
                includeImages: opts.preserveThumbnail !== false && !ffmpegReady,
              });
              win?.webContents.send('download-complete', { id: downloadId });
            } catch (moveError: any) {
              await cleanStagedArtifacts(downloadId, stagingDir);
              win?.webContents.send('download-error', {
                id: downloadId,
                error: moveError?.message || 'Direct download finished but failed to finalize output file'
              });
            }
          } else {
            await cleanStagedArtifacts(downloadId, stagingDir);
            win?.webContents.send('download-error', {
              id: downloadId,
              error: 'Direct media fallback failed after yt-dlp extension safety rejection',
            });
          }

          return;
        }

        const classification = classifyDownloadFailure(stderrCombined, code);
        const canFallbackToExtractor = currentTargetUrl !== opts.url && /^https?:\/\//i.test(opts.url);
        const shouldRetryTransient = classification.transient && attempt < MAX_AUTO_RETRIES;
        const shouldFallbackRetry = canFallbackToExtractor
          && (classification.transient || classification.authRelated || classification.geoBlocked)
          && attempt < MAX_AUTO_RETRIES;

        if (shouldRetryTransient || shouldFallbackRetry) {
          const nextAttempt = attempt + 1;
          const retryDelayMs = 2000 * nextAttempt;

          if (shouldFallbackRetry) {
            // Direct URLs can expire on VPN/location/IP changes. Revert to source page extraction flow.
            currentTargetUrl = opts.url;
          }

          console.warn('[download-retry] Retrying failed download', {
            id: downloadId,
            attempt: nextAttempt,
            reason: classification.message,
            retryDelayMs,
            usingExtractorUrl: currentTargetUrl === opts.url,
          });

          win?.webContents.send('download-progress', {
            id: downloadId,
            progress: activeDownloads.get(downloadId)?.progress || 0,
            speed: undefined,
            eta: `retrying in ${Math.ceil(retryDelayMs / 1000)}s`,
          });

          pendingRetryTimers.set(downloadId, setTimeout(() => {
            pendingRetryTimers.delete(downloadId);
            if (intentionallyCanceledIds.has(downloadId) || intentionallyPausedIds.has(downloadId)) {
              return;
            }

            try {
              launchAttempt(nextAttempt);
            } catch (retryError: any) {
              win?.webContents.send('download-error', {
                id: downloadId,
                error: retryError?.message || classification.message,
              });
            }
          }, retryDelayMs));

          return;
        }

        // Keep partial files so retry/resume can continue from where it stopped.
        win?.webContents.send('download-error', {
          id: downloadId,
          error: classification.message,
        });
      })();
    });

    subprocess.on('error', (err: Error) => {
      clearPendingRetryTimer(downloadId);
      activeDownloads.delete(downloadId);
      win?.webContents.send('download-error', {
        id: downloadId,
        error: err.message
      });
    });
  };

  try {
    if (selectedEngine === 'electron-net') {
      launchDirectAttempt(0);
    } else {
      launchAttempt(0);
    }
    return { id: downloadId, status: 'started' };
  } catch (error: any) {
    return {
      id: downloadId,
      status: 'error',
      error: error.message || 'Failed to start download'
    };
  }
});

ipcMain.handle('get-runtime-dependencies-status', async () => {
  const commands = getInstallCommandMap();
  const platform = process.platform === 'win32'
    ? 'windows'
    : process.platform === 'darwin'
      ? 'macos'
      : 'linux';

  return {
    success: true,
    data: {
      platform,
      dependencies: [
        {
          id: 'yt-dlp',
          name: 'yt-dlp',
          required: true,
          installed: isYtDlpAvailable(),
          installCommand: commands.ytDlp,
          helpUrl: 'https://github.com/yt-dlp/yt-dlp#installation',
        },
        {
          id: 'ffmpeg',
          name: 'ffmpeg',
          required: false,
          installed: isFfmpegAvailable(),
          installCommand: commands.ffmpeg,
          helpUrl: 'https://ffmpeg.org/download.html',
        },
        {
          id: 'aria2',
          name: 'aria2c',
          required: false,
          installed: isAria2cAvailable(),
          installCommand: commands.aria2,
          helpUrl: 'https://aria2.github.io/',
        },
      ],
    },
  };
});

ipcMain.handle('open-external-url', async (_event, url: string) => {
  if (!url || !/^https?:\/\//i.test(url)) {
    return {
      success: false,
      error: 'Invalid URL',
    };
  }

  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'Failed to open URL',
    };
  }
});

// Cancel download
ipcMain.handle('cancel-download', async (_event, downloadId: string) => {
  const stagingDir = getStagingDir();
  const downloadInfo = activeDownloads.get(downloadId);
  const hadPendingRetry = pendingRetryTimers.has(downloadId);
  clearPendingRetryTimer(downloadId);

  if (downloadInfo) {
    intentionallyPausedIds.delete(downloadId);
    intentionallyCanceledIds.add(downloadId);
    terminateProcessTree(downloadInfo.process);
    activeDownloads.delete(downloadId);
    pausedDownloads.delete(downloadId); // Also remove from paused if exists
    await cleanStagedArtifacts(downloadId, stagingDir);
    return { success: true };
  }

  // Cancel may race with auto-retry scheduling where no process is active yet.
  if (hadPendingRetry) {
    intentionallyPausedIds.delete(downloadId);
    intentionallyCanceledIds.add(downloadId);
    pausedDownloads.delete(downloadId);
    await cleanStagedArtifacts(downloadId, stagingDir);
    return { success: true };
  }

  // Also check paused downloads
  if (pausedDownloads.has(downloadId)) {
    intentionallyPausedIds.delete(downloadId);
    intentionallyCanceledIds.delete(downloadId);
    pausedDownloads.delete(downloadId);
    await cleanStagedArtifacts(downloadId, stagingDir);
    return { success: true };
  }
  return { success: false, error: 'Download not found' };
});

// Pause download - kills process but saves state for resume
ipcMain.handle('pause-download', async (_event, downloadId: string) => {
  const downloadInfo = activeDownloads.get(downloadId);
  clearPendingRetryTimer(downloadId);
  if (downloadInfo) {
    // Mark as intentionally paused (so close handler won't send error)
    intentionallyCanceledIds.delete(downloadId);
    intentionallyPausedIds.add(downloadId);
    // Store options for resume
    pausedDownloads.set(downloadId, {
      options: downloadInfo.options,
      progress: downloadInfo.progress
    });
    // Kill the process
    terminateProcessTree(downloadInfo.process);
    activeDownloads.delete(downloadId);
    return { success: true, progress: downloadInfo.progress };
  }
  return { success: false, error: 'Download not found' };
});

// Resume download - restarts download (yt-dlp auto-resumes partial files)
ipcMain.handle('resume-download', async (_event, downloadId: string) => {
  const pausedInfo = pausedDownloads.get(downloadId);
  if (pausedInfo) {
    pausedDownloads.delete(downloadId);
    // The download will be restarted from the frontend with the same options
    // yt-dlp automatically resumes partial downloads
    return {
      success: true,
      options: pausedInfo.options,
      progress: pausedInfo.progress
    };
  }
  return { success: false, error: 'Paused download not found' };
});

// Open downloads folder
ipcMain.handle('open-downloads-folder', async () => {
  const downloadsPath = await getActiveDownloadsPath();
  shell.openPath(downloadsPath);
  return { success: true };
});

ipcMain.handle('open-folder', async (_event, folderPath?: string) => {
  const targetPath = folderPath && folderPath.trim()
    ? path.resolve(folderPath)
    : await getActiveDownloadsPath();

  await ensureDirectory(targetPath);
  await shell.openPath(targetPath);
  return { success: true, data: { path: targetPath } };
});

// ==================== APP LIFECYCLE ====================
app.on('window-all-closed', () => {
  // Kill all active downloads
  activeDownloads.forEach((downloadInfo) => {
    try {
      terminateProcessTree(downloadInfo.process);
    } catch (e) {
      // Ignore
    }
  });
  pendingRetryTimers.forEach((timer) => clearTimeout(timer));
  pendingRetryTimers.clear();
  activeDownloads.clear();
  pausedDownloads.clear();

  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(async () => {
  await ensureDownloadLocationLoaded();
  createWindow();
})
