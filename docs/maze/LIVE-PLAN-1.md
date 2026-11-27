# Live Pac-Man, milestone 1: the feel check — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two to four phones on the same Wi-Fi share one maze through a Cloudflare Durable Object, bump and eat each other, and Lesia judges whether it feels immediate.

**Architecture:** A pure `LiveRound` class (in the maze package) runs chompers with the existing `ChomperSim` and resolves contact; a thin Durable Object in the `jackdaw` Worker owns the sockets and a 50 ms loop. A custom worker entry wraps OpenNext's worker, exports the Durable Object and routes `/live/spike/*` upgrades to it. A hidden spike page predicts your own chomper, interpolates others and draws with the existing renderer.

**Tech Stack:** TypeScript, Vitest, Cloudflare Workers + Durable Objects (WebSocket API), `@opennextjs/cloudflare` 1.20.18, wrangler 4.167.0, Next.js 16 client component, the maze package's `sim/` and `ui/render/`.

**Spec:** `docs/maze/LIVE.md` (read "Contact rules", "The live round", "The phones and TV", "Order of work" step 1).

## Global Constraints

- Milestone 1 only. No lobby, pass, result, ghosts, timer, bots, TV or catalog changes; those are later plans written after Lesia plays this.
- The spike is **off unless `LIVE_SPIKE=1`** (a wrangler var set only in `apps/web/.dev.vars`): the `/live/spike/*` route returns 404 and the page calls `notFound()` without it. Never set it in `wrangler.jsonc` or production.
- Contact values (Claude's starting point, spec "Contact rules"): touch < `0.8` tiles (euclidean, centers); bump `−50` each, `1500` ms bump shield, knock-back = both reverse direction; eat (exactly one has Hunt active) eaten `−200` (never below 0) + `DYING_MS` then respawn at its start with `SPAWN_SHIELD_MS`, eater `+400`.
- Sim step is the sim's own: `50 / 3` ms (60 per second). Broadcast every `50` ms. Others drawn `100` ms behind the newest snapshot.
- Kept code (`contact.ts`, `round.ts`) gets real tests; the Durable Object, worker entry and spike page are throwaway-labelled (a `// SPIKE (docs/maze/LIVE-PLAN-1.md)` header) and get no tests beyond a build.
- Repo rules: no `Math.random` in game sources (none needed); no literal colours outside tokens in shipped UI (the spike reuses look colours through `draw`); commits authored as Lesia with no trailer; run `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` and `pnpm --filter @jackdaw/web cf:build` before each commit that touches web code.
- Don't break the Vercel build: `apps/web/worker.ts` must not be imported by Next code, and `next build` stays unchanged.

## Review Focus

- Three chompers touching in the same step: each pair resolves once, no one is charged twice for one meeting → test `three-way meeting charges each pair once` in Task 1.
- Two chompers both standing still (pressed into a wall) side by side: a bump must not repeat every step → covered by the bump shield; test `bump shield stops a repeat bump` in Task 1.
- A chomper that is dying or shielded is touched: nothing happens to either → test `dying or shielded chompers are ignored` in Task 1.
- A phone reconnects mid-round with the same name: it takes its old chomper back (score kept) and the old socket is closed → test `rejoin by name keeps the chomper` in Task 2.
- Score near zero eaten: never negative → test `eat cost never takes score below zero` in Task 2.

---

### Task 1: Contact rules

**Files:**

- Create: `packages/games/maze/src/live/contact.ts`
- Test: `packages/games/maze/src/live/contact.test.ts`

**Interfaces:**

- Produces:

  ```ts
  export const TOUCH_TILES = 0.8;
  export const BUMP_COST = 50;
  export const BUMP_SHIELD_MS = 1500;
  export const EAT_COST = 200;
  export const EAT_GAIN = 400;
  export interface Contender {
    id: string;
    x: number;
    y: number;
    hunting: boolean;
    /** Dying, spawn-shielded or bump-shielded until then: ignored. */
    immuneUntil: number;
    score: number;
  }
  export type ContactEvent =
    | { kind: 'bump'; a: string; b: string; cost: number }
    | { kind: 'eat'; by: string; eaten: string; cost: number; gain: number };
  /** Pairs in id order, each at most once; costs already capped at each score. */
  export function resolveContacts(cs: readonly Contender[], tMs: number): ContactEvent[];
  ```

- [ ] **Step 1: Write the failing tests** in `contact.test.ts`:
  - `bump when two plain chompers touch`: A(5,5) and B(5.7,5), neither hunting, scores 300/300, `t=1000` → `[{kind:'bump', a:'A', b:'B', cost:50}]`.
  - `no contact at the touch distance or further`: B at (5.8,5) → `[]`.
  - `hunter eats`: A hunting, B not → `[{kind:'eat', by:'A', eaten:'B', cost:200, gain:400}]`.
  - `both hunting is a bump`.
  - `events carry nominal costs`: B score 120 eaten → the event still says `cost:200`. `LiveRound` caps each score at 0 when it applies events (tested in Task 2), so one bump event can charge two players different amounts.
  - `dying or shielded chompers are ignored`: B `immuneUntil: 1500` at `t=1000` → `[]`.
  - `bump shield stops a repeat bump`: covered in Task 2 (the shield is set by `LiveRound`); here assert only that `immuneUntil > t` blocks it.
  - `three-way meeting charges each pair once`: A(5,5), B(5.5,5), C(5.25,5.4) plain → three bump events A–B, A–C, B–C in that order, no duplicates.
- [ ] **Step 2:** Run `pnpm vitest run packages/games/maze/src/live/contact.test.ts` → FAIL (module not found).
- [ ] **Step 3:** Implement `resolveContacts` in `contact.ts`: sort by id, check each pair once with `Math.hypot`, skip any with `immuneUntil > tMs`, hunting XOR decides eat vs bump.
- [ ] **Step 4:** Run the test → PASS.
- [ ] **Step 5:** Commit: `git add packages/games/maze/src/live && git commit -m "Live Pac-Man: contact rules"`.

### Task 2: LiveRound (pure round, no ghosts)

**Files:**

- Create: `packages/games/maze/src/live/round.ts`, `packages/games/maze/src/live/index.ts`
- Modify: `packages/games/maze/package.json` (add `"./live": "./src/live/index.ts"` to `exports`)
- Test: `packages/games/maze/src/live/round.test.ts`

**Interfaces:**

- Consumes: `resolveContacts`, constants (Task 1); `ChomperSim`, `DYING_MS`, `SPAWN_SHIELD_MS` (`sim/chomper.ts`); `layoutsOf` (`sim/layouts.ts`); `Dir` (`sim/walker.ts`).
- Produces:

  ```ts
  export const STEP_MS = 50 / 3;
  export const MAX_PLAYERS = 4;
  export interface LiveChomper {
    id: string;
    name: string;
    seat: number;
    x: number;
    y: number;
    dir: Dir | null;
    score: number;
    power: { kind: PowerKind; untilMs: number } | null;
    dyingUntil: number;
    shieldUntil: number;
  }
  export interface LiveSnapshot {
    t: number; // round ms
    layoutId: string;
    chompers: LiveChomper[];
    /** Pellet and power-spot indexes taken since `since` (all of them when `since` is 0). */
    taken: number[];
    events: ContactEvent[]; // since the previous snapshot
  }
  export class LiveRound {
    constructor(o: { layoutId: string; startedAt: number });
    /** Seats a new name (up to MAX_PLAYERS) or returns the existing seat for that name; null when full. */
    join(name: string): string | null; // returns player id
    input(id: string, dir: Dir): void;
    /** Steps the sim in STEP_MS slices up to `now` (absolute ms), resolving contact after each slice. */
    advance(now: number): void;
    snapshot(sinceT: number): LiveSnapshot;
  }
  ```

  `index.ts` re-exports `contact.ts` and `round.ts` only (no React, no `ui/`), so the Worker can import `@jackdaw/game-maze/live`.

- [ ] **Step 1: Write the failing tests** in `round.test.ts`, with the Medium layout `layoutsOf('Medium')[0]` and a fake clock (`startedAt: 0`, call `advance(ms)`):
  - `join seats up to four, then refuses` → 4 ids, fifth `null`.
  - `rejoin by name keeps the chomper`: join "Wren", advance, `join("Wren")` returns the same id and the score is kept.
  - `a chomper moves at the sim's speed`: input `right` for a chomper with an open corridor; after 1000 ms its `x` grew by the same amount a lone `ChomperSim` with the same inputs moves (build one in the test and compare).
  - `pellets are owned by whoever reaches them first`: two chompers in one corridor heading the same way; the second never scores the first's pellets; `snapshot(0).taken` lists each index once.
  - `bump costs both and reverses them`: place two chompers facing each other in one corridor (use their seat starts and inputs; pick a layout/seat pair in the test where seats 0 and 1 meet on a straight); advance until a `bump` event; both scores fell by 50 (capped at 0), both directions reversed, both `shieldUntil ≥ t + BUMP_SHIELD_MS`.
  - `bump shield stops a repeat bump`: advance 500 ms more → no second bump.
  - `hunter eats and the eaten respawns`: give A Hunt (`power` via picking up a power spot, or a test-only `LiveRound.prototype.grant(id, power, untilMs)` marked `/** test hook */`) and meet B → `eat` event, B score −200 (≥ 0), A +400, B `dyingUntil = t + DYING_MS`; after `DYING_MS` B is at its start with `shieldUntil = respawn + SPAWN_SHIELD_MS`.
  - `eat cost never takes score below zero`: B at 120 when eaten → B score 0.
- [ ] **Step 2:** Run `pnpm vitest run packages/games/maze/src/live/round.test.ts` → FAIL.
- [ ] **Step 3:** Implement `LiveRound`: one shared `taken: Uint8Array` passed to each `ChomperSim` as `taken` and updated from `pellet`/`power` events (call `take` on the others); `ghosts: { ghosts: [] }`; `fruit: false`; `powers: ['hunt']`; `level: 1`. After each slice: build `Contender`s (`hunting = power?.kind === 'hunt' && power.untilMs > t`, `immuneUntil = max(dyingUntil, shieldUntil, bumpShield)`), apply events (bump: reverse each with `input(opposite(dir))`, set bump shield; eat: `respawn` after `DYING_MS`, scores capped at 0). Keep events in a buffer drained by `snapshot`. Score = pellets 10, power 50 (existing `POINTS` in `rules.ts` if importable without React; otherwise copy those two values with a comment pointing at `POINTS`) plus contact.
- [ ] **Step 4:** Run the test → PASS. Also `pnpm --filter @jackdaw/game-maze typecheck`.
- [ ] **Step 5:** Commit: `git commit -m "Live Pac-Man: LiveRound, chompers and contact on one clock"`.

### Task 3: Durable Object and worker entry (spike)

**Files:**

- Create: `apps/web/live/spike-room.ts` (the Durable Object class `LiveSpikeRoom`), `apps/web/worker.ts` (custom entry)
- Modify: `apps/web/wrangler.jsonc` (`main`, `durable_objects`, `migrations`), `apps/web/package.json` (add `@jackdaw/game-maze` dependency only if not already present), `.gitignore` (add `.dev.vars`; `.env*` doesn't cover it)
- Create (untracked): `apps/web/.dev.vars` with `LIVE_SPIKE=1`

**Interfaces:**

- Consumes: `LiveRound`, `LiveSnapshot`, `STEP_MS` from `@jackdaw/game-maze/live` (Task 2).
- Produces: socket protocol used by Task 4 (JSON text frames):
  - client → server: `{ "t": "join", "name": string }` once, then `{ "t": "dir", "d": Dir }`.
  - server → client: `{ "t": "hello", "id": string, "serverNow": number, "startedAt": number, "layoutId": string }`, then `{ "t": "snap", "s": LiveSnapshot, "serverNow": number }` every 50 ms; `{ "t": "full" }` close reason when the room has 4.
  - URL: `GET /live/spike/<room>` with `Upgrade: websocket`; `<room>` matches `^[A-Z0-9]{1,8}$`.

- [ ] **Step 1:** `wrangler.jsonc`: set `"main": "worker.ts"`; add `"durable_objects": { "bindings": [{ "name": "LIVE_SPIKE_ROOM", "class_name": "LiveSpikeRoom" }] }` and `"migrations": [{ "tag": "live-spike-1", "new_sqlite_classes": ["LiveSpikeRoom"] }]` (SQLite-backed classes are the ones the free plan allows).
- [ ] **Step 2:** `worker.ts`: import OpenNext's handler from `./.open-next/worker.js` (with `// @ts-expect-error` for the generated file) and re-export anything that file exports besides `default` (check the generated file after `cf:build`; OpenNext's docs for custom workers list `DOQueueHandler`/`DOShardedTagCache`, which this config doesn't use, so likely none). `fetch(req, env, ctx)`: if the path starts with `/live/spike/`, return 404 unless `env.LIVE_SPIKE === '1'`, 426 without an upgrade header, 400 on a bad room, else `env.LIVE_SPIKE_ROOM.get(env.LIVE_SPIKE_ROOM.idFromName(room)).fetch(req)`. Everything else goes to the OpenNext handler. Export `LiveSpikeRoom`.
- [ ] **Step 3:** `spike-room.ts`: `class LiveSpikeRoom extends DurableObject` using `this.ctx.acceptWebSocket(server)` (hibernation API), one `LiveRound` created on first join with layout `layoutsOf('Medium')[0].id` and `startedAt = Date.now()`; per-socket attachment holds the player id; on `join` call `round.join(name)` (close with `full` on null; close any older socket holding the same id). A `setInterval` of 50 ms runs while at least one socket is open: `round.advance(Date.now())`, then send each socket `snap` with `snapshot(lastT)`. Clear the interval and drop the round when the last socket closes.
- [ ] **Step 4:** Build and run: `pnpm --filter @jackdaw/web cf:build`, then `pnpm --filter @jackdaw/web exec opennextjs-cloudflare preview -- --ip 0.0.0.0 --port 8787`. Check with a quick Node script in `$CLAUDE_JOB_DIR/tmp` using the global `WebSocket` (Node 22+): connect twice to `ws://localhost:8787/live/spike/TEST`, join "Wren" and "Rook", expect `hello` then `snap` frames at about 20 per second. Expected: two ids, snapshots with two chompers. Then confirm `GET /` still renders and `pnpm build:check` (Vercel/Next build) still passes. Stop the preview (whole process tree).
- [ ] **Step 5:** Commit: `git commit -m "Live Pac-Man spike: Durable Object room and worker entry"`.

### Task 4: Spike page (prediction, interpolation, drawing)

**Files:**

- Create: `packages/games/maze/src/ui/live-spike.tsx` (client component `LiveSpike`), `packages/games/maze/src/ui/live-client.ts` (pure client logic `LiveClient`)
- Modify: `packages/games/maze/src/ui/index.tsx` (export `LiveSpike`)
- Create: `apps/web/app/live-spike/page.tsx` (server component: `notFound()` unless `process.env.LIVE_SPIKE === '1'`, else renders `<LiveSpike />`)
- Test: `packages/games/maze/src/ui/live-client.test.ts`

**Interfaces:**

- Consumes: socket protocol (Task 3); `ChomperSim` (`sim/chomper.ts`); `draw`, `FrameModel`, `FrameBoard`, `FrameChomper` (`ui/render/core.ts`, `ui/frame.ts`); the existing swipe/keyboard input helpers used by `PlayerScreen` (reuse whatever `player.tsx` uses; don't write new gesture code).
- Produces:

  ```ts
  export const INTERP_MS = 100;
  export const SNAP_TILES = 1.5;
  export class LiveClient {
    constructor(o: { me: string; layoutId: string; startedAt: number; offsetMs: number });
    /** A local turn: applied to the predicted chomper at once; returns true to send it. */
    turn(d: Dir): boolean;
    onSnapshot(s: LiveSnapshot, serverNow: number, localNow: number): void;
    /** Positions to draw at local time `now`: own predicted, others INTERP_MS behind. */
    frame(now: number): { chompers: LiveChomper[]; taken: Set<number>; events: ContactEvent[] };
  }
  ```

- [ ] **Step 1: Write the failing tests** in `live-client.test.ts`:
  - `own turn moves the predicted chomper before any snapshot`: after `turn('right')` and `frame(now + 500)`, own `x` advanced.
  - `small differences are blended, big ones snap`: server position 0.3 tiles off → drawn position moves toward it over the next frames (not instantly); 2 tiles off → `frame` returns the server position.
  - `others are drawn between snapshots, INTERP_MS behind`: snapshots at t=1000 (x=5) and t=1050 (x=6); `frame` at the local time matching t=1125 draws x=6 (clamped), at t=1075 → 5.5.
  - `contact events come out once`: an `eat` event in one snapshot appears in exactly one `frame` result.
- [ ] **Step 2:** Run `pnpm vitest run packages/games/maze/src/ui/live-client.test.ts` → FAIL.
- [ ] **Step 3:** Implement `LiveClient`: own chomper is a local `ChomperSim` (same params as the server's, `taken` from snapshots) stepped in `STEP_MS` slices to round time `now - startedAt + offsetMs`; on snapshot, if own server position is ≥ `SNAP_TILES` away, `resume` the sim at the server state, else keep a correction offset that decays to 0 over about 150 ms; others interpolate linearly between the two snapshots around `t - INTERP_MS` (wrap-aware on tunnel x).
- [ ] **Step 4:** Run the test → PASS.
- [ ] **Step 5:** `LiveSpike` component: a name field (prefilled with a bird name), a room field (default `JACK`), Join. Opens `ws(s)://<host>/live/spike/<room>`, sends `join`, builds a `LiveClient` on `hello` (offset = `serverNow - Date.now()`), sends `dir` when `turn` returns true. A `requestAnimationFrame` loop builds a `FrameModel` (phase `play`, `mode: 'Shared'`, `look: 'printed'`, board from the layout with pellets minus `taken`, chompers from `frame`, no ghosts, `timerMs: null`) and calls `draw`. Bump: `navigator.vibrate?.(40)` and a small shake; eaten: the existing catch effect and a banner "ROOK ATE YOU −200"; eating: banner "+400". Score list along the top. Fit the canvas to the screen as `PlayerScreen` does. Respect `prefers-reduced-motion` for the shake.
- [ ] **Step 6:** Check: `pnpm --filter @jackdaw/web cf:build`, run the preview on `--ip 0.0.0.0`, open `http://localhost:8787/live-spike` in two browser windows (Playwright or by hand), join both, steer into each other; confirm bump and eat banners show on both. `pnpm typecheck && pnpm lint && pnpm test`. Stop the preview.
- [ ] **Step 7:** Commit: `git commit -m "Live Pac-Man spike: phone page with prediction"`.

### Task 5: Lesia plays it

- [ ] **Step 1:** Start the preview on the LAN (`--ip 0.0.0.0 --port 8787`) and give Lesia `http://<this PC's LAN IP>:8787/live-spike` (find the IP with `ipconfig`; Windows may ask to allow wrangler through the firewall). Leave it running and say so (CLAUDE.md: dev servers).
- [ ] **Step 2:** Ask Lesia how it felt: own chomper lag, others gliding, bump and eat feel, scores. Write what they said and the decisions that follow into `docs/maze/LIVE.md` under a new "Feel check (date)" heading, and note it in PROGRESS.md.
- [ ] **Step 3:** Stop the preview when Lesia is done. Commit: `git commit -m "Live Pac-Man: feel-check notes"`.

The next plan (pass and result, server-only action, Contact mode in the real game) is written after this step, from the notes.
