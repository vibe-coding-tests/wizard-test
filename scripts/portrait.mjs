// Dev helper: two big portraits — same character at yaw 0 and yaw PI —
// camera 2.2m away, to verify facing and close-up geometry.
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:5173';
const CHAR_A = process.argv[3] || 'dumbledore';
const CHAR_B = process.argv[4] || 'voldemort';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 760 } })).newPage();
const squad = process.argv[5] || 'dumbledore,mcgonagall,hermione,ron';
const foes = process.argv[6] || 'voldemort,snape,lucius,bellatrix,draco';
await page.goto(`${BASE}/?auto=1&map=quidditch&team=order&char=harry&squad=${squad}&foes=${foes}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 20000 });
await page.evaluate(([idA, idB]) => {
  const g = window.__game;
  for (let i = 0; i < 6 / 0.025; i++) g.update(0.025);
  const h = g.human;
  const b = g.world.bounds;
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  const gy = g.world.groundY(cx, cz, 5);
  for (const p of g.players) if (p.bot) { p.bot.update = () => {}; Object.assign(p.ctrl, { moveX: 0, moveZ: 0, castHeld: false, jump: false, crouch: false }); p.pos.set(cx + 60, gy, cz + 60); }
  const a = g.players.find((q) => q.charId === idA);
  const v = g.players.find((q) => q.charId === idB);
  a.alive = v.alive = true; a.health = v.health = 100;
  a.pos.set(cx - 0.8, gy + 0.02, cz - 1.9); a.vel.set(0, 0, 0); a.yaw = 0;
  v.pos.set(cx + 0.8, gy + 0.02, cz - 1.9); v.vel.set(0, 0, 0); v.yaw = Math.PI;
  h.pos.set(cx, gy + 0.02, cz + 0.7);
  h.yaw = 0; h.pitch = -0.22;
  for (let i = 0; i < 40; i++) {
    for (const p of g.players) p.vel.set(0, Math.min(0, p.vel.y), 0);
    g.update(0.016);
  }
  g.hud.el.style.display = 'none';
}, [CHAR_A, CHAR_B]);
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/portrait.png' });
await browser.close();
console.log(`written shots/portrait.png  (left: ${CHAR_A} yaw 0, right: ${CHAR_B} yaw PI)`);
