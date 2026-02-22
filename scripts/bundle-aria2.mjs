import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const currentFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(currentFile), '..');
const binDir = path.join(rootDir, 'bin');
const targetName = process.platform === 'win32' ? 'aria2c.exe' : 'aria2c';
const targetPath = path.join(binDir, targetName);

const ensureBinDir = () => {
  fs.mkdirSync(binDir, { recursive: true });
};

const alreadyBundled = () => {
  try {
    if (!fs.existsSync(targetPath)) return false;
    const probe = spawnSync(targetPath, ['--version'], { stdio: 'ignore', windowsHide: true });
    return probe.status === 0;
  } catch {
    return false;
  }
};

const findOnPath = () => {
  if (process.platform === 'win32') {
    const where = spawnSync('where', ['aria2c'], { encoding: 'utf-8', windowsHide: true });
    if (where.status !== 0 || !where.stdout) return null;
    const first = where.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    return first || null;
  }

  const which = spawnSync('which', ['aria2c'], { encoding: 'utf-8' });
  if (which.status !== 0 || !which.stdout) return null;
  return which.stdout.trim() || null;
};

const copyIfAvailable = () => {
  ensureBinDir();

  if (alreadyBundled()) {
    console.log('[prepare:aria2] Bundled aria2 already available:', targetPath);
    return;
  }

  const source = findOnPath();
  if (!source) {
    console.warn('[prepare:aria2] aria2c not found on PATH. Installer will rely on system PATH at runtime.');
    return;
  }

  try {
    fs.copyFileSync(source, targetPath);
    if (process.platform !== 'win32') {
      fs.chmodSync(targetPath, 0o755);
    }
    console.log('[prepare:aria2] Bundled aria2 from:', source);
  } catch (error) {
    console.warn('[prepare:aria2] Failed to bundle aria2 binary:', error instanceof Error ? error.message : String(error));
  }
};

copyIfAvailable();
