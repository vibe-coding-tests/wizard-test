// src/net/protocol.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildState, buildCast, buildHit, decode } from './protocol.js';

test('buildState carries transform + meta and tags type', () => {
  const m = buildState({
    pos: { x: 1, y: 2, z: 3 }, yaw: 0.5, pitch: -0.2,
    walking: true, charId: 'harry', team: 'order', curSpell: 'stupefy', alive: true,
  });
  assert.equal(m.t, 'state');
  assert.deepEqual([m.x, m.y, m.z], [1, 2, 3]);
  assert.equal(m.yaw, 0.5);
  assert.equal(m.sp, 'stupefy');
  assert.equal(m.al, true);
});

test('buildCast captures the shot', () => {
  const m = buildCast('avada', { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, 0.8);
  assert.equal(m.t, 'cast');
  assert.equal(m.spell, 'avada');
  assert.equal(m.charge, 0.8);
  assert.deepEqual(m.dir, { x: 0, y: 0, z: -1 });
});

test('buildHit reports target + damage', () => {
  const m = buildHit('c7', 'sectum', 42, true);
  assert.deepEqual(m, { t: 'hit', target: 'c7', spell: 'sectum', dmg: 42, hs: true });
});

test('decode parses JSON and rejects garbage to null', () => {
  assert.equal(decode('not json'), null);
  assert.deepEqual(decode('{"t":"state","x":1}'), { t: 'state', x: 1 });
});
