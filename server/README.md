# DuelStrike relay server

A dumb WebSocket relay for multiplayer deathmatch. It manages rooms by code and
forwards messages between the members of a room — it holds **no game logic**.
The authoritative simulation runs in the host's browser; this server only moves
bytes.

It deploys independently of the game client and has a single dependency (`ws`).

## Run it locally

```bash
cd server
npm install
npm start          # listens on PORT (default 8787)
```

From the repo root, `npm run relay` does the same thing.

The client connects to `ws://localhost:8787` by default. Point it elsewhere at
build time with `VITE_RELAY_URL` (see the root README).

## Protocol (for reference)

Control messages manage rooms; everything else is forwarded verbatim to the
rest of the sender's room with a `from` id stamped on.

- `→ { t: 'host', name }` ⇒ `← { t: 'welcome', id, room, isHost: true, peers: [] }`
- `→ { t: 'join', room, name }` ⇒ `← { t: 'welcome', id, room, isHost: false, hostId, peers }`
  and existing members get `{ t: 'peerJoin', id, name }`
- on disconnect: peers get `{ t: 'peerLeave', id }`; if the **host** leaves, the
  room is destroyed and members get `{ t: 'ended' }`
- any other message (`state`, `cast`, `hit`, `snapshot`, `start`, …) is relayed
  to the rest of the room with `from` added

## Deploy

The server is a plain Node process that listens on `$PORT` and speaks
WebSocket. Any host that keeps a long-lived Node process and supports
persistent WebSocket connections works:

- **Railway** (free trial, then usage-based) — point it at the `server/`
  directory, build/run `npm install && npm start`. `PORT` is injected.
- **Fly.io** (~$2/mo for a shared-cpu-1x machine) — `fly launch` in `server/`,
  expose the internal port, run `npm start`. Persistent connections are fine.

Then build the client with `VITE_RELAY_URL=wss://<your-relay-host>` so it
connects over TLS to the deployed relay.

**Avoid platforms that sleep idle apps or drop WebSockets.** Render's free tier,
for example, spins down on idle and severs long-lived sockets — fine for a quick
test, frustrating for a real session.

> Phase 1 is a friends-only trust model: clients self-report position and hits,
> and there is no authentication or rate limiting on the relay. Don't expose it
> as a public service as-is.
