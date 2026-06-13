// Dev helper: close-up portraits of a few rigs + FP wand + bolts in flight.
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:5173';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 760 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${BASE}/?auto=1&map=quidditch&team=order&char=harry&squad=dumbledore,mcgonagall,hermione,ron&foes=voldemort,snape,lucius,bellatrix,draco`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 20000 });

// 1. four rigs right in front of the camera
await page.evaluate(() => {
  const g = window.__game;
  for (let i = 0; i < 6 / 0.025; i++) g.update(0.025);
  const order = ['dumbledore', 'mcgonagall', 'voldemort', 'snape'];
  const h = g.human;
  const b = g.world.bounds;
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  const gy = g.world.groundY(cx, cz, 5);
  for (const p of g.players) if (p.bot) { p.bot.update = () => {}; Object.assign(p.ctrl, { moveX: 0, moveZ: 0, castHeld: false, jump: false, crouch: false }); p.pos.set(cx + 40, gy, cz + 40); }
  order.forEach((id, i) => {
    const p = g.players.find((q) => q.charId === id);
    if (!p) return;
    p.alive = true; p.health = 100;
    p.pos.set(cx - 2.7 + i * 1.8, gy + 0.02, cz - 2.6);
    p.vel.set(0, 0, 0);
    p.yaw = 0;
  });
  h.pos.set(cx, gy + 0.02, cz + 0.6);
  h.yaw = 0; h.pitch = 0.06;
  for (let i = 0; i < 40; i++) {
    for (const p of g.players) p.vel.set(0, Math.min(0, p.vel.y), 0);
    g.update(0.016);
  }
  g.hud.el.style.display = 'none';
});
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/closeup-a.png' });

// 2. second four
await page.evaluate(() => {
  const g = window.__game;
  const order = ['hermione', 'ron', 'lucius', 'bellatrix'];
  const h = g.human;
  const b = g.world.bounds;
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  const gy = g.world.groundY(cx, cz, 5);
  for (const p of g.players) if (p.bot) p.pos.set(cx + 40, gy, cz + 40);
  order.forEach((id, i) => {
    const p = g.players.find((q) => q.charId === id);
    if (!p) return;
    p.alive = true; p.health = 100;
    p.pos.set(cx - 2.7 + i * 1.8, gy + 0.02, cz - 2.6);
    p.vel.set(0, 0, 0);
    p.yaw = 0;
  });
  for (let i = 0; i < 40; i++) {
    for (const p of g.players) p.vel.set(0, Math.min(0, p.vel.y), 0);
    g.update(0.016);
  }
});
await page.waitForTimeout(250);
await page.screenshot({ path: 'shots/closeup-b.png' });

// 3. FP wand while charging avada (harry uses stupefy colors otherwise)
await page.evaluate(() => {
  const g = window.__game, h = g.human;
  h.owned.add('avada');
  h.curSpell = 'avada';
  h.mana = 200;
  h.charge = { t: 0.6, total: 1.0 };
  g.update(0.016);
});
await page.waitForTimeout(150);
await page.screenshot({ path: 'shots/closeup-fp-charge.png' });

// 4. bolts in flight, close to camera
await page.evaluate(async () => {
  const { SPELLS } = await import('/src/data.js');
  const g = window.__game, h = g.human;
  h.charge = null;
  const b = g.world.bounds;
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  const gy = g.world.groundY(cx, cz, 5);
  for (const p of g.players) if (p.bot) p.pos.set(cx + 40, gy, cz + 40);
  const enemy = g.players.find((p) => p.team !== h.team);
  const mk = (id, x, y) => {
    const spell = SPELLS[id];
    const fx = g.effects.acquireBolt(spell);
    fx.group.position.set(x, y, cz - 7);
    fx.group.lookAt(x, y, cz + 10);
    g.spells.projectiles.push({ x, y, z: cz - 7, vx: 0, vy: 0, vz: 10, spell, owner: enemy, life: 5, traveled: 0, gravity: 0, fx });
  };
  mk('stupefy', cx - 1.8, gy + 1.7);
  mk('avada', cx - 0.6, gy + 1.5);
  mk('expelliarmus', cx + 0.6, gy + 1.62);
  mk('sectum', cx + 1.8, gy + 1.55);
  h.pos.set(cx, gy + 0.02, cz + 0.6);
  h.yaw = 0; h.pitch = 0.02;
  for (let i = 0; i < 6; i++) g.update(1 / 60);
});
await page.screenshot({ path: 'shots/closeup-bolts.png' });

console.log(JSON.stringify({ errors: errors.slice(0, 6) }));
await browser.close();
