// Headless two-client multiplayer smoke test. Dev-only; not part of `npm test`.
//
// Spawns the relay (on the client's default port 8787) and drives two browser
// pages through the real lobby: page A hosts a deathmatch, page B joins by the
// shared ?room= link, then A starts. It asserts that each side sees the other,
// that the guest receives host-simulated bots via the authoritative snapshot,
// and that HP/score sync flows.
//
// Requires a running dev/preview server (defaults to http://localhost:5173):
//   npm run dev            # terminal 1
//   node scripts/net-smoke.mjs [baseUrl]   # terminal 2
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const BASE = process.argv[2] || 'http://localhost:5173';
const RELAY_PORT = 8787; // the client falls back to ws://localhost:8787
const __dirname = dirname(fileURLToPath(import.meta.url));

const log = (...a) => console.log('[net-smoke]', ...a);
let failures = 0;
const check = (ok, label) => { log((ok ? 'PASS' : 'FAIL') + ' — ' + label); if (!ok) failures++; };

for (const ev of ['uncaughtException', 'unhandledRejection']) {
  process.on(ev, (e) => {
    console.log(`[net-smoke] FAIL — harness crash (${ev}): ${e?.message || e}`);
    console.log(e?.stack || '');
    process.exit(1);
  });
}

// ---- relay ----------------------------------------------------------------
const relay = spawn('node', [resolve(__dirname, '../server/relay.js')], {
  env: { ...process.env, PORT: String(RELAY_PORT) },
  stdio: 'inherit',
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(600); // let the relay bind

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const errs = [];
function watch(page, tag) {
  page.on('pageerror', (e) => errs.push(`${tag} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`${tag}: ${m.text()}`); });
}
const realErrors = () => errs.filter((e) => !/pointer lock/i.test(e) && !/favicon/.test(e) && !/permissions policy/i.test(e));

try {
  const ctxA = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const ctxB = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const host = await ctxA.newPage();
  const guest = await ctxB.newPage();
  watch(host, 'host');
  watch(guest, 'guest');

  // --- host opens the lobby and hosts -------------------------------------
  await host.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await host.getByText('MULTIPLAYER', { exact: false }).first().click();
  await host.getByText('HOST GAME', { exact: true }).click();
  await host.waitForSelector('.mp-status b', { timeout: 15000 });
  const code = (await host.textContent('.mp-status b'))?.trim();
  check(/^[A-Z0-9]{4}$/.test(code || ''), `host got a room code (${code})`);

  // --- guest joins by the shared link BEFORE the host starts --------------
  await guest.goto(`${BASE}/?room=${code}`, { waitUntil: 'domcontentloaded' });
  await guest.waitForFunction(() => /joined/i.test(document.querySelector('.mp-status')?.textContent || ''), null, { timeout: 15000 });
  check(true, 'guest joined the room');

  // --- host starts the deathmatch -----------------------------------------
  await host.getByText('START DEATHMATCH', { exact: true }).click();

  // both sides build their Game (loading screen → async)
  await host.waitForFunction(() => window.__game && window.__game.players, null, { timeout: 30000 });
  await guest.waitForFunction(() => window.__game && window.__game.players, null, { timeout: 30000 });

  // let real-time net traffic flow (state @20Hz, snapshot @15Hz)
  await sleep(3000);

  const hostInfo = await host.evaluate(() => {
    const g = window.__game;
    return { role: g.role, peers: g.netPeers.size, players: g.players.length };
  });
  const guestInfo = await guest.evaluate(() => {
    const g = window.__game;
    const puppets = [...g.netPeers.values()];
    return {
      role: g.role,
      peers: g.netPeers.size,
      // bots arrive purely via the host snapshot
      botPuppets: puppets.filter((p) => p.health !== undefined && p.bot === null).length,
      hpFinite: puppets.every((p) => Number.isFinite(p.health)),
      humanHpFinite: Number.isFinite(g.human.health),
    };
  });

  check(hostInfo.role === 'host', `host role is "host" (${hostInfo.role})`);
  check(guestInfo.role === 'guest', `guest role is "guest" (${guestInfo.role})`);
  check(hostInfo.peers >= 1, `host sees the guest (netPeers=${hostInfo.peers})`);
  // host (1) + at least one host-simulated bot delivered by snapshot
  check(guestInfo.peers >= 2, `guest sees host + bots via snapshot (netPeers=${guestInfo.peers})`);
  check(guestInfo.hpFinite && guestInfo.humanHpFinite, `guest HP is authoritative/finite (puppets+human)`);

  // --- host-authoritative damage round-trip --------------------------------
  // Freeze the host sim so a bot's HP only moves from our reported hit, then
  // have the guest "land" a 60-dmg hit on bot0. The guest does NOT apply it
  // locally — it reports to the host, who resolves it and streams the new HP
  // back in the next snapshot.
  const targetId = await host.evaluate(() => {
    const g = window.__game;
    g.spells.clear();
    for (const p of g.players) if (p.bot) { p.bot.update = () => {}; g.spells.cancelCharge(p); }
    // pick an ENEMY bot (friendly fire is correctly rejected by the host)
    const enemy = g.players.find((p) => p.bot && p.team !== g.human.team);
    enemy.health = 100; enemy.alive = true; enemy.spawnProtT = 0;
    return enemy.netId;
  });
  const dmg = await guest.evaluate(async (id) => {
    const g = window.__game;
    const bot = g.netPeers.get(id);
    const before = bot.health;
    // guest-side damage() with attacker === human reports a hit to the host
    g.damage(bot, g.human, 60, { id: 'stupefy' }, false);
    // wait for the authoritative snapshot to round-trip
    const start = performance.now();
    while (performance.now() - start < 2500) {
      await new Promise((r) => setTimeout(r, 100));
      if (bot.health <= 45) break;
    }
    return { before, after: bot.health };
  }, targetId);
  const hostHp = await host.evaluate((id) => window.__game.players.find((p) => p.netId === id).health, targetId);
  check(Math.abs(hostHp - 40) < 1, `host applied the reported hit (${targetId} hp ${hostHp})`);
  check(dmg.after <= 45, `guest sees authoritative HP drop via snapshot (${dmg.before} → ${dmg.after})`);

  const bad = realErrors();
  check(bad.length === 0, `no console errors (${bad.length})`);
  if (bad.length) log('   errors:', bad.slice(0, 5));
} finally {
  await browser.close();
  relay.kill();
}

log(failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
