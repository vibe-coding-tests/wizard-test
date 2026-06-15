import test from 'node:test';
import assert from 'node:assert/strict';
import {
  segVsSphere, segVsAABB, eyeHeight,
  EYE_STAND, EYE_CROUCH,
} from '../src/world.js';

test('segVsSphere returns the entry t for a segment that pierces a sphere', () => {
  // segment along +x from -5 to 5, unit sphere at the origin: enters at x=-1
  const t = segVsSphere(-5, 0, 0, 5, 0, 0, 0, 0, 0, 1);
  assert.ok(Math.abs(t - 0.4) < 1e-9, `expected 0.4, got ${t}`);
});

test('segVsSphere returns -1 when the segment misses the sphere', () => {
  assert.equal(segVsSphere(-5, 5, 0, 5, 5, 0, 0, 0, 0, 1), -1);
});

test('segVsSphere returns 0 when the segment starts inside the sphere', () => {
  assert.equal(segVsSphere(0, 0, 0, 5, 0, 0, 0, 0, 0, 1), 0);
});

test('segVsSphere returns -1 for a degenerate zero-length segment', () => {
  assert.equal(segVsSphere(2, 2, 2, 2, 2, 2, 0, 0, 0, 1), -1);
});

test('segVsSphere returns -1 when the sphere is behind the segment start', () => {
  // sphere at x=-10, segment runs +x away from it
  assert.equal(segVsSphere(0, 0, 0, 5, 0, 0, -10, 0, 0, 1), -1);
});

test('segVsAABB returns the entry t for a segment crossing the box', () => {
  // along +x from -5 to 5 through the unit cube [0,0,0]-[1,1,1]: enters at x=0
  const t = segVsAABB(-5, 0.5, 0.5, 5, 0.5, 0.5, 0, 0, 0, 1, 1, 1);
  assert.ok(Math.abs(t - 0.5) < 1e-9, `expected 0.5, got ${t}`);
});

test('segVsAABB returns -1 when the segment passes above the box', () => {
  assert.equal(segVsAABB(-5, 5, 0.5, 5, 5, 0.5, 0, 0, 0, 1, 1, 1), -1);
});

test('segVsAABB returns 0 when the segment starts inside the box', () => {
  assert.equal(segVsAABB(0.5, 0.5, 0.5, 5, 0.5, 0.5, 0, 0, 0, 1, 1, 1), 0);
});

test('segVsAABB rejects a segment parallel to and outside a slab', () => {
  // no x movement, x origin sits outside [0,1]
  assert.equal(segVsAABB(5, 0.5, 0.5, 5, 5, 0.5, 0, 0, 0, 1, 1, 1), -1);
});

test('eyeHeight picks the crouch eye below 1.5m and the stand eye above', () => {
  assert.equal(eyeHeight({ height: EYE_CROUCH }), EYE_CROUCH);
  assert.equal(eyeHeight({ height: 1.2 }), EYE_CROUCH);
  assert.equal(eyeHeight({ height: 1.8 }), EYE_STAND);
  assert.equal(eyeHeight({ height: 1.49 }), EYE_CROUCH, 'just under the threshold crouches');
  assert.equal(eyeHeight({ height: 1.5 }), EYE_STAND, 'exactly 1.5 stands');
});
