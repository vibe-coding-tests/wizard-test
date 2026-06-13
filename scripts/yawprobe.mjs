// Dev helper: one rig at four yaws to confirm which way the model faces.
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:5173';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 760 } })).newPage();
await page.goto(`${BASE}/?auto=1&map=quidditch&team=order&char=harry&squad=hermione,ron,ginny,neville&foes=voldemort,snape,lucius,bellatrix,draco`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 20000 });
await page.evaluate(() => {
  const g = window.__game;
  for (let i = 0; i < 6 / 0.025; i++) g.update(0.025);
  const h = g.human;
  const b = g.world.bounds;
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  const gy = g.world.groundY(cx, cz, 5);
  for (const p of g.players) if (p.bot) { p.bot.update = () => {}; Object.assign(p.ctrl, { moveX: 0, moveZ: 0, castHeld: false, jump: false, crouch: false }); p.pos.set(cx + 60, gy, cz + 60); }
  // four leftmost order bots at yaw 0, PI/2, PI, 3PI/2 (left to right)
  const ids = ['hermione', 'ron', 'ginny', 'neville'];
  ids.forEach((id, i) => {
    const p = g.players.find((q) => q.charId === id);
    if (!p) return;
    p.alive = true; p.health = 100;
    p.pos.set(cx - 4.5 + i * 3, gy + 0.02, cz - 4);
    p.vel.set(0, 0, 0);
    p.yaw = i * Math.PI / 2; // 0, 90, 180, 270
  });
  h.pos.set(cx, gy + 0.02, cz + 2);
  h.yaw = 0; h.pitch = -0.1;
  for (let i = 0; i < 40; i++) {
    for (const p of g.players) p.vel.set(0, Math.min(0, p.vel.y), 0);
    g.update(0.016);
  }
  g.hud.el.style.display = 'none';
});
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/yawprobe.png' });
await browser.close();
console.log('written shots/yawprobe.png  (left→right: yaw 0, 90, 180, 270)');
