// src/net/net.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Net } from './net.js';

class FakeSocket {
  constructor() { this.sent = []; this.readyState = 1; this.OPEN = 1; }
  send(s) { this.sent.push(JSON.parse(s)); }
  close() { this.onclose?.(); }
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
  net.send({ t: 'state', x: 1 });
  assert.equal(sock.sent.length, 0);
  sock.emitOpen();
  assert.deepEqual(sock.sent.find((m) => m.t === 'state'), { t: 'state', x: 1 });
});

test('peerJoin and peerLeave update the peers map', () => {
  const { net, sock } = makeNet();
  net.host('H'); sock.emitOpen();
  sock.emitMsg({ t: 'welcome', id: 'c1', room: 'AB12', isHost: true, hostId: 'c1', peers: [{ id: 'c2', name: 'Ron' }] });
  assert.equal(net.peers.get('c2').name, 'Ron');
  sock.emitMsg({ t: 'peerJoin', id: 'c3', name: 'Ginny' });
  assert.equal(net.peers.get('c3').name, 'Ginny');
  sock.emitMsg({ t: 'peerLeave', id: 'c2' });
  assert.equal(net.peers.has('c2'), false);
});

test('close() resets transient state and queued messages', () => {
  const { net, sock } = makeNet();
  net.host('H'); sock.emitOpen();
  sock.emitMsg({ t: 'welcome', id: 'c1', room: 'AB12', isHost: true, hostId: 'c1', peers: [{ id: 'c2', name: 'Ron' }] });
  net.close();
  assert.equal(net.id, null);
  assert.equal(net.room, null);
  assert.equal(net.isHost, false);
  assert.equal(net.peers.size, 0);
  assert.equal(net.queue.length, 0);
});
