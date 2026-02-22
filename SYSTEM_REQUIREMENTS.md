# System Requirements

This file lists runtime/build dependencies and installation commands for Windows, macOS, and Linux.

Note: AetherLens includes a first-run setup wizard in-app that checks these dependencies and shows install commands.

## Core Requirements

- Node.js 18+
- npm 9+
- `yt-dlp` on system `PATH`

Optional but recommended:

- `ffmpeg` (format merge/conversion support)
- `aria2c` (accelerated downloads)

Default installer builds are configured to avoid bundling third-party helper binaries unless explicitly requested.

## Windows

### Install Node.js

- Download from https://nodejs.org/
- Or use winget:

```powershell
winget install OpenJS.NodeJS.LTS
```

### Install yt-dlp

```powershell
winget install yt-dlp.yt-dlp
```

### Install ffmpeg (optional)

```powershell
winget install Gyan.FFmpeg
```

### Install aria2c (optional)

```powershell
winget install aria2.aria2
```

## macOS

Using Homebrew:

```bash
brew install node yt-dlp ffmpeg aria2
```

If you do not want optional tools, install only what you need:

```bash
brew install node yt-dlp
```

## Linux

Package names can vary by distro. Typical examples:

Debian/Ubuntu:

```bash
sudo apt update
sudo apt install -y nodejs npm yt-dlp ffmpeg aria2
```

Fedora:

```bash
sudo dnf install -y nodejs npm yt-dlp ffmpeg aria2
```

Arch:

```bash
sudo pacman -S --needed nodejs npm yt-dlp ffmpeg aria2
```

## Verify Installation

Run:

```bash
node --version
npm --version
yt-dlp --version
ffmpeg -version
aria2c --version
```

`ffmpeg` and `aria2c` are optional. Missing optional tools do not block basic usage.

## App Setup Commands

```bash
npm install
npm run dev
```

For packaging:

```bash
npm run build
```
