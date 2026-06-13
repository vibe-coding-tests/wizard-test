// Dev helper: load the game headless and dump any console/page errors.
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:5173';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.stack || e}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
await page.goto(`${BASE}/?auto=1&map=dust2&team=order&char=harry`, { waitUntil: 'domcontentloaded' });
try {
  await page.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 15000 });
  console.log('game booted OK');
} catch {
  console.log('game did NOT boot');
}
console.log(errors.slice(0, 8).join('\n') || 'no errors');
await browser.close();
