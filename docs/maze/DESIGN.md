# Pac Man: design

2026-11-14: a multiplayer take on the classic arcade maze game, with "a similar look/feel" and
aesthetic. The game takes the genre (a maze, pellets, chasers, power pellets that flip the
chase, bonus fruit, arcade sound and scoring) and builds it in its own name, characters, mazes
and art. The artwork does not use the yellow wedge hero, the four
named ghosts, their colors as a set, or the original maze layouts. The game's display name is
**Pac Man** (2026-11-15); the internal `maze` ID remains stable for existing rooms and assets.

A throwaway playable demo was signed off before the build (2026-11-14: "honestly, yeah it's
playable. And the printed looks great!"). It is the reference for feel, animation and layout.

## Why, and what success looks like

A party game for the Jackdaw room: people on their phones, the TV showing the action, everyone
shouting when someone jinxes the leader. Success is that it feels like the arcade game (tight
controls, the chomp, the panic when the power wears off), looks like it belongs in Jackdaw, and
that every mode runs well over Jackdaw's existing polling with as few requests as possible.

- **Goals:** three modes (Solo, Shared maze, Race), four looks (Printed by default, Neon,
  Classic, Cabinet), classic or mixed power-ups in every mode, bots, the TV view, lots of
  animation.
- **Non-goals:** a real-time transport (tabled for later, see "Later"), contact between
  chompers, online leaderboards, a maze editor.
- **Anti-goals:** controls that feel mushy or lag on your own chomper; other players that jump
  around or are hard to tell apart; small, cramped screens; anything that reads as a copy of the
  original game.

## Modes

The host picks the mode in the lobby options. 1 player for Solo, 2–8 for Shared maze and Race.

- **Solo.** One chomper against four ghosts. The host picks how many mazes, 1–5 (default 3).
  Clearing a maze flashes it, throws confetti and moves on after a countdown; later mazes are
  harder (faster ghosts, shorter power-ups). Three lives; the round ends when the last maze is
  cleared or the lives run out.
- **Shared maze.** Everyone in one maze, racing for the same pellets. **Chompers never touch:
  they pass through each other** (the demo showed contact can't work over polling: "REALLY awful
  at 0.8s, the chompers teleport all the time... collisions don't do anything"). Players affect
  each other through power-ups instead (below). Ghosts are shared; being caught costs 200 and
  sends you back to your start corner after a short death animation. Highest score wins; the
  platform's running tally carries across rounds.
  - **Several mazes.** 2026-11-15: "shared should also have a several maze option". The host's
    **Number of mazes** (1–5, default 3) counts here too. When every pellet of the maze is owned,
    everyone gets the countdown together and moves on to the next maze, each to their own corner.
    The maze starts over: pellet owners, power spots, ghost aims, bases and events, and the
    fruit count; the ghosts get the maze's own seed and the next maze's level, as in Solo. Scores
    carry on. The round ends after the last maze or when the timer runs out (host option, 2–4
    minutes), and the highest total wins. Phones and the TV build the new maze afresh (board,
    ghosts, checkpoints, where others are drawn from), and a late report for the old maze is
    ignored. The score cards show "Maze 2/3"; the TV shows it once there is more than one.
- **Race.** Everyone plays their own copy of the same mazes, in the same order, on their own
  phone. The host picks 1–5 mazes (default 3). Clearing a maze gives a bonus and moves you on;
  the first to clear the last maze ends the round and gets a big bonus, but the winner is the
  highest score. The timer is a backstop. Clearing pellets or eating ghosts sends trouble to
  opponents (_what and how much is the builder's call, drawn from the attack power-ups below_).
  The TV shows everyone's maze side by side, with which maze each player is on.

### Maze size

2026-11-14: "select maze size… auto selects when playing with several people but you can change
it". A host option, **Auto** (default), Small (21×20), Medium (27×24) or Large (33×30). Auto picks
Medium for Solo and Race, and for the Shared maze Medium with 2–4 players and Large with 5–8. Each
size has at least four original mazes. The maze always fits the screen whatever its size.

### Random mazes

2026-11-14: "More puzzle maps? Perhaps there's a way to randomize them?" A host option, **Maze
style**: **Mix** (default) alternates a handmade maze and a generated one through the run (starting with
either), Handmade uses only the drawn mazes, Random only generated ones. The state stores each maze
of the run as a handmade index or `{ gen: seed, size }`; every reader resolves it with one
function, `layoutAt`, which caches generated mazes by seed and size. The generator
(`sim/generate.ts`) starts from a lattice of one-tile corridors with random spacing, the house and
a ring round it in the middle, and an optional side tunnel, then fills mirrored corridor pieces at
random to merge blocks into varied shapes, keeping a piece open whenever filling it would leave a
dead end, split the maze or grow a block too big. It uses only `createRng(seed)` and integer
steps, so every device builds the same maze, and every result passes the same checks as the
handmade mazes (`sim/validate.ts`). Generated mazes get a name from their seed, like "Bramble Run
4821".

### Telling who's who (Shared maze)

Your own chomper is full strength, a little larger, with a pulsing ring and a **YOU** tag.
Everyone else is drawn at half opacity with their name above them.

Others are drawn **where they probably are now**, not where they were (the first build replayed
their reported path a moment late, and after the 2026-11-14 playtest they still looked behind).
From their latest report the phone carries them on along the maze, for at most 1.2 s: straight
through corridors (and on through a junction when straight on is open), round a corner when it
is the only way, and holding at a fork, where a left or right guess would be wrong half the
time, and at walls. Chompers never touch, so this needn't be their exact path. When a new report
disagrees, the drawn chomper glides into the new guess within the speed a chomper can run
(never stepping back along its heading); only a respawn or a gap of more than 20 tiles is drawn
at once. The Race minis and the TV use the same prediction.

Pellets follow what is drawn: a pellet goes when someone's drawn chomper passes over it, and
comes back if no report claims it within 2.5 s. One the server says someone took goes once their
drawn chomper reaches it or has settled past it, and after 2.5 s at the latest. If you reach one
first that was already taken, it vanishes quietly and scores nothing.

## Power-ups and fruit

Power pellets come in colors, and the color is the effect:

| Name   | Modes       | Effect                                                                        |
| ------ | ----------- | ----------------------------------------------------------------------------- |
| Hunt   | all         | Ghosts turn edible, for you only. Combo 200, 400, 800, 1600.                  |
| Dash   | all         | Super speed for a few seconds, with an afterimage trail.                      |
| Phase  | all         | Pass through ghosts for a few seconds.                                        |
| Magnet | all         | Pulls nearby pellets in.                                                      |
| Jinx   | multiplayer | Sends an extra ghost after the leader (or second place, if you lead) for 8 s. |
| Freeze | multiplayer | Everyone else crawls for about 2½ s.                                          |
| Steal  | multiplayer | Takes up to 200 (15%) from the leader (or second place).                      |
| Fog    | multiplayer | Everyone else sees only a small circle around their own chomper for 4 s.      |

A big banner tells the target what happened ("FOGGED BY ROOK", "WREN STOLE 120!").

Host options, in every mode: **Classic** (Hunt only) or **Mixed**; in Mixed, each power-up can be
switched on or off (2026-11-14: "make sure you can turn those on/off too"). The switches are one
grid of chips, each in its power's color; the grid hides in Classic, and in Solo the attack
power-ups are greyed out (there is no one to attack). In Mixed, power
pellets come back about 12 s after they're eaten as a random enabled type. Bonus fruit
(cherries, a berry, a lemon; drawn fresh) pops up for points. Exact durations and values are the
builder's call, starting from the demo's.

## Lobby

The lobby is an arcade cabinet's attract mode: a maze in the look the host picked, ghosts chasing
chompers through it, pellets eaten and a power spot turning the ghosts blue now and then. It is a
small scripted loop (not the real simulation), the same for a seed, and a still frame when the
device asks for less motion. Switching the look restyles it at once. Beneath it the players are
lined up like a high-score table, each a chomper in their seat color with their name; computer
players are tagged CPU, and a newcomer chomps in from the side. The host starts with a big
**READY?** button; everyone else sees who they are waiting for. The TV's lobby is the same maze
filling the screen, with the room code and the lineup beside it.

Options sit below in the shell's sheet: choices as rows of buttons, the power-ups as their grid.
**Minutes** shows only where there is a bell (not Solo). Once a computer player is seated, the
host picks how bots play, Easy, Normal or Hard (everyone else just reads it): harder bots steer
away from ghosts sooner, avoid pockets the ghosts can close, and slip less.

## Look

Four looks, picked by the host; **Printed is the default** (2026-11-14: neon shouldn't be the
default "because of the theming"). All share the same proportions: a 27×24 maze that fills the
screen, thin walls, chompers and ghosts about 1.5 corridor tiles wide. Chompers are round with a
mouth and an eye and **stay upright** (facing left mirrors rather than flipping upside down);
chasers are little ghosts (rounded top, scalloped hem, eyes), drawn fresh.

- **Printed:** ink on cream paper like a puzzle-book page (as Zap does): soft wall fill with an
  inked rule, ink pellets, a gold ghost door, players in heraldic colors (gules, azure, vert, or)
  with ink outlines, ghosts in tenné, purpure, sable and teal. No glow.
- **Neon:** glowing magenta outline walls on deep purple, faint scanlines, glowing outlined
  chompers and ghosts.
- **Classic:** fine pixel art: solid blue block walls with a bright rim, pixel sprites.
- **Cabinet:** a wooden arcade machine: lit marquee, walnut and gold walls, a dim green screen.

Everything around the maze is Jackdaw: the shell's fonts (Grenze Gotisch titles, Big Shoulders
labels and buttons, Alegreya Sans text), its plaque buttons, score cards on paper with a bump
when the score changes and a power-up timer bar, the footprint table. End screens are lid panels
with corner ornaments, a big score that counts up, rankings that rise in, and confetti.

Animation (the demo is the reference): a 3-2-1-GO countdown, springy score pop-ups, bursts on
power-ups and ghosts, the death animation with a screen shake, the maze flashing on clear, eyes
floating home, Dash trails, Phase shimmer, Magnet pellets flying in, fog and frost overlays.
Chiptune sound effects.

Controls: swipe on a phone, arrow keys or WASD on a keyboard; a turn can be queued before the
junction. The maze always fits below the score cards and resizes with its container.

## Approaches considered

1. **Phones run the game; the server keeps score and settles what matters (chosen).** Each phone
   simulates its own chomper with no input lag and reports in cumulative, idempotent ticks, as
   Tetra does.
2. **A live real-time service** for a contact-based shared maze. The only way chomping each
   other feels right, but new infrastructure and against the kickoff decision to stay on Vercel.
   Tabled for later (2026-11-14: "we can table 2 for later").
3. **The TV runs the shared maze and phones are controllers.** Every swipe would wait a round
   trip; worse than seeing others late.

The demo tested approach 1 with contact (unplayable at any poll rate) and without contact
(playable at 0.8 s). Hence: no contact, power-ups for interaction.

## Constraints

- Rooms sync by HTTP polling over Vercel and Upstash. The live poll (`GameUi.livePollMs`,
  `PollingTransport.setLivePoll`, floored at 600 ms) exists on the unmerged Tetra branch.
  **No lower floor is needed**: the Shared maze was signed off at 0.8 s.
- Same game contract as every other game: rules, bot, phone/TV/results screens, recap, catalog
  entry and pictures, tests, end-to-end test.

## Keep requests low

Every request is a Vercel call and Redis commands on free plans that all games share
(2026-11-14: "minimize this as much as possible for ANY game, especially this game and later
tetra").

- **Live polling only in Shared-maze rounds**, at the 600 ms floor (800 ms until the 2026-11-14
  playtest).
  Solo needs no server mid-round: it reports once per maze cleared and at the end, and polls only
  every 7.5 s while a maze is played (for presence and the host's buttons). Race uses the
  normal pace plus a report when an attack needs routing. Lobby, countdown and results use the
  normal pace.
- **Reports ride on polls.** A report is a send whose reply is the fresh snapshot (the
  transport already treats that reply as the next poll). Report only when something changed (a
  turn, a pellet batch, a power-up, a catch); a chomper going straight has nothing to say.
- **Small, cheap requests.** One or two Redis commands each; "unchanged" replies stay tiny.
  Ghost aim beats and attack deliveries ride on replies that go out anyway.
- **Back off when hidden** and stop live polling the moment a round ends.
- **Count it.** The builder measures requests per player per minute for each mode in the
  end-to-end run and notes the numbers here.

Measured on a Vercel preview, one human steering for 60 s of live play (all `/api/` requests from
that browser, counting the platform's own normal-pace snapshot polling):

- **Solo:** about 23 requests per minute. This is above the 10 per minute target: the platform's
  normal-pace poll keeps running during a Solo round, and the game adds almost nothing on top.
- **Shared** (with three computer players): about 115 requests per minute. This is above the 90 per
  minute target (live polling at about 800 ms plus reports).
- **Race** (with one computer player): about 80 requests per minute at the normal pace plus
  reports.

The end-to-end test (`apps/web/e2e/maze.spec.ts`) prints the same counts for each mode on every run.

## Sync decisions (builder's calls)

- **Ghosts in the Shared maze.** Ghost movement is a pure function of the seed, the round clock
  and an **aim list**: at fixed beats (about every 2 s) the server records each chomper's last
  reported tile, and ghosts steer toward those tiles until the next beat. Every phone gets the
  same aim list, so every phone computes the same ghosts; a phone that receives a beat late
  re-simulates from that beat. The round clock is the server's start time plus each phone's
  measured clock offset. Jinx ghosts are added to the aim list with their target. In Solo and
  Race, ghosts chase that phone's own chomper directly.
- **Authority.** A phone decides its own catches by ghosts, its pellets in Solo and Race, and its
  power-up pickups. In the Shared maze, contested pellets and power pellets go to whichever
  report reached the server first; the loser's phone takes the points back quietly. Attack
  effects (Jinx, Freeze, Steal, Fog) are applied by the server and delivered on each target's
  next reply. Phones are trusted: no anti-cheat.
- **Platform change.** Cherry-pick the live-poll change from the Tetra branch into this game's
  branch (only `GameUi.livePollMs` and `PollingTransport.setLivePoll`, with tests); don't wait
  for Tetra.
- **Race.** Attacks go through the server and apply on the receiving phone at its next reply.
  Finishes are ordered by the finish time each phone reports on the round clock.
- **Bots.** The host adds bots the way other Jackdaw games do ("Add a computer player"). Bots
  run on the server through the game's `bot()`, as Tetra's do: each bot move advances that bot's
  chomper from its last report to `now` with the shared simulation and returns a normal report
  (with its path, so it glides like a person). To keep server writes low, bots report about every
  900 ms in play. In the Shared maze a bot restores the server's ghost base just as a phone does,
  so its ghosts are everyone's.
- **Rate limits.** The server allows 30 sends and 40 polls per 10 s per phone, so a phone reports
  at most every 450 ms and live-polls no faster than 600 ms.

## Later

- A live real-time connection would allow a contact mode in the shared maze (eat other
  chompers, bump penalties: "any collision should take off the same amount") and would help
  Tetra too. Tabled 2026-11-14.

## Reference

- `docs/maze/looks.html`: the first mockup of the looks (Neon, Classic, Cabinet), power-up
  colors and fruit. Printed came later and is in the demo.
- `docs/maze/demo.html`: the signed-off throwaway demo (Solo and Shared maze with bots, Printed
  and Neon, all power-ups, the lag switch). Reference for feel, animation and layout; not code
  to reuse as is.

## Left to the builder

Maze layouts (original, several, phone-friendly), point values, timings, Race attacks, sound,
ghost personalities (our own), how bots play, the TV layouts, and the exact reconciliation rules
for contested pellets.
