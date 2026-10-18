# Jackdaw Games

A private web platform where friends open one shared lobby and play several games in a row, each
person on their own phone, with an optional TV showing the public table. Avalon
(`C:\Users\KBITK\OneDrive\Desktop\avalon`, play-avalon.vercel.app) is the reference
implementation and the first game to move in.

- The full plan is in `docs/BUILD_PLAN.md`. This file records the decisions that change or
  sharpen it. Where they disagree, this file wins.
- Current state, next steps and open questions are in `PROGRESS.md`. Read it first.

## Kickoff decisions (2026-10-12, Lesia)

| Topic             | Decision                                                                                                                                                                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hosting           | **Everything on Vercel for now**, not Cloudflare. Rooms use Avalon's proven approach: HTTP polling plus Upstash Redis. It's hidden behind `RoomTransport` (client) and `RoomStorage` (server) so a WebSocket/Durable Object backend can replace it later. |
| Repo layout       | There's no `apps/server`. The room runtime is `packages/server` (web-standard APIs only), mounted by Next.js route handlers in `apps/web/app/api`. A Cloudflare Worker can mount the same runtime later.                                                  |
| Wavelength        | **Paused** until there's a real-time transport, because the shared live dial needs it.                                                                                                                                                                    |
| Avalon            | **Linked, not ported** (2026-10-13): Jackdaw hands the table to the live Avalon app (5 to 15 players, all modes) and gets the result back. See `docs/avalon/LINK.md`.                                                                                     |
| Platform features | Chat, avatars/crests (adapted per game where needed), rejoin codes (move your seat to a new device) and a running per-lobby score tally all live in the platform, not in each game.                                                                       |
| Game choice       | Only the host can change the game and options.                                                                                                                                                                                                            |
| History           | Lobby history and scores live with the lobby and expire with it after 24h idle. There's no database.                                                                                                                                                      |
| Look              | The shell is creative and game-like, near Avalon's parchment: birds, board games, medieval. It must not look generic. It has **one day look plus its own dark mode** (not Avalon Night). Each game keeps its own theme. See `STYLE_GUIDE.md`.             |
| Styling           | Design tokens are CSS custom properties in `packages/ui`. Tailwind v4 is used for layout utilities only. There are no literal colours outside token files.                                                                                                |
| Commits           | Authored as Lesia, with **no Claude/Co-Authored-By trailer** (same as Avalon).                                                                                                                                                                            |

## Repo layout

```
apps/web              Next.js 16 (App Router): pages, API routes that mount the room runtime
packages/engine       GameModule contract, lobby state machine, protocol + Zod schemas, Rng
packages/server       RoomStorage (memory, Upstash REST), lobby room runtime, polling protocol
packages/ui           tokens.css, kit.css, kit pieces (Lid, Plaque, Chits, Token, SeatTrack, BoxLid), crests, icons, GameUi types
packages/games/<id>   One package per game: src/meta.ts, src/rules.ts, src/ui/, tests
docs/                 BUILD_PLAN.md and design notes
mockups/              Static HTML design mockups (not shipped)
```

Internal packages export TypeScript source directly (`"exports": { ".": "./src/index.ts" }`).
Next compiles them through `transpilePackages`, so they have no build step.

## Commands

Run all of these from the repo root:

- `pnpm dev` starts the web app on :3000. Other sessions often hold 3000–3010, so use `pnpm --filter @jackdaw/web exec next dev -p 3021` for another port (`pnpm dev -- -p` passes the `--` through and fails). Kill the whole process tree when done.
- `pnpm test` runs all Vitest projects. `pnpm vitest run packages/engine` runs one project.
- `pnpm lint`, `pnpm typecheck` and `pnpm format` (Prettier).
- `pnpm build` is the production build. `pnpm build:check` builds into `.next-check` and is safe while dev is running.
- Before every commit run `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`, plus `pnpm build:check` when web code changed.
- CI (`.github/workflows/ci.yml`) runs format, lint, typecheck, test and build on every push.

On Windows, pnpm comes from corepack and its shim is in `~/.local/bin`. If `pnpm` isn't found in
Git Bash, run `export PATH="$HOME/.local/bin:$PATH"`. In PowerShell 5.1, chain with `;`, not `&&`.

## Working rules

- **Branch per change** (`feat/`, `fix/`, `chore/`). Never commit directly to `main`. Lesia merges.
- Keep commits small, one checklist item each, with a clear message.
- Keep worktrees outside OneDrive. This repo already lives outside it on purpose.
- Game rules are pure TypeScript with unit tests. No rules logic goes in React components.
- **Never send another player's hidden information to a client.** It's a bug as serious as a
  crash. `getPlayerView` / `getTableView` are the only gates, and every game has a leak test.
- All randomness in rules goes through the injected `Rng`. ESLint bans `Math.random` in engine and game sources.
- Ask Lesia before changing the game module contract, the lobby state machine or the message
  protocol. Additions that the kickoff decisions require (e.g. chat messages) are noted in PROGRESS.md.
- No hard-coded domains: URLs come from `NEXT_PUBLIC_SITE_URL` (falling back to the request origin).
  Server code uses web-standard APIs only (`fetch`, `crypto`, `Request`/`Response`), with no `fs` or native add-ons.
- Aesthetic is a top priority. Screens are built from `packages/ui` tokens and checked at 375,
  768, 1280 and 1920px. Respect `prefers-reduced-motion`. Tap targets are at least 44px.
- Keep `PROGRESS.md`, this file and `MIGRATION.md` current when things change.
- Needing new env vars or Vercel/Upstash changes means telling Lesia (or noting it in PROGRESS.md).

### Lesia's design taste (from Avalon)

- Avalon's Night look is their favourite and stays untouched. "Printed" means real board-game print: cream card
  stock, charcoal ink, double-ruled frames, perforated stamp edges, condensed caps plaques.
- Disliked: lots of italic text, big brass-yellow button blocks, settings as wrapping centred pills, and
  anything that looks templated or "vibe-coded".
- Liked: a medieval palette of cream with heraldic red, green and blue. Every screen (loading, join, home) must match.
- When given a reference, study the real thing (source, assets, screenshots) before designing.

### Every game (Lesia, 2026-10-12)

- **Results you can feel.** "If I win the round, I can't tell" is a bug. Whenever a round, vote
  or mission resolves, each phone shows the player's own result with the kit's `VerdictMoment`
  (`packages/ui/src/celebrate.tsx`): a wax seal pressed onto a heraldic ribbon, vert with a burst
  of chits and feathers for a win, drooping gules for a loss, sable for a draw, azure `reveal`
  for someone watching. Work the outcome out from public table data only, key it with
  `useMoment(<public counter>)` so a refresh doesn't replay it, and let it clear itself (tap,
  Escape or about 3.4s) so it never blocks the next move. The TV shows it at `size="tv"`.
  Per-row results use `OutcomeChip`; running scores use `Tally`. The end-of-game results screen
  gives everyone their own `Verdict` already. See the doc comment in `packages/ui/src/game-ui.ts`.
- **Day and dark follow the shell.** Every game follows the day/dark choice through `useTheme()`
  (`packages/ui/src/theme.ts`). A game with its own looks maps onto them: Avalon's day is its Parchment
  look and dark is its Night look.

## Architecture (polling on Vercel)

- **Server-authoritative.** Each lobby is one JSON document in storage (`jackdaw:lobby:<CODE>`),
  holding players, the selected game and options, history, scores, and the private `session.state`.
- **Writes**: `POST /api/lobby/<CODE>` with a `ClientMessage` (Zod-validated) and the
  `x-player-token` header. The runtime takes a per-lobby lock, loads, applies through the
  pure lobby state machine (which calls the game module), bumps `version`, saves and returns
  that caller's snapshot.
- **Reads**: `GET /api/lobby/<CODE>?v=<version>` returns `{unchanged:true}` or the caller's snapshot:
  `{ lobby, view?, tableView, results? }`. Players get their own `view` plus the public `tableView`.
  TV displays (`/tv/<CODE>`, no token) get only `tableView`. Polling is adaptive, as in Avalon:
  about 1.5s when active, slower when idle or hidden.
- **Timers and away-host handover** are evaluated lazily on each read and write (`onTimer`
  deadlines live in the session), since there are no alarms on Vercel. The Redis TTL expires idle lobbies.
- **Protocol mapping**: the plan's client→server messages are the `ClientMessage` union. The plan's
  server→client `lobby` / `view` / `results` / `error` messages are fields of one snapshot response
  (or a `{ error: { code, message } }` body), because polling returns everything at once.

## Installable app (PWA)

`app/manifest.ts` (name, icons in `public/icons/`, standalone), `public/sw.js` (registered in
production only by `app/pwa.tsx`): pages always come from the network with `public/offline.html`
as the fallback, hashed `/_next/static` assets are cached, and `/api` is never touched. Bump
`CACHE` in sw.js when the offline page or precache list changes. `InstallButton` on the home page
uses the browser's install prompt, or shows Add to Home Screen steps on iPhone and iPad.

## Game module contract

Defined in `packages/engine/src/contract.ts`, and exactly as in the build plan:
`meta`, `optionsSchema`, `defaultOptions`, `validateOptions?`, `setup`, `getPlayerView`,
`getTableView`, `applyAction` (throws `GameError`), `getResult`, and `onTimer?`. Each game also
exports `PlayerScreen` (`{ view, tableView, me, players, sendAction }`) and `TvScreen`
(`{ tableView, players }`). Games register in one file, `apps/web/lib/registry.ts`, which is injected into the room
runtime and also feeds the catalog. A game package exports its rules module from `.` and its
screens from `./ui`, so the server never imports React.

Additions approved by Lesia:

- **`actionSchema`** is a Zod schema for one action. The platform validates untrusted input with it before calling `applyAction`.
- **`GameResult.standings?`** (2026-10-12) holds one `{ playerId, outcome: 'win' | 'loss' | 'draw', team?, role? }` per player. `team` and `role` are display labels such as "Evil" and "Assassin". Every game with teams or roles should report them, because they feed the lobby's Game stats.
  - Where a game leaves standings out, the lobby derives win/loss from `winners`.
  - The lobby keeps 200 games of history. Each entry records the participants, their names at the time and their standings.
  - Polls carry the latest 10 entries plus `historyCount`.
  - `GET /api/lobby/:code/stats` returns the full history and `lobbyStats(history)`.
- **Platform additions (2026-10-13)**: reactions over seats, unique names (case-insensitive),
  the host ending a game early (unscored), and system lines in chat (joins, leaves, game start
  and end, plus a game's optional `announce`). The contract also carries `now`, `nextTimer`
  and `onTimer` for future timed games, and `sendAction` resolves true/false once a move is
  saved or refused.
- **Avalon is linked, not ported (2026-10-13).** The live Avalon app stays the game; Jackdaw is
  the lobby and hands the table over. See `docs/avalon/LINK.md`. Each game's lobby keeps
  Jackdaw's frame but has its own unique look (Avalon: its round table and shields, styled
  just like the real Avalon lobby).
- **Linked games** (2026-10-13, for Avalon): a module sets `linked: true`, and the server
  registers a `GameLink` for it with the room runtime (`links` in `createRoomRuntime`, wired in
  `apps/web/lib/runtime.ts` from `AVALON_URL` and `JACKDAW_LINK_SECRET`). The lobby machine
  stays pure; the runtime does the network calls:
  - `link.start(ctx)` runs on Start and Play again, outside the lock and before the session
    exists. It gets the lobby code, host, seated players, parsed options, the `returnUrl`
    (`NEXT_PUBLIC_SITE_URL` or the request origin) and the starter's `look` (light/dark, sent
    with `start` / `playAgain`). What it returns reaches `setup` as `ctx.linked`. If it throws,
    nothing changes and the host sees the message. If the table changed meanwhile, Start is
    refused ("Press Start again"). A linked game without a registered link can't start
    ("… isn't set up on this server yet").
  - `link.check(state)` runs on reads, at most every 5s per session per instance, and returns
    `{over:false}`, `{over:true, result}` (finishes as usual: history, scores, results) or
    `{over:true, abandoned:true}` (back to waiting, nothing recorded). The pure
    `settleLinked(lobby, sessionId, status, ctx)` applies it. A failed check waits for the next.
- **`GameUi.Lobby`** (optional) draws a game's own lobby (players, options, Start), full screen
  under Jackdaw's bar, chat included (`LobbyChat`: lines, send, open/close); games without one
  use Jackdaw's lobby. Only Avalon has one. A game's own lobby draws its chat with the kit's
  `LobbyChatPanel` (restyled through `--lc-*` properties), unless it ports one exactly (Avalon).
  `GameUi.TvLobby` (optional) is the TV's lobby in the game's look; the platform hands it the
  join panel and keeps the night so far below. `fullTv` drops Jackdaw's strip above the TV screen. It gets the code, players, options, `start()`, `onSeat(id)` (own seat opens your look;
  the host's tap opens remove / make host) and `changeGame` for the host.
- **Round three (Lesia, 2026-10-18: "do timers, do alerts")**: the runtime runs game timers
  (`nextTimer`/`onTimer`, lazily on reads and writes; snapshots carry `serverNow` and `timerAt`).
  `GameModule.waitingOn?(state)` (public) says who the game waits on, for your-move alerts and
  Web Push (VAPID env vars; see PROGRESS.md). `GameResult.highlights?` feeds the night's
  awards. UI types: `GameUi.fit` (phone screen fits under the bar, no scrolling), `LobbySeats`
  (a game's own seats in Jackdaw's lobby), `TvReveal` (a game's reveal on the TV's results).
- **Secret Hitler is secret-hitler.online, ported** (Lesia, 2026-10-17: "copy EXACTLY"). Its
  screens live in `packages/games/secret-hitler/src/ui/sho/` with the site's markup, text,
  timings and stylesheet (scoped under `.sho`); change them only to match the site, or to fit
  Jackdaw (Lesia, same day: "with necessary adaptations": no scrolling, Jackdaw's crests and
  look sheet, table talk shown properly, tokens flying in and out as in Avalon). For it the UI
  types gained `GameUi.fullBleed` (the phone screen fills the column under the bar and draws
  table talk itself from `ScreenExtras.chat`; starting and ending the game runs a view
  transition so seats fly) and `GameUi.Results` (a game draws the whole end-of-game screen on
  phones, with the host's Play again and Back to lobby, and its chat). See PROGRESS.md.
