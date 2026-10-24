# Catan: design

Date: 2026-10-23. Asked for by Lesia ("I want you to make Catan in Jackdaw Games… design matters a
LOT… Catan should maintain some of its own identity in its design, lobby, TV display"). Branch
`feat/catan`. Mockups: `mockups/catan.html` (published for review at
https://claude.ai/artifact/Y7tNj2rKQJthLVVch2Emdy).

## Intent and decisions

Catan joins the lobby as a turn-based board game for 3–6 friends, each on their own phone, with the
TV showing the island. It keeps Catan's own identity inside Jackdaw's frame. Lesia chose
(2026-10-23):

- **Players:** 3–6. The classic island for 3–4, the big island for 5–6 with catan.com's current
  **Paired Players** rule.
- **Name:** "Catan", credited to Klaus Teuber and CATAN GmbH (private play, like Risk and UNO).
- **Trading:** offers with counters. The player whose turn it is offers to everyone or to one
  player; others accept, decline or counter; anyone may propose to the player whose turn it is;
  the offerer picks who to trade with.
- **Board:** Balanced random by default; Random and the rulebook's Beginner board as options.
- **Look:** A, "Colour print": Catan's terrain colours as printing inks, each tile engraved with
  its motif. Seats are **ships at the harbours** in the lobby and TV lobby. The phone layout as
  mocked up.
- Then: "Everything looks good for now so just build it all."

It fits the existing contract unchanged: no change to `GameModule`, the lobby state machine or
the protocol. Risk is the template (package layout, `LobbySeats` + `TvLobby`, timer, tests).

Rules are the official 5th edition ("Game Rules & Almanac", 2015) and the 5–6 Player Extension,
with the Paired Players rule from catan.com (2021). Where the rulebook is silent the choice is
written below and marked **(ruling)**.

## Package

`packages/games/catan` (`@jackdaw/game-catan`):

```
src/meta.ts        id 'catan', name 'Catan', 3–6, category 'board', minutes [60, 120], complexity 2
src/types.ts       Resource, Terrain, Board, State, actions, views
src/geometry.ts    hex/corner/edge ids for the classic (19) and big (30) islands, harbour slots
src/board.ts       board generation: Balanced, Random, Beginner
src/build.ts       placement rules (setup, roads, settlements, cities), costs, piece limits
src/roads.ts       longest road length and the award's holder
src/trade.ts       offer checks, bank ratios
src/rules.ts       the GameModule
src/moments.ts     outcomes from public data only, for the screens
src/bot.ts         a random legal move, used by onTimer and by the fuzz test
src/*.test.ts
src/ui/            index, player, tv, board (SVG), hand, dock, sheets, lobby, reveal, glyphs, catan.css
```

Registered in `apps/web/lib/registry.ts`, `apps/web/lib/catalog.ts`, `apps/web/next.config.ts`
(`transpilePackages`) and `apps/web/package.json`. Catalog art
`{ band: 'tenne', field: 'semee', glyph: 'hexes' }` with a new `hexes` glyph (three hexes and a
settlement) in `packages/ui/src/icons.tsx`.

## Board

**Geometry.** Pointy-top hexes in axial coordinates. The classic island is rows 3-4-5-4-3 (19
tiles, 54 corners, 72 edges), the big island rows 3-4-5-6-5-4-3 (30 tiles, 80 corners, 109
edges). Corners and edges get stable string ids from their rounded positions, so the same board
always has the same ids. Each corner knows its tiles and neighbouring corners; each edge its two
corners and tiles. Pure data, built once per layout and cached.

**Components.**

|                                | Classic (3–4)                                                  | Big (5–6)                                                       |
| ------------------------------ | -------------------------------------------------------------- | --------------------------------------------------------------- |
| Tiles                          | forest 4, pasture 4, fields 4, hills 3, mountains 3, desert 1  | 6, 6, 6, 5, 5, desert 2                                         |
| Number tokens, in letter order | 5,2,6,3,8,10,9,12,11,4,8,10,9,4,5,6,3,11                       | 2,5,4,6,3,9,8,11,11,10,6,3,8,4,8,10,11,12,10,5,4,9,5,9,12,3,2,6 |
| Harbours                       | four 3:1, one 2:1 of each resource                             | five 3:1, two wool 2:1, one 2:1 of each other                   |
| Resource cards                 | 19 of each                                                     | 24 of each                                                      |
| Development cards              | knight 14, VP 5, road building 2, year of plenty 2, monopoly 2 | knight 20, VP 5, road building 3, year of plenty 3, monopoly 3  |

Each player has 15 roads, 5 settlements and 4 cities. Costs: road = brick + lumber; settlement =
brick + lumber + wool + grain; city = 3 ore + 2 grain (upgrading your settlement, which goes back
to your supply); development card = ore + wool + grain.

**Harbour slots.** Fixed coastal edges, spread evenly round the coast like the printed frame (9
on the classic island, 11 on the big one). A harbour serves the two corners of its edge.

**Generation** (`board.ts`, all through `Rng`):

- **Balanced** (default): shuffle tiles and harbour kinds over their slots; lay the tokens in
  letter order in a spiral from an outer corner tile inward, skipping deserts; redraw the tiles
  until no two red tokens (6 and 8) sit on neighbouring tiles. (The rulebook's spiral; the red
  check also on the big island, where the rulebook doesn't promise it.)
- **Random:** shuffle tiles, harbours and tokens; redraw until no reds touch.
- **Beginner:** the rulebook's starting map for the classic island (tiles, numbers and harbours
  fixed). Players still place their own opening pieces (ruling: the rulebook's pre-placed
  pieces aren't used). With 5–6 players Beginner falls back to Balanced; the option help says so.

The robber starts on the desert (the first desert on the big island).

## Rules

**Seats and colours.** Seat order is the lobby's `playerIds`. The first player is drawn with
`Rng` (the "highest roll" of the rulebook). Seats take Catan's colours in order: red, blue,
white, orange, green, brown.

**Setup.** Round one in seat order from the first player, round two in reverse (1-2-3-4-4-3-2-1).
Each step is `place { corner }` then `road { edge }` touching that settlement. The distance rule
always holds (no building on a corner next to another building). After the second settlement the
player takes one card from each tile next to it (not the desert). The first player then starts
the first turn.

**A turn** (phases `roll` → `main`, with `discard`, `robber` and `roadBuilding` in between):

1. **Roll** (`roll`). Every settlement on a tile with that number takes 1, every city 2; nothing
   from the robber's tile. **Short bank:** if the bank can't pay everyone a resource, nobody gets
   it, unless only one player is owed it, who takes what's left. A knight may be played before
   rolling.
2. **Seven.** Nobody produces. Everyone holding 8 or more resource cards discards half, rounded
   down (`discard { cards }`, all at once; `waitingOn` names who's left). Then the roller moves
   the robber to a different tile (the desert counts) and takes one random card from a player
   with a building there (`robber { tile, victim? }`). Victim choice is required when anyone
   there has a card; a tile with nobody to rob is fine.
3. **Main** (combined trade and build, as the almanac recommends): any number of trades, builds,
   purchases, and one development card, then `endTurn`.

**Building.** `build { kind: 'road', edge }` must touch your road or building and may not go
through a corner held by another player. `build { kind: 'settlement', corner }` must touch your
road and keep the distance rule. `build { kind: 'city', corner }` upgrades your settlement. Each
needs the cards and a piece in your supply. `buy` takes the top development card (none when the
deck is empty).

**Development cards.** One knight or progress card per turn, never one bought this turn. VP cards
are never played: they count for their owner automatically and stay hidden until the game ends.

- **Knight:** move the robber and rob as on a 7 (no discards). Played knights count toward
  Largest Army.
- **Road building:** place two roads free (phase `roadBuilding`); with fewer roads left or no
  legal spot, place what you can (ruling), and `endRoads` stops early.
- **Year of plenty:** take any two from the bank (the same twice allowed); if the bank is short,
  take what there is (ruling).
- **Monopoly:** name a resource; every other player gives you all of theirs.

**Longest Road** (2 points): the longest single trail of your roads, each road counted once,
never passing through a corner where another player has built. The first to 5 takes the card;
another player takes it only with a strictly longer road. When the holder's road is broken: if
the holder is still tied for longest, they keep it; otherwise it goes to the single longest
player with 5 or more, or is set aside if there's a tie or nobody has 5. A set-aside card comes
back as soon as exactly one player has the longest road of 5 or more. Recomputed after every
road and settlement.

**Largest Army** (2 points): the first with 3 played knights; another takes it only with
strictly more.

**Winning.** Points: settlement 1, city 2, Longest Road 2, Largest Army 2, each VP card 1. The
game ends at once when the player on their turn (or in their paired phase) reaches the target.
Reaching it on someone else's turn counts when your own turn (or paired phase) begins.

**Paired turns (5–6 players).** When player 1 ends their turn, **player 2** (the third seat to
player 1's left) has a paired phase: bank and harbour trades, building, buying and one
development card (one bought in this paired phase can't be played in it, ruling), but no roll
and no trading with players. A knight in the paired phase robs as usual. `endTurn` then passes
player 1's turn to the next seat. Player 1 wins first if both would.

**Trading** (`trade.ts`):

- `offer { give, want, to? }` by the player whose turn it is (to everyone, or one player).
  Others answer `answer { offer, reply: 'accept' | 'decline' }` or `counter { offer, give, want }`
  (a new offer from them to the player whose turn it is). Anyone else may `propose { give,
want }` to the player whose turn it is.
- `accept { offer, with }` by the offer's maker (for their own offer, choosing an accepter) or by
  the player whose turn it is (for a counter or proposal made to them) completes it. Both hands
  are checked again then; a trade either side can't cover is refused.
- Not allowed: gifts (each side gives at least one card), the same resource on both sides,
  development cards, trades on another player's turn, trades between two players neither of whom
  is on their turn, player trades in the paired phase.
- `withdraw { offer }` by its maker. Every offer clears at the end of the turn. At most 6 open
  offers per maker (ruling, to bound state).
- **Bank:** `bank { give, get, n }` trades `n` lots at your best ratio for that resource: 2:1 at
  its own harbour, 3:1 at any generic harbour, else 4:1. Only on your turn or paired phase.

**Turn timer** (Off, 1, 2 or 3 minutes per step, via `nextTimer`/`onTimer` like poker and Risk).
When it runs out the server finishes the step: in setup a random legal settlement or road; the
roll; random discards for everyone still to discard; a random robber tile and victim; road
building ends; in `main` or a paired phase the turn ends (open offers clear). `bot.ts` provides
these moves.

**`waitingOn`:** the player placing in setup; the player whose turn it is (and the paired
player during their phase); during `discard`, everyone still to discard.

**Results.** `winners` = the winner. `standings`: win for the winner, loss for everyone else, no
team or role. `highlights`: "Longest road" (the longest road length at the end, by its holder)
and "Biggest haul" (most cards one player took from one roll). `reveal` carries the final board
and each player's point breakdown and VP cards. `announce`: the first player, Longest Road and
Largest Army changing hands, monopolies, and the win.

## Hidden information

Private (only `getPlayerView` for that player): their resource cards, their development cards
(including VP cards) and which can be played now, and the resource in a robbery they took part
in. Never sent to anyone: the development deck's order.

`getTableView` is public: the board, buildings and roads, the robber, the bank's counts, the
dice, what each player took from the last roll, each player's resource card count and
development card count, knights played, longest road length, the two awards, visible points
(without VP cards), the phase and whose turn, who still has to discard and how many, open offers
and their answers, the last robbery (who robbed whom, not what), year of plenty and monopoly
results, the deadline, and a short log. VP cards and the full breakdown appear only once the
game is over.

The leak test plays random whole games (3–6 players, every board option) and at every step
checks that the table view and every other player's view are unchanged when everyone else's
secrets (hands, development cards, deck order) are scrambled.

## Screens

**Phone** (`GameUi.fit`, never scrolls), as mocked up:

- Top strip: whose turn and the step, the two dice (cream and gules), the clock.
- Opponents' chips: token in their seat colour ring, name, card count, development card count,
  award marks, points.
- The board fills the width (the classic island never needs zoom). Only legal spots are drawn
  and tappable when placing; a tap puts a ghost piece on the nearest legal spot (within 28px) and
  "Build here" confirms. Producing tiles light up when the dice land.
- Your hand: five resource cards with counts. "You got …" rises over it after a roll.
- Dock: Build (a tray of the four costs, each greyed with what's missing), Trade (the offer
  sheet: you give / you want, to everyone or a player, live answers, pick a partner; bank row
  with your ratios), Cards (your development cards, play buttons, why one can't be played), End.
- Sheets: discard (tap cards down to the number), robber (tap a tile, then a victim), year of
  plenty and monopoly pickers, an incoming offer card (Accept / Counter / Decline).
- Other players' turns: the board, the dice, offers to you, and Propose a trade.
- On a laptop the board grows and the hand and dock sit beside it (container queries, like
  poker).

**Moments** (`VerdictMoment`, keyed with `useMoment` on public counters, worked out in
`moments.ts` from the table view only): being robbed (loss: "Rook took a card") and robbing
(win), taking or losing Longest Road or Largest Army. Rolls get the "You got" ribbon, not a
verdict. The TV shows robberies and award changes as `reveal` at `size="tv"`.

**TV:** the board large on the left; on the right the title and round, whose turn with the dice,
every player (token, name, cards, knights, road, award plaques, points), and the latest roll
with who got what plus a short log. Card backs fly from each paying tile to its owners
(reduced motion: no flight). Built to STYLE_GUIDE.md "TV sizes" (stage units, nothing under 24px,
checked at 1920×1080, 1440×900, 960×540).

**Lobby:** Jackdaw's lobby with Catan's `LobbySeats`: "Bound for Catan", the island faint in the
middle (the classic one up to 4 seated, the big one from 5), each player a ship at a harbour with
the sail in their seat colour and their crest on it, open moorings for empty seats. `TvLobby`:
the island large with the ships round it, how to join beside it. Seats behave like the track's
(tap your own, host taps others, reactions, away).

**Results:** `Reveal`: the final board and a table of each player's points (settlements, cities,
Longest Road, Largest Army, VP cards). `TvReveal`: the final board with the scores.

**Look** (`catan.css`, tokens at the top, scoped under `.cn`): the board is printed and looks the
same day and dark (terrain inks, cream number discs with pips, red 6 and 8, a sable robber, wooden
piers with ratio plaques, an engraved sea with shallows); the frame, sheets and text follow
Jackdaw's tokens. Engraved motifs are small SVG patterns (pines, grass and sheep, wheat rows,
brick courses, crags, dunes). Glyphs for lumber, brick, wool, grain, ore and the development
cards are original line art.

## Options

```ts
z.object({
  board: z.enum(['Balanced', 'Random', 'Beginner']).describe('Board'),
  points: z.enum(['10', '8', '12']).describe('Points to win'),
  robber: z.enum(['Standard', 'Friendly']).describe('Robber'),
  turnTimer: z.enum(['Off', '1 minute', '2 minutes', '3 minutes']).describe('Turn timer'),
});
```

Defaults: Balanced, 10, Standard, Off. Friendly robber (Traders & Barbarians variant): the robber
may not go on a tile touching a player with 2 or fewer visible points; if no tile is allowed, it
goes to the desert.

## Testing

Written test-first (Vitest):

- geometry: 19/54/72 and 30/80/109, neighbours symmetric, harbour slots on the coast
- generation: component counts, the spiral, no touching reds, Beginner fixed, seeds repeatable
- setup: snake order, distance rule, road touching, starting cards
- production, the short bank, the robber's tile
- the whole 7: who discards how many, the robber must move, robbing, nobody to rob
- building: costs, connection, blocked roads, piece limits, city returning a settlement
- every development card, one per turn, not the turn bought, knight before the roll
- longest road: forks, loops, broken by a settlement, ties, set aside and back
- largest army, winning only on your turn, a win counted at the start of your turn
- paired turns: who's paired, what they can and can't do, both reaching the target
- trading: every refused shape, counters, proposals, hands re-checked, bank ratios
- the timer from every step; `waitingOn`
- fuzz: random whole games (3–6, every board) keep every card and piece accounted for, finish or
  run long without error, with the leak check at every step
- e2e (`apps/web/e2e/catan.spec.ts`): three phones play the opening and a first turn, a trade is
  offered and answered, the TV shows the change; no sideways scroll at 375/768/1280/1920, day and
  dark.

## Out of scope

Seafarers, Cities & Knights and other expansions, the official 2-player variant, house-rule
discard limits, and bots for missing players. Each could come later.
