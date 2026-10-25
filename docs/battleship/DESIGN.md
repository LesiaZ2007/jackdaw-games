# Battleship: design

2026-10-25. Classic Battleship for exactly two players, including a person against a bot.
The name stays Battleship, with a credit to Hasbro and Milton Bradley on the detail page.
It uses Jackdaw's lobby.

## How it plays

Each player hides a fleet on a 10×10 chart the other cannot see. Columns are A–J, rows
1–10, and a cell is `row * 10 + column` (A1 is 0). The fleet is the classic one:

| Ship       | Squares |
| ---------- | ------- |
| Carrier    | 5       |
| Battleship | 4       |
| Cruiser    | 3       |
| Submarine  | 3       |
| Destroyer  | 2       |

Ships lie horizontal or vertical. They may touch, including along an edge, and they may
not overlap or leave the chart. Both fleets are placed in secret. When the second fleet
locks, one player is drawn to fire first.

In One shot, a hit earns another shot. That includes a hit which sinks a ship while any
of the fleet remains. A miss ends the turn. The shot that sinks the last ship ends the
battle, and does not offer another shot. Salvo stays one volley per turn: every square
resolves, then the other player fires, even when the volley was all hits. The bot
follows the same rule, because it is only asked while it is the player to act.

A miss is an ink cross. A hit is a red peg. On your own chart the peg is drawn on top
of that part of the ship. A ship is named and drawn only on the shot that sinks it, and
then every square of it is marked sunk.

## Options (Jackdaw's options panel)

| Key         | Label      | Choices                     | Default  |
| ----------- | ---------- | --------------------------- | -------- |
| `firing`    | Firing     | One shot, Salvo             | One shot |
| `turnTimer` | Turn timer | Off, 30 seconds, 60 seconds | Off      |

One shot fires a single square. A hit lets you fire again. A miss passes the turn.
Sinking the last ship ends the game.

Salvo is the old variant from the same family. On your turn you fire once for each of
**your** ships still afloat (five at the start, one fewer each time one of yours is
sunk). You name the whole volley, then every square resolves, even if the enemy fleet
goes down partway through. The turn passes after the volley, hits or not. A volley
that sinks the last ship ends the battle.

The turn timer is one shared clock. While placing, it is a single deadline from the
start of the game; anyone still laying a fleet has one dealt for them, then firing
begins. During firing it resets each turn. Out of time, a legal shot (or a full salvo)
is fired at random and marked late. `validateOptions` refuses any table that is not
exactly two players.

## Phases

`place` → `fire` → `show` (3.2s, `SHOW_MS`) → `over`.

The show beat keeps the winning volley on the charts long enough for the shot to land
and the last ship to go down. `getResult` stays null until that timer fires, even when
the turn timer option is Off. `waitingOn` is empty during the beat. The timer id is
`show`.

## Hidden information

Hits and misses are public. A sunk ship's name, direction and cells are public.

Any square of a ship that has not been fired at stays off:

- the opponent's `getPlayerView`
- `getTableView` (and therefore the TV)
- the chat

The owner's view is the only place an unsunk fleet is listed (`ships`). The recap may
carry a `secret` such as "Hit the cruiser." for a hit that did not sink anything.
`announce` pushes the public sentence only. When the battle is over, `result.reveal`
holds both fleets; that is the first time the ships that were never sunk are drawn.

Animations use the same public volley and the same wrecks. A chart the other player or
the TV can see is never given an unsunk hull. The leak tests move an unhit ship and
require the table view and the opponent's view to stay identical.

## The bot

`bot` places with `dealFleet` and then aims only from the marks on its own chart
(blank, hit, miss, sunk). It prefers squares beside a hit that has not sunk a ship,
especially the ends of a line, and otherwise searches a checkerboard (`r + c` even),
because the shortest ship is two squares. Below Hard it sometimes guesses. It never
reads the opponent's ships. An all-bot game, including the show timer, is in
`bot.test.ts`.

## Ended early

`partialResult` is null before any shot. After that, the leader is whoever has sunk
more ships, then whoever has more hits. A tie on both is a draw. The highlight
"Sharpest eye" is awarded only once a ship has gone down. On a finished game its value
is `1000` minus the winner's shots, so fewer shots rank higher.

## Screens

A printed chart on pale water. The sea, its ink, and a few engraved wave lines are tokens
on `.bs` (`--bs-sea`, `--bs-ink`, `--bs-wave`), with a darker sea when `useTheme()` is dark.
Each ship has its own broad silhouette, bow to the left or the top, still wide enough to
cover its squares: the carrier's flight deck and island, the battleship's three turret
knuckles, the cruiser's clipper bow and spoon stern, the submarine's round nose and sail,
the destroyer's sharp bow and cut stern. Heraldic fills stay (gules, azure, vert,
purpure, tenné). Your own fleet, the placement ghost, and a sunk ship use these shapes.
A sunk hull tilts a little and turns transparent so the squares show through, still on
the cells it occupies. An unsunk enemy ship is never drawn. The frame, compass, and miss
marks use the sea ink. Jackdaw's bar is left alone. No gradients as decoration, no glows,
no spinning rings, no stained glass.

The tally belongs to the chart on screen. Your fleet says how many of your ships are
still afloat and how many are sunk. Their sea says the same for their fleet. On a laptop
or the TV, each chart carries its own tally. On a phone, switching charts switches the
tally.

Letters A–J and numbers 1–10 sit on the same tracks as the columns and rows. A miss or a
hit is inside the cell. The labels are not buttons, so tapping one does not fire.

A hit part of your own ship smokes, and the red peg sits on that square of the hull. On
their sea, smoke marks the hit cell only, until that ship sinks. After it sinks, the
hull can smoke. Smoke is ink, with no blur.

On a computer, while you are placing, a faded copy of the ship you have picked follows
the mouse and snaps to the squares it would occupy. Same shape, length, and fill. A spot
that hangs off the chart or overlaps another ship is drawn as a warning, not as a placed
hull. Touch screens do not show it. The preview lives only on your own chart. It is not
part of either player's view, the table view, or the TV.

- **Phone (`fit`):** one chart at a time, Your fleet or Their sea. From 740px of the
  game container both charts sit side by side and the switch hides. While placing, the
  dock is the five ships (at least 44px) and Horizontal / Vertical. A tap lays the
  selected ship, which drops onto its squares. Fleet ready locks it. One shot fires on
  the tap. Salvo selects squares, then Fire salvo. Grid squares shrink so the 10×10
  chart fits under the bar at 375px; the dock and the chart switch stay at least 44px.
- **A shot:** the peg travels across the chart, then lands in the square. Printed, with
  no glow. A miss lands as an ink cross. A hit lands as a red peg. On your fleet that peg
  is drawn on the ship. A ship that just sank is drawn across its squares, then tilts and
  turns transparent, still on those squares. A salvo staggers the pegs. The flight is only
  the mark, never an unsunk enemy hull. `prefers-reduced-motion` snaps to the landed mark.
- **VerdictMoment** still fires for a result the player can feel: you hit (reveal),
  you sank a ship (win), they hit you or sank one of yours (loss), and the final
  result. A miss does not raise one. The seal waits until the peg has landed.
- **TV:** both seas, shots and sunk ships only, read from the sofa. The last volley is
  stamped large over the chart it landed on (Miss in ink, Hit in gules, Sunk in vert),
  and a ship that went down tilts on its squares and lets the chart show through. Nothing on the stage is under
  24px. No bare `vh` or `vw`. `VerdictMoment` at TV size for a hit or a sink.
- **Results:** both fleets, now public, under the verdict.

Entrances use `--ease-out` (`cubic-bezier(.22, 1, .36, 1)`), between 640ms and 900ms.
`prefers-reduced-motion: reduce` drops every animation for the settled state.

## Testing

- Rules: touching ships, overlap, off the chart, both must lock, the first shot is
  drawn, a second placement is refused, a hit keeps the turn and leaves the rest of
  the ship blank, a miss passes, a sink that is not the last ship keeps the turn and
  reveals the wreck, the shot that sinks the last ship ends the battle with no extra
  shot, repeat and out-of-turn shots, the show beat then the result and highlight,
  salvo size after you lose a ship, an all-hit salvo still passes, the place timer
  and a timed shot that follows the same hit rule.
- Hidden information: moving an unhit destroyer does not change the table or the
  other player; chat does not name a ship until it sinks; the recap secret is not in
  the views; eight random games, including secret moves.
- Bot: all-bot games for one shot and salvo, with and without the timer, a check that
  the bot aims from its own chart, and that it is asked again after its own hit and
  not after its miss.
