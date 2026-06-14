// server/relay.js
// Dumb relay: control messages (host/join/leave) manage rooms; every other
// message is forwarded verbatim to the rest of the sender's room with `from`
// stamped. No game logic.
import { WebSocketServer } from 'ws';
import { RoomRegistry } from './rooms.js';

export function attach(wss, { codeGen } = {}) {
  const reg = new RoomRegistry(codeGen);
  const socks = new Map(); // id -> ws
  let nextId = 1;

  const send = (id, obj) => {
    const ws = socks.get(id);
    if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
  };

  wss.on('connection', (ws) => {
    const id = `c${nextId++}`;
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
      // Dumb relay: forward the client's message verbatim (spread first so our
      // `from` stamp can't be spoofed). Friends-only — no key filtering.
      const out = { ...m, from: id };
      for (const pid of reg.recipients(id)) send(pid, out);
    });

    ws.on('error', () => { /* ignore; 'close' handles cleanup */ });

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
  console.log(`[relay] listening on :${port}`);
}
