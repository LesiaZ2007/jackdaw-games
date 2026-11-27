# Live Pac-Man, milestone 2: the real Contact mode

Spec: `docs/maze/LIVE.md` (approved 2026-11-26; Lesia: "you're good to do everything and finish
up"). Milestone 1 (`LIVE-PLAN-1.md`) built the kept pieces: `live/contact.ts`, `live/round.ts`,
`ui/live-client.ts`. Progress is ledgered in `.superpowers/sdd/LIVE-PLAN-2/progress.md`.

Each task is test-first and ends with format, lint, typecheck and the touched tests green, and a
commit (authored as Lesia, no trailer).

1. **Server-only action** (platform, approved): `GameModule.serverActionSchema` and
   `applyServerAction(state, action, now)`; `applyServerAction(lobby, {sessionId, action}, ctx)` in
   the engine; `runtime.serverAction(code, sessionId, action)`, not reachable over HTTP. Test:
   `packages/server/src/server-action.test.ts`.
2. **Contact in the rules**: `mode: 'Contact'` (2–8 players) in `options.ts`; setup like Shared
   (seed, layouts, startAt/endAt); `serverActionSchema` = `liveResult` {round, seq, final, players:
   per id {score, pellets, ghosts, caught, fruit, powers, bumps, eats}, log lines, trail}; ignores
   older seq; `final` ends the round; `partialResult` from the latest checkpoint; fallback timer at
   `endAt + 90 s` ends it unscored if no final result; phones' `tick` actions refused in Contact;
   standings and stats as Shared plus Bumps and Eaten columns. Tests in `rules.test.ts`.
3. **Full LiveRound**: built from the round's setup (seed, layouts, options, seats, bots, startAt,
   endAt); ghosts (GhostSim aimed at real positions), Mixed power-ups and attacks, fruit, several
   mazes, the bell, bots (bot.ts steering), edge-triggered bumps, knock-back that survives a turn,
   keeps its clock when everyone drops; `checkpoint()` builds the `liveResult`. All-bot simulation
   test.
4. **Pass and result**: HMAC-SHA256 pass (`live/pass.ts`, Web Crypto) carrying code, session,
   player id or `tv`, the round setup and expiry; `POST /api/lobby/[code]/live` (player token →
   pass, Cloudflare only) and `POST /api/lobby/[code]/live-result` (signed body →
   `runtime.serverAction`). Secret: `JACKDAW_LIVE_SECRET`, falling back to `JACKDAW_LINK_SECRET`.
5. **Worker**: `apps/web/worker/index.ts` wraps `.open-next/worker.js`, routes `/live/<code>/<session>`
   to the `LiveRoom` Durable Object (hibernation API, pass checked, Origin checked), which posts
   results through `WORKER_SELF_REFERENCE`; `wrangler.jsonc` binding + migration. Verified by
   `pnpm cf:build` (needs Windows Developer Mode on this PC) or Cloudflare's build.
6. **Screens**: Contact in the phone screen and TV through `LiveClient` and the existing renderer
   (score cards, banners, sounds, results); hidden on deployments without `NEXT_PUBLIC_LIVE=1`; a
   Vercel phone in a Contact lobby gets "Open on jackdaw.lastivka.dev".
7. **Docs and checks**: LIVE.md, MIGRATION notes for Lesia, full suite, `build:check`.
