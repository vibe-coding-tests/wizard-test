# Multiplayer Phase 1 — Networked Deathmatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a few friends join the same deathmatch over the internet via a room code and see each other move, cast, and frag — with bots filling empty slots — using a dumb relay server cheap enough to host on a free tier.

**Architecture:** Host-authoritative relay. One browser is the **host**: it runs the existing `Game` simulation (bots, DM timer, damage resolution) and broadcasts an authoritative snapshot ~15 Hz. Every client simulates its **own** player locally (instant control, no prediction) and broadcasts its transform ~20 Hz peer-to-peer. The Node server is a **dumb relay** — it manages rooms by code and forwards messages to all other members of a room; it holds no game logic. Clients self-report position and hits (friends-only trust model).

**Tech Stack:** Node + `ws` (server only), browser-native `WebSocket` (client), Vite, Three.js, `node --test`, Playwright (existing).

**Scope of Phase 1:** Deathmatch mode only (`mode: 'dm'`). No rounds/economy/relic objective (that is Phase 2). Deliverable: host a DM, share a code/link, friends join, everyone runs around casting and killing each other and bots, scores tracked by the host. This is the vertical slice that de-risks transport + remote rendering + damage authority.

**Out of scope (later phases):** Relic mode (rounds, buy phase, objective) — Phase 2. Host migration, reconnect, chat, public lobby browser, deploy hardening — Phase 3.

---

## File Structure

**New files:**
- `server/rooms.js` — pure room registry (no networking): create/join/leave/forward bookkeeping. Unit-tested in isolation.
- `server/relay.js` — `ws` transport that wires socket connections to `RoomRegistry`. Thin.
- `server/package.json` — declares the server's own `ws` dependency and `start` script, so the server deploys independently of the game client.
- `src/net/protocol.js` — pure message builders + `decode`. Unit-tested.
- `src/net/net.js` — `Net` class: owns the `WebSocket`, exposes `host`/`join`/`send`/`close` and an event emitter. Socket factory is injectable for tests.
- `src/net/interp.js` — pure transform-interpolation helper (`sampleBuffer`). Unit-tested.

**Modified files:**
- `src/player.js` — add `remote` puppet branch to `Player.update` + a `pushNetState`/`updateRemote` pair driven by `interp.js`.
- `src/game.js` — multiplayer DM wiring: build remote players from peers, broadcast own state, apply peer states, host-owns-bots/timer, cast replication, host-authoritative damage.
- `src/menus.js` — lobby UI (Host / Join / code / share link / start).
- `src/main.js` — net lifecycle + `?room=` auto-join, pass `net` into `Game`.
- `package.json` — add a `relay` dev script to run the server locally.
- `vite.config.js` — expose `VITE_RELAY_URL` (already handled by Vite env; only touched if a default is needed).

**Relay URL config:** the client reads `import.meta.env.VITE_RELAY_URL`, falling back to `ws://localhost:8787` for local dev. Production sets `VITE_RELAY_URL=wss://<your-relay-host>` at build time.

---

## Task 1: Room registry (pure, no networking)

**Files:**
- Create: `server/rooms.js`
- Test: `server/rooms.test.js`

- [ ] **Step 1: Write the failing test**

```js
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
  assert.deepEqual(r.peers, []); // no other members yet
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
  assert.equal(reg.recipients('sock-g').length, 0); // room gone
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/rooms.test.js`
Expected: FAIL — `Cannot find module './rooms.js'`.

- [ ] **Step 3: Write minimal implementation**

```js
// server/rooms.js
// Pure room bookkeeping for the relay. No sockets here — `id` is whatever
// opaque connection key the transport hands us. Keeps room logic unit-testable.

function defaultCode() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no easily-confused chars
  let s = '';
  for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

export class RoomRegistry {
  constructor(codeGen = defaultCode) {
    this.codeGen = codeGen;
    this.rooms = new Map();    // code -> { hostId, members: Map<id,{name}> }
    this.byMember = new Map(); // id -> code
  }

  host(id, name) {
    let code = this.codeGen();
    while (this.rooms.has(code)) code = this.codeGen();
    const members = new Map([[id, { name }]]);
    this.rooms.set(code, { hostId: id, members });
    this.byMember.set(id, code);
    return { room: code, id, isHost: true, hostId: id, peers: [] };
  }

  join(id, code, name) {
    const room = this.rooms.get(code);
    if (!room) return { ok: false, reason: 'no-room' };
    const peers = [...room.members].map(([mid, m]) => ({ id: mid, name: m.name }));
    room.members.set(id, { name });
    this.byMember.set(id, code);
    return { ok: true, room: code, id, isHost: false, hostId: room.hostId, peers };
  }

  recipients(id) {
    const code = this.byMember.get(id);
    const room = code && this.rooms.get(code);
    if (!room) return [];
    return [...room.members.keys()].filter((mid) => mid !== id);
  }

  nameOf(id) {
    const code = this.byMember.get(id);
    const room = code && this.rooms.get(code);
    return room?.members.get(id)?.name ?? null;
  }

  leave(id) {
    const code = this.byMember.get(id);
    const room = code && this.rooms.get(code);
    this.byMember.delete(id);
    if (!room) return { ended: false, left: id, notify: [] };
    if (room.hostId === id) {
      const notify = [...room.members.keys()].filter((mid) => mid !== id);
      for (const mid of room.members.keys()) this.byMember.delete(mid);
      this.rooms.delete(code);
      return { ended: true, room: code, notify };
    }
    room.members.delete(id);
    return { ended: false, left: id, notify: [...room.members.keys()] };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/rooms.test.js`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add server/rooms.js server/rooms.test.js
git commit -m "feat(net): pure room registry for the relay server"
```

---

## Task 2: Relay server (ws transport)

**Files:**
- Create: `server/relay.js`
- Create: `server/package.json`
- Test: `server/relay.test.js`
- Modify: `package.json` (root) — add `relay` script

- [ ] **Step 1: Create the server package manifest and install `ws`**

```json
// server/package.json
{
  "name": "wizardstrike-relay",
  "version": "1.0.0",
  "type": "module",
  "private": true,
  "scripts": {
    "start": "node relay.js",
    "test": "node --test"
  },
  "dependencies": {
    "ws": "^8.18.0"
  }
}
```

Run: `cd server && npm install && cd ..`
Expected: `ws` installed under `server/node_modules`.

- [ ] **Step 2: Write the failing integration test**

```js
// server/relay.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocketServer } from 'ws';
import WebSocket from 'ws';
import { attach } from './relay.js';

function once(ws, type) {
  return new Promise((res) => {
    ws.on('message', function h(raw) {
      const m = JSON.parse(raw);
      if (m.t === type) { ws.off('message', h); res(m); }
    });
  });
}
function open(ws) { return new Promise((r) => ws.on('open', r)); }

test('host + join + relay forwarding end-to-end', async () => {
  const wss = new WebSocketServer({ port: 0 });
  attach(wss, { codeGen: () => 'AB12' });
  const port = wss.address().port;

  const host = new WebSocket(`ws://localhost:${port}`);
  await open(host);
  host.send(JSON.stringify({ t: 'host', name: 'Harry' }));
  const welcome = await once(host, 'welcome');
  assert.equal(welcome.room, 'AB12');
  assert.equal(welcome.isHost, true);

  const guest = new WebSocket(`ws://localhost:${port}`);
  await open(guest);
  const peerJoinP = once(host, 'peerJoin');
  guest.send(JSON.stringify({ t: 'join', room: 'AB12', name: 'Ron' }));
  const gWelcome = await once(guest, 'welcome');
  assert.equal(gWelcome.isHost, false);
  assert.equal(gWelcome.peers[0].name, 'Harry');
  const peerJoin = await peerJoinP;
  assert.equal(peerJoin.name, 'Ron');

  // a game message from guest is forwarded to host with `from` stamped
  const stateP = once(host, 'state');
  guest.send(JSON.stringify({ t: 'state', x: 1, y: 2, z: 3 }));
  const state = await stateP;
  assert.equal(state.x, 1);
  assert.equal(state.from, gWelcome.id);

  // host leaves -> guest gets `ended`
  const endedP = once(guest, 'ended');
  host.close();
  await endedP;

  wss.close();
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd server && node --test relay.test.js`
Expected: FAIL — `attach` is not exported / module missing.

- [ ] **Step 4: Write minimal implementation**

```js
// server/relay.js
// Dumb relay: control messages (host/join/leave) manage rooms; every other
// message is forwarded verbatim to the rest of the sender's room with `from`
// stamped. No game logic.
import { WebSocketServer } from 'ws';
import { RoomRegistry } from './rooms.js';

let _nextId = 1;

export function attach(wss, { codeGen } = {}) {
  const reg = new RoomRegistry(codeGen);
  const socks = new Map(); // id -> ws

  const send = (id, obj) => {
    const ws = socks.get(id);
    if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
  };

  wss.on('connection', (ws) => {
    const id = `c${_nextId++}`;
    ws.connId = id;
    socks.set(id, ws);

    ws.on('message', (raw) => {
      let m;
      try { m = JSON.parse(raw); } catch { return; }
      if (m.t === 'host') {
        const r = reg.host(id, (m.name || 'Wizard').slice(0, 24));
        send(id, { t: 'welcome', ...r });
        return;
      }
      if (m.t === 'join') {
        const r = reg.join(id, String(m.room || '').toUpperCase(), (m.name || 'Wizard').slice(0, 24));
        if (!r.ok) { send(id, { t: 'error', reason: r.reason }); return; }
        send(id, { t: 'welcome', ...r });
        for (const pid of reg.recipients(id)) send(pid, { t: 'peerJoin', id, name: reg.nameOf(id) });
        return;
      }
      // forward everything else to the room
      const out = { ...m, from: id };
      for (const pid of reg.recipients(id)) send(pid, out);
    });

    ws.on('close', () => {
      socks.delete(id);
      const res = reg.leave(id);
      if (res.ended) for (const pid of res.notify) send(pid, { t: 'ended' });
      else for (const pid of res.notify) send(pid, { t: 'peerLeave', id });
    });
  });

  return reg;
}

// Standalone entry: `node relay.js` (PORT env or 8787).
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT) || 8787;
  const wss = new WebSocketServer({ port });
  attach(wss);
  // eslint-disable-next-line no-console
  console.log(`[relay] listening on :${port}`);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && node --test relay.test.js`
Expected: PASS.

- [ ] **Step 6: Add a root convenience script**

In `package.json` (root), add to `"scripts"`:

```json
    "relay": "node server/relay.js",
```

- [ ] **Step 7: Commit**

```bash
git add server/relay.js server/relay.test.js server/package.json server/package-lock.json package.json
git commit -m "feat(net): ws relay server with room forwarding"
```

---

## Task 3: Client protocol helpers (pure)

**Files:**
- Create: `src/net/protocol.js`
- Test: `src/net/protocol.test.js`

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/net/protocol.test.js`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/net/protocol.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/net/protocol.js src/net/protocol.test.js
git commit -m "feat(net): client wire-message builders"
```

---

## Task 4: Net class (connection + events)

**Files:**
- Create: `src/net/net.js`
- Test: `src/net/net.test.js`

- [ ] **Step 1: Write the failing test (fake socket injected)**

```js
// src/net/net.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Net } from './net.js';

class FakeSocket {
  constructor() { this.sent = []; this.readyState = 1; this.OPEN = 1; }
  send(s) { this.sent.push(JSON.parse(s)); }
  close() { this.onclose?.(); }
  // helpers for the test to drive inbound traffic
  emitOpen() { this.onopen?.(); }
  emitMsg(obj) { this.onmessage?.({ data: JSON.stringify(obj) }); }
}

function makeNet() {
  const sock = new FakeSocket();
  const net = new Net('ws://x', () => sock);
  return { net, sock };
}

test('host() sends a host control message on open', () => {
  const { net, sock } = makeNet();
  net.host('Harry');
  sock.emitOpen();
  assert.deepEqual(sock.sent[0], { t: 'host', name: 'Harry' });
});

test('welcome populates identity and fires event', () => {
  const { net, sock } = makeNet();
  let got = null;
  net.on('welcome', (m) => { got = m; });
  net.host('Harry');
  sock.emitOpen();
  sock.emitMsg({ t: 'welcome', id: 'c1', room: 'AB12', isHost: true, hostId: 'c1', peers: [] });
  assert.equal(net.id, 'c1');
  assert.equal(net.room, 'AB12');
  assert.equal(net.isHost, true);
  assert.equal(got.room, 'AB12');
});

test('game messages route through the "message" event', () => {
  const { net, sock } = makeNet();
  const seen = [];
  net.on('message', (m) => seen.push(m));
  net.host('H'); sock.emitOpen();
  sock.emitMsg({ t: 'welcome', id: 'c1', room: 'AB12', isHost: true, hostId: 'c1', peers: [] });
  sock.emitMsg({ t: 'state', from: 'c2', x: 5 });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].x, 5);
});

test('send() queues until open, then flushes', () => {
  const { net, sock } = makeNet();
  net.host('H');
  net.send({ t: 'state', x: 1 }); // before open
  assert.equal(sock.sent.length, 0);
  sock.emitOpen();
  assert.deepEqual(sock.sent.find((m) => m.t === 'state'), { t: 'state', x: 1 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/net/net.test.js`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

```js
// src/net/net.js
// Owns the WebSocket and a tiny event emitter. Control messages (welcome,
// peerJoin, peerLeave, host, error, ended) fire named events; every other
// message fires `message`. Socket factory injectable for tests.
import { decode } from './protocol.js';

const CONTROL = new Set(['welcome', 'peerJoin', 'peerLeave', 'host', 'error', 'ended']);

export class Net {
  constructor(url, socketFactory = (u) => new WebSocket(u)) {
    this.url = url;
    this.makeSocket = socketFactory;
    this.ws = null;
    this.open = false;
    this.queue = [];
    this.listeners = new Map();
    this.id = null; this.room = null; this.isHost = false; this.hostId = null;
    this.peers = new Map(); // id -> { name }
    this._intent = null;    // {t:'host'|'join', ...} sent on open
  }

  on(type, fn) { (this.listeners.get(type) || this.listeners.set(type, []).get(type)).push(fn); return this; }
  emit(type, m) { for (const fn of this.listeners.get(type) || []) fn(m); }

  _connect() {
    if (this.ws) return;
    this.ws = this.makeSocket(this.url);
    this.ws.onopen = () => {
      this.open = true;
      if (this._intent) this._raw(this._intent);
      for (const m of this.queue) this._raw(m);
      this.queue.length = 0;
    };
    this.ws.onmessage = (e) => this._recv(e.data);
    this.ws.onclose = () => { this.open = false; this.emit('close', null); };
    this.ws.onerror = () => this.emit('error', { reason: 'socket' });
  }

  host(name) { this._intent = { t: 'host', name }; this._connect(); }
  join(room, name) { this._intent = { t: 'join', room: String(room).toUpperCase(), name }; this._connect(); }

  _recv(raw) {
    const m = decode(raw);
    if (!m) return;
    if (m.t === 'welcome') {
      this.id = m.id; this.room = m.room; this.isHost = m.isHost; this.hostId = m.hostId;
      this.peers = new Map((m.peers || []).map((p) => [p.id, { name: p.name }]));
    } else if (m.t === 'peerJoin') this.peers.set(m.id, { name: m.name });
    else if (m.t === 'peerLeave') this.peers.delete(m.id);
    else if (m.t === 'host') { this.hostId = m.id; this.isHost = m.id === this.id; }
    if (CONTROL.has(m.t)) this.emit(m.t, m);
    else this.emit('message', m);
  }

  _raw(obj) { if (this.ws && this.open) this.ws.send(JSON.stringify(obj)); }
  send(obj) { if (this.open) this._raw(obj); else this.queue.push(obj); }
  close() { this.ws?.close(); this.ws = null; this.open = false; }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/net/net.test.js`
Expected: PASS.

> Note: the `on()` one-liner relies on `Map.prototype.set` returning the map; the
> `.set(type, []).get(type)` chain creates-then-fetches the array. Verify the
> first registration works (the passing tests above exercise it).

- [ ] **Step 5: Commit**

```bash
git add src/net/net.js src/net/net.test.js
git commit -m "feat(net): Net connection wrapper with event emitter"
```

---

## Task 5: Transform interpolation buffer (pure)

**Files:**
- Create: `src/net/interp.js`
- Test: `src/net/interp.test.js`

- [ ] **Step 1: Write the failing test**

```js
// src/net/interp.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleBuffer } from './interp.js';

const buf = [
  { t: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0 },
  { t: 1, x: 10, y: 0, z: 0, yaw: 1, pitch: 0 },
];

test('samples midway between two states', () => {
  const s = sampleBuffer(buf, 0.5);
  assert.ok(Math.abs(s.x - 5) < 1e-6);
  assert.ok(Math.abs(s.yaw - 0.5) < 1e-6);
});

test('clamps before the first sample', () => {
  const s = sampleBuffer(buf, -3);
  assert.equal(s.x, 0);
});

test('clamps after the last sample', () => {
  const s = sampleBuffer(buf, 9);
  assert.equal(s.x, 10);
});

test('interpolates yaw the short way around the wrap', () => {
  const wrap = [
    { t: 0, x: 0, y: 0, z: 0, yaw: 3.0, pitch: 0 },   // ~ +172deg
    { t: 1, x: 0, y: 0, z: 0, yaw: -3.0, pitch: 0 },  // ~ -172deg
  ];
  const s = sampleBuffer(wrap, 0.5); // should cross +/-pi, not sweep through 0
  assert.ok(Math.abs(Math.abs(s.yaw) - Math.PI) < 0.2);
});

test('empty buffer returns null', () => {
  assert.equal(sampleBuffer([], 0.5), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/net/interp.test.js`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

```js
// src/net/interp.js
// Linear interpolation over a time-ordered buffer of transform samples.
// `renderT` is in the same time units as each sample's `t`.

function lerpAngle(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

export function sampleBuffer(buf, renderT) {
  if (!buf || buf.length === 0) return null;
  if (renderT <= buf[0].t) return { ...buf[0] };
  const last = buf[buf.length - 1];
  if (renderT >= last.t) return { ...last };
  let i = 0;
  while (i < buf.length - 1 && buf[i + 1].t < renderT) i++;
  const a = buf[i], b = buf[i + 1];
  const k = (renderT - a.t) / (b.t - a.t || 1);
  return {
    t: renderT,
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    z: a.z + (b.z - a.z) * k,
    yaw: lerpAngle(a.yaw, b.yaw, k),
    pitch: a.pitch + (b.pitch - a.pitch) * k,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/net/interp.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/net/interp.js src/net/interp.test.js
git commit -m "feat(net): transform interpolation buffer"
```

---

## Task 6: Remote puppet mode on Player

**Files:**
- Modify: `src/player.js` (constructor near line 84; `update` near line 383)
- Test: `src/net/puppet.test.js` (tests the pure buffer push/trim logic, extracted)

The puppet needs: a `remote` flag, an incoming-state buffer, a push that stamps
arrival time + trims old samples, and a render that interpolates ~100 ms behind.
Extract the buffer maintenance into a pure helper so it is testable without a
live `Player`/Three.js.

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/net/puppet.test.js`
Expected: FAIL — `pushSample` / `trimBuffer` not exported.

- [ ] **Step 3: Add the helpers to `src/net/interp.js`**

Append:

```js
export function pushSample(buf, s, now) {
  buf.push({ t: now, x: s.x, y: s.y, z: s.z, yaw: s.yaw, pitch: s.pitch });
  return buf;
}

export function trimBuffer(buf, now, windowMs) {
  const cutoff = now - windowMs;
  while (buf.length > 2 && buf[1].t < cutoff) buf.shift();
  return buf;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/net/puppet.test.js`
Expected: PASS.

- [ ] **Step 5: Wire the puppet branch into `Player`**

In `src/player.js` constructor, after the `this.ctrl = {...}` line (~line 84) add:

```js
    this.remote = false;     // network-driven puppet (other humans)
    this.netBuf = [];        // interpolation buffer of incoming states
    this.netClock = 0;       // ms clock advanced by updateRemote
    this.netLatest = null;   // last raw state (for alive/spell/team)
```

At the very top of `Player.update(dt)` (line 383, before the `if (!this.alive)`
block), add:

```js
    if (this.remote) { this.updateRemote(dt); return; }
```

Add this method to the `Player` class (place it right after `update`). It uses
the same `this.rig?.update(dt, this)` call the local path uses at line ~600, so
remote players animate identically to bots:

```js
  pushNetState(s) {
    // called from Game when a peer `state` message arrives
    this.netLatest = s;
    if (s.al === false) { this.alive = false; }
    else if (s.al === true && !this.alive) { this.alive = true; this.health = this.stats.hp; }
    if (s.sp) this.curSpell = s.sp;
    pushSample(this.netBuf, { x: s.x, y: s.y, z: s.z, yaw: s.yaw, pitch: s.pitch }, this.netClock);
  }

  updateRemote(dt) {
    this.netClock += dt * 1000;
    trimBuffer(this.netBuf, this.netClock, 500);
    const renderT = this.netClock - 100; // render 100ms in the past for smoothness
    const s = sampleBuffer(this.netBuf, renderT);
    if (s) {
      this.pos.set(s.x, s.y, s.z);
      this.yaw = s.yaw; this.pitch = s.pitch;
      this.walking = !!this.netLatest?.w;
    }
    this.rig?.update(dt, this);
  }
```

Add the import at the top of `src/player.js` (next to the existing imports):

```js
import { sampleBuffer, pushSample, trimBuffer } from './net/interp.js';
```

- [ ] **Step 6: Verify the existing suite still passes**

Run: `npm test`
Expected: PASS (no behavior change for offline play — `remote` defaults false).

- [ ] **Step 7: Commit**

```bash
git add src/player.js src/net/interp.js src/net/puppet.test.js
git commit -m "feat(net): remote puppet interpolation on Player"
```

---

## Task 7: Lobby UI + net lifecycle

**Files:**
- Modify: `src/menus.js` (add `showMultiplayer`, wire a main-menu button)
- Modify: `src/main.js` (own a `Net`, pass into `startGame`/`Game`, read `?room=`)

This task adds the host/join screen and connects the socket. It does not yet add
any in-game sync — that is Task 8. After this task, hosting prints a code + link
and starting launches a normal local DM that *also* holds an open socket.

- [ ] **Step 1: Add the relay URL helper and Net wiring in `main.js`**

Near the top of `src/main.js` (after imports), add:

```js
import { Net } from './net/net.js';
const RELAY_URL = import.meta.env.VITE_RELAY_URL || 'ws://localhost:8787';
let net = null;
```

Change the `startGame` signature so a `net` can be threaded into the `Game`
options object. In the `game = window.__game = new Game({ ... }, setup)` call
(line ~167), add `net,` to the options object:

```js
    game = window.__game = new Game({
      scene, camera, renderer, audio, input, hud, settings, postfx, net,
      onMatchEnd: (winner) => { /* unchanged */ },
    }, setup);
```

Add a helper used by the lobby to start a networked DM once connected:

```js
function startNetGame(setup) {
  startGame(setup, { requestLock: true, loading: true });
}
```

- [ ] **Step 2: Pass net-control callbacks into Menus**

In the `new Menus(uiEl, { ... })` options (line ~151), add:

```js
    net: {
      host: (name) => { net = new Net(RELAY_URL, undefined); net.host(name); return net; },
      join: (room, name) => { net = new Net(RELAY_URL, undefined); net.join(room, name); return net; },
      current: () => net,
      relayUrl: RELAY_URL,
    },
    startNetGame,
```

- [ ] **Step 3: Add the multiplayer panel to `menus.js`**

In `showMain()` (line ~161), add a button after the DEATHMATCH button:

```js
    mk('MULTIPLAYER', 'Host or join a friend\'s deathmatch by room code.', () => this.showMultiplayer());
```

Add the panel method to the `Menus` class (model it on `showSetup`/`showHelp`,
using the existing `el` helper and `this.panel(cls)`):

```js
  showMultiplayer() {
    const p = this.panel('multiplayer');
    el('h2', 'panel-title', p, 'MULTIPLAYER — DEATHMATCH');
    const name = (this.ctx.settings.lastSetup?.name) || 'Wizard';

    const hostBtn = el('button', 'btn big', p, 'HOST GAME');
    const row = el('div', 'mp-join-row', p);
    const codeIn = el('input', 'mp-code', row);
    codeIn.placeholder = 'CODE'; codeIn.maxLength = 4;
    const joinBtn = el('button', 'btn', row, 'JOIN');
    const status = el('div', 'mp-status', p, '');

    const onWelcome = (net) => {
      net.on('welcome', (m) => {
        const link = `${location.origin}${location.pathname}?room=${m.room}`;
        status.innerHTML = `Room <b>${m.room}</b> — share: <span class="mp-link">${link}</span>` +
          (m.isHost ? ' · you are HOST' : ' · joined');
        if (m.isHost) {
          const go = el('button', 'btn big', p, 'START DEATHMATCH');
          go.onclick = () => { this.click(); this.startMpGame(net, true); };
        } else {
          status.innerHTML += '<br>Waiting for host to start…';
          net.on('message', (g) => { if (g.t === 'start') this.startMpGame(net, false, g.setup); });
        }
      });
      net.on('error', (m) => { status.textContent = m.reason === 'no-room' ? 'No such room.' : 'Connection error.'; });
      net.on('ended', () => { status.textContent = 'Host left — match ended.'; });
    };

    hostBtn.onclick = () => { this.click(); onWelcome(this.ctx.net.host(name)); };
    joinBtn.onclick = () => { this.click(); onWelcome(this.ctx.net.join(codeIn.value, name)); };

    const foot = el('div', 'setup-foot', p);
    const back = el('button', 'btn big', foot, '← BACK');
    back.onclick = () => { this.click(); this.ctx.net.current()?.close(); this.showMain(); };
  }

  startMpGame(net, isHost, hostSetup) {
    const setup = hostSetup || {
      mode: 'dm', mapId: 'dust2', team: 'order', charId: 'harry', prefWand: 'holly',
      botsFriendly: 4, botsEnemy: 4, difficulty: 'normal', format: 'mr8',
      squad: [], foes: [], dmBanned: [],
    };
    if (isHost) net.send({ t: 'start', setup });
    this.clear();
    this.ctx.startNetGame(setup);
  }
```

- [ ] **Step 4: Auto-join from a share link in `main.js`**

At the bottom of `main.js`, replace the final `else { menus.showMain(); }` branch
of the `params.get('auto')` block with:

```js
} else if (params.get('room')) {
  menus.showMain();
  menus.showMultiplayer();
  const n = net = new Net(RELAY_URL, undefined);
  n.join(params.get('room'), 'Wizard');
  n.on('welcome', (m) => {
    n.on('message', (g) => { if (g.t === 'start') menus.startMpGame(n, false, g.setup); });
  });
} else {
  menus.showMain();
}
```

- [ ] **Step 5: Add minimal styles**

In `src/style.css`, append:

```css
.mp-join-row { display: flex; gap: 8px; margin: 12px 0; }
.mp-code { width: 120px; text-transform: uppercase; letter-spacing: 4px; text-align: center; }
.mp-status { margin-top: 10px; min-height: 2em; opacity: 0.9; }
.mp-link { user-select: all; color: #7dffa0; }
```

- [ ] **Step 6: Manual smoke (build must succeed)**

Run: `npm run build`
Expected: build passes with no errors. (Full two-browser smoke happens in Task 9.)

- [ ] **Step 7: Commit**

```bash
git add src/menus.js src/main.js src/style.css
git commit -m "feat(net): multiplayer lobby UI + net lifecycle"
```

---

## Task 8: In-game presence + cast replication

**Files:**
- Modify: `src/game.js` (constructor; `buildPlayers`; `update`; new `net` methods)

After this task, joined players appear and move in each other's worlds and their
casts are visible. Damage is still local-only (Task 9 adds host authority).

The model:
- The **host** keeps building the normal DM (human + bots). Each remote human is
  appended as a `Player` with `remote = true` and a `Rig`, replacing one bot slot
  per connected guest.
- A **guest** builds the same map but: suppresses bot AI and the DM timer (host
  owns them), keeps its own local human, and represents the host + every other
  peer + every bot as `remote` puppets.

For Phase 1 simplicity, **both host and guests run their own bots locally** is
NOT done — only the host simulates bots; guests receive bot transforms via the
host snapshot (Task 9 extends the snapshot to bots; in Task 8 guests simply have
no bots and host has bots). This keeps Task 8 focused on human presence.

- [ ] **Step 1: Capture role + net in the Game constructor**

In `src/game.js` constructor (after `this.postfx = app.postfx || null;`, ~line 28) add:

```js
    this.net = app.net || null;
    this.role = this.net ? (this.net.isHost ? 'host' : 'guest') : null;
    this.netPeers = new Map(); // peerId -> remote Player
    this.netSendT = 0;
```

- [ ] **Step 2: Create remote players for existing peers**

Add a method to `Game` (near `buildPlayers`, ~line 109):

```js
  addRemotePlayer(peerId, info) {
    const p = new Player(this, {
      name: info.name || 'Wizard', charId: info.charId || 'harry',
      team: info.team || TEAM.ORDER, isHuman: false,
    });
    p.remote = true;
    p.bot = null;
    p.rig = new Rig(this.scene, p.char, p.team);
    p.alive = true;
    this.players.push(p);
    this.netPeers.set(peerId, p);
    return p;
  }

  removeRemotePlayer(peerId) {
    const p = this.netPeers.get(peerId);
    if (!p) return;
    p.rig?.dispose?.();
    const i = this.players.indexOf(p);
    if (i >= 0) this.players.splice(i, 1);
    this.netPeers.delete(peerId);
  }
```

> Confirm `Rig`'s constructor signature against `src/player.js` line ~724 and its
> disposal at line ~1587 (`scene.remove(this.group)`); if `Rig` has no `dispose`,
> call `this.scene.remove(p.rig.group)` directly instead.

- [ ] **Step 3: Wire net handlers in the constructor**

At the end of the constructor (after `if (this.mode === 'dm') ...`), add:

```js
    if (this.net) this.bindNet();
```

Add the method:

```js
  bindNet() {
    // existing peers (from welcome) become remote players immediately
    for (const [pid, info] of this.net.peers) this.addRemotePlayer(pid, info);

    this.net.on('peerJoin', (m) => this.addRemotePlayer(m.id, { name: m.name }));
    this.net.on('peerLeave', (m) => this.removeRemotePlayer(m.id));
    this.net.on('message', (m) => this.onNetMessage(m));
  }

  onNetMessage(m) {
    const p = this.netPeers.get(m.from);
    if (m.t === 'state') {
      if (!p) { this.addRemotePlayer(m.from, { name: 'Wizard', charId: m.ch, team: m.tm }); return; }
      p.team = m.tm || p.team;
      p.pushNetState(m);
    } else if (m.t === 'cast') {
      this.replayRemoteCast(p, m);
    }
  }

  replayRemoteCast(p, m) {
    if (!p) return;
    const spell = SPELLS[m.spell];
    if (!spell) return;
    // reuse the existing visual/projectile path; the authoritative hit comes
    // from the caster's own `hit` report (Task 9).
    p.curSpell = m.spell;
    p.pos.set(m.origin.x, m.origin.y - 0 /* origin already eye-height */, m.origin.z);
    this.spells.fire(p, spell);
  }
```

> `this.spells.fire(p, spell)` is the existing cast entry (`src/spells.js:110`).
> Verify it reads direction from `p.aimDirInto`/`p.yaw`/`p.pitch`; if it needs an
> explicit direction, set `p.yaw`/`p.pitch` from `m.dir` before calling (compute
> `yaw = atan2(-dir.x, -dir.z)`, `pitch = asin(dir.y)`).

- [ ] **Step 4: Broadcast own state + casts from `update`**

In `Game.update(dt)`, just after `for (const p of this.players) p.update(dt);`
(line ~1309), add:

```js
    if (this.net) this.netTick(realDt);
```

Add the method:

```js
  netTick(realDt) {
    this.netSendT += realDt;
    if (this.netSendT >= 0.05) { // ~20Hz
      this.netSendT = 0;
      const h = this.human;
      this.net.send(buildState({
        pos: h.pos, yaw: h.yaw, pitch: h.pitch, walking: h.walking,
        charId: h.charId, team: h.team, curSpell: h.curSpell, alive: h.alive,
      }));
    }
  }
```

For casts: in `SpellSystem.fire` is shared by bots/humans, so broadcast at the
call site instead. In `Game`, wrap the human cast path — find where the human's
cast is triggered (the `castHeld` → `spells` path inside `handleHumanInput` /
`spells.update`). Simplest reliable hook: after `this.spells.update(dt)` in
`Game.update`, drain a per-frame outbox the SpellSystem fills. Add to
`SpellSystem.fire` (`src/spells.js`, end of the method) :

```js
    if (this.game.net && p === this.game.human) {
      this.game.net.send(buildCast(spell.id, p.eyePosInto(new THREE.Vector3()), p.aimDirInto(new THREE.Vector3()), p.charge?.t ? p.charge.t / p.charge.total : 0));
    }
```

Add imports at the top of `src/game.js`:

```js
import { buildState, buildCast } from './net/protocol.js';
```

and in `src/spells.js`:

```js
import { buildCast } from './net/protocol.js';
```

> Confirm `spell.id` exists on the spell object; if spells are keyed only by the
> `SPELLS` map key, pass that key through `fire`'s caller instead.

- [ ] **Step 5: Guests suppress host-owned simulation**

In `Game.update`, gate the bot + DM-timer simulation on role. Change the bots
loop (line ~1302) and the DM timer block (line ~1259) to host/offline only:

```js
    // bots (host or offline only — guests receive bot state from the host)
    if (this.role !== 'guest') for (const p of this.players) if (p.bot && p.alive) p.bot.update(dt);
```

```js
    if (this.mode === 'dm' && this.role !== 'guest') {
      this.dmTimer -= dt;
      if (this.dmTimer <= 0) { /* unchanged finishMatch block */ }
    }
```

- [ ] **Step 6: Manual two-window smoke**

Run (three terminals):
```bash
npm run relay              # terminal 1
npm run dev                # terminal 2 (opens browser A)
```
In browser A: MULTIPLAYER → HOST GAME → note the code → START DEATHMATCH.
Open a second browser window to the printed `?room=CODE` link.
Expected: each window shows the other player's wizard moving and casting.

- [ ] **Step 7: Commit**

```bash
git add src/game.js src/spells.js
git commit -m "feat(net): in-game presence and cast replication for DM"
```

---

## Task 9: Host-authoritative damage + bot snapshot

**Files:**
- Modify: `src/game.js` (snapshot broadcast, hit reports, guest snapshot apply)
- Modify: `src/player.js` (guard local damage application on role)
- Test: extend `scripts/soak.mjs` or add `scripts/net-smoke.mjs` (two headless clients)

After this task: the host owns HP/deaths/score and bot transforms; guests render
bots and authoritative HP from the host snapshot; a guest's spell hitting a
target is reported and resolved by the host.

- [ ] **Step 1: Report hits to the host**

The damage entry point is `Game.damage`/`applyDamage` (the method around
`src/game.js:340–400` that resolves `dealt`). Locate where damage is applied to a
victim from the human's spell. Add, at the point a *local human's* spell would
damage a victim:

```js
    // guest: don't apply locally — report to host, who is authoritative
    if (this.role === 'guest' && attacker === this.human) {
      const targetId = this.netIdOf(victim);
      if (targetId) { this.net.send(buildHit(targetId, spell?.id || 'unknown', Math.round(dealt), !!isHS)); return 0; }
    }
```

Add a helper mapping a Player back to its network id (peer id, or `'host'`/the
human's own id):

```js
  netIdOf(p) {
    for (const [pid, rp] of this.netPeers) if (rp === p) return pid;
    if (p === this.human) return this.net?.id;
    return p.netId || null; // host-owned bots get a stable netId at build (Step 3)
  }
```

- [ ] **Step 2: Host applies reported hits**

In `onNetMessage`, handle `hit` (host only):

```js
    else if (m.t === 'hit' && this.role === 'host') {
      const victim = this.playerByNetId(m.target);
      const attacker = this.netPeers.get(m.from) || null;
      if (victim && victim.alive) {
        this.applyDamage(victim, m.dmg, attacker, SPELLS[m.spell], m.hs); // existing damage routine
      }
    }
```

> Use the project's actual damage method name (verify around `src/game.js:340`).
> If it is `this.damage(...)` with a different argument order, match it. The point
> is: the host runs the same authoritative routine it already uses for bots.

Add `playerByNetId`:

```js
  playerByNetId(id) {
    if (id === this.net?.id) return this.human;
    const rp = this.netPeers.get(id);
    if (rp) return rp;
    return this.players.find((p) => p.netId === id) || null;
  }
```

- [ ] **Step 3: Give host bots stable network ids + broadcast snapshot**

In `buildPlayers` (host path), after bots are created, tag each with a stable id:

```js
    let _bn = 0;
    for (const p of this.players) if (p.bot) p.netId = `bot${_bn++}`;
```

Add snapshot broadcast in `netTick` (host only), ~10–15 Hz:

```js
    if (this.role === 'host') {
      this.netSnapT = (this.netSnapT || 0) + realDt;
      if (this.netSnapT >= 0.066) {
        this.netSnapT = 0;
        const bots = this.players.filter((p) => p.bot).map((p) => ({
          id: p.netId, x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, pitch: p.pitch,
          hp: p.health, al: p.alive, ch: p.charId, tm: p.team, w: !!p.walking,
        }));
        const hp = {};
        for (const p of this.players) {
          const nid = this.netIdOf(p);
          if (nid) hp[nid] = { hp: p.health, al: p.alive };
        }
        this.net.send({ t: 'snapshot', bots, hp, score: this.scoreboardSnapshot?.() || null });
      }
    }
```

- [ ] **Step 4: Guests apply the snapshot**

In `onNetMessage`, handle `snapshot` (guest only):

```js
    else if (m.t === 'snapshot' && this.role === 'guest') {
      for (const b of m.bots) {
        let bp = this.netPeers.get(b.id);
        if (!bp) bp = this.addRemotePlayer(b.id, { name: 'Bot', charId: b.ch, team: b.tm });
        bp.health = b.hp; bp.alive = b.al;
        bp.pushNetState({ x: b.x, y: b.y, z: b.z, yaw: b.yaw, pitch: b.pitch, w: b.w, al: b.al, sp: bp.curSpell });
      }
      for (const [nid, s] of Object.entries(m.hp)) {
        const pl = this.playerByNetId(nid);
        if (pl && pl === this.human) {
          if (s.al === false && this.human.alive) this.killLocalHuman(); // host says we died
          this.human.health = s.hp;
        }
      }
    }
```

Add a minimal `killLocalHuman()` that routes through the existing death/death-cam
path for the human without re-broadcasting (reuse the DM death handling; for
Phase 1 a respawn after `ROUND.dmRespawn` driven by the host snapshot flipping
`al` back to true is sufficient — when `s.al === true && !this.human.alive`,
respawn locally via `this.dmSpawn(this.human)`).

- [ ] **Step 5: Guard local damage application on the host path**

In `src/player.js` / `src/game.js` damage routine, ensure guests never mutate
authoritative HP locally except via the snapshot. The Step 1 early-return already
covers the human-attacker case; also ensure remote puppets' `health` is only set
from the snapshot (it is — puppets don't run local physics/damage).

- [ ] **Step 6: Headless two-client smoke test**

Create `scripts/net-smoke.mjs` (Playwright, modeled on `scripts/soak.mjs`):

```js
// Launches the relay, opens two pages (host + guest via ?room=), starts a DM,
// and asserts the guest sees >=1 remote player and the host sees the guest.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const relay = spawn('node', ['server/relay.js'], { env: { ...process.env, PORT: '8799' }, stdio: 'inherit' });
await new Promise((r) => setTimeout(r, 500));
const browser = await chromium.launch();
try {
  const host = await browser.newPage();
  await host.goto('http://localhost:5173/?mp=1'); // dev server must be running
  // ... drive HOST GAME, read code, START; open guest at ?room=CODE
  // assert window.__game.netPeers.size >= 1 on both pages
  console.log('net-smoke: OK');
} finally {
  await browser.close();
  relay.kill();
}
```

> This smoke test requires `npm run dev` running. Document it in the README; it is
> a manual/CI-gated check, not part of `npm test` (which stays hermetic).

Run: `npm test`
Expected: PASS (the hermetic unit suite from Tasks 1–6 is unaffected).

- [ ] **Step 7: Commit**

```bash
git add src/game.js src/player.js scripts/net-smoke.mjs
git commit -m "feat(net): host-authoritative damage and bot snapshot for DM"
```

---

## Task 10: Docs + deployment notes

**Files:**
- Modify: `README.md`
- Create: `server/README.md`

- [ ] **Step 1: Document multiplayer in `README.md`**

Add a "Multiplayer (beta)" section: run `npm run relay` locally, set
`VITE_RELAY_URL` for production, host/join by code, current limits (DM only, no
reconnect, host-leaves-ends-match).

- [ ] **Step 2: Server deploy notes in `server/README.md`**

Document deploying `server/` to Railway (free trial) or Fly.io (~$2/mo):
`PORT` env, `npm start`, and that the client must point `VITE_RELAY_URL` at the
`wss://` URL. Note Render's free tier sleeps and drops WebSockets.

- [ ] **Step 3: Commit**

```bash
git add README.md server/README.md
git commit -m "docs: multiplayer usage and relay deployment"
```

---

## Self-Review Notes

- **Spec coverage:** relay topology (broadcast-to-room) → Tasks 1–2; client owns
  own movement / 20 Hz state → Tasks 6, 8; host owns bots + DM timer + damage →
  Tasks 8–9; room codes + share link → Task 7; cast replication via existing
  spell system → Task 8; friends-only trust (self-reported hits) → Task 9;
  host-leaves-ends-match → Tasks 2 (`ended`) + 7 (UI). Rounds/economy/relic are
  explicitly Phase 2, not covered here by design.
- **Known verification points flagged inline** (marked with `>`): `Rig`
  constructor/disposal signature, `spells.fire` direction handling, the exact
  name/argument order of the damage routine, and whether `spell.id` exists. These
  are existing-code lookups the implementer must confirm at the touch site — the
  plan states the expected shape and the fallback for each.
- **Test strategy:** Tasks 1–6 are fully hermetic `node --test` units. Tasks 7–9
  touch Three.js/DOM and are validated by build + a Playwright two-client smoke
  (`scripts/net-smoke.mjs`), kept out of the hermetic `npm test`.
