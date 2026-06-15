// src/net/protocol.js
// Pure wire-message builders + decode. Keys are short to keep snapshots small.

export function buildState(p) {
  return {
    t: 'state',
    x: p.pos.x, y: p.pos.y, z: p.pos.z,
    yaw: p.yaw, pitch: p.pitch,
    w: !!p.walking, al: !!p.alive,
    sp: p.curSpell, ch: p.charId, tm: p.team,
  };
}

export function buildCast(spell, origin, dir, charge) {
  return {
    t: 'cast', spell,
    origin: { x: origin.x, y: origin.y, z: origin.z },
    dir: { x: dir.x, y: dir.y, z: dir.z },
    charge: charge ?? 0,
  };
}

export function buildHit(target, spell, dmg, hs) {
  return { t: 'hit', target, spell, dmg, hs: !!hs };
}

export function decode(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}
