// One-off: capture verification screenshots into shots/.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = process.argv[2] || 'http://localhost:5174';
mkdirSync('shots', { recursive: true });
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();

const shot = (name) => page.screenshot({ path: `shots/${name}.png` });
const ff = (secs) => page.evaluate((s) => {
  const g = window.__game;
  for (let i = 0; i < Math.ceil(s / 0.025) && g && !g.over; i++) g.update(0.025);
}, secs);

// main menu
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
await shot('menu-main');

// setup screen
await page.click('text=PLAY VS BOTS').catch(() => {});
await page.waitForTimeout(900);
await shot('menu-setup');

// in-game: combat moment on dust2
await page.goto(`${BASE}/?auto=1&map=dust2&team=order&char=harry&diff=normal`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game?.state, null, { timeout: 20000 });
await ff(6); // through freeze, buy auto-open behind overlay
await page.waitForTimeout(400);
await shot('game-freeze-buy');
// close buy, into the fight
await page.evaluate(() => window.__game.hud.openBuy(false));
await ff(18);
await page.waitForTimeout(300);
await shot('game-live');

// scoreboard
await page.evaluate(() => { const h = window.__game.hud; h.renderScoreboard(); h.scoreboardEl.classList.remove('hidden'); });
await page.waitForTimeout(200);
await shot('game-scoreboard');
await page.evaluate(() => window.__game.hud.scoreboardEl.classList.add('hidden'));

// planted relic visual
await page.evaluate(() => {
  const g = window.__game, r = g.relic, z = g.world.zones.siteA;
  const gy = g.world.groundY(z.cx, z.cz, 10);
  if (r.carrier) { r.carrier.hasRelic = false; r.carrier = null; }
  r.state = 'planted'; r.site = 'A'; r.fuseT = 30; r.planter = g.players.find((p) => p.team === g.attackingTeam);
  r.pos.set(z.cx, gy, z.cz);
  g.effects.plantRelic(r.pos.clone());
  // park the (dead or alive) human camera at the site for the shot
  const h = g.human;
  h.pos.set(z.cx - 6, gy + 0.01, z.cz + 6); h.yaw = Math.atan2(-(z.cx - h.pos.x), -(z.cz - h.pos.z));
});
await ff(2.5);
await page.waitForTimeout(300);
await shot('game-planted');

// aztec vista
await page.goto(`${BASE}/?auto=1&map=aztec&team=death&char=voldemort&diff=normal`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game?.state, null, { timeout: 20000 });
await ff(7);
await page.evaluate(() => window.__game.hud.openBuy(false));
await ff(10);
await page.waitForTimeout(300);
await shot('game-aztec');

await browser.close();
console.log('done');
