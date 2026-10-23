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

### UNO (2026-10-18, branch `feat/uno`, merged to `main` with Lesia's go-ahead)

Lesia asked to "Make UNO" and to call it UNO (it's Mattel's trademark; the credit line says so).

- **Rules** (`packages/games/uno`): 2–10 players, the official 108-card deck (`src/cards.ts`, a
  card is its id 0–107). Seven each, a number card turned up, play from the dealer's left; match
  colour, number or symbol, or a Wild. Draw one and play it if it goes. Skip, Reverse (a Skip at
  two players), Draw Two. Wild Draw Four can be challenged: a bluff (holding the colour in play)
  costs the bluffer the cards, a fair one costs the challenger six. "UNO!" is called with the
  play (or straight after); anyone can catch an uncalled last card for two until the next player
  moves. Going out on a draw card still makes the next player draw. The round winner scores the
  other hands (face value, actions 20, wilds 50); the deal moves round and the next round deals
  itself after 8s. Options: length (one round / to 200, the default / to 500), drawing (one /
  until you can play), stacking draw cards (house rule, off), turn timer (off/30s/60s: out of time
  you draw or take, and play moves on). Award: Biggest round.
- **Hidden information**: hands, the draw pile, the card you just drew and whether a Wild Draw
  Four was a bluff are never in the table view; a fuzz test plays 25 seeded games checking every
  card is accounted for and nothing leaks.
- **Screens** (`fit`): a printed paper mat ringed in the colour in play with arrows turning the way
  play goes, both piles in the middle (tap the draw pile to draw), seats round the rim with a fan of
  backs, the card count, the score and tags (Skipped, +2, Caught!, Bluffed!), a stamp over the pile
  for action cards, your hand fanned to fit any size (playable cards lifted), and the dock: Draw,
  Keep it, Take N / Challenge, a colour picker for wilds, Say UNO!, and a loud Catch button.
  Round moments for everyone; TV shows the table; lobby seats round the same mat. Kit: `uno` glyph.
  e2e: `apps/web/e2e/uno.spec.ts`.

### TV screens that read from the sofa, and Letterhoard extras (2026-10-21, branch `feat/tv-scale`)

Lesia: the TV display was too small for any game ("works great on a laptop but on a real TV stuff
is tiny"), UNO's TV was "awful", all TVs should scale and be interesting, and it must keep looking
good on a laptop. Plus Letterhoard: rearrange the tray, and a definition popup after each play.

- **Why it was tiny**: TV styles used `vh`/`vw`/`vmin`, which measure the browser window, not the
  1920×1080 stage. A TV's browser often reports 960×540, so UNO, Poker and Letterhoard tables
  and all of Secret Hitler's port were drawn at about half size or less. `TvStage` now hands its
  own units down (`--vw`, `--vh`, `--vmin`, `--vmax`); game CSS uses `var(--vh, 1vh)` and so on
  (phones unchanged), and the type steps are fixed TV sizes on the stage. Secret Hitler's TV fit
  compared a scaled rect with an unscaled height (it overflowed on small windows); it now compares
  both on screen, and grows the page up to 1.6× when there's room, not only shrinks it.
  One design for TV and laptop (no couch mode): the stage scales the same picture to both.
- **UNO's TV redone** (`packages/games/uno/src/ui/tv.tsx`): the room washed in the colour in
  play, a big discard pile with the last few cards scattered under it, the deck, a ring of arrows
  turning the way play goes, everyone's real hand fanned face down, the player to act lifted and
  haloed, UNO!/One card!/+4 stamps, Skip!/Reverse! across the table, and a play by play. The
  phone's table no longer has a TV mode.
- **Bigger everywhere**: Poker (the table fills the screen; names, stacks, pot), RPS, Codenames'
  folders and log, Risk's side panel, Letterhoard's scores. Rules in STYLE_GUIDE.md, "TV sizes".
- **Letterhoard rack**: drag a tile along the rack to rearrange it (also while waiting for your
  turn); your order is kept from turn to turn (`ui/arrange.ts`, with tests). Shuffle still works.
- **What a word means**: after every play each phone shows a card over the board with the
  meaning of the words made (tap or about 9s to clear), and the TV keeps the last word in tiles
  with its meaning beside the board. `GET /api/words/define?w=` asks dictionaryapi.dev and
  Wiktionary's REST API at once (no keys; only words in the word list; cached a month on the CDN)
  (`src/define.ts`, with tests). e2e: rearranging while waiting, the order surviving a move, and
  the card (dictionary mocked).
- Also fixed: main didn't build (UNO's TV picture still said `wide`, renamed `desktop` in the UI
  polish), so Vercel couldn't deploy main after the merge.
- Not changed on purpose: Avalon's and Secret Hitler's own lobbies (their looks are copies).

### Wavelength (2026-10-23, branch `feat/wavelength`)

Lesia: "Let's do wavelength", then "make sure there's an option to choose either random or
selected teams", and allowed merging to main once done and tested. Design in
`docs/wavelength/DESIGN.md`.

- `packages/games/wavelength`: Teams (Sun and Moon, 4–15) and Together (2–15). The psychic picks
  one of two cards with the target on their dial and writes a clue; the team turns the dial; the
  other team calls left or right for a point; 4/3/2 by distance; the catch-up turn; first to
  7/10/15, or 5/7/10 rounds Together with a bonus round per bullseye. About 190 original
  spectrum pairs. 35 rules tests (scoring, rotation, locks, the call, catch-up, winning,
  Together, chosen teams, hidden info).
- Options: Mode, Teams (Random or Chosen), Guessing (Shared dial or Everyone guesses, averaged),
  Length, Dial timer. The psychic can "Lock it in now" so a dropped phone can't stall a round.
- The live dial runs over polling: the dragging phone moves at once and sends at most every
  400ms, newest position only, one at a time (`useDialSync` in `ui/dial.tsx`); other screens
  ease the needle. No transport or contract change.
- **Platform additions** (lobby UI only, no contract or protocol change): `LobbySeatsProps.setOptions`
  (host only) so a game can set options from its seats; the options panel and the "Next up"
  summary skip options that aren't plain choices. Wavelength's `LobbySeats` draws Sun and Moon
  with host buttons to move players when teams are Chosen, and the seat track otherwise.
- Screens: phone (`fit`), TV (checked at 1920, 1440 dark, 960), results reveal with every
  round's dial, catalog pictures. e2e `wavelength.spec.ts`: a clue, a dragged and locked dial,
  the reveal, and the target never public before it.
- Still open: group-written spectrum pairs need a text option in the lobby.

### UNO polish, poker's greyed moves, the host's End game (2026-10-23, branch `feat/uno-polish`)

- **UNO on a laptop**: your hand runs under the table in bigger cards (92–128px), the dock beside it.
- **UNO mat** (phone and laptop): the ring is a light tint of the colour in play, the arrows in that
  colour turn slowly (60s) and quietly.
- **UNO TV** back in the compendium look (Lesia: the gradient "doesn't fit", the spinning circle
  "is just random"): no wash, no glows, no spinning ring. The table is printed flat in the colour in
  play inside a cream rule on a paper rim; whoever plays next gets an ink ring and a small lift.
- **Card counts** everywhere are a card-shaped sable chit by the token (TV 64px, phone at least
  18px), gules at one card.
- **Poker**: the betting dock stays up while you're in the hand. What you can't do right now is
  greyed out, not hidden: everything while someone else acts, the raise row when you can only call
  or fold ("No raise now"), and ½ pot / Pot when they come to the same as Min or All in.
- **The host's End game**: a button in the bar during any game (a stop square on phones, "End game"
  from 768px), opening a confirm sheet ("End it for everyone"). The two-tap one in the menu stays.
  e2e covers both, and that nobody else gets the button.

### Deep clean (2026-10-23, branch `chore/deep-clean`)

Lesia asked for a deep run through every game so everything goes smoothly. Five audits (platform,
web and kit, and the games in groups) and fixes with tests; unit tests 414 → 443, e2e green.

- **Security**: Next 16.4.0 → 16.4.2 (two critical advisories, one an unauthenticated RCE; `next
build` refused to run on 16.4.0). The Phase 0 echo endpoint is gone. Push endpoints must be a
  browser push service. An address that keeps guessing lobby codes is turned away for a while,
  and lobby creation is limited per address as well as per token.
- **Platform**: a game timer that throws can't wedge a lobby (End game always works); saves only
  land while the lock is held (lock 10s); a refused Start closes the Avalon room it opened; a
  rejoin code can't strand a ghost seat; an emptied lobby's next joiner is host; avatars never
  repeat; a moved seat stops getting the old device's pushes.
- **Every game**: the win/loss moment clears itself again in busy games; recaps never show
  `{Name}` braces or "Rook: Rook…"; Start / Play again / Back to lobby ignore a second tap;
  sheets keep focus; rejoin and chat recover from a dropped connection.
- **Rules**: UNO's turn clock restarts when a turn comes straight back; poker doesn't ask the
  last bettor to act against a short all-in; Codenames needs a guess before ending a turn; Risk's
  +2 card bonus is once a turn and fallback missions win at once; Letterhoard shuffles swapped
  tiles back and counts 0-point plays as scoreless.
- **Wavelength** (merged into this branch mid-round, then audited): the psychic can only end the
  wait once a guesser has locked in or a caller has voted (they know the target, so an early
  hurry was a free bullseye); Lock in sends the last dial move first, so a quick tap can't lock
  the old spot; in Teams the team going second starts on 1 point, as in the box; TV tags 24px.
- **Avalon link**: 8s timeouts; only Avalon's own "room gone" 404 drops a game unscored.
- **Consistency**: option help in every Jackdaw-lobby game, Codenames TV moments, TV type ≥24px,
  44px catalog targets, literal colours in tokens, the host can reset scores from Stats.

## Next

1. Lesia playtests `chore/deep-clean` on its preview, then merges.
2. Still to check on real devices: notifications on real phones (iPhone needs Home Screen
   install), QR joining, a laptop driving a TV.

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

- **A player who walks away mid-game** (deep clean, 2026-10-23): players can't leave a running
  game, so in a game without a turn timer (RPS, Codenames, Secret Hitler, and poker/UNO/Letterhoard
  with the timer off) one closed phone stalls the table until the host ends it unscored. Options:
  turn timers on by default, a timer for RPS/Codenames/Secret Hitler, or a host "skip them" once a
  waited-on player has been away a few minutes. Needs Lesia's call (it touches the contract).
- Wavelength (deep clean): a psychic who is away during the clue stalls the round (no clue timer,
  and teammates can't skip them); with the timer off, a whole away team stalls the call; the
  psychic, who knows the target, decides when the call ends ("Go with that"), which perhaps
  belongs to the callers; Together on the TV lists one player per row, so past 9 players the
  list is cut off.
- Codenames and RPS phones still scroll (no `GameUi.fit`): fitting them needs a layout redesign.
- UNO: after "Draw one", opponents can tell whether the drawn card was playable (the turn passes
  at once if not). Fine to keep, or always offer "Keep it"?
- UNO's pictures: the phone shot is 1x (390×844) and the laptop shot is the TV (1920×1080).
- Vercel WAF: a rate-limit rule on `/api/lobby*` would make the per-address limits global
  (they're per instance today). Dashboard step.

- Should `actionSchema` stay on the game contract? It was added so every incoming action is checked with Zod.
- The plan's strict "reject stale seq" would reject simultaneous votes. Actions are currently rejected only when they come from an earlier game or claim a future seq. Ordering within a game is left to the rules.
- Secret Hitler house rules for 11 to 15 players still need confirming with the group (Phase 3).
- Poker's defaults stand (Lesia, 2026-10-18). Lesia asked for the official Scrabble dictionary (2026-10-18): NWL and Collins are
  licensed, so Letterhoard keeps ENABLE plus a short list of newer words; a licensed copy could be
  loaded per lobby if Lesia has one.
