import test from 'node:test';
import assert from 'node:assert/strict';
import { clamp, lerp, damp, angDiff, dist2D, fmtTime, fmt$, hexCss, shuffle, TAU, DEG } from '../src/utils.js';

test('TAU is 2π and DEG is π/180', () => {
  assert.ok(Math.abs(TAU - Math.PI * 2) < 1e-15);
  assert.ok(Math.abs(DEG - Math.PI / 180) < 1e-15);
});

test('clamp holds a value within [a, b]', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(11, 0, 10), 10);
  assert.equal(clamp(0, 0, 0), 0);
});

test('lerp interpolates linearly between two values', () => {
  assert.equal(lerp(0, 10, 0), 0);
  assert.equal(lerp(0, 10, 1), 10);
  assert.equal(lerp(0, 10, 0.5), 5);
  assert.equal(lerp(-10, 10, 0.5), 0);
  assert.equal(lerp(3, 3, 0.7), 3);
});

test('damp converges to target and is at rest when dt=0', () => {
  assert.ok(Math.abs(damp(0, 10, 5, 0) - 0) < 1e-9, 'no change at dt=0');
  assert.ok(Math.abs(damp(0, 10, 5, 1000) - 10) < 1e-9, 'reaches target at large dt');
  const mid = damp(0, 10, 1, 1);
  assert.ok(mid > 0 && mid < 10, 'intermediate dt lands between source and target');
});

test('angDiff returns the shortest signed angle', () => {
  assert.ok(Math.abs(angDiff(0, Math.PI / 2) - Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(angDiff(0, -Math.PI / 2) - (-Math.PI / 2)) < 1e-9);
  assert.equal(angDiff(0, 0), 0);
  // just past ±π wraps to the short way around
  const d = angDiff(0, Math.PI + 0.1);
  assert.ok(d < 0 && d > -Math.PI - 0.2, 'wraps to negative short arc');
});

test('dist2D computes 2-D Euclidean distance', () => {
  assert.equal(dist2D(0, 0, 3, 4), 5);
  assert.equal(dist2D(1, 1, 1, 1), 0);
  assert.ok(Math.abs(dist2D(0, 0, 1, 1) - Math.SQRT2) < 1e-9);
});

test('fmtTime formats seconds as M:SS with ceiling and zero-floor', () => {
  assert.equal(fmtTime(0), '0:00');
  assert.equal(fmtTime(59), '0:59');
  assert.equal(fmtTime(60), '1:00');
  assert.equal(fmtTime(90), '1:30');
  assert.equal(fmtTime(1.2), '0:02');
  assert.equal(fmtTime(-5), '0:00');
  assert.equal(fmtTime(3661), '61:01');
});

test('fmt$ rounds and appends the galleon currency glyph', () => {
  assert.equal(fmt$(300), '300\u20BD');
  assert.equal(fmt$(0), '0\u20BD');
  assert.equal(fmt$(1.6), '2\u20BD');
});

test('hexCss formats a number as a 6-digit CSS hex colour', () => {
  assert.equal(hexCss(0xff3b4a), '#ff3b4a');
  assert.equal(hexCss(0x000000), '#000000');
  assert.equal(hexCss(0xffffff), '#ffffff');
  assert.equal(hexCss(0x0000ff), '#0000ff');
});

test('shuffle returns all elements without modifying the original', () => {
  const arr = [1, 2, 3, 4, 5];
  const result = shuffle(arr);
  assert.equal(result.length, arr.length);
  assert.deepEqual([...result].sort((a, b) => a - b), arr);
  assert.deepEqual(arr, [1, 2, 3, 4, 5], 'original array is unchanged');
});
