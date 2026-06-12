// Spawn-point audit for every map. Dev-only.
// For each team spawn slot, checks:
//  - the slot stands on real ground (not inside geometry, not in a pit/water)
//  - it has nav coverage (a path to both sites exists)
//  - the facing yaw looks into open space, not a wall
//  - slots don't overlap each other
// And per map, the CS timing rule: defenders (order) must be able to reach
// each site before attackers (death), measured by nav path length.
// Usage: node scripts/check-spawns.mjs [baseUrl]
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:5173';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 800, height: 600 } })).newPage();

let failures = 0;
for (const map of ['dust2', 'dust', 'inferno', 'aztec', 'mirage', 'nuke', 'hall', 'dungeons', 'astronomy', 'quidditch', 'hogsmeade', 'chamber', 'diagon', 'gringotts', 'ministry']) {
  await page.goto(`${BASE}/?auto=1&map=${map}&team=order&char=harry&diff=easy`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 20000 });
  const rep = await page.evaluate(() => {
    const g = window.__game;
    const w = g.world;
    const out = { spawns: {}, timing: {}, problems: [] };
    const pathLen = (path) => {
      if (!path || !path.length) return null;
      let L = 0;
      for (let i = 1; i < path.length; i++) {
        L += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
      }
      return L;
    };
    for (const team of ['order', 'death']) {
      const arr = w.spawns[team];
      out.spawns[team] = arr.length;
      arr.forEach((s, i) => {
        const gy = w.floorY(s.x, s.z, 30);
        const id = `${team}[${i}] (${s.x.toFixed(1)},${s.z.toFixed(1)})`;
        // standing room: a player capsule must fit
        if (w.overlaps(s.x - 0.36, gy + 0.1, s.z - 0.36, s.x + 0.36, gy + 1.8, s.z + 0.36)) {
          out.problems.push(`${id}: spawn clips geometry`);
        }
        // not under water
        if (w.waterAt(s.x, gy + 0.3, s.z)) out.problems.push(`${id}: spawn in water`);
        // ground sanity: groundY should be near 0..6 (no falling into the void)
        if (!(gy > -3 && gy < 12)) out.problems.push(`${id}: weird ground y=${gy.toFixed(1)}`);
        // facing: forward ray should travel at least 3m before a wall
        const dx = -Math.sin(s.yaw), dz = -Math.cos(s.yaw);
        const hit = w.raycast(s.x, gy + 1.5, s.z, dx, 0, dz, 8);
        if (hit && hit.t < 3) out.problems.push(`${id}: faces a wall ${hit.t.toFixed(1)}m away`);
        // nav coverage + path to both sites
        for (const site of ['A', 'B']) {
          const zz = w.zones[`site${site}`];
          const path = w.findPath(s.x, gy, s.z, zz.cx, w.floorY(zz.cx, zz.cz, 30), zz.cz);
          if (!path || !path.length) out.problems.push(`${id}: no nav path to site ${site}`);
        }
        // overlapping slots
        for (let j = i + 1; j < arr.length; j++) {
          const o = arr[j];
          if (Math.hypot(o.x - s.x, o.z - s.z) < 0.9) out.problems.push(`${id}: overlaps slot ${j}`);
        }
      });
    }
    // CS timing: defender (order) path to each site must be shorter than attacker (death)
    for (const site of ['A', 'B']) {
      const zz = w.zones[`site${site}`];
      const gy = (s) => w.floorY(s.x, s.z, 30);
      const o = w.spawns.order[0], d = w.spawns.death[0];
      const oL = pathLen(w.findPath(o.x, gy(o), o.z, zz.cx, w.floorY(zz.cx, zz.cz, 30), zz.cz));
      const dL = pathLen(w.findPath(d.x, gy(d), d.z, zz.cx, w.floorY(zz.cx, zz.cz, 30), zz.cz));
      out.timing[site] = { defender: oL && +oL.toFixed(0), attacker: dL && +dL.toFixed(0) };
      if (oL == null || dL == null) out.problems.push(`site ${site}: missing path for timing check`);
      else if (oL >= dL) out.problems.push(`site ${site}: defenders arrive LATER than attackers (${oL.toFixed(0)}m vs ${dL.toFixed(0)}m)`);
    }
    // buy zones should contain their team's spawn slots
    for (const team of ['order', 'death']) {
      const bz = w.zones.buy[team];
      for (const s of w.spawns[team]) {
        if (!(s.x >= bz.x0 && s.x <= bz.x1 && s.z >= bz.z0 && s.z <= bz.z1)) {
          out.problems.push(`${team} spawn (${s.x.toFixed(0)},${s.z.toFixed(0)}) outside its buy zone`);
        }
      }
    }
    return out;
  });
  const ok = rep.problems.length === 0;
  if (!ok) failures++;
  console.log(`[spawns] ${ok ? 'PASS' : 'FAIL'} — ${map}  order=${rep.spawns.order} death=${rep.spawns.death}  timing A: ${JSON.stringify(rep.timing.A)} B: ${JSON.stringify(rep.timing.B)}`);
  for (const p of rep.problems) console.log(`   · ${p}`);
}
await browser.close();
process.exit(failures === 0 ? 0 : 1);
