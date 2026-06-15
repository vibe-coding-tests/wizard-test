import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TEAM, TEAM_INFO, otherTeam,
  SPELLS, GRENADES, SLOT3, SLOT5,
  CHARACTERS,
  HITZONES,
} from '../src/data.js';

test('TEAM constants are "order" and "death"', () => {
  assert.equal(TEAM.ORDER, 'order');
  assert.equal(TEAM.DEATH, 'death');
});

test('otherTeam flips between the two sides and is its own inverse', () => {
  assert.equal(otherTeam(TEAM.ORDER), TEAM.DEATH);
  assert.equal(otherTeam(TEAM.DEATH), TEAM.ORDER);
  assert.equal(otherTeam(otherTeam(TEAM.ORDER)), TEAM.ORDER);
});

test('TEAM_INFO has entries for both sides with name, color, and css', () => {
  for (const key of [TEAM.ORDER, TEAM.DEATH]) {
    const info = TEAM_INFO[key];
    assert.ok(info, `TEAM_INFO missing entry for "${key}"`);
    assert.equal(typeof info.name, 'string');
    assert.equal(typeof info.color, 'number');
    assert.equal(typeof info.css, 'string');
    assert.ok(info.css.startsWith('#'), `${key}: css should be a hex colour string`);
  }
});

test('every spell has required fields and its id matches its registry key', () => {
  const always = ['id', 'name', 'kind', 'slot', 'dmg', 'mana', 'price', 'color'];
  const projectileOnly = ['interval', 'speed'];
  const kinds = ['bolt', 'lob', 'shield', 'summon'];
  for (const [key, spell] of Object.entries(SPELLS)) {
    assert.equal(spell.id, key, `spell id mismatch: registry key="${key}" vs spell.id="${spell.id}"`);
    assert.ok(kinds.includes(spell.kind), `spell "${key}" has unknown kind "${spell.kind}"`);
    for (const field of always) {
      assert.ok(field in spell, `spell "${key}" is missing required field "${field}"`);
    }
    if (spell.kind !== 'shield') {
      for (const field of projectileOnly) {
        assert.ok(field in spell, `spell "${key}" (${spell.kind}) is missing field "${field}"`);
      }
    }
  }
});

test('stupefy (rifle) is free and avada (AWP) one-shots', () => {
  assert.ok('stupefy' in SPELLS);
  assert.ok('avada' in SPELLS);
  assert.equal(SPELLS.stupefy.price, 0, 'stupefy should be free (default loadout)');
  assert.equal(SPELLS.avada.dmg, 250, 'avada should one-shot (250 dmg)');
});

test('all ids in GRENADES, SLOT3, and SLOT5 exist in SPELLS', () => {
  for (const id of [...GRENADES, ...SLOT3, ...SLOT5]) {
    assert.ok(id in SPELLS, `"${id}" is listed in a spell array but not defined in SPELLS`);
  }
});

test('HITZONES covers all five CS-style body regions with correct multipliers', () => {
  const zones = ['head', 'chest', 'stomach', 'arm', 'leg'];
  for (const z of zones) {
    assert.ok(z in HITZONES, `hitzone "${z}" is missing`);
  }
  assert.equal(HITZONES.chest.mult, 1.0, 'chest is the baseline (1.0×)');
  assert.ok(HITZONES.stomach.mult > 1.0, 'stomach should deal bonus damage');
  assert.ok(HITZONES.arm.mult < 1.0, 'arm should deal reduced damage');
  assert.ok(HITZONES.leg.mult < 1.0, 'leg should deal reduced damage');
  assert.ok(HITZONES.leg.mult < HITZONES.arm.mult, 'leg deals less damage than arm');
});

test('CHARACTERS has 16 entries — the full champion roster', () => {
  assert.equal(CHARACTERS.length, 16);
});

test('every character has required fields', () => {
  const required = ['id', 'name', 'side', 'hp', 'speed', 'mana', 'perk', 'perkDesc'];
  for (const char of CHARACTERS) {
    for (const field of required) {
      assert.ok(field in char, `character "${char.id ?? '(no id)'}" is missing field "${field}"`);
    }
    assert.ok(['order', 'death'].includes(char.side), `${char.id}: side must be "order" or "death", got "${char.side}"`);
    assert.ok(char.hp > 0, `${char.id}: hp must be positive`);
    assert.ok(char.speed > 0, `${char.id}: speed must be positive`);
  }
});

test('character ids are all unique', () => {
  const ids = CHARACTERS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate character id detected');
});

test('both sides have at least 5 champions each', () => {
  const order = CHARACTERS.filter((c) => c.side === 'order');
  const death = CHARACTERS.filter((c) => c.side === 'death');
  assert.ok(order.length >= 5, `too few Order characters: ${order.length}`);
  assert.ok(death.length >= 5, `too few Death Eater characters: ${death.length}`);
});
