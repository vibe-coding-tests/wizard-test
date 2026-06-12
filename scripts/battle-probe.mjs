// One-off battle-mechanics probe: instruments a live bot match and reports
// anomalies (wasted charges, shield flicker, firing starvation, bad numbers).
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:5174';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 800, height: 600 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

const MAP = process.argv[3] || 'dust2';
await page.goto(`${BASE}/?auto=1&map=${MAP}&team=order&char=harry&diff=expert`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && window.__game.state, null, { timeout: 20000 });

const report = await page.evaluate(async () => {
  const g = window.__game;
  g.particles.setQuality(0.2);
  const stats = {
    casts: {},
    avadaFires: 0, avadaNoTarget: 0, chargeCancels: 0,
    dmgEvents: 0, badDamage: [], negMana: 0, hpOver: 0,
    shieldToggles: 0, shieldSecs: 0, parries: 0, accidentalParries: 0,
    kills: 0, hsKills: 0,
    boltsFired: 0, boltsHitPlayer: 0,
  };
  // rich bots: force the full kit into play (avada, grenades, tactical spells)
  for (const p of g.players) if (p.bot) { p.money = 12000; p.bot.buy(); }

  // --- instrument fire ---
  const origFire = g.spells.fire.bind(g.spells);
  g.spells.fire = (p, spell) => {
    stats.casts[spell.id] = (stats.casts[spell.id] || 0) + 1;
    if (spell.kind === 'bolt' || spell.kind === 'lob') stats.boltsFired++;
    if (spell.id === 'avada') {
      stats.avadaFires++;
      if (p.bot && (!p.bot.target || !p.bot.target.alive || !(p.bot.aware.get(p.bot.target.id) >= 1))) {
        stats.avadaNoTarget++;
      }
    }
    return origFire(p, spell);
  };
  const origCancel = g.spells.cancelCharge.bind(g.spells);
  g.spells.cancelCharge = (p, fired) => { if (p.charge && !fired) stats.chargeCancels++; return origCancel(p, fired); };

  // --- instrument boltHit / damage / kill ---
  const origBoltHit = g.spells.boltHit.bind(g.spells);
  g.spells.boltHit = (pr, v, zone, pos) => { stats.boltsHitPlayer++; return origBoltHit(pr, v, zone, pos); };
  const origDamage = g.damage.bind(g);
  g.damage = (v, a, amount, spell, isHS, hitPos, silent) => {
    stats.dmgEvents++;
    if (!Number.isFinite(amount) || amount < 0 || amount > 600) {
      stats.badDamage.push(`${spell?.id} dealt ${amount} to ${v.name}`);
    }
    return origDamage(v, a, amount, spell, isHS, hitPos, silent);
  };
  const origKill = g.kill.bind(g);
  g.kill = (v, a, spell, isHS) => { stats.kills++; if (isHS) stats.hsKills++; return origKill(v, a, spell, isHS); };

  // --- per-frame sampling ---
  const shieldPrev = new Map();
  const sample = (dt) => {
    for (const p of g.players) {
      if (!p.bot || !p.alive) continue;
      if (p.mana < -0.001) stats.negMana++;
      if (p.health > p.stats.hp + 0.001) stats.hpOver++;
      const sh = !!p.shielding;
      if (shieldPrev.get(p.id) !== undefined && sh !== shieldPrev.get(p.id)) stats.shieldToggles++;
      shieldPrev.set(p.id, sh);
      if (sh) stats.shieldSecs += dt;
    }
  };

  // parry detection: projectile owner flips after a shield reflect
  const owners = new WeakMap();
  const watchParry = () => {
    for (const pr of g.spells.projectiles) {
      const prev = owners.get(pr);
      if (prev && prev !== pr.owner) {
        stats.parries++;
        if (pr.owner.bot && !pr.owner.bot.parryIntent) stats.accidentalParries++;
      }
      owners.set(pr, pr.owner);
    }
  };

  // run ~4 rounds of simulated play
  const dt = 0.025;
  let simT = 0;
  const roundsAtStart = g.roundNum;
  while (simT < 360 && !g.over && g.roundNum < roundsAtStart + 4) {
    g.update(dt);
    sample(dt);
    watchParry();
    simT += dt;
  }
  stats.roundsPlayed = g.roundNum - roundsAtStart;
  stats.simSeconds = +simT.toFixed(0);
  stats.shieldSecs = +stats.shieldSecs.toFixed(1);
  stats.boltAccuracy = stats.boltsFired ? +(stats.boltsHitPlayer / stats.boltsFired).toFixed(3) : 0;
  return stats;
});

console.log(JSON.stringify(report, null, 1));
if (errs.length) console.log('CONSOLE ERRORS:', errs.slice(0, 8));
await browser.close();
