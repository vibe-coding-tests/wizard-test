// Throwaway: stage and screenshot the v3 features (scope, snake, drops, flight).
import { chromium } from 'playwright';
const BASE = process.argv[2] || 'http://localhost:5174';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const shot = (n) => page.screenshot({ path: `/tmp/ws-${n}.png` });

async function fresh() {
  await page.goto(`${BASE}/?auto=1&map=dust2&team=order&char=harry&diff=normal`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 20000 });
  await page.evaluate(() => {
    const g = window.__game;
    for (let i = 0; i < 320; i++) g.update(0.025);
    g.handleHumanInput = () => {};
    g.input.locked = true;
    for (const p of g.players) if (p.bot) {
      p.bot.update = () => {};
      g.spells.cancelCharge(p);
      Object.assign(p.ctrl, { moveX: 0, moveZ: 0, castHeld: false, altHeld: false, jump: false });
    }
    g.spells.clear();
  });
}

// 1) Avada scope zoom mid-charge
await fresh();
await page.evaluate(() => {
  const g = window.__game, h = g.human;
  const sp = g.world.spawns.order[0];
  const gy = g.world.groundY(sp.x, sp.z, 30);
  h.pos.set(sp.x, gy + 0.05, sp.z); h.yaw = Math.PI / 4; h.pitch = 0;
  const foe = g.players.find((p) => p.team !== h.team && p.alive);
  const d = h.lookDir();
  foe.pos.set(sp.x + d.x * 22, gy + 0.05, sp.z + d.z * 22);
  h.owned.add('avada'); h.curSpell = 'avada'; h.mana = 200;
  h.ctrl.castHeld = true;
  for (let i = 0; i < 60; i++) g.update(0.016);
});
await page.waitForTimeout(400);
await shot('scope');

// 2) serpensortia snake hunting a death eater
await fresh();
await page.evaluate(() => {
  const g = window.__game, h = g.human;
  const sp = g.world.spawns.order[0];
  const gy = g.world.groundY(sp.x, sp.z, 30);
  h.pos.set(sp.x, gy + 0.05, sp.z); h.yaw = Math.PI / 4; h.pitch = -0.15;
  const d = h.lookDir();
  const prey = g.players.find((p) => p.team !== h.team && p.alive);
  prey.pos.set(sp.x + d.x * 10, gy + 0.05, sp.z + d.z * 10);
  const { SPELLS } = g.constructor.SPELLS ? g.constructor : { SPELLS: null };
  h.owned.add('serpensortia'); h.charges.serpensortia = 1; h.mana = 200;
  import('/src/data.js').then(({ SPELLS }) => {
    g.spells.fire(h, SPELLS.serpensortia);
    for (let i = 0; i < 50; i++) g.update(0.016);
  });
});
await page.waitForTimeout(600);
await shot('snake');

// 3) loot drops + pickup hint
await page.evaluate(async () => {
  const { wandById } = await import('/src/data.js');
  const g = window.__game, h = g.human;
  const sp = g.world.spawns.order[0];
  const gy = g.world.groundY(sp.x, sp.z, 30);
  g.clearDrops();
  h.wand = wandById('holly');
  h.pos.set(sp.x, gy + 0.05, sp.z); h.yaw = Math.PI / 4; h.pitch = -0.35;
  const d = h.lookDir();
  g.addDrop({ kind: 'wand', id: 'elder', name: 'The Elder Wand' }, sp.x + d.x * 1.2, sp.z + d.z * 1.2);
  g.addDrop({ kind: 'spell', id: 'bombarda', name: 'Bombarda' }, sp.x + d.x * 2.6 + 0.8, sp.z + d.z * 2.6);
  g.addDrop({ kind: 'equip', id: 'potion', name: 'Healing Potion' }, sp.x + d.x * 2.2 - 1.0, sp.z + d.z * 2.2);
  for (let i = 0; i < 30; i++) g.update(0.016);
});
await page.waitForTimeout(400);
await shot('drops');

// 4) broom flight over mid
await page.evaluate(() => {
  const g = window.__game, h = g.human;
  const sp = g.world.spawns.order[0];
  const gy = g.world.groundY(sp.x, sp.z, 30);
  h.pos.set(sp.x, gy + 6, sp.z); h.yaw = Math.PI / 4; h.pitch = -0.35;
  h.equip.broom = 1;
  h.broomFuel = 99;
  h.useEquip('broom');
  for (let i = 0; i < 20; i++) g.update(0.016);
});
await page.waitForTimeout(400);
await shot('flight');

await browser.close();
console.log('shots done');
