// Staged screenshots: character lineup, bolt visuals, clash, setup menu. Dev-only.
// Usage: node scripts/v2-shots.mjs [baseUrl]
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = process.argv[2] || 'http://localhost:5173';
mkdirSync('shots', { recursive: true });
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

// 1. setup menu with disciplines + playstyles
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(700);
await page.screenshot({ path: 'shots/v2-mainmenu.png' });
await page.click('.main-btn'); // PLAY
await page.waitForTimeout(400);
await page.evaluate(() => {
  document.querySelector('.setup-scroll').scrollTop = 600; // show champions + disciplines
});
await page.waitForTimeout(200);
await page.screenshot({ path: 'shots/v2-setup.png' });

// 2. in-game: lineup of all 8 champions
await page.goto(`${BASE}/?auto=1&map=dust2&team=order&char=harry&diff=normal&disc=duelist`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 20000 });
await page.evaluate(async () => {
  const { CHARACTERS } = await import('/src/data.js');
  const { Player, Rig } = await import('/src/player.js');
  const g = window.__game;
  for (let i = 0; i < 400; i++) g.update(0.025);
  for (const p of g.players) if (p.bot) {
    p.bot.update = () => {};
    g.spells.cancelCharge(p);
    Object.assign(p.ctrl, { moveX: 0, moveZ: 0, castHeld: false, altHeld: false, jump: false });
    p.rig.group.visible = false; // hide the real bots
  }
  g.spells.clear();
  const h = g.human;
  const sp = g.world.spawns.order[0];
  const gy = g.world.groundY(sp.x, sp.z, 30);
  // build one display rig per champion in a line facing the camera
  window.__lineup = [];
  CHARACTERS.forEach((c, i) => {
    const team = c.side;
    const dummy = new Player(g, { name: c.name.split(' ').pop(), charId: c.id, team });
    dummy.pos.set(sp.x - 5.25 + i * 1.5, gy + 0.02, sp.z - 6);
    dummy.yaw = 0; // model faces -z when yaw=PI applied; yaw 0 turns it toward us
    dummy.alive = true;
    const rig = new Rig(g.scene, dummy);
    dummy.rig = rig;
    rig.update(0.016, dummy);
    window.__lineup.push({ dummy, rig });
  });
  h.pos.set(sp.x, gy + 0.05, sp.z); h.vel.set(0, 0, 0);
  h.yaw = 0; h.pitch = -0.02;
  window.__lab = { sp, gy };
});
await page.waitForTimeout(500);
await page.evaluate(() => { for (const { dummy, rig } of window.__lineup) rig.update(0.016, dummy); });
await page.screenshot({ path: 'shots/v2-lineup.png' });

// 3. bolt visuals: a volley in flight (stupefy, avada, expelliarmus, sectum)
await page.evaluate(async () => {
  const { SPELLS } = await import('/src/data.js');
  const g = window.__game, h = g.human, { sp, gy } = window.__lab;
  for (const { rig } of window.__lineup) { rig.group.visible = false; }
  const mk = (id, x, y) => {
    const spell = SPELLS[id];
    const fx = g.effects.acquireBolt(spell);
    fx.group.position.set(x, y, sp.z - 9);
    fx.group.lookAt(x, y, sp.z + 10);
    g.spells.projectiles.push({ x, y, z: sp.z - 9, vx: 0, vy: 0, vz: 14, spell, owner: g.players.find((p) => p.team !== h.team), life: 5, traveled: 0, gravity: 0, fx });
  };
  mk('stupefy', sp.x - 2.6, gy + 1.7);
  mk('avada', sp.x - 0.9, gy + 1.45);
  mk('expelliarmus', sp.x + 0.9, gy + 1.6);
  mk('sectum', sp.x + 2.6, gy + 1.5);
  h.yaw = 0; h.pitch = -0.03;
});
await page.waitForTimeout(420);
await page.screenshot({ path: 'shots/v2-bolts.png' });

// 4. clash: two bolts annihilate head-on
await page.evaluate(async () => {
  const { SPELLS } = await import('/src/data.js');
  const g = window.__game, h = g.human, { sp, gy } = window.__lab;
  g.spells.clear();
  const enemy = g.players.find((p) => p.team !== h.team);
  const mate = g.players.find((p) => p.team === h.team && p !== h);
  const y = gy + 1.55, z = sp.z - 8;
  const mkP = (spell, x, vx, owner) => {
    const fx = g.effects.acquireBolt(spell);
    fx.group.position.set(x, y, z);
    g.spells.projectiles.push({ x, y, z, vx, vy: 0, vz: 0, spell, owner, life: 5, traveled: 0, gravity: 0, fx });
  };
  mkP(SPELLS.stupefy, sp.x - 6, 30, mate);
  mkP(SPELLS.avada, sp.x + 6, -30, enemy);
  // step just past the moment of impact so the flash is at full bloom
  for (let i = 0; i < 13; i++) g.update(1 / 60);
  h.yaw = 0; h.pitch = -0.03;
});
await page.screenshot({ path: 'shots/v2-clash.png' });

console.log(JSON.stringify({ errors }, null, 1));
await browser.close();
