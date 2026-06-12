import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
// Frame-rate independent exponential approach.
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const choice = (arr) => arr[(Math.random() * arr.length) | 0];
export const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const dist2D = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

export const angDiff = (a, b) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};

export const yawTo = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));

export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// Shared scratch vectors (never hold across calls that also use them)
export const TMP = { a: v3(), b: v3(), c: v3(), d: v3(), e: v3() };

export const fmt$ = (n) => `${Math.round(n)}\u20BD`; // galleon glyph stand-in, styled in CSS

export const fmtTime = (s) => {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

let _uid = 1;
export const uid = () => _uid++;

// DOM helper: el('div', 'class names', parent, textContent)
export function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  if (text !== undefined) e.textContent = text;
  return e;
}

export function hexCss(hex) {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

// Gaussian-ish random in [-1,1], biased to center
export const grand = () => (Math.random() + Math.random() + Math.random()) / 1.5 - 1;
