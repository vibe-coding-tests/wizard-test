# WizardStrike Multiplayer (v1) — Host-Authoritative Relay

**Status:** Approved design — ready for implementation planning
**Date:** 2026-06-13

## Goal

Let a small group of friends play a WizardStrike match together over the
internet: join the same map, see each other move, cast, and take damage, with
bots filling any empty slots so a match is still a full 5v5. Keep the server
tiny and cheap enough to run on a free/near-free tier.

This is a **friends-only** experience, not a competitive/anti-cheat platform.
That single constraint is what makes the cheap, simple architecture viable.

## Non-goals (explicitly out of scope for v1)

- Anti-cheat / server-side validation of movement or hits.
- Host migration (if the host leaves, the match ends).
- Reconnect after a dropped connection.
- Text or voice chat.
- A public server browser / matchmaking. (Room codes only.)
- Mid-round late-join (late joiners spectate until the next round freeze).

All of these are clean follow-on additions; none are designed-out.

## Chosen approach: host-authoritative relay

Considered and rejected:

- **Full authoritative server** — server runs the simulation, clients predict +
  reconcile. Cheat-resistant but a multi-week rewrite of the ~14k-line client
  sim, and a heavier server. Overkill for friends.
- **Pure P2P mesh (WebRTC)** — every client talks to every other directly. NAT
  traversal pain and no clean owner for bots / round state.
- **Host-authoritative relay (CHOSEN)** — one host browser runs the match and
  bots; each player simulates their own movement locally and relays it; the
  server is a dumb message forwarder.

Why it fits: the current game is already a single-browser simulation
(`Game.update(dt)` ticks human input → bots → players → physics, all locally).
The relay model keeps that simulation intact on the host, makes each player
authoritative only over their own avatar (so local control stays instant with
zero prediction code), and reduces the server to a relay that needs no game
logic — which is what keeps it free to host.

## Roles & authority

Two roles per match: **host** (clicks "Host Game") and **guests**.

- **Each client owns its own player.** Movement, aim, and casting are simulated
  locally exactly as today, so the local player always feels instant. The client
  broadcasts its own state ~20 Hz.
- **The host owns shared match state:** the round state machine
  (freeze/buy/live/end), economy, the Cursed Relic objective, scores, and **all
  bots** that fill empty slots. The host broadcasts an authoritative snapshot
  ~15 Hz.
- **The server owns nothing about the game.** It manages rooms (keyed by a short
  code), tracks membership, designates the host, and forwards messages.

On any screen: the local player is simulated locally; everyone else (other
humans + bots) are interpolated "puppets" driven by network data.

**Trust model:** clients self-report their own position and the hits they land.
A determined client could lie. Accepted for friends-only v1.

## Components

### New files

- **`server/relay.js`** — standalone Node `ws` relay server. Responsibilities:
  create/join rooms by code, track members, designate the first member as host,
  forward messages to the rest of a room, announce join/leave, end the room when
  the host leaves. No game logic. The only artifact deployed to Railway/Fly.
- **`src/net.js`** — client networking layer. Responsibilities: connect to the
  relay, create/join a room, encode/decode messages, queue outgoing state,
  buffer incoming snapshots for interpolation, and emit events the `Game`/menus
  subscribe to. Holds no game logic beyond serialization.

### Changed files

- **`src/player.js`** — add a `remote` puppet mode. A remote player's `update()`
  skips local input/physics and instead interpolates its transform toward the
  latest buffered network state. Main surgical change.
- **`src/game.js`** — branch on role:
  - **Host:** runs the existing simulation, but remote humans' control inputs
    come from the network (not a `Bot` or local input); broadcasts the
    authoritative snapshot; applies damage from guests' hit reports and
    broadcasts resulting HP/death/score.
  - **Guest:** suppresses the round state machine, bot AI, and economy locally
    and drives them from host snapshots; still runs its own local player,
    rendering, audio, HUD, and effects.
- **`src/menus.js`** — lobby UI: "Host Game" / "Join Game" (enter code),
  shareable link + copy, roster list, host's map/mode pick, "Start".
- **`src/main.js`** — wire the net connection lifecycle into game start/dispose;
  read `?room=<code>` from the URL so share links auto-join.

## Data flow (wire protocol)

All messages are JSON over a single WebSocket per client to the relay. **The
relay broadcasts every message to all other members of the same room** (the hub
is the server, not the host). This star-broadcast topology means a player's
movement reaches peers in a single hop and does not need to be relayed again by
the host. Consequently authority is split cleanly:

- A player owns **where they are** (their own transform), sent peer-to-peer.
- The host owns **everything shared**: bots, relic, round state, score, and each
  player's **HP / money / alive** (because the host resolves damage).

Message kinds:

**From each client (broadcast to all)**
- `state` (~20 Hz): own transform (pos, yaw, pitch), motion/anim flags, current
  wand. Every client interpolates peers directly from this — it is NOT echoed in
  the host snapshot.
- `cast` (event): spell id, origin, direction, charge level. Every client plays
  the projectile/visual locally via the existing spell system.
- `hit` (event): target id, spell id, damage, headshot flag. Acted on by the
  host.
- `buy`, `plantProgress` / `defuseProgress`, `ping` (events).

**From the host (broadcast to all)**
- `snapshot` (~15 Hz): authoritative shared state only — every **bot's** full
  transform + HP + alive; the relic state; round state + timers; score; and per
  **human** the authoritative `{ hp, money, alive, team, char }` (no transform,
  since humans own their own position). Keeps the snapshot small.
- events: `death`, `roundStart` / `roundEnd`, `announce`.

Casts are replayed locally through the existing `SpellSystem` / `Effects`: only
the cast event is sent, not per-projectile ticks. The authoritative outcome of a
projectile is delivered separately by the shooter's `hit` report. This reuses
the current spell/effects code rather than re-syncing projectile physics.

## Damage & kills

Shooter-reports model. When a local player's spell hits a target, that client
sends a `hit` to the host. The host applies the damage, decides death and score,
and broadcasts the result in the next snapshot / a `death` event. One source of
truth; trusts clients (same friends-only trade-off).

## Lobby & joining

- Host clicks **Host Game**, picks map + mode, and receives a short room code and
  a share URL (`?room=<code>`).
- Guests click the link (auto-fills the code) or enter the code via **Join
  Game**, landing in the host's lobby with a live roster.
- Host starts the match; the chosen map/mode is sent so every client builds the
  same map.
- Empty slots are filled by bots (host-simulated) up to a full 5v5.

## Error handling & edges (v1)

- **Host disconnects →** match ends for everyone; return to lobby/menu.
- **Guest disconnects →** removed from roster; their slot can backfill with a bot
  at the next round.
- **Late join →** join the lobby; if a match is already live, spectate until the
  next round freeze, then spawn in.
- No reconnect, no chat, no public browser (see non-goals).

## Testing

- `server/relay.js`: node `--test` unit tests for room lifecycle — create, join,
  host-leaves-ends-room, message forwarding to the right members.
- `src/net.js`: encode/decode round-trip tests for every message kind.
- Two-client integration soak (extending `scripts/soak.mjs` / the existing
  Playwright setup): one client hosts, one joins; play a short match headless and
  assert both sides converge on the same score and relic state.

## Deployment

- **Client:** built static as today (`npm run build`) → hosted free (e.g.
  Cloudflare Pages / Vercel / Netlify / GitHub Pages).
- **Relay server:** deploy only `server/relay.js`. Railway free trial to prove
  it; then ~$2/mo (Fly.io tiny VM) or $5/mo (Railway Hobby) for an always-on
  public server. (No truly-free always-on tier survives for persistent
  WebSockets; Render's free tier sleeps and drops sockets.)
- The client reads the relay URL from a config/env value so local dev and prod
  point at different servers.

## Open questions

None blocking. Future iterations may revisit host migration, reconnect, chat,
and a public lobby browser.
