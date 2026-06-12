// Probe attacker route progress (do bots reach sites / plant?). Dev-only.
// Usage: node scripts/debug-routes.mjs [baseUrl] [map]
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:5173';
const MAP = process.argv[3] || 'dust2';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1024, height: 768 } })).newPage();

await page.goto(`${BASE}/?auto=1&map=${MAP}&team=order&char=harry&diff=normal`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 20000 });
await page.evaluate(() => window.__game.particles.setQuality(0.2));

const out = await page.evaluate(() => {
  const g = window.__game;
  // human idles in spawn so bots decide the round
  const stats = { rounds: 0, plants: 0, routes: {}, stuck: [] };
  const routeOf = new Map();
  let lastRound = g.roundNum;
  const sample = () => {
    for (const p of g.players) {
      if (!p.bot || p.team !== g.attackingTeam) continue;
      const r = p.bot.role;
      if (r?.name) routeOf.set(p.name, r.name);
    }
  };
  for (let i = 0; i < 24000 && !g.over; i++) {
    g.update(0.025);
    if (i % 40 === 0) sample();
    if (g.roundNum !== lastRound) {
      lastRound = g.roundNum;
      stats.rounds++;
      if (stats.rounds >= 6) break;
    }
    if (g.relic.state === 'planted' && !stats._p) { stats._p = true; stats.plants++; }
    if (g.relic.state !== 'planted') stats._p = false;
  }
  // who ended up where: attackers far from any site at round end while alive = suspicious
  for (const p of g.players) {
    if (!p.bot || p.team !== g.attackingTeam || !p.alive) continue;
    const a = g.world.zones.siteA, b = g.world.zones.siteB;
    const dA = Math.hypot(p.pos.x - a.cx, p.pos.z - a.cz);
    const dB = Math.hypot(p.pos.x - b.cx, p.pos.z - b.cz);
    if (Math.min(dA, dB) > 22) stats.stuck.push({ name: p.name, route: routeOf.get(p.name), x: +p.pos.x.toFixed(0), z: +p.pos.z.toFixed(0), viaIdx: p.bot.role?.viaIdx });
  }
  for (const r of routeOf.values()) stats.routes[r] = (stats.routes[r] || 0) + 1;
  delete stats._p;
  return stats;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
