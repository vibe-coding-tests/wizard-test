// Headless Playwright verification of the Phase 1 combat-feel slice:
// blink dash, i-frame dodge, affliction combos, perfect-parry reward, and the
// cinematic time-scale. Drives window.__game directly under ?auto.
// Usage: node scripts/verify-slice.mjs [baseUrl]   (default http://localhost:5173)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.argv[2] || 'http://localhost:5173';
const SHOTS = fileURLToPath(new URL('./.shots/', import.meta.url));
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();

const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const realErrors = () => errs.filter((e) => !/pointer lock/i.test(e) && !/favicon/.test(e));

const log = (...a) => console.log('[verify]', ...a);
let failures = 0;
const check = (ok, label) => { log((ok ? 'PASS' : 'FAIL') + ' — ' + label); if (!ok) failures++; };

async function load(qs) {
  errs.length = 0;
  await page.goto(`${BASE}/?auto=1&${qs}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 20000 });
  await page.evaluate(() => window.__game.particles.setQuality(0.5));
}
async function fastForward(secs) {
  await page.evaluate((s) => { const g = window.__game; const n = Math.ceil(s / 0.025); for (let i = 0; i < n && !g.over; i++) g.update(0.025); }, secs);
}

// ---------------------------------------- 1. dash + dodge + combos + time ---
await load('map=dust2&team=order&char=harry&diff=normal');
await fastForward(8);
const r1 = await page.evaluate(async () => {
  const { SPELLS, DASH } = await import('/src/data.js');
  const g = window.__game; const h = g.human;
  const res = {};
  const stepP = (p, s) => { for (let i = 0; i < Math.ceil(s / 0.025); i++) p.update(0.025); };
  for (const p of g.players) if (p.bot) { p.bot.update = () => {}; Object.assign(p.ctrl, { moveX: 0, moveZ: 0, castHeld: false, altHeld: false, jump: false }); }
  const victim = g.players.find((p) => p.team !== h.team && p.alive);
  const sp = g.world.spawns.order[0];
  const gy = g.world.groundY(sp.x, sp.z, 30);
  h.pos.set(sp.x, gy + 0.05, sp.z); h.vel.set(0, 0, 0); h.health = h.stats.hp;
  h.freezeT = 0; h.staggerT = 0; h.snareT = 0; h.disarmT = 0; h.flying = false; h.portkeyT = 0; h.dashCD = 0; h.dashT = 0; h.dashIframeT = 0;

  // --- BLINK DASH ---
  h.ctrl.moveX = 1; h.ctrl.moveZ = 0;
  const x0 = h.pos.x, z0 = h.pos.z;
  res.dashReturns = h.tryDash() === true;
  res.velSet = +Math.hypot(h.vel.x, h.vel.z).toFixed(1);         // ~= DASH.speed
  res.dashTset = Math.abs(h.dashT - DASH.dur) < 1e-6;
  res.cdSet = Math.abs(h.dashCD - DASH.cd) < 1e-6;
  res.iframeSet = Math.abs(h.dashIframeT - DASH.iframe) < 1e-6;
  stepP(h, DASH.dur + 0.12);
  res.moved = +Math.hypot(h.pos.x - x0, h.pos.z - z0).toFixed(2);
  res.secondBlocked = h.tryDash() === false;                    // still on cooldown
  h.dashCD = 0; h.dashT = 0; h.snareT = 1; res.snaredBlocked = h.tryDash() === false; h.snareT = 0;
  h.dashCD = 0; h.dashT = 0; h.freezeT = 1; res.frozenBlocked = h.tryDash() === false; h.freezeT = 0;
  h.dashCD = 0; h.dashT = 0; h.dashIframeT = 0;

  // --- BLINK I-FRAME DODGE ---
  victim.pos.set(h.pos.x + 4, gy + 0.05, h.pos.z); victim.vel.set(0, 0, 0);
  const clearV = () => { victim.health = victim.stats.hp; victim.freezeT = 0; victim.slowT = 0; victim.snareT = 0; victim.staggerT = 0; victim.bleeds.length = 0; victim.dashIframeT = 0; victim.vel.set(0, 0, 0); };
  const shoot = (sps) => g.spells.boltHit({ spell: sps, owner: h, traveled: 0, vx: 46, vy: 0, vz: 0 }, victim, 'chest', victim.eyePos());
  clearV(); victim.dashIframeT = 0.2; const hpD = victim.health; shoot(SPELLS.stupefy);
  res.dodgedNoDamage = victim.health === hpD;
  clearV(); const hpH = victim.health; shoot(SPELLS.stupefy);
  res.hitWhenNoIframe = victim.health < hpH;

  // --- AFFLICTION COMBO PAYOFF ---
  clearV(); const b0 = victim.health; shoot(SPELLS.stupefy); const baseDmg = b0 - victim.health;
  clearV(); victim.freezeT = 2; const f0 = victim.health; shoot(SPELLS.stupefy); const frozenDmg = f0 - victim.health;
  clearV(); victim.slowT = 2; const s0 = victim.health; shoot(SPELLS.stupefy); const slowDmg = s0 - victim.health;
  res.baseDmg = +baseDmg.toFixed(1); res.frozenDmg = +frozenDmg.toFixed(1); res.slowDmg = +slowDmg.toFixed(1);
  res.shatterBonus = frozenDmg > baseDmg * 1.35;
  res.crushBonus = slowDmg > baseDmg * 1.12 && slowDmg < frozenDmg;

  // --- CINEMATIC TIME-SCALE ---
  g.paused = false; g.over = false;
  g.autoMode = false; // enable juice as in real play
  g.hitstopT = 0; g.slowmoT = 0; g.slowmoScale = 1; g.hitstop(0.05); g.update(0.016); res.tsHitstop = +g.timeScale.toFixed(2);
  g.hitstopT = 0; g.slowmoT = 0; g.slowmoScale = 1; g.slowmo(0.3, 0.4); g.update(0.016); res.tsSlowmo = +g.timeScale.toFixed(2);
  for (let k = 0; k < 40; k++) g.update(0.016); res.tsRecovered = +g.timeScale.toFixed(2);
  g.autoMode = true; // back to test mode → cinematic is a no-op
  g.hitstopT = 0; g.slowmoT = 0; g.slowmoScale = 1; g.slowmo(0.3, 0.4); g.update(0.016); res.tsAutoNoop = +g.timeScale.toFixed(2);
  return res;
});
log('dash/dodge/combo/time results:', JSON.stringify(r1));
check(r1.dashReturns, 'dash: tryDash() succeeds');
check(r1.velSet > 20, `dash: imparts burst velocity (${r1.velSet} m/s)`);
check(r1.dashTset && r1.cdSet && r1.iframeSet, 'dash: sets duration, cooldown & i-frame timers');
check(r1.moved > 1.5, `dash: actually displaces the wizard (${r1.moved} m)`);
check(r1.secondBlocked, 'dash: blocked while on cooldown');
check(r1.snaredBlocked && r1.frozenBlocked, 'dash: blocked while snared / petrified');
check(r1.dodgedNoDamage, 'dodge: bolt deals 0 damage during i-frames');
check(r1.hitWhenNoIframe, 'dodge: same bolt connects once i-frames end');
check(r1.shatterBonus, `combo: frozen target SHATTERS for bonus (${r1.baseDmg} -> ${r1.frozenDmg})`);
check(r1.crushBonus, `combo: slowed target takes a crunch (${r1.baseDmg} -> ${r1.slowDmg})`);
check(r1.tsHitstop === 0, `time: hitstop freezes the sim (scale=${r1.tsHitstop})`);
check(r1.tsSlowmo > 0 && r1.tsSlowmo < 1, `time: slow-mo stretches the moment (scale=${r1.tsSlowmo})`);
check(r1.tsRecovered === 1, 'time: returns to full speed after the beat');
check(r1.tsAutoNoop === 1, 'time: cinematic is a no-op under ?auto (deterministic tests)');
let bad = realErrors();
check(bad.length === 0, `no console errors in dash/combo scenario (${bad.length})`);
if (bad.length) log('   errors:', bad.slice(0, 4));

// --------------------------------------------------- 2. perfect-parry reward ---
await load('map=dust2&team=order&char=harry&diff=normal');
await fastForward(8);
const r2 = await page.evaluate(async () => {
  const { SPELLS } = await import('/src/data.js');
  const g = window.__game; const h = g.human;
  const res = {};
  const step = (s) => { for (let i = 0; i < Math.ceil(s / 0.016); i++) g.update(0.016); };
  for (const p of g.players) if (p.bot) { p.bot.update = () => {}; Object.assign(p.ctrl, { moveX: 0, moveZ: 0, castHeld: false, altHeld: false, jump: false }); }
  const enemy = g.players.find((p) => p.team !== h.team && p.alive);
  const sp = g.world.spawns.order[0];
  const gy = g.world.groundY(sp.x, sp.z, 30);
  // shield is an omnidirectional bubble (sphere) — fire across a gap so the
  // bolt ENTERS it from outside (a point-blank spawn inside never registers).
  h.pos.set(sp.x, gy + 0.05, sp.z); h.vel.set(0, 0, 0); h.health = h.stats.hp;
  enemy.pos.set(sp.x + 6, gy + 0.05, sp.z); enemy.vel.set(0, 0, 0); enemy.health = enemy.stats.hp;
  enemy.parryBuffT = 0;
  enemy.bot.parryIntent = true;           // a deliberate parry read (bots reflect only then)
  enemy.bot.shieldUntil = Infinity;
  enemy.ctrl.altHeld = true;
  step(0.05);                             // shield snaps up: shieldOnAt = now
  enemy.mana = 30; const m0 = enemy.mana; // refund should push this up
  const fx = g.effects.acquireBolt(SPELLS.stupefy);
  const bx = h.pos.x + 1, by = gy + 1.45, bz = h.pos.z;
  fx.group.position.set(bx, by, bz);
  g.spells.projectiles.push({ x: bx, y: by, z: bz, vx: 46, vy: 0, vz: 0, spell: SPELLS.stupefy, owner: h, life: 5, traveled: 0, gravity: 0, fx });
  step(0.1);
  const refl = g.spells.projectiles.find((pr) => pr.owner === enemy);
  res.reflected = !!refl;
  res.reflectedFlag = refl ? refl.reflected === true : false;
  res.parryBuff = +(enemy.parryBuffT).toFixed(2);
  res.manaBefore = +m0.toFixed(1); res.manaAfter = +enemy.mana.toFixed(1);
  res.manaRefunded = enemy.mana >= m0 + 18;
  return res;
});
log('parry results:', JSON.stringify(r2));
check(r2.reflected, 'parry: curse is reflected back at the caster');
check(r2.reflectedFlag, 'parry: reflected bolt is flagged (returns 1.4x harder)');
check(r2.parryBuff > 1, `parry: grants FLOW speed surge (parryBuffT=${r2.parryBuff})`);
check(r2.manaRefunded, `parry: refunds mana (${r2.manaBefore} -> ${r2.manaAfter})`);
bad = realErrors();
check(bad.length === 0, `no console errors in parry scenario (${bad.length})`);
if (bad.length) log('   errors:', bad.slice(0, 4));

// --------------------------------------------------- 3. HUD + dash visual ---
await load('map=dust2&team=order&char=harry&diff=normal');
await fastForward(7);
await page.evaluate(() => { const h = window.__game.human; h.alive = true; h.health = h.stats.hp; h.dashCD = 0; });
await page.waitForTimeout(120);
await page.screenshot({ path: SHOTS + 'slice-hud-ready.png' });
// fire a blink and grab the trail mid-dash
await page.evaluate(() => { const h = window.__game.human; h.ctrl.moveX = Math.cos(h.yaw); h.ctrl.moveZ = Math.sin(h.yaw); h.tryDash(); });
await page.waitForTimeout(70);
await page.screenshot({ path: SHOTS + 'slice-dash-trail.png' });
const hudOk = await page.evaluate(() => !!document.querySelector('.dash-ind'));
check(hudOk, 'hud: blink readiness pill is present in the DOM');
log('screenshots:', SHOTS + 'slice-hud-ready.png', '+ slice-dash-trail.png');

await browser.close();
log(failures === 0 ? 'ALL SLICE CHECKS PASSED' : failures + ' CHECK(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
