# Release QA Checklist

Use this checklist before pushing a new release tag.

## Version And Metadata

- [ ] `package.json` version matches planned release tag.
- [ ] `CHANGELOG.md` has a new section for this version.
- [ ] Download website points to the correct GitHub repository and release feed.

## First-Run Experience

- [ ] Fresh install launches setup wizard.
- [ ] Missing required dependency (`yt-dlp`) is clearly flagged.
- [ ] Setup wizard blocks normal continue until the user explicitly accepts limited mode.
- [ ] Recheck updates dependency status correctly after installation.

## Core Download Flow

- [ ] URL metadata preview loads for a normal video URL.
- [ ] Standard video download completes successfully.
- [ ] Audio-only download completes successfully.
- [ ] Playlist flow opens and queues selected items.

## Queue And Recovery

- [ ] Pause and resume work on an active download.
- [ ] Cancel terminates the download cleanly.
- [ ] Failed download shows `Retry`, `Copy Details`, and context install guide actions.
- [ ] `Retry` recovers at least one transient failure scenario.

## Updates And Navigation

- [ ] Update check works from the Info page.
- [ ] Sidebar Info item shows a badge when an update is available.
- [ ] Update button opens release page correctly.

## Public Download Page

- [ ] Windows card resolves latest `.exe` asset.
- [ ] macOS card resolves latest `.dmg` asset.
- [ ] Linux card resolves latest `.AppImage` asset.
- [ ] Fallback links still work when GitHub API is unavailable.

## Final Verification

- [ ] `npm run lint` passes.
- [ ] Quick smoke run on Windows build is successful.
- [ ] No secrets or local machine paths were committed.
