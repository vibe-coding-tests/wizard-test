// Screenshots of the new maps: spawn view + a site/mid vantage per map.
// Usage: node scripts/map-shots.mjs [baseUrl] [mapsCsv]
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = process.argv[2] || 'http://localhost:5174';
const MAPS = (process.argv[3] || 'mirage,nuke,hall,dungeons,astronomy,quidditch,hogsmeade,chamber').split(',');
mkdirSync('shots', { recursive: true });

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();

// per-map vantage: [x, z, yaw, pitch] (yaw 0 faces -z), null → site A view
const VIEWS = {
  mirage: [[-30, 0, -Math.PI / 2 - 0.4, 0.06], [16, -10, Math.PI * 0.85, 0.1]],
  nuke: [[-30, 4, -Math.PI / 2, 0.04], [22, 12, Math.PI * 0.75, 0.12]],
  hall: [[0, -40, Math.PI, 0.04], [0, 8, Math.PI, 0.1]],
  dungeons: [[-30, 0, -Math.PI / 2, 0.02], [-2, -2, Math.PI * 0.9, 0.08]],
  astronomy: [[0, -36, Math.PI, 0.02], [-18, 14, Math.PI * 0.6, 0.14]],
  quidditch: [[-22, -6, -Math.PI / 2 + 0.4, 0.02], [0, 24, Math.PI, 0.05]],
  hogsmeade: [[0, -42, Math.PI, 0.02], [-2, 12, Math.PI * 0.65, 0.05]],
  chamber: [[0, -36, Math.PI, 0.02], [0, 6, Math.PI, 0.08]],
  diagon: [[0, 36, 0, 0.02], [-2, -4, Math.PI / 2, 0.05], [21, 24, 0, 0.04]],
  gringotts: [[0, 22, 0, 0.04], [-28, -32, 0.42, 0.06], [0, 30, Math.PI, 0.25]],
  ministry: [[0, 28, 0, 0.04], [32, 0, 0, 0.05], [0, -36, Math.PI, 0.06]],
};

for (const map of MAPS) {
  await page.goto(`${BASE}/?auto=1&map=${map}&team=order&char=harry&diff=normal`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'live' || window.__game?.state === 'freeze' || window.__game?.state === 'warmup', null, { timeout: 25000 });
  await page.waitForTimeout(900);
  const views = VIEWS[map] || [[0, 0, 0, 0]];
  for (let vi = 0; vi < views.length; vi++) {
    const [x, z, yaw, pitch] = views[vi];
    await page.evaluate(({ x, z, yaw, pitch }) => {
      const g = window.__game;
      const h = g.human;
      const y = g.world.floorY(x, z, 30);
      h.pos.set(x, y + 0.05, z);
      h.vel.set(0, 0, 0);
      h.yaw = yaw; h.pitch = pitch;
      g.hud.openBuy(false);
      g.updateCamera(0.016);
    }, { x, z, yaw, pitch });
    await page.waitForTimeout(450);
    await page.screenshot({ path: `shots/map-${map}-${vi}.png` });
  }
  console.log(`[shots] ${map} done`);
}
await browser.close();
