// Staged screenshots of on-hit effects. Dev-only.
// Usage: node scripts/fx-shots.mjs [baseUrl]
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = process.argv[2] || 'http://localhost:5174';
mkdirSync('shots', { recursive: true });
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();

await page.goto(`${BASE}/?auto=1&map=dust2&team=order&char=harry&diff=normal`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 20000 });

// into live, freeze the bots, stage the lab
await page.evaluate(async () => {
  const g = window.__game;
  for (let i = 0; i < 400; i++) g.update(0.025);
  for (const p of g.players) if (p.bot) {
    p.bot.update = () => {};
    Object.assign(p.ctrl, { moveX: 0, moveZ: 0, castHeld: false, altHeld: false, jump: false });
  }
  const h = g.human;
  h.health = h.stats.hp; h.bleeds.length = 0; h.burnT = 0; h.slowT = 0; // undo warmup scuffles
  const sp = g.world.spawns.order[0];
  const gy = g.world.groundY(sp.x, sp.z, 30);
  h.pos.set(sp.x, gy + 0.05, sp.z); h.vel.set(0, 0, 0);
  window.__lab = { sp, gy };
});

const shot = (name) => page.screenshot({ path: `shots/${name}.png` });

// 1. burning victim + orange vignette on the human
await page.evaluate(async () => {
  const { SPELLS } = await import('/src/data.js');
  const g = window.__game, h = g.human, { sp, gy } = window.__lab;
  const v = g.players.find((p) => p.team !== h.team && p.alive);
  v.pos.set(sp.x, gy + 0.05, sp.z - 5); v.vel.set(0, 0, 0);
  v.yaw = Math.PI;
  h.yaw = 0; h.pitch = -0.05; // looking -z at victim
  g.effects.spawnFire(v.pos.clone(), SPELLS.incendio, h);
  g.effects.igniteFX(v);
  v.burnT = 3;
  h.burnT = 2.5; // human shows the vignette too
});
await page.waitForTimeout(1200);
await shot('fx-burning');

// 2. human disarmed: empty frantic hands + wand glinting on the floor
await page.evaluate(() => {
  const g = window.__game, h = g.human;
  h.health = h.stats.hp; h.bleeds.length = 0; h.burnT = 0;
  for (const f of g.effects.fires) f.t = 0.01;
  h.applyDisarm(2.0, g, { x: 0, y: 0, z: -1 });
  h.pitch = -0.35;
});
await page.waitForTimeout(1100);
await shot('fx-disarmed');

// 3. avada corpse launch + green wisp
await page.evaluate(async () => {
  const { SPELLS } = await import('/src/data.js');
  const g = window.__game, h = g.human, { sp, gy } = window.__lab;
  h.disarmT = 0;
  const v = g.players.find((p) => p.team !== h.team && p.alive);
  v.pos.set(sp.x, gy + 0.05, sp.z - 6); v.vel.set(0, 0, 0);
  h.yaw = 0; h.pitch = -0.05;
  g.spells.boltHit({ spell: SPELLS.avada, owner: h, traveled: 5, vx: 0, vy: 0, vz: -82 }, v, false, v.eyePos());
});
await page.waitForTimeout(450);
await shot('fx-avada');

// 4. crucio writhe + purple vignette (human slowed)
await page.evaluate(() => {
  const g = window.__game, h = g.human;
  const v = g.players.find((p) => p.team !== h.team && p.alive);
  if (v) {
    v.pos.set(window.__lab.sp.x - 2, window.__lab.gy + 0.05, window.__lab.sp.z - 5);
    v.slowT = 1.5;
    g.effects.crucioFX(v);
  }
  h.slowT = 1.5;
  g.hud.notice('CRUCIO — SLOWED!', 'bad');
});
await page.waitForTimeout(350);
await shot('fx-crucio');

await browser.close();
console.log('fx shots saved to shots/');
