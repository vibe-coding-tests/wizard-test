// src/net/puppet.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pushSample, trimBuffer } from './interp.js';

test('pushSample appends with a timestamp', () => {
  const buf = [];
  pushSample(buf, { x: 1, yaw: 0, pitch: 0, y: 0, z: 0 }, 100);
  assert.equal(buf.length, 1);
  assert.equal(buf[0].t, 100);
  assert.equal(buf[0].x, 1);
});

test('trimBuffer drops samples older than the window', () => {
  const buf = [{ t: 0 }, { t: 50 }, { t: 900 }, { t: 1000 }];
  trimBuffer(buf, 1000, 500); // now=1000, keep last 500ms
  assert.deepEqual(buf.map((s) => s.t), [900, 1000]);
});
