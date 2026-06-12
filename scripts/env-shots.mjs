// One-off: verification screenshots for the environment systems + bot-brain menu.
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
const load = async (qs) => {
  await page.goto(`${BASE}/?auto=1&${qs}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game?.state, null, { timeout: 20000 });
};
// park the human at a vantage point looking at a target
const vantage = (x, z, tx, ty, tz) => page.evaluate(([x, z, tx, ty, tz]) => {
  const g = window.__game;
  const h = g.human;
  for (const p of g.players) if (p.bot) {
    p.bot.update = () => {};
    Object.assign(p.ctrl, { moveX: 0, moveZ: 0, castHeld: false, altHeld: false });
  }
  const gy = g.world.floorY(x, z, 30);
  h.pos.set(x, gy + 0.05, z); h.vel.set(0, 0, 0);
  const eye = h.eyePos();
  h.yaw = Math.atan2(tx - eye.x, tz - eye.z) + Math.PI;
  h.pitch = Math.atan2(ty - eye.y, Math.hypot(tx - eye.x, tz - eye.z));
  g.handleHumanInput = () => {};
  g.input.locked = true;
}, [x, z, tx, ty, tz]);

// 1. the bot-brain section of the setup menu (custom selected, sliders live)
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1100);
await page.click('text=CURSED RELIC').catch(() => {});
await page.waitForTimeout(700);
await page.click('.sel-card.diff:has-text("Custom")').catch(() => {});
await page.waitForTimeout(250);
await page.evaluate(() => document.querySelector('.card-row.diffs')?.scrollIntoView({ block: 'center' }));
await page.waitForTimeout(250);
await shot('menu-botbrain');

// 2. dust2: barrel mid-detonation at long doors (live loop renders the fireball)
await load('map=dust2&team=order&char=harry&diff=normal');
await ff(6);
await page.evaluate(() => window.__game.hud.openBuy(false));
await vantage(23, 31, 31.5, 1.2, 27);
await page.evaluate(() => {
  const g = window.__game;
  const b = g.env.breakables.find((r) => r.kind === 'barrel' && !r.dead);
  g.env.queueBoom(b, g.human, 0.03);
});
await page.waitForTimeout(160);
await shot('env-barrel-boom');

// 3. hogsmeade: the dragon strafes a bot down the high street; we watch from the side
await load('map=hogsmeade&team=order&char=harry&diff=normal');
await ff(6);
await page.evaluate(() => window.__game.hud.openBuy(false));
await vantage(-6, 30, 2, 10, -4);
await page.evaluate(() => {
  const g = window.__game;
  const bait = g.players.find((p) => p.team !== g.human.team && p.alive);
  bait.pos.set(2, 0.1, -6);
  g.env.dragon.cdUntil = 0;
  g.env.provoke(bait);
});
await page.waitForTimeout(2400); // dive (1.6s) → into the breath pass
await page.evaluate(() => {
  const g = window.__game;
  const d = g.env.dragon.grp.position;
  const h = g.human;
  const eye = h.eyePos();
  h.yaw = Math.atan2(d.x - eye.x, d.z - eye.z) + Math.PI;
  h.pitch = Math.atan2(d.y - 1 - eye.y, Math.hypot(d.x - eye.x, d.z - eye.z));
});
await page.waitForTimeout(300);
await shot('env-dragon-breath');

// 4. the Great Hall: candles + the dinner bell down the nave
await load('map=hall&team=order&char=harry&diff=normal');
await ff(6);
await page.evaluate(() => window.__game.hud.openBuy(false));
await vantage(0, 6, 0, 6.0, -30);
await page.evaluate(() => {
  const g = window.__game;
  g.env.ringBell(g.env.bells[0], g.human);
});
await ff(0.3);
await page.waitForTimeout(350);
await shot('env-hall-bell');

await browser.close();
console.log('shots written to shots/');
