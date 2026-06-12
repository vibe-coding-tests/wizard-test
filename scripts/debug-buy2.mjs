// Instrument openBuy/toggleBuy to find who closes the menu. Dev-only.
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:5173';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();

await page.goto(`${BASE}/?auto=1&map=dust2&team=order&char=harry&diff=normal`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && window.__game.state === 'freeze', null, { timeout: 20000 });
await page.waitForTimeout(300);

await page.evaluate(() => {
  const hud = window.__game.hud;
  window.__log = [];
  const t0 = performance.now();
  const wrap = (name) => {
    const orig = hud[name].bind(hud);
    hud[name] = (...args) => {
      window.__log.push({
        t: Math.round(performance.now() - t0), fn: name, args: [...args],
        stack: new Error().stack.split('\n').slice(2, 5).join(' | '),
      });
      return orig(...args);
    };
  };
  wrap('openBuy');
  wrap('toggleBuy');
});

await page.keyboard.press('b'); // close
await page.waitForTimeout(300);
await page.keyboard.press('b'); // reopen?
await page.waitForTimeout(300);

const out = await page.evaluate(() => ({
  log: window.__log,
  buyOpen: window.__game.hud.buyOpen,
  state: window.__game.state,
  paused: window.__game.paused,
}));
console.log(JSON.stringify(out, null, 1));
await browser.close();
