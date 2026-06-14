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

  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
    return this;
  }

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
  close() {
    this.ws?.close();
    this.ws = null;
    this.open = false;
    this.queue.length = 0;
    this._intent = null;
    this.peers = new Map();
    this.id = null; this.room = null; this.isHost = false; this.hostId = null;
  }
}
