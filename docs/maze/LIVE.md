# Live Pac-Man (Contact mode): design

2026-11-26, approved by Lesia the same day. A real-time shared maze where chompers touch, run in a Cloudflare Durable Object.
Extends `docs/maze/DESIGN.md` ("Approaches considered", option 2, tabled 2026-11-14 and taken up
today). Everything not said here works as that document says.

## Why

The Shared maze over polling can't have contact: at 0.8 s "the chompers teleport all the time...
collisions don't do anything". Lesia wants the version where you can eat each other ("eat other
chompers, bump penalties: any collision should take off the same amount"). It is also the first
Durable Object on the planned move off Vercel (CLAUDE.md, Hosting, 2026-11-26), so it should
leave a pattern the lobby rooms can reuse later.

Success: friends in one room, each on a phone, chase and bump each other and it feels immediate;
your own chomper never lags; others glide, never teleport; a bump or an eat is felt by both
phones at once; the TV shows it live.

- **Goals:** a new **Contact** mode of Pac-Man, 2–8 players, bots, TV, the same looks, power-ups,
  mazes, options, results, stats and recap as the Shared maze.
- **Non-goals:** moving the lobby, chat or other games off polling; WebSockets for any other game;
  anti-cheat beyond the server being the one that decides; play across continents.
- **Anti-goals:** your own chomper waiting on the network; contact that the two phones disagree
  about; a round that can't finish or score if the socket drops; anything that breaks the existing
  Solo, Shared or Race modes, or the Vercel deployment.

## Constraints

- Hosting (2026-11-26): new infrastructure on Cloudflare. The site runs as the OpenNext `jackdaw`
  Worker at `jackdaw.lastivka.dev` (`apps/web/wrangler.jsonc`) and still also on Vercel, which
  can't hold WebSockets. **Contact works only on the Cloudflare deployment.**
- Lobby state stays in Upstash behind `RoomStorage`, reached by the existing polling runtime.
- Free Workers plan where possible. A round is a few minutes; Durable Object duration and incoming
  socket messages for a friend group are far inside the free allowance. Measure in the e2e run.
- Changes to the game module contract, lobby state machine or message protocol need Lesia's OK
  first (CLAUDE.md). The one needed is listed under "Platform addition".
- Pure rules with unit tests; randomness through `Rng`; the Durable Object's round logic is a pure
  class with an injected clock so it can be tested in Vitest without Workers.
- No hidden information exists in this game (all positions and scores are public), but the views
  and the leak test still apply.

## Approaches (picked: A)

- **A. The Durable Object in the existing `jackdaw` Worker (picked, 2026-11-26).** OpenNext's
  custom worker entry exports the Durable Object class next to the site. Phones connect to
  `wss://<site>/live/...` on the same origin. One deploy, one secret, no CORS. Trade-off: it ships
  with the website build, so a live-room bug ships with the site.
- **B. A separate `apps/live` Worker on `live.lastivka.dev`.** Independent deploys and failures,
  but a second pipeline, CORS and a second secret for a friends' game night.
- **C. Move the whole lobby into a Durable Object now.** Step 1 of full independence, but touches
  every game's transport before anyone can chomp. Better after A proves the pattern.

## Contact rules (Lesia, 2026-11-26)

- **Bump:** two chompers meet (closer than about 0.8 tile, neither eating) → both lose the same
  points and both are knocked back: each reverses and is briefly shielded from another bump.
- **Eat:** a chomper with Hunt active touches one without → the eaten one loses points, plays the
  death animation and respawns in their corner with the usual spawn shield; the eater scores.
  Both hunting, or both not, is a bump.
- Ghosts, pellets, power-ups, fruit, several mazes, the timer and attack power-ups work as in the
  Shared maze. Hunt makes ghosts edible for you as today, and now also makes you dangerous to
  other players (its banner and look say so).
- **Builder's call:** exact values. Starting point: bump −50 each and 1.5 s bump shield; eaten
  −200 (never below 0, like `catchCost`), eater +400; knock-back of one tile. Tune in playtest.

## How it fits together

```
phone ──poll/send──▶ /api/lobby/<CODE>        (today's runtime, Upstash; lobby, chat, scores)
phone ──POST──────▶ /api/lobby/<CODE>/live    → signed pass for this round and seat
phone ══WebSocket═▶ /live/<CODE>/<session>    → custom worker entry checks the pass
                                               → Durable Object "LiveRound" (one per session)
LiveRound ──signed POST (self binding)──▶ runtime: server-only `liveResult` action → results
```

1. **Start.** The host picks Contact and presses Start as usual. `setup` builds the same state as
   the Shared maze (seed, mazes, options, seats including bots) with `mode: 'Contact'`.
2. **Pass.** Each phone (and the TV, as a viewer) asks `POST /api/lobby/<CODE>/live` with its
   player token. The route loads the lobby, checks the seat and returns a short-lived pass signed
   with HMAC: lobby code, session id, player id (or `tv`), and the round's setup (seed, maze
   list, options, seats, start time). Pass lifetime covers the round plus a margin, so a phone
   can reconnect with it.
3. **Connect.** The custom worker entry (`apps/web/worker.ts`, wrapping `.open-next/worker.js`
   and exporting `LiveRound`) handles `/live/*` before Next: checks the pass signature and
   expiry, then forwards the upgrade to the Durable Object named by `<CODE>:<session>`. The first
   valid connection initialises the round from the pass's setup; later passes must match it.
4. **Play.** `LiveRound` runs the round authoritatively (below). When the last maze is cleared or
   the timer ends, it computes final scores and the recap/stats facts.
5. **Result.** `LiveRound` sends a signed `liveResult` to the runtime through the worker's
   `WORKER_SELF_REFERENCE` binding. The runtime applies it as a server-only action; the game
   finishes as usual (history, scores, standings, highlights, results screen). It retries until
   accepted; the action is idempotent (keyed by session).
6. **Fallbacks.** If the result never arrives (Durable Object lost), the module's own timer, a
   margin after the round's planned end, ends the game from what the state has (no live scores:
   unscored, like ending early without saving). The host's existing End Game still works.

### Settled for the builder (Claude's calls, 2026-11-26)

- **What `liveResult` carries.** It fills the same per-player record fields the Shared maze
  builds from phone reports (score parts, pellets, ghosts eaten, catches, fruit, power pickups,
  the score `trail` and recap events), plus new `bumps` and `eats` counts and their recap lines
  ("Wren ate Rook"). So `getResult`, standings, highlights, recap and the stats page are reused;
  Contact adds two stats (bumps and players eaten). `final: false` checkpoints are sent at every
  maze clear and about every 30 s, `final: true` at the end; each is keyed by session and a
  sequence number, and an older or repeated one is ignored.
- **When the lobby ends the round first** (host's End Game, Play again, everyone leaving):
  "Save the rounds so far" uses the latest checkpoint (`partialResult` reads it), so it works in
  Contact. Phones see the session end on their next poll and close their sockets. `LiveRound`
  stops when the runtime rejects a result or checkpoint as belonging to an old session, and when it
  has had no sockets for 60 s after its planned end. No call from the runtime into the Durable
  Object is needed.
- **Clock and late joiners.** The pass carries the session's start time; the round clock is that
  time on the Durable Object's clock, and the platform's 3-2-1 countdown runs before it, as in the
  Shared maze. The round starts on time whoever is connected. A chomper whose phone hasn't
  connected yet waits in its corner (it can't be bumped or caught there, a shield like the spawn
  one) and joins when the phone connects. The module's fallback timer is the planned end + 90 s.
- **One socket per seat.** A new socket for a seat (reconnect, a second tab, a rejoin code on a
  new device) takes over and the old one is closed with "Playing on another device". TV passes
  allow any number of viewers.
- **Vercel phones in a Contact lobby.** Lobbies are shared between both sites, so a phone on the
  Vercel address can be in a Contact lobby. It shows the round's start screen with one button,
  "Open on jackdaw.lastivka.dev" (the same room, seat kept through its rejoin link), and never
  tries a cross-site socket. The pass route works only on the Cloudflare site, and sockets check
  their `Origin` against the site's own address.

### Platform addition (approved by Lesia, 2026-11-26)

A **server-only action**: the runtime gets an internal `applyServerAction(code, sessionId,
action)` (not reachable from `POST /api/lobby`), and `GameModule` gets an optional
`serverActionSchema` validated before `applyAction` with `actor: null`. The HTTP handler keeps
refusing any action not in `actionSchema`, so a phone can never send `liveResult`. This is the
general shape later realtime games (Tetra) can reuse. Alternative considered: making Contact a
`GameLink`; rejected because links are per game, not per mode, and would make the whole Pac-Man
game "linked".

The new route `POST /api/lobby/<CODE>/live` and `POST /api/lobby/<CODE>/live-result` (internal,
signed) are additions to the HTTP surface, not to `ClientMessage`.

### The live round (server)

- **Simulation.** Reuse `sim/` as is: the maze from `generate`/`layouts`, `ChomperSim` per
  chomper and `GhostSim`, stepping at the sim's own step rate. Ghosts aim at actual chomper
  positions every step (no aim beats needed). Pellets, power spots and fruit are owned by the
  server: first chomper to reach one gets it, no reconciliation.
- **Loop.** A fixed step on an alarm/interval while anyone is connected; broadcast a compact
  snapshot about 20 times a second (positions, directions, power, scores, pellet changes since
  the last one, events: bump, eat, catch, power, attack, maze clear). Full state on (re)connect.
- **Input.** Phones send only turns: `[clientMs, dir]` with a sequence number, as they happen
  (queued turns included). The server applies each at its next step at the chomper's current
  position; the sim's existing turn-at-junction rules decide when it takes. Rate-limited per
  socket.
- **Bots.** Bots run inside `LiveRound` using the existing bot steering (`bot.ts`) on live state,
  deciding a few times a second. They bump and eat like anyone.
- **Disconnects.** A dropped player's chomper stops at its next junction and keeps its score;
  reconnecting with the same pass resumes control. If everyone disconnects, the round keeps its
  clock; if it's still empty at the end, it reports the result as usual.
- **Clock.** Round time is the Durable Object's own clock; phones measure an offset from
  snapshots for countdown and HUD timers.

### The phones and TV

- **Own chomper predicted.** The phone runs `ChomperSim` for its own chomper from its own input
  with no wait, and corrects smoothly toward the server's position when they differ (snap only
  past a tile or two). Bumps, eats and deaths come from the server.
- **Others interpolated** about 100 ms behind the newest snapshot, so they glide.
- **Rendering.** The existing renderer, looks, HUD, banners, effects and sounds; a bump gets a
  small shake and a thud on both phones, an eat gets the catch animation and a banner
  ("ROOK ATE YOU −200").
- **TV.** Connects as a viewer with a TV pass and draws the same snapshots.
- **Polling during a round** drops to the slow idle pace (presence, chat, host buttons); the
  socket carries the game.
- **Lost connection.** A banner ("Reconnecting…") and automatic reconnects with backoff; your
  chomper freezes while disconnected.

### Where Contact is offered

Contact appears in the mode options only where the site can run it. **Builder's call:** a build
time flag set in the Cloudflare build (`open-next.config.ts`, as `NEXT_PUBLIC_SITE_URL` is) that
the options UI and `validateOptions` context read through the registry; on Vercel the mode is
hidden and a Contact start is refused with "Contact needs jackdaw.lastivka.dev".

### Local development

`next dev` can't run Durable Objects or WebSocket upgrades, and `pnpm cf:build` fails on this
Windows machine (OpenNext creates symlinks, which need Developer Mode; found 2026-11-26). So live
play is developed with a standalone `wrangler dev` Worker: `pnpm --filter @jackdaw/web live:spike`
bundles the page and serves it with the Durable Object on port 8787, reachable from phones on the
LAN. `LiveRound` and `LiveClient` are pure classes tested in Vitest. Wiring the Durable Object into
the OpenNext `jackdaw` Worker is verified in Cloudflare's own (Linux) build, or locally after
turning on Windows Developer Mode or building in WSL.

## Feel check (2026-11-26)

Built as `docs/maze/LIVE-PLAN-1.md` (standalone `wrangler dev` Worker, `pnpm --filter
@jackdaw/web live:spike`). Lesia played it: "this all looks good. However knowing intent is kind
of hard and not always right." Taken as: a turn sometimes landed at a different junction than the
one the phone showed, because the server got it after passing that junction.

Decisions that follow (Lesia approved, "you're good to implement everything"):

- **Turns go where the phone took them.** The phone sends a turn when its own chomper takes it,
  tagged with that junction; the server moves its chomper back and turns it there if it is at most
  `TURN_GRACE_TILES` (0.5) past, else queues it. Built and tested in `LiveRound.input`.
- **Seats are keyed by a per-device id**, not by name; a rejoin gets the full board and starts its
  turn count again.
- **One step's contacts settle once per chomper** (eats first; a hunter may eat several).
- **The phone keeps refining its clock offset** from every snapshot.
- Kept as they are for now: bump −50 each with a 1.5 s shield, eat −200 / +400, touch 0.8 tiles.

Still to decide in the build (from the review): bumps between chompers overlapping in the same
direction should be edge-triggered or push them apart; the round should keep its clock when
everyone drops; the Durable Object should use the hibernation API.

## Order of work

1. **Feel check first** (a throwaway, kept off the catalog): `LiveRound` with two chompers, one
   maze, bump and eat, on `cf:preview`, two phones on the LAN. Lesia plays it before the rest is
   built; lessons come back into this document.
2. Platform addition (server-only action) with tests, once approved.
3. Contact mode in rules/options, the pass and result routes, the worker entry and wrangler
   config (`durable_objects` binding and migration).
4. Full `LiveRound`: ghosts, pellets, powers, attacks, several mazes, bots, disconnects.
5. Phone and TV screens, banners, sounds, results, stats and recap entries.
6. Tests: `LiveRound` unit tests (contact rules, scoring, disconnects, idempotent result), an
   all-bot simulation test, an e2e on `cf:preview` with two browsers, and request/message counts
   noted in `docs/maze/DESIGN.md`. Update MIGRATION.md (new binding, secret) and PROGRESS.md.

## Left to the builder

Exact scores, shields and knock-back; snapshot format and rate; the prediction-correction curve;
bot decision rate; pass format and lifetime; whether the step loop uses alarms or an interval;
names of files inside the maze package.

## Needs from Lesia (outside the code)

- A secret for passes and results (`JACKDAW_LIVE_SECRET`, or reuse `JACKDAW_LINK_SECRET`), set
  with `wrangler secret put`.
- The `durable_objects` binding and migration go in `wrangler.jsonc`; the next `cf:deploy`
  creates them. No dashboard steps expected.
