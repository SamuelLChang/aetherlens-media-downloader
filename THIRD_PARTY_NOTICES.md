# Third-Party Notices

This repository code is MIT-licensed (see `LICENSE`).

The app may use third-party tools at runtime and packaging time. If you redistribute those tools, you are responsible for meeting their license obligations.

## Runtime/Packaging Tools

- `yt-dlp` (The Unlicense): downloader/extractor backend.
- `ffmpeg` (LGPL 2.1+ by default, GPL if built/configured with GPL components): media conversion/merge support.
- `aria2c` (GPLv2): accelerated downloads.

## Distribution Guidance

- Default releases should avoid bundling helper binaries unless required.
- If you bundle helper binaries, include required license texts/attributions/source-offer requirements where applicable.
- Re-check obligations before each release.
- Verify license terms of the exact binary build you distribute (especially for `ffmpeg`).

## Trademarks

Platform/product names used in the app are property of their respective owners and do not imply affiliation or endorsement.
