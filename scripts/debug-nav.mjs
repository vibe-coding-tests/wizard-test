// One-off: navgrid connectivity audit per map.
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:5174';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage();

const MAPS = process.argv[3] ? process.argv[3].split(',')
  : ['dust2', 'dust', 'inferno', 'aztec', 'mirage', 'nuke', 'hall', 'dungeons', 'astronomy', 'quidditch', 'hogsmeade', 'chamber', 'diagon', 'gringotts', 'ministry'];
for (const map of MAPS) {
  await page.goto(`${BASE}/?auto=1&map=${map}&team=order&char=harry&diff=normal`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 20000 });
  const r = await page.evaluate(() => {
    const g = window.__game;
    const w = g.world;
    const nodes = w.nav.nodes;
    // BFS from order spawn (nearestNode returns an index)
    const si = w.nearestNode(w.spawns.order[0].x, 0, w.spawns.order[0].z);
    const seen = new Set([si]);
    const q = [si];
    while (q.length) {
      const i = q.pop();
      for (const j of (nodes[i]?.links || [])) if (!seen.has(j)) { seen.add(j); q.push(j); }
    }
    const siteStat = (rect) => {
      const inRect = nodes.map((n, i) => ({ n, i })).filter(({ n }) => n.x >= rect.x0 && n.x <= rect.x1 && n.z >= rect.z0 && n.z <= rect.z1);
      const reachable = inRect.filter(({ i }) => seen.has(i));
      // path from CT spawn to a reachable floor node in the site
      let path = null;
      if (reachable.length) {
        const t = reachable[Math.floor(reachable.length / 2)].n;
        const p = w.findPath(w.spawns.order[0].x, 0, w.spawns.order[0].z, t.x, t.y, t.z);
        path = p ? p.length : null;
      }
      return { nodes: inRect.length, reachable: reachable.length, path };
    };
    const pathT = w.findPath(w.spawns.order[0].x, 0, w.spawns.order[0].z, w.spawns.death[0].x, 0, w.spawns.death[0].z);
    return {
      total: nodes.length, reachableFromCT: seen.size,
      siteA: siteStat(w.zones.siteA),
      siteB: siteStat(w.zones.siteB),
      crossMap: pathT ? pathT.length : null,
    };
  });
  console.log(map, JSON.stringify(r));
}
await browser.close();
