// Probe the patronus ward block path with verbose diagnostics. Dev-only.
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:5173';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1024, height: 768 } })).newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message));

await page.goto(`${BASE}/?auto=1&map=dust2&team=order&char=harry&diff=normal`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 20000 });
await page.evaluate(() => window.__game.particles.setQuality(0.3));
await page.evaluate(() => {
  const g = window.__game;
  for (let i = 0; i < 320 && !g.over; i++) g.update(0.025);
});

const out = await page.evaluate(async () => {
  const { SPELLS } = await import('/src/data.js');
  const g = window.__game;
  const h = g.human;
  const log = [];
  for (const p of g.players) if (p.bot) {
    p.bot.update = () => {};
    Object.assign(p.ctrl, { moveX: 0, moveZ: 0, castHeld: false, altHeld: false, jump: false });
  }
  const enemy = g.players.find((p) => p.team !== h.team && p.alive);
  const sp = g.world.spawns.order[0];
  const gy = g.world.groundY(sp.x, sp.z, 30);
  h.pos.set(sp.x, gy + 0.05, sp.z); h.vel.set(0, 0, 0); h.health = h.stats.hp;
  enemy.pos.set(sp.x + 6, gy + 0.05, sp.z); enemy.vel.set(0, 0, 0); enemy.health = enemy.stats.hp;

  const wardPos = h.pos.clone(); wardPos.x += 3;
  const yaw = Math.atan2(enemy.pos.x - h.pos.x, enemy.pos.z - h.pos.z);
  const ward = g.effects.spawnWard(wardPos, yaw, h, SPELLS.patronum);
  log.push({ ward: { x: ward.x, y: ward.y, z: ward.z, nx: ward.nx, nz: ward.nz, hw: ward.hw, h: ward.h, team: ward.team } });

  const fx = g.effects.acquireBolt(SPELLS.stupefy);
  const bx = enemy.pos.x - 1, by = gy + 1.5, bz = enemy.pos.z;
  fx.group.position.set(bx, by, bz);
  g.spells.projectiles.push({ x: bx, y: by, z: bz, vx: -46, vy: 0, vz: 0, spell: SPELLS.stupefy, owner: enemy, life: 5, traveled: 0, gravity: 0, fx });
  log.push({ bolt: { x: bx, y: by, z: bz }, hx: h.pos.x, hHealth: h.health, players: g.players.filter((p) => p.alive).map((p) => ({ t: p.team, x: +p.pos.x.toFixed(1), z: +p.pos.z.toFixed(1), shield: p.shielding })) });

  for (let i = 0; i < 20; i++) {
    g.update(0.025);
    const pr = g.spells.projectiles[0];
    log.push({ i, n: g.spells.projectiles.length, pr: pr ? { x: +pr.x.toFixed(2), y: +pr.y.toFixed(2) } : null, hHealth: h.health, wards: g.effects.wards.length });
    if (!pr) break;
  }
  return log;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
