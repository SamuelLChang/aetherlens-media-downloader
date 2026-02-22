import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { _electron as electron } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const electronExecutable = path.join(
  projectRoot,
  'node_modules',
  'electron',
  'dist',
  process.platform === 'win32' ? 'electron.exe' : 'electron'
);

const mainEntry = path.join(projectRoot, 'dist-electron', 'main.js');
const screenshotPath = path.join(projectRoot, 'docs', 'screenshots', 'setup-wizard-first-run.png');

const run = async () => {
  await mkdir(path.dirname(screenshotPath), { recursive: true });

  const app = await electron.launch({
    executablePath: electronExecutable,
    args: [mainEntry],
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
  });

  try {
    const page = await app.firstWindow();

    await page.setViewportSize({ width: 1280, height: 840 });
    await page.waitForTimeout(1200);

    // Force first-run wizard visibility for deterministic capture.
    await page.evaluate(() => {
      localStorage.removeItem('aetherlens-setup-complete-v1');
    });

    await page.reload();
    await page.waitForTimeout(1800);

    await page.screenshot({
      path: screenshotPath,
      fullPage: false,
    });

    console.log(`Saved screenshot: ${screenshotPath}`);
  } finally {
    await app.close();
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
