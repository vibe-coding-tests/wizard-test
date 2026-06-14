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

  const stateP = once(host, 'state');
  guest.send(JSON.stringify({ t: 'state', x: 1, y: 2, z: 3 }));
  const state = await stateP;
  assert.equal(state.x, 1);
  assert.equal(state.from, gWelcome.id);

  const endedP = once(guest, 'ended');
  host.close();
  await endedP;

  wss.close();
});
