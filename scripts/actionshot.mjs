// Dev helper: let a deathmatch run, then catch bots mid-fight from a high vantage.
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:5173';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 760 } })).newPage();
await page.goto(`${BASE}/?auto=1&mode=dm&map=dust2&team=order&char=harry`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 20000 });
// run the sim until two bots are actually casting at each other
await page.evaluate(() => {
  const g = window.__game;
  g.hud.el.style.display = 'none';
  let caught = 0;
  for (let i = 0; i < 60 / 0.025 && !caught; i++) {
    g.update(0.025);
    if (g.spells.projectiles.length >= 2) caught = 1;
  }
  // park the camera near the densest projectile
  const pr = g.spells.projectiles[0];
  const h = g.human;
  if (pr) {
    const o = pr.owner;
    h.pos.set(o.pos.x - Math.sin(o.yaw + 0.5) * 4, o.pos.y + 0.4, o.pos.z - Math.cos(o.yaw + 0.5) * 4);
    h.yaw = o.yaw + 0.12; h.pitch = -0.05;
    h.alive = true;
  }
  g.update(0.016);
});
await page.waitForTimeout(200);
await page.screenshot({ path: 'shots/action.png' });
await browser.close();
console.log('written shots/action.png');
