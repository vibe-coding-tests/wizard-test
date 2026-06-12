// Staged screenshots of the defensive kit + map fidelity work. Dev-only.
// Usage: node scripts/def-shots.mjs [baseUrl]
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = process.argv[2] || 'http://localhost:5173';
mkdirSync('shots', { recursive: true });
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();

await page.goto(`${BASE}/?auto=1&map=dust2&team=order&char=harry&diff=normal`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 20000 });

const shot = (name) => page.screenshot({ path: `shots/${name}.png` });

// 0. buy menu with the new kit (auto-opens during freeze; switch to Spells tab)
await page.waitForTimeout(600);
await page.click('.buy-tab:nth-child(2)');
await page.waitForTimeout(250);
await shot('def-buymenu');

// into live, freeze the bots, stage the lab
await page.evaluate(async () => {
  const g = window.__game;
  g.hud.openBuy(false);
  for (let i = 0; i < 400; i++) g.update(0.025);
  for (const p of g.players) if (p.bot) {
    p.bot.update = () => {};
    g.spells.cancelCharge(p);
    Object.assign(p.ctrl, { moveX: 0, moveZ: 0, castHeld: false, altHeld: false, jump: false });
  }
  g.spells.clear();
  const h = g.human;
  h.health = h.stats.hp; h.bleeds.length = 0; h.burnT = 0; h.slowT = 0;
  const sp = g.world.spawns.order[0];
  const gy = g.world.groundY(sp.x, sp.z, 30);
  h.pos.set(sp.x, gy + 0.05, sp.z); h.vel.set(0, 0, 0);
  window.__lab = { sp, gy };
});

// 1. patronus ward wall glowing mid-air with a blocked bolt splash
await page.evaluate(async () => {
  const { SPELLS } = await import('/src/data.js');
  const g = window.__game, h = g.human, { sp, gy } = window.__lab;
  h.yaw = 0; h.pitch = -0.04;
  const v = g.players.find((p) => p.team !== h.team && p.alive);
  v.pos.set(sp.x + 1.5, gy + 0.05, sp.z - 11); v.vel.set(0, 0, 0);
  v.yaw = Math.PI;
  const wardPos = h.pos.clone(); wardPos.z -= 5;
  g.effects.spawnWard(wardPos, Math.PI, h, SPELLS.patronum); // wall facing the enemy
  // an enemy bolt streaks in and dies on the veil
  const fx = g.effects.acquireBolt(SPELLS.stupefy);
  fx.group.position.set(v.pos.x - 0.5, gy + 1.5, v.pos.z + 1);
  g.spells.projectiles.push({ x: v.pos.x - 0.5, y: gy + 1.5, z: v.pos.z + 1, vx: -4, vy: 0, vz: 46, spell: SPELLS.stupefy, owner: v, life: 5, traveled: 0, gravity: 0, fx });
});
await page.waitForTimeout(700);
await shot('def-ward');

// 2. petrified enemy: stone statue + dust
await page.evaluate(async () => {
  const { SPELLS } = await import('/src/data.js');
  const g = window.__game, h = g.human, { sp, gy } = window.__lab;
  for (const w of g.effects.wards) w.t = Math.min(w.t, 0.05);
  const v = g.players.find((p) => p.team !== h.team && p.alive);
  v.pos.set(sp.x, gy + 0.05, sp.z - 4.5); v.vel.set(0, 0, 0);
  v.yaw = Math.PI;
  h.yaw = 0; h.pitch = -0.1;
  g.spells.boltHit({ spell: SPELLS.petrificus, owner: h, traveled: 4, vx: 0, vy: 0, vz: -40 }, v, false, v.eyePos());
  v.freezeT = 2.5; // hold the pose for the shot
});
await page.waitForTimeout(600);
await shot('def-petrified');

// 3. human PETRIFIED: stone vignette + status chip
await page.evaluate(() => {
  const g = window.__game, h = g.human;
  const v = g.players.find((p) => p.team !== h.team && p.alive);
  if (v) v.freezeT = 0;
  h.applyFreeze(1.6, g);
  h.freezeT = 2.0;
});
await page.waitForTimeout(400);
await shot('def-petrified-pov');

// 4. spawn pads + banner at order spawn (third-person view from behind)
await page.evaluate(() => {
  const g = window.__game, h = g.human, { sp, gy } = window.__lab;
  h.freezeT = 0;
  h.pos.set(sp.x - 3, gy + 0.05, sp.z + 7);
  h.yaw = Math.PI + 2.6; h.pitch = -0.25;
});
await page.waitForTimeout(350);
await shot('def-spawnpad');

await browser.close();
console.log('def shots saved to shots/');
