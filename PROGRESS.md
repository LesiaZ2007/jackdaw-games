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
  scrolls to the games. (Since 2026-10-18, Lesia: with few games the shelves confused; home and
  /games show one grid, loosely by kind with playable games first, under one row of filters.)
  In the lobby, Next up is a small row that expands to options and rules.
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

### Codenames (2026-10-16, `feat/codenames`)

- `packages/games/codenames`: rules (`rules.ts`), team placement (`teams.ts`), an original list
  of 549 words (`words.ts`), and the screens: its own lobby (two case folders), the phone (board,
  clue entry for spymasters, suggest/hold-to-guess for operatives), the TV, the TV lobby and the
  end-of-game key.
- Guessing: a tap suggests a word (everyone sees suggestions); it's guessed when most of the
  team's operatives suggest it, or one of them holds it (or presses "Guess …"). "End our turn"
  passes. Clues are one word plus 0–9 or ∞ (0 and ∞ allow unlimited guesses, otherwise the
  number plus one); a clue that is a word on the board is allowed but flagged. Each clue also
  goes in the chat.
- Teams are part of the game's options, arranged by the host in the lobby (tap a player, then a
  team or spymaster slot; Shuffle teams). Players who left are ignored; unplaced players join
  the smaller team at the start; "Even teams" balances (never moving a chosen spymaster); every
  team gets at least two players and a spymaster. "New spymasters each game" draws them at random
  (a true rotation would need the lobby to remember past games).
- Deferred: players choosing their own team (needs a platform addition: a per-player lobby
  choice), and the optional turn timer (the runtime doesn't run game timers yet).

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
- 2026-10-16 (`feat/sh-status`): the status display rebuilt after secret-hitler.online (player
  strip with busy hourglasses, a named status line with "Your move", the vote tally, the board
  with its piles, and a phase banner), and new filled emblems. `src/status.ts` has the busy set
  and the wording, with unit tests.
- 2026-10-17 (`feat/sh-online`, Lesia: "copy EXACTLY"): **played and drawn as
  secret-hitler.online.** ShrimpCryptid's Secret Hitler Online (CC BY-NC-SA 4.0, React +
  Java) is open source, but its live server can't be driven from Jackdaw (no API, CORS locked to
  its own site, a watcher would take a seat), so its client was ported instead:
  - `src/ui/sho/`: its components (player tiles, player row, status bar, event bar, decks,
    boards, every prompt and popup, the role card, the investigation card, the policy folder,
    the election tracker, the victory popup) with the same markup, ids, text and timings, and
    `GamePage.tsx`, its App's game page with the animation queue, driven by polling.
    `sho.css` is its stylesheet rule for rule, generated: every selector scoped under `.sho`
    (and skipping `.jd-lchat` / `.sho-jackdaw`), every keyframe renamed `sho-*`, plus a
    browser-defaults reset (`all: revert`) because the site relies on what Tailwind's
    preflight removes. Art in `apps/web/public/games/secret-hitler/sho/`; Germania One and
    Montserrat come from `next/font` in `app/layout.tsx`.
  - `adapt.ts` turns Jackdaw's views into its game state (players keyed by name, which Jackdaw
    keeps unique), with a leak test; moves map back in `ui/player.tsx`.
  - Its gameplay: the president presses **End term** after every round (new `post` phase and
    `endTerm` action in the rules).
  - Its lobby page (code, invite link, tiles, Change icon, Start game for the VIP), fitted to
    one screen with no scrolling (`useTileFit` sizes the tiles for 5 to 15 players). The invite
    is the code plus the short link printed plainly with Copy (no text box). House rules past 10
    sit in the lobby in its style. The TV lobby and TV use its look; the TV page zooms to fit
    the screen. The end of a game replays the last move on the phone, then its victory popup,
    with Play again / Return to lobby for the host.
  - Adapted to Jackdaw (Lesia, 2026-10-17: "exactly, with necessary adaptations"): tiles carry
    each player's Jackdaw crest and colour instead of the site's portraits, and Change icon opens
    Jackdaw's own look sheet, so a look is the same in every game. Table talk is drawn in the
    site's colours and type on every Secret Hitler screen (lobby, game, results): docked from
    1240px, a drawer from the bar's chat button below that. Popups sit under Jackdaw's bar, so
    the chat and menu open mid-vote. The decks and boards shrink to fit under the tiles
    (`FitToScreen`), and on landscape screens the two boards sit side by side, so the game page
    doesn't scroll. Crests and names fly between Jackdaw's seat track, the Secret Hitler lobby
    and the table (view transitions) when the game is chosen, starts and ends. No "About this
    project" link; the credit is on the game's About page.
  - Kept from Jackdaw: the bar, table talk, short links, looks, stats and scores, 11–15 players.
    Other differences from the site: the header says SECRET HITLER (not its domain); [Host]
    marks the host (the site marks everyone else by mistake); no bots; one look only (it has no
    day/dark); its own popups instead of the kit's VerdictMoments.
  - Platform additions: `GameUi.fullBleed` (the game fills the column under the bar, draws
    table talk itself from `ScreenExtras.chat` / `GameResultsProps.chat`, and its tokens fly in
    and out on start and end) and `GameUi.Results` (a game's own end screen).

### Poker and Letterhoard (2026-10-17, merged to `main` 2026-10-18)

The word game was built as Wordhoard and renamed **Letterhoard** (Lesia, 2026-10-18). Only the
name players see changed: its id, package and storage stay `wordhoard`, so saved lobbies and
history keep working.

Lesia asked for "poker and a scrabble-esque game" in the agreed style. Both use Jackdaw's own
lobby (simple games keep it), follow day and dark through the tokens, and have rules tests with
a leak test, phone and TV screens, catalog pictures and an e2e (`e2e/cards-and-words.spec.ts`).

- **Poker** (`packages/games/poker`): no-limit Texas Hold'em for 2–10. Options: starting chips
  (500/1000/2000), blinds (5/10, 10/20, 25/50), blinds doubling (never, every 5 or 10 hands)
  and length (15 or 30 hands, or last one standing). Full no-limit betting: min-raises, short
  all-ins that don't reopen the action, uncalled bets returned, side pots, odd chips left of the
  button; `cards.ts` ranks hands. A busted player watches. The next hand deals itself (Lesia,
  2026-10-18) on the server timer, 7s after a hand ends; "Deal now" skips the wait (a deal
  naming a hand already dealt does nothing). Look: a printed card table, vert baize on a sable rail,
  seats round the rim with your seat at the bottom (like Avalon's round table), cream cards with
  gules hearts and diamonds, chips as small stacks. Each hand ends with your VerdictMoment (won,
  lost at a showdown, or who won if you weren't in it; none if you folded).
- **Letterhoard** (`packages/games/wordhoard`): a crossword tile game for 2–4, or up to 8 in pairs
  (Lesia, 2026-10-18). Past four players everyone plays in pairs; the option "Pairs: Always"
  pairs smaller groups too (3+). Partners are
  drawn at random (one player alone with an odd number), share a rack and a score, and either
  can make the move; racks, scores and the turn are keyed by a side's first player. It has Jackdaw's own
  board layout (original bonus squares), tile mix (100 tiles) and values. Plays are checked on
  the server against ENABLE (public domain, 168,551 words), packed by
  `scripts/pack-words.mjs` into `src/words.packed.ts`; browsers get an empty list through the
  package's `#packed-words` import (`browser` condition), so the 540 KB never reaches a phone.
  Tap a rack tile then a square; the phone previews the score; blanks ask for their letter;
  swap (bag of 7+), pass, and the usual endings (out with the bag empty, or six scoreless turns).
  Look: paper squares ruled in ink, bonus squares in heraldic fills (gules 3W, tenné 2W, azure
  3L, pale azure 2L), bone tiles in Grenze.
- Kit: new `cards` and `tiles` glyphs for the box lids.

### Round three (2026-10-18, branch `feat/round-three`)

Lesia's playtest list ("do timers, do alerts, do all the improvements"), all done:

- **Server timers.** The runtime fires a game's `nextTimer`/`onTimer` on every read and write
  (`runTimers` in the engine; each counts as a move). Snapshots carry `serverNow` and `timerAt`;
  clients correct their clock from the quickest poll (`apps/web/lib/clock.ts`, the screens'
  `now()`) and poll just after a timer is due, so it fires within a moment while anyone has the
  game open (a TV counts). Nothing fires while every screen is closed; it fires on the next one.
  The kit's `useCountdown(at, now)` counts down to a deadline.
- **Screens that fit** (`GameUi.fit`): Letterhoard's and poker's phone screens fill the height under
  the bar and never scroll; on a laptop the rack or betting dock sits beside the board or table
  (container queries on the `game` container). Toasts moved under the bar and clear on a tap
  (they used to cover Letterhoard's rack).
- **Your-move alerts.** `GameModule.waitingOn` (public; poker, Letterhoard, Codenames, Secret
  Hitler, RPS) feeds `snapshot.waitingOn`. Phones chime (Web Audio, no files), buzz, and mark the
  tab title when a game starts waiting on them; chime and buzz can be switched off in the lobby
  menu. **Notifications**: Web Push sent by the server itself (`packages/server/src/push.ts`,
  RFC 8291/8292 with web crypto, tested against the RFC's worked example), after the reply
  (Next's `after`). Subscriptions are per lobby (`jackdaw:push:<code>`, `POST
/api/lobby/<code>/push`); `GET /api/push` gives the public key. The service worker shows them
  unless Jackdaw is on screen; a tap opens the lobby. On iPhone it needs Jackdaw on the Home Screen.
  Vercel env (set 2026-10-18, Production and Preview): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`
  (sensitive), `VAPID_SUBJECT`. Without them the option isn't offered.
- **Poker**: the server deals the next hand; options Turn timer (off/30s/60s: out of time checks
  if free, else folds) and Buy back in (no/once each/any time, first half of the game); the lobby
  seats everyone round the card table (`GameUi.LobbySeats`; the TV keeps its track); your two
  cards are named before the flop ("Ace and six, same suit"). The winning five were already
  lifted at a showdown.
- **Letterhoard**: words are checked as you place them (`GET /api/words?w=…`, so the 540 KB list
  stays on the server); newer words ENABLE lacks (QI, ZA, OK, EW, ZEN, EMOJI… in `words.ts`;
  the official NWL and Collins lists are copyrighted and can't be shipped); drag tiles as well
  as tap; the TV animates each move (tiles drop in, the word card stamps the score); results show
  the final scores with leftover tiles, the finished board with the best play, and every move
  (`GameUi.Reveal`), and the TV shows the finished board (`GameUi.TvReveal`); option Turn timer
  (off/1/2/3 minutes; out of time passes).
- **The night's awards**: `GameResult.highlights` (Best word, Biggest pot, Best clue) are kept in
  history; the night summary gives each to the best of its kind. On the TV's night so far and in
  Game stats > Tonight.
- A lobby saved before a game gained an option gets that option's default (start never breaks).

### Risk (2026-10-18, branch `feat/risk`)

Lesia asked for Risk ("Let's add Risk") and chose: a length option (secret missions, the short
game, or classic world domination), both the classic world map and an original one, and Roll or
Blitz attacks. Design: `docs/superpowers/specs/2026-10-18-risk-design.md`; plan:
`docs/superpowers/plans/2026-10-18-risk.md`.

- **Rules** (`packages/games/risk`): 2–6 players (two share the board with a passive neutral).
  Options: map (World / Realm), goal (Secret missions / World domination), setup (Quick: dealt and
  spread; Draft: everyone places their starting armies at once, hidden until all are done), card
  sets (Rising 4, 6, 8, 10, 12, 15, +5 / Fixed 4, 6, 8, 10), turn timer (off, 1, 2, 3 minutes;
  out of time it trades if forced, spreads what's left, moves in the minimum and ends the turn).
  Reinforce (territories / 3, at least 3, plus continents and sets; must trade at 5 cards; +2 on a
  traded territory you hold), attack (Roll: one exchange; Blitz: until it falls or you're down
  to 1; the defender wins ties), move in, fortify once along your own chain. A card for taking a
  territory; knocking someone out takes their cards (trade down at 6+). Missions: the map's six
  continent goals, 24 territories, 18 with 2 armies each, destroy an army (not at 2 players;
  falls back to 24 if someone else gets there first). Awards: Bloodiest battle, Greatest conquest.
- **Maps** (`src/maps`): the classic 42-territory world (classic borders and bonuses, Europe
  enlarged like printed boards) and the Realm, an island kingdom of 42 provinces in 6 regions.
  Outlines come from `scripts/build-map.mjs` (`pnpm --filter @jackdaw/game-risk maps world`):
  coast polygons and one seed per territory in `scripts/coasts/*.json`, cut into Voronoi cells with
  wobbled, shared borders; a test checks that territories touch on land exactly where they border
  (sea crossings are lanes). The output (`*.shapes.ts`) is generated and kept out of Prettier.
- **Hidden information**: hands, missions, unrevealed drafts and the deck are only in
  `getPlayerView`; the leak test plays 20 random whole games and checks, at every step, that the
  table view and every player's view are unchanged when everyone else's secrets are scrambled.
- **Screens**: the phone (`fit`) is the map (pinch, drag, wheel; it opens filling the frame,
  "Whole map" shows all; tap a territory to pick it), the turn and clock, the last dice, and a
  dock for each step; cards and mission in sheets. Each settled battle shows the attacker and
  defender their `VerdictMoment` (taken / repelled, lost / held); being knocked out shows a loss.
  The TV: the whole map with names, seats with lands, armies and cards, the dice and the
  continents; settled battles as reveals. Results: everyone's mission and the final map. Jackdaw's
  own lobby. Kit: a `banners` glyph. e2e: `apps/web/e2e/risk.spec.ts`.
- **First playtest feedback** (Lesia, 2026-10-18; design approved in chat, "Yes, perfect"):
  - **Whose land**: each seat marches under one of six heraldic army colours in seat order (red,
    blue, green, gold, purple, orange; the neutral grey; `src/ui/armies.ts`). Territories are
    filled with their owner's colour. Players' own tints were too muted and alike to tell apart;
    their crest tokens keep them. Continents are ruled round in a heavy double line (`*_REGIONS`
    from the map generator) and lettered in the sea with their bonus.
  - **Dice**: they tumble as a battle lands (faces turning), then settle with the beaten dice
    struck through; a blitz says how many throws it took (`Battle.throws`). The TV shows the last
    battle as a card. Reduced motion: no tumble.
  - **Your orders**: the game opens on a sealed letter in your army's colour (tap to break the
    seal), your mission or "Conquer the world", your colour and land count, then "To battle".
    Shown at the start (round one, before any battle), remembered per deal on the device.
  - **Option explanations**: `GameUi.optionHelp` (new, optional) puts one line under each option
    in Jackdaw's lobby, following the choice made. Risk explains all five.
  - **Lobby layout (every game in Jackdaw's lobby)**: the game column is now the wider one, the
    opened Next up stacks the box above the words when narrow, and the seat track draws only the
    chosen game's seats (Risk 6, not 15).
  - **Themed seating**: `LobbySeats` is the war council, each seat a banner in its army colour with
    the crest on it over a faint engraving of the chosen map, open seats furled. `TvLobby`: the
    map large and faint, the banners across it, joining on a cartouche. Switching the lobby to
    a game with its own seats (and back), or the track changing size, runs as a view transition:
    each crest and name flies to its new seat (`useSeatStyle` in `waiting.tsx`).
  - **TV text**: names grow less than the roundels on the TV and long ones break onto two lines.
  - **Landmarks** (`src/ui/decor.tsx`): World: title cartouche, compass rose, three galleons, a
    sea serpent, the Rockies, Andes, Alps and Himalayas, Siberian forest. Realm: cartouche, compass,
    ships, a serpent in the strait, castles at Kingsreach and Highcairn, a dragon over the Wolds,
    Elderwood's pines, the Fells' peaks, Saltmarsh reeds and the Lantern Isle lighthouse.

### UI polish (2026-10-18, branch `fix/ui-polish`)

Lesia's list, all done:

- **No scrollbars on phones** (`pointer: coarse` or ≤760px), and no sideways scrolling anywhere:
  the detail page's picture strip is now a grid.
- **Avalon is Parchment by default**, even with Jackdaw in dark, with a Parchment/Night choice in
  its lobby settings (per phone). See "Day and dark" in CLAUDE.md.
- **Pictures by device**: each game has phone shots and a 1440×900 laptop shot (`desktop: true`);
  phones see the phone ones, laptops the laptop ones. All retaken with bird-named players (Avalon's
  against a local Avalon app; its shots are JPEGs because the parchment texture made PNGs 1.4 MB).
  The TV shots are gone.
- **Plainer words**: every tagline, description, step and credit was rewritten to read like a
  person wrote it; the dead Secret Hitler "coming soon" entry is gone.
- **Birds, not people**: tests, comments, mockups and examples use Wren, Rook, Magpie, Robin,
  Finch, Heron, Kestrel, Lark, Swift, Jay, Crow and Kite.
- **Filters**: the Players stepper is now a dropdown like the others; each dropdown fills its
  printed box with the label inside, so all four fit in one short row on a phone.
- **Settings easy to find**: a moon/sun button in the corner of home and in the games bar, and
  the Lobby menu's Look is a Day/Dark choice right under You (it was a link near the bottom).
- **Detail page on phones**: the back button sits in the banner's top-left corner (it had its own
  row, out of line with the banner), and the Start dock slides away while you scroll down and
  comes back when you scroll up or reach the end.
- Less clutter: shorter hints in the lobby ("That's you. Tap to change your look.") and the menu.

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
- Secret Hitler house rules for 11 to 15 players still need confirming with the group (Phase 3).
- Poker's defaults stand (Lesia, 2026-10-18). Lesia asked for the official Scrabble dictionary (2026-10-18): NWL and Collins are
  licensed, so Letterhoard keeps ENABLE plus a short list of newer words; a licensed copy could be
  loaded per lobby if Lesia has one.
