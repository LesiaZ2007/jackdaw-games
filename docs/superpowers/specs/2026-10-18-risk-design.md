# Risk: design

Date: 2026-10-18. Asked for by Lesia ("Let's add Risk"). Branch `feat/risk`.

## Intent

Risk joins the lobby as a turn-based board game that friends play on their phones, with the TV
showing the whole map. A Jackdaw night runs several games in a row, so Risk has a **short mode
(secret missions, about 45–60 min) as the default** and **classic world domination** as an option.
Lesia chose (2026-10-18):

- Length: an option for classic and short. Short = secret missions.
- Map: both the classic world map and an original medieval realm, as an option.
- Attacks: Roll (one exchange) or Blitz (fight it out); both sides always roll the most dice allowed.
- Sections approved: rules, maps, screens and testing.

It fits the existing contract unchanged: no change to `GameModule`, the lobby state machine or the
protocol. Poker is the template (package layout, server turn timer, tests, registration).

## Package

`packages/games/risk` (`@jackdaw/game-risk`), laid out like poker:

```
src/meta.ts           GameMeta: id 'risk', 2–6 players, category 'board', minutes [45, 180], complexity 2
src/maps/types.ts     MapDef types
src/maps/world.ts     classic world (generated outlines + hand-checked graph)
src/maps/realm.ts     original realm
src/maps/index.ts     MAPS by id
src/cards.ts          deck, set checks, trade values
src/missions.ts       mission deck, checks, fallback
src/rules.ts          the GameModule
src/*.test.ts         rules, maps, missions, leak + fuzz
src/ui/               index.tsx, player.tsx, tv.tsx, map.tsx (SVG + pan/zoom), dock.tsx, reveal.tsx, risk.css
scripts/build-map.mjs dev-only outline generator (d3-delaunay + polygon-clipping as devDependencies)
```

Registered in `apps/web/lib/registry.ts`, `apps/web/lib/catalog.ts` (`gameUis`),
`apps/web/next.config.ts` (`transpilePackages`) and `apps/web/package.json`. The root Vitest glob
picks up its `vitest.config.ts`.

## Maps

```ts
interface MapDef {
  id: 'world' | 'realm';
  name: string;
  viewBox: [w: number, h: number];
  continents: { id: string; name: string; bonus: number; tint: Heraldic }[];
  territories: {
    id: string;
    name: string;
    continent: string;
    path: string;
    label: [x: number, y: number];
    adj: string[];
  }[];
  lanes: [string, string][]; // sea crossings drawn as dashed lines (also in adj)
  missionPairs: [string, string, 'any'?][]; // continent goals for this map's missions
  sea?: string; // decorative coast/hatching path data
}
```

- **World:** the classic 42 territories, 6 continents, standard bonuses (Asia 7, North America 5,
  Europe 5, Africa 3, South America 2, Australia 2) and the classic neighbour list. Outlines are
  stylised, engraved-print shapes, not accurate cartography. Mission pairs: N. America + Africa,
  N. America + Australia, Asia + S. America, Asia + Africa, Europe + S. America + any third,
  Europe + Australia + any third.
- **Realm:** an invented island kingdom, 42 provinces in 6 regions with original names, bonuses
  balanced to roughly the same spread (7/5/5/3/2/2), with its own six mission pairs.
- **Outlines:** `scripts/build-map.mjs` takes hand-authored coast polygons plus one seed point per
  territory, cuts each landmass into Voronoi cells clipped to the coast (single-territory islands
  are their own polygon), so borders are shared exactly. It prints suggested neighbours from
  shared edges; the committed `adj` is checked by hand against the classic list (World) or the
  drawing (Realm). Output is static TS data; nothing extra ships.
- **Map tests:** 42 territories; adjacency symmetric; graph connected; every territory has a known
  continent, an outline and a label; continent bonuses positive; mission pairs name real continents.

## Rules

**Seating.** Seat order is `playerIds`; the first player is drawn with `Rng`. With 2 players a
passive **neutral** (`'neutral'`, not a player) holds a third of the territories: it never acts,
can be attacked, isn't counted for elimination or missions, and its armies are spread at setup.

**Setup.** Territories are dealt at random (evenly; any remainder goes in seat order). Starting
armies per player: 2p 40 (neutral 40 too), 3p 35, 4p 30, 5p 25, 6p 20; every territory starts
with 1.

- **Quick** (default): the remaining armies are spread at random over each player's territories.
- **Draft:** everyone places their remaining armies **at the same time** on their phone
  (`draft { placements }`); placements stay private until everyone is done, then appear together.

**A turn** (phases `reinforce` → `attack` (`occupy` after a conquest) → `fortify`):

1. **Reinforce.** `max(3, floor(territories / 3))` + bonuses of continents held fully + card sets.
   With 5 or more cards you must trade before placing. `trade { cards }` adds the set's value, plus
   2 armies placed straight on a traded card's territory if you own it (once per trade).
   `reinforce { placements }` places exactly all armies left (staged on the phone with Undo,
   sent as one move).
2. **Attack**, any number of times. `attack { from, to, mode }`: `from` is yours with 2+ armies,
   `to` an enemy (or neutral) neighbour. The attacker rolls `min(3, armies − 1)` dice, the defender
   `min(2, armies)`; highest pairs compare, the defender wins ties. `roll` = one exchange;
   `blitz` = repeat until `to` is taken or `from` is down to 1. On a conquest the phase becomes
   `occupy { from, to, min: dice rolled last, max: armies − 1 }` and `occupy { n }` moves them in.
   `endAttack` goes to fortify.
3. **Fortify.** `fortify { from, to, n }` once, along a chain of your own territories, leaving at
   least 1 behind; or `endTurn`. Either ends the turn.

**Cards.** 42 territory cards (each infantry, cavalry or artillery, assigned evenly in map order)
plus 2 wilds, shuffled with `Rng`. Conquering at least one territory in a turn draws one card at
the end of the turn. A valid set is three alike, one of each, or any two plus a wild.

- **Rising** (default): 4, 6, 8, 10, 12, 15, then +5 for each set, counted across the whole game.
- **Fixed:** three infantry 4, three cavalry 6, three artillery 8, one of each 10.
- Traded cards go to a discard pile, which is reshuffled when the deck runs out.

**Elimination.** Taking someone's last territory eliminates them; the attacker takes their cards.
If that leaves them with 6 or more, they must trade at once down to 4 or fewer and place those
armies (phase `reinforce` with `returnTo: 'attack'`) before attacking again.

**Goals.**

- **Secret missions** (default). Each player is dealt one mission from the map's six continent
  pairs plus "Hold 24 territories", "Hold 18 territories with at least 2 armies on each", and
  "Destroy the <colour> army" for each other player. "Destroy" missions are left out at 2 players.
  If your target is eliminated by someone else, or the target is you, your mission becomes
  "Hold 24 territories". The mover's mission is checked after every move they make; the first to
  complete theirs wins at once.
- **World domination:** the last player with territories wins (the neutral doesn't count).

**Turn timer** (Off, 1, 2 or 3 minutes per turn, via `nextTimer`/`onTimer` like poker). When it
runs out: a forced trade is made with the best set, remaining reinforcements are spread at random,
an `occupy` moves the minimum, and the turn ends (no card unless one was earned). In a Draft, the
timer covers the draft and spreads any unplaced armies at random.

**`waitingOn`:** the player whose turn it is, or everyone not yet done during a Draft.

**Results.** `winners` = the winner. `standings`: win for the winner, loss for everyone else, with
`role` set to each player's mission text (missions mode) and `team` unset. `highlights`:
"Bloodiest battle" (most armies lost on both sides in one battle, i.e. one `from`→`to` attack run)
and "Greatest conquest" (most territories taken in one turn). `announce` lines: eliminations,
continents taken, and the win.

## Hidden information

Private: each player's hand and mission, and their unrevealed Draft placements; the deck order.
`getTableView` carries only public data: map id, owners, armies, seat order, phase, turn, armies
left to place, each player's **card count**, the next set value, the last battle (dice, losses,
conquered), the pending `occupy`, who has finished drafting, eliminations, the turn deadline, and
a short log. Missions appear in the table view only when the game is over. The leak test plays
random whole games (both goals, both maps, 2–6 players, Draft and Quick) and checks every table
view and every other player's view at every step for hands, missions, drafts and the deck.

## Screens

**Phone** (`GameUi.fit`: fills the height under the bar, never scrolls):

- The map fills the screen: an SVG with pinch, drag and wheel zoom (pointer events, own small
  component; no zoom animations under `prefers-reduced-motion`) and a "whole map" button. Each
  territory carries a roundel in its owner's colour with the army count; continent washes in
  heraldic tints; names in condensed caps when zoomed in enough to read.
- A top strip shows whose turn it is, the phase and the countdown (`useCountdown`).
- A bottom dock, by phase: **Reinforce** (armies left, tap a territory to add one, Undo, Done;
  Trade opens the cards sheet), **Attack** (tap your territory, enemy neighbours light up, tap
  one, then Roll / Blitz; End attack), **Occupy** (stepper, Move), **Fortify** (from, to,
  stepper, Move or Skip), **Draft** (like Reinforce, then Done; shows who's still placing).
- A cards sheet (kit `Sheet`) with sets you can trade highlighted; a sealed mission card to
  tap and read. On a laptop the dock sits beside the map (container queries, like poker).
- Players waiting for their turn see the map, the last dice and whose turn it is.

**Results you can feel.** When an attack resolves (the territory is taken, or the attacker can't
go on from there), the attacker and the defender get a `VerdictMoment` (vert "Taken" / gules
"Repelled" for the attacker, the reverse for the defender), keyed with `useMoment(battleSeq)`.
Single rolls that don't resolve show their dice and an `OutcomeChip` in the dice strip. Being
eliminated gives that player a loss moment. The TV shows the dice strip and each resolved battle
as an azure `reveal` at `size="tv"`.

**TV:** the whole map, a seat track with armies, territories and cards per player, the last
battle's dice, and who holds each continent.

**Lobby:** Jackdaw's own lobby (options from the schema). **Results:** `Reveal` lists every
player's mission (completed or not) and shows the final map; `TvReveal` shows the final map.

**Look:** cream card stock, charcoal ink coasts, an engraved hatched sea, double-ruled frame,
heraldic continent washes; dark mode from the shell's dark tokens. Only token colours; checked at
375, 768, 1280 and 1920px in day and dark; tap targets at least 44px (territories are tapped
through their roundel as well as their shape, and the zoom helps on small islands).

**Catalog:** category `board`, art `{ band: 'tenne', field: 'checky', glyph: 'banners' }` with a
new crossed-banners glyph in `packages/ui/src/icons.tsx`; about text, steps, and the credit
"Based on Risk by Albert Lamorisse." Name shown: "Risk" (private play; rename if ever public, as
BUILD_PLAN.md notes for trademarked titles).

## Options

```ts
z.object({
  map: z.enum(['World', 'Realm']).describe('Map'),
  goal: z.enum(['Secret missions', 'World domination']).describe('Goal'),
  setup: z.enum(['Quick', 'Draft']).describe('Setup'),
  cardSets: z.enum(['Rising', 'Fixed']).describe('Card sets'),
  turnTimer: z.enum(['Off', '1 minute', '2 minutes', '3 minutes']).describe('Turn timer'),
});
```

Defaults: World, Secret missions, Quick, Rising, Off.

## Testing

Written test-first (Vitest):

- reinforcement maths, including continents and the minimum of 3
- seeded combat (dice counts, ties to the defender), blitz stopping rules, occupy limits
- card sets (rising and fixed), wild cards, the forced trade at 5, the +2 territory bonus
- elimination passing cards on, and the trade-down at 6
- every mission kind, the fallback to 24, no destroy missions at 2 players
- the 2-player neutral; Draft placements hidden until everyone is done
- the timer for each phase; `waitingOn`
- map validity for both maps
- random whole-game fuzz (armies never below 1, every territory owned, games finish) with the
  leak check at every step
- e2e (`apps/web/e2e/risk.spec.ts`): two phones start a game, play a full turn (reinforce, roll,
  fortify), and the TV shows the change; no sideways scroll at the four widths in day and dark.

## Out of scope

Capitals, alliances, fog of war, a third map, and a themed lobby. Each is easy to add later.
