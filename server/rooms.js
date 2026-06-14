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
