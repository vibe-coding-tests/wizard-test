import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHARACTERS, charById,
  WANDS, wandById,
  EQUIPMENT, equipById, EQUIP_EFFECTS,
  DISCIPLINES, disciplineById,
  DIFFICULTIES, aiProfile,
  FORMATS, MAP_LIST,
  ECON,
  DEFAULT_VOICE, voiceFor,
  pickLine, pickPlan, LINES, PLAN_LINES,
} from '../src/data.js';

test('charById finds by id and returns undefined for unknown', () => {
  assert.equal(charById('harry').name, 'Harry Potter');
  assert.equal(charById('voldemort').side, 'death');
  assert.equal(charById('nobody'), undefined);
});

test('wandById finds every wand and prices rise with the roster', () => {
  for (const w of WANDS) assert.equal(wandById(w.id), w);
  assert.equal(wandById('training').price, 0, 'training wand is free');
  assert.equal(wandById('missing'), undefined);
});

test('every wand has the stat fields the combat sim reads', () => {
  const fields = ['id', 'name', 'price', 'power', 'cast', 'spread', 'manaMult', 'castPoint', 'desc'];
  for (const w of WANDS) {
    for (const f of fields) assert.ok(f in w, `wand "${w.id}" missing "${f}"`);
    for (const axis of ['fwd', 'right', 'up']) {
      assert.equal(typeof w.castPoint[axis], 'number', `wand "${w.id}" castPoint.${axis}`);
    }
  }
});

test('equipById finds gear and every action item has an effect entry', () => {
  for (const e of EQUIPMENT) assert.equal(equipById(e.id), e);
  assert.equal(equipById('felix').price, 1000);
  assert.equal(equipById('nope'), undefined);
  for (const e of EQUIPMENT) {
    assert.ok(e.max >= 1, `equipment "${e.id}" should be buyable at least once`);
    assert.ok(e.id in EQUIP_EFFECTS, `equipment "${e.id}" has no EQUIP_EFFECTS entry`);
  }
});

test('the healing potion heals its documented 55 HP over its duration', () => {
  const { duration, healPerSecond } = EQUIP_EFFECTS.potion;
  assert.equal(Math.round(duration * healPerSecond), 55);
});

test('disciplineById finds builds and returns null (not undefined) for unknown', () => {
  for (const d of DISCIPLINES) assert.equal(disciplineById(d.id), d);
  assert.equal(disciplineById('void'), null);
  assert.equal(DISCIPLINES.length, 4);
});

test('every difficulty preset has all four AI axes in range, ascending by tier', () => {
  const axes = ['reflex', 'aim', 'sense', 'iq'];
  for (const d of DIFFICULTIES) {
    for (const a of axes) {
      assert.ok(d.axes[a] >= 0 && d.axes[a] <= 100, `${d.id}.${a} out of [0,100]`);
    }
  }
  const easy = DIFFICULTIES.find((d) => d.id === 'easy');
  const legend = DIFFICULTIES.find((d) => d.id === 'legend');
  for (const a of axes) {
    assert.ok(legend.axes[a] > easy.axes[a], `legend should out-skill easy on ${a}`);
  }
});

test('aiProfile maps axes monotonically: higher reflex means faster reactions', () => {
  const slow = aiProfile({ reflex: 0, aim: 0, sense: 0, iq: 0 });
  const fast = aiProfile({ reflex: 100, aim: 100, sense: 100, iq: 100 });
  assert.ok(fast.reactMean < slow.reactMean, 'faster reflex → lower reaction time');
  assert.ok(fast.turnSpeed > slow.turnSpeed, 'faster reflex → higher turn speed');
  assert.ok(fast.trackErr < slow.trackErr, 'better aim → less tracking error');
  assert.ok(fast.sightDist > slow.sightDist, 'better sense → sees further');
  assert.ok(fast.util > slow.util, 'higher iq → more utility usage');
});

test('aiProfile clamps out-of-range axes and defaults missing ones to 50', () => {
  const clamped = aiProfile({ reflex: 999, aim: -50, sense: 50, iq: 50 });
  assert.equal(clamped.axes.reflex, 100, 'reflex clamps to 100');
  assert.equal(clamped.axes.aim, 0, 'aim clamps to 0');
  const empty = aiProfile();
  assert.equal(empty.axes.reflex, 50, 'missing axis defaults to 50');
  assert.equal(empty.axes.iq, 50);
});

test('ECON values are coherent: caps above starts, losses bounded by the max', () => {
  assert.ok(ECON.cap > ECON.start, 'cap should exceed the round-one stipend');
  assert.ok(ECON.lossMax >= ECON.lossBase, 'loss bonus tops out above the base');
  assert.ok(ECON.lossBase + ECON.lossStep <= ECON.lossMax + ECON.lossStep);
  for (const k of ['winElim', 'winTime', 'winDefuse', 'winRelic']) {
    assert.ok(ECON[k] > 0, `${k} reward must be positive`);
  }
});

test('FORMATS define a short and a full match with sane round caps', () => {
  const ids = FORMATS.map((f) => f.id);
  assert.deepEqual(new Set(ids).size, ids.length, 'format ids are unique');
  for (const f of FORMATS) {
    assert.ok(f.maxRounds >= f.winTarget, `${f.id}: maxRounds must allow reaching winTarget`);
    assert.ok(f.halftimeAfter < f.maxRounds, `${f.id}: halftime must fall before the last round`);
  }
});

test('MAP_LIST has unique ids spread across the three groups', () => {
  const ids = MAP_LIST.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate map id');
  const groups = new Set(MAP_LIST.map((m) => m.group));
  assert.deepEqual([...groups].sort(), ['classic', 'hogwarts', 'world']);
  for (const m of MAP_LIST) {
    assert.ok(m.name && m.desc, `map "${m.id}" missing name/desc`);
  }
});

test('voiceFor overlays a champion profile on the defaults', () => {
  const def = voiceFor('nobody-here');
  assert.deepEqual(def, DEFAULT_VOICE, 'unknown champion gets pure defaults');
  const snape = voiceFor('snape');
  assert.ok(snape.pitch < DEFAULT_VOICE.pitch, 'Snape speaks lower than default');
  assert.equal(snape.syl, DEFAULT_VOICE.syl, 'unspecified fields fall back to default');
});

test('pickLine returns a filled callout and null for unknown categories', () => {
  assert.equal(pickLine('does-not-exist', 'harry'), null);
  const line = pickLine('contact', 'harry', { area: 'Long A' });
  assert.equal(typeof line, 'string');
  assert.ok(line.length > 0);
  assert.ok(!line.includes('{area}'), 'the {area} token should be substituted');
});

test('pickLine fills the {area} token, defaulting to "mid"', () => {
  // "report" has only a generic pool, every entry uses {area}
  for (let i = 0; i < 20; i++) {
    const line = pickLine('report', 'harry');
    assert.ok(!line.includes('{area}'), 'token replaced');
    assert.ok(line.includes('mid'), `default area "mid" applied: "${line}"`);
  }
});

test('pickLine only ever returns lines drawn from the category bank', () => {
  const bank = LINES.kill;
  const allowed = new Set([...(bank._ || []), ...(bank.bellatrix || [])].map((l) => l));
  for (let i = 0; i < 40; i++) {
    assert.ok(allowed.has(pickLine('kill', 'bellatrix')), 'line came from generic or flavor pool');
  }
});

test('pickPlan returns a known plan line and falls back to default', () => {
  for (let i = 0; i < 20; i++) {
    assert.ok(PLAN_LINES.rushA.includes(pickPlan('rushA')));
    assert.ok(PLAN_LINES.default.includes(pickPlan('no-such-strat')));
  }
});
