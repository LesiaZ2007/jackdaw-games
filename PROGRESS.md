# Progress

Read this first. CLAUDE.md has the decisions and rules, STYLE_GUIDE.md has the look, and
`docs/BUILD_PLAN.md` has the full plan.

## Where we are (2026-10-12)

**Phase 0 is done**, with the design signed off. **Phase 1 is built** on `feat/phase-1`, and
Lesia's first playtest feedback is done (see "Playtest round 1" below). It's waiting for the
next playtest and review before it's merged to `main`.

### Branches

| Branch         | State                                                                                                                                                                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main`         | Only the initial workspace commit. Lesia merges.                                                                                                                                                                                                    |
| `feat/phase-1` | **The working branch.** It holds Phase 0 and all of Phase 1. The fork branches `feat/phase-1-backend`, `feat/stats`, `feat/catalog`, `feat/lobby`, `feat/tv`, `feat/home-shelves`, `feat/lobby-people` and `feat/celebrate` are all merged into it. |

### Deployed

- The Vercel project `jackdaw-games` (team lesia-s-projects) has root `apps/web` and is linked to GitHub, so every push gets a preview. Production follows `main`.
- Storage is the shared Upstash store `upstash-kv-carmine-bucket`, also used by Avalon and notes-app. Every Jackdaw key is prefixed `jackdaw:`.
- **Deployment protection is off** for the whole project (Lesia, 2026-10-12), so friends can open previews to playtest. Turn it back on before anything private goes out.
- **Phase 0 acceptance passed:** the deployed page reached the room server and got its message echoed back.

### Phase 1, built

- **Engine** (`packages/engine`):
  - The game contract, including the optional `standings` and `actionSchema` fields.
  - Protocol and Zod schemas.
  - A seeded `Rng`.
  - The lobby state machine.
  - `lobbyStats`.
- **Server** (`packages/server`): room storage (memory or Upstash REST), and a runtime with locks, presence, host handover, rate limits and rejoin codes.
- **UI kit** (`packages/ui`):
  - `tokens.css` (Pebble by day, plus the dark theme) and `kit.css`.
  - Lid, Plaque, Chits, CodeInput, Token, SeatTrack and BoxLid.
  - Crests ported from Avalon, the icons, and the BirdMark (OpenMoji).
  - Sheet, Toast and RecapTimeline (with `withNames`).
  - The GameUi types, including an optional themed `Lobby` hook.
- **Web** (`apps/web`):
  - `/` is the home page.
  - `/games` is the catalog, with filters kept in the URL. `/games/[id]` is a game's detail page; on laptops the detail shows as a side panel.
  - `/about` holds the credits.
  - `/r/[code]` is a player's lobby:
    - joining, with crest and tint pickers, rejoin codes, and a removed screen when a player is kicked or replaced;
    - the seat track, the game picker, options built from each game's schema, and Start with the reason it's disabled;
    - an invite sheet with a QR code, plus chat, stats (the score pad), and Manage players;
    - the game shell, and results with Play again and Back to lobby.
  - `/tv` and `/tv/[code]` are TV mode: the TV lobby, a slim join strip over the game's TV screen during a game, and the end-of-game reveal.
- **Rock Paper Scissors** (`packages/games/rps`): the test game, with rules, tests, a phone screen, a TV screen and catalog pictures.
- **Tests:**
  - 96 Vitest unit tests.
  - Playwright (`pnpm test:e2e`, 48 tests) covers:
    - unique names, join lines in chat, a reaction reaching another phone, and the host ending a game early;
    - three phones create and join a lobby, change their look, play a round, a phone refreshes and gets its seat back, and Play again keeps the game;
    - home: typing a code, picking a crest, Browse scrolling to the shelves;
    - round and game verdicts on phones and the TV;
    - every page has no sideways scrolling at 375, 768, 1280 and 1920, in light and dark.
  - CI runs everything, and the end-to-end job uploads the Playwright report as an artifact.
- `.claude/agents/`: repo-explorer, rules-tester, hidden-info-auditor and ui-reviewer.

### Playtest round 1 (2026-10-13)

Lesia's feedback on the first preview, all done:

- The example name is "e.g. Jackdaw". The code boxes on home can be typed into.
- You can change your crest and colour on home (tap your token) and your name, crest and colour
  in the lobby (the "You" strip or the menu). Taken ones are greyed out with who has them.
- The crest and colour picker (`AvatarPicker`) fits at 375px with room between items.
- Bigger type everywhere. Chat is 18px with names in each player's colour. Tokens line up with
  their names.
- The seat track is bigger on laptops and your own seat is marked. The TV track is bigger too.
- Home: the nav is one row on laptops (About moved to the /games footer). "Browse the games"
  scrolls to shelves of `GameCover`s (Ready to play, Hidden roles, Quick games, Fine with three,
  Coming soon). In the lobby, Next up is a small row that expands to options and rules.
- Results you can feel: the kit's `VerdictMoment` for every round in RPS (phones and TV), and
  your own verdict plus coloured standings on the results screens.
- Every game follows the day/dark choice (`useTheme()`).
- Fixed along the way: quick taps on an option stepper used to lose all but the first.

### Platform additions (2026-10-13, `feat/platform-avalon`)

Approved by Lesia for every game:

- **Host ends a game early**: `endGame` message. The host's lobby menu shows "End this game"
  during a game; a second tap within 4s ("Tap again to end the game for everyone") ends it.
  Nothing is recorded (no history, no scores), the lobby goes back to waiting with the same game,
  and players get a toast.
- **Reactions**: `react { kind }` with Avalon's six (thumbs up, thumbs down, hmm, suspicious,
  shocked, laughing), drawn in the house line style with a heraldic accent each
  (`packages/ui/src/reactions.tsx`). One per player, 800ms apart, kept 6s, public (the TV gets
  them). They pop over seats in the lobby and the TV lobby; the lobby has a reaction row under
  the table and the menu has one during games and results. Game screens get `reactions` and draw
  them with the kit's `PlayerReaction` (Rock Paper Scissors does, on phones and the TV).
- **Unique names**: `join` and `rename` refuse a name someone at the table already has, ignoring
  case (`NAME_TAKEN`, "Someone at the table is already called Bran."). The join card and your
  sheet check first with the engine's `nameClash` and say so inline.
- **System lines in chat**: `ChatMessage.system` lines for joins, leaves, removals, host changes,
  rejoins, game start, game over (with the summary), ending early and score resets, plus each line
  from a game's optional `announce(prev, next)`. Players are written `{playerId}` and shown by
  current name (names at the time are kept for anyone who left). They're quiet, centred lines and
  don't count toward the unread badge.
- Not built (dropped with the Avalon port): the timer runtime, a server clock, and rejoin codes
  made for someone else. The contract keeps `now`, `nextTimer` and `onTimer` for later.

### Design (signed off)

- The review page is https://claude.ai/artifact/T8HQa4wn5a41g7Yj4GBwyC. The reference mockup is `mockups/a3-compendium.html`. STYLE_GUIDE.md is the source of truth.
- **Avalon stays exactly as it is today**, in both gameplay and styling. There's no stained glass anywhere.

### Secret Hitler (2026-10-13, branch `feat/secret-hitler`)

- `packages/games/secret-hitler`: the official rules for 5–10 players (deal and knowledge, the
  6+11 deck with reshuffles, term limits including the five-player exception, the election
  tracker and top-decking, every power board, veto from five Fascist policies, every win), and
  house rules for 11–15 as host options. Rules unit tests include leak checks and random full
  games at 5, 8, 10, 12 and 15 players; `e2e/secret-hitler.spec.ts` plays a game on five phones.
- **House rules to confirm with the group** (they're options, so they're easy to change):
  - Fascist team (Fascists plus Hitler): 11→5, 12→5, 13→6, 14→6, 15→7. That carries on the
    official pattern of just under half, so the Liberals always keep a clear majority. The host
    can set 2 up to just under half.
  - The 9–10 power board for every count above 10.
  - A bigger deck (on by default): 7 Liberal + 12 Fascist at 11–12, 8 + 13 at 13–15. That keeps
    the official third or so of Liberal cards but reshuffles less often at a big table.
- Screens: its own lobby and TV lobby, the phone game (secret role card that's face down until
  tapped, both tracks, the placards, nominate, Ja!/Nein, discard and enact with a confirm, veto,
  powers), the TV, and a recap of every government with the policies really drawn, discarded
  and enacted, every vote, investigations and executions, and everyone's role.
- Not built: turn timers (no timer runtime yet).

## Next

1. Lesia reviews and playtests Phase 1 on the Vercel preview, then merges `feat/phase-1` to `main`. Production then serves it.
2. Phase 1 still to check on real devices:
   - joining with QR codes on actual phones;
   - a laptop driving a TV.
3. Phase 2, porting Avalon:
   - Write the parity checklist from the current app.
   - Rules in TypeScript, with the knowledge and leak tests.
   - Port the UI unchanged, using the `GameUi.Lobby` hook for Avalon's round-table waiting room.
   - Extract the kit pieces, then write GAME_KIT.md.

## Ideas for later

- **Short room links** (Lesia, 2026-10-13). `jackdaw-games.vercel.app/QGYR` going straight to the
  room works on Vercel today (a `/[code]` route that redirects to `/r/[code]`). A really short
  address needs a short domain bought and added to the Vercel project; that's not tied to
  Cloudflare either.

## Decided

- **Avalon is linked, not ported** (Lesia, 2026-10-13; `docs/avalon/LINK.md`). Branch
  `feat/avalon-link` has Jackdaw's side: linked games in the contract and runtime (CLAUDE.md),
  `packages/games/avalon`, Avalon's own lobby, the hand-off screens and an e2e against a fake
  Avalon. Vercel is set up (2026-10-13): `JACKDAW_LINK_SECRET` on both projects (Preview and
  Production); Jackdaw's `AVALON_URL` is play-avalon.vercel.app for Production and the Avalon
  `feat/jackdaw-link` preview for Preview; Avalon's previews are public. A live game through both
  previews worked end to end (seated, played, back to Jackdaw, scored). Live since 2026-10-13: Avalon main
  1de4b6b and Jackdaw main d841c12 are in production, Jackdaw's `AVALON_URL` is
  play-avalon.vercel.app for Production and Preview, and a linked game on production worked
  end to end. Standalone Avalon simulated cleanly on production. Avalon's lobby fills the screen under Jackdaw's
  bar; Rock Paper Scissors went back to Jackdaw's lobby (STYLE_GUIDE.md, "Each game's lobby").

- In dark mode Avalon switches to its own Night look; every game follows the shell's day/dark
  choice through `useTheme()` (Lesia, 2026-10-12).
- Every game celebrates results with the kit's outcome moments (`celebrate.tsx`); see CLAUDE.md,
  "Every game" (Lesia, 2026-10-12).

## Open questions

- Should `actionSchema` stay on the game contract? It was added so every incoming action is checked with Zod.
- The plan's strict "reject stale seq" would reject simultaneous votes. Actions are currently rejected only when they come from an earlier game or claim a future seq. Ordering within a game is left to the rules.
- Timers (`onTimer`) are not scheduled yet. That will be decided with the first timed game. On Vercel they'll be evaluated lazily on each poll.
- Secret Hitler house rules for 11 to 15 players still need confirming with the group (Phase 3).
