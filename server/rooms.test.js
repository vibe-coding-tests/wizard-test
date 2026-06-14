// server/rooms.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomRegistry } from './rooms.js';

test('host creates a room and is its host', () => {
  const reg = new RoomRegistry(() => 'AB12');
  const r = reg.host('sock-h', 'Harry');
  assert.equal(r.room, 'AB12');
  assert.equal(r.id, 'sock-h');
  assert.equal(r.isHost, true);
  assert.deepEqual(r.peers, []);
});

test('join adds a member and returns existing peers', () => {
  const reg = new RoomRegistry(() => 'AB12');
  reg.host('sock-h', 'Harry');
  const j = reg.join('sock-g', 'AB12', 'Ron');
  assert.equal(j.ok, true);
  assert.equal(j.isHost, false);
  assert.equal(j.hostId, 'sock-h');
  assert.deepEqual(j.peers.map((p) => p.name), ['Harry']);
});

test('join unknown room fails', () => {
  const reg = new RoomRegistry(() => 'AB12');
  const j = reg.join('sock-g', 'ZZZZ', 'Ron');
  assert.equal(j.ok, false);
  assert.equal(j.reason, 'no-room');
});

test('recipients() returns every member except the sender', () => {
  const reg = new RoomRegistry(() => 'AB12');
  reg.host('sock-h', 'Harry');
  reg.join('sock-g', 'AB12', 'Ron');
  assert.deepEqual(reg.recipients('sock-h').sort(), ['sock-g']);
});

test('host leaving ends the room and lists the orphaned members', () => {
  const reg = new RoomRegistry(() => 'AB12');
  reg.host('sock-h', 'Harry');
  reg.join('sock-g', 'AB12', 'Ron');
  const res = reg.leave('sock-h');
  assert.equal(res.ended, true);
  assert.deepEqual(res.notify.sort(), ['sock-g']);
  assert.equal(reg.recipients('sock-g').length, 0);
});

test('guest leaving keeps the room and notifies peers', () => {
  const reg = new RoomRegistry(() => 'AB12');
  reg.host('sock-h', 'Harry');
  reg.join('sock-g', 'AB12', 'Ron');
  const res = reg.leave('sock-g');
  assert.equal(res.ended, false);
  assert.equal(res.left, 'sock-g');
  assert.deepEqual(res.notify.sort(), ['sock-h']);
});
