# AetherLens Media Downloader

AetherLens is a cross-platform desktop app for downloading and organizing media with a clean, task-focused workflow.

Built with Electron, React, and TypeScript, it is designed to make advanced download operations feel simple: paste a URL, inspect metadata, choose quality, and track every job from one place.

![AetherLens Logo](public/branding/aetherlens-logo.svg)

## Why AetherLens

- Fast metadata preview before downloading
- Format and quality control for video, audio, and image flows
- Playlist and channel-style batch handling
- Queue controls with pause, resume, retry, and cancel
- Setup wizard for dependency checks and guided install commands
- Local history and settings persistence

## Product Tour

Visual standards and naming rules are documented in `docs/screenshots/SCREENSHOT_SCHEME.md`.
All screenshots below are real in-app captures stored as `.png` files.

### Home And URL Preview

![Home screen with URL analysis](docs/screenshots/home-preview.png)

Paste any supported media URL to fetch title, duration, source metadata, and available formats before starting.

### Format And Quality Selection

![Format and quality picker](docs/screenshots/format-selector.png)

Choose output type, quality level, and destination behavior. This keeps downloads predictable and avoids re-runs.

### Playlist Workflow

![Playlist selection modal](docs/screenshots/playlist-modal.png)

For playlist-style URLs, AetherLens helps you review items and run batch downloads with better control over what gets queued.

### Downloads Queue

![Download queue with progress and actions](docs/screenshots/downloads-queue.png)

Track active and completed jobs with progress information and controls for pause, resume, retry, and cancel.

## How It Works

1. Paste a media URL.
2. Review metadata and available formats.
3. Select format, quality, and target location.
4. Start download and monitor progress.
5. Manage queue operations from the Downloads page.

## Quick Start

```bash
npm install
npm run dev
```

## System Requirements

- Node.js 18+
- npm 9+
- `yt-dlp` available on system `PATH`
- Optional: `ffmpeg` for merge/conversion workflows
- Optional: `aria2c` for acceleration

For platform-specific commands, see `SYSTEM_REQUIREMENTS.md`.

## Build And Package

```bash
npm run build
```

Notes:

- Default builds do not bundle third-party helper binaries.
- If `aria2c` is available on `PATH`, the app can use it at runtime.
- Optional helper bundling: `npm run build:with-bundled-aria2`.

## Scripts

- `npm run dev`: run renderer and Electron in development mode
- `npm run prepare:aria2`: best-effort bundle of local `aria2c` from `PATH`
- `npm run build`: compile and package with Electron Builder
- `npm run build:with-bundled-aria2`: bundle `aria2c` then build
- `npm run lint`: run ESLint
- `npm run preview`: preview renderer build

## Developer Integration

Renderer-to-main APIs are exposed through `window.electronAPI` in `electron/preload.ts`.

Key integration methods:

- `getVideoInfo(url, cookiesBrowser?)`
- `startDownload(options)`
- `pauseDownload(id)`
- `resumeDownload(id)`
- `cancelDownload(id)`
- `getPlaylistInfo(url)`
- `searchVideos(query, platform, count)`
- `getDownloadLocation()`
- `selectDownloadLocation()`
- `getAvailableBrowsers()`
- `validateBrowserCookies(browser)`

If you extend behavior, add IPC handlers in `electron/main.ts` and expose minimal safe methods through preload.

## Project Structure

- `src/`: React renderer
- `electron/`: Electron main and preload process
- `scripts/`: helper scripts for build-time tasks
- `build/icons/`: packaging icons
- `bin/`: optional runtime helper binaries
- `docs/screenshots/`: README visual assets

## Legal And Compliance

- License: MIT (`LICENSE`)
- This project is for lawful use only
- Users are responsible for compliance with copyright law, local regulations, and platform terms

Additional references:

- `LEGAL.md`
- `THIRD_PARTY_NOTICES.md`
