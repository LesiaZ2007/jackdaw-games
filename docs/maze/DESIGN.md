# Maze chase: design

2026-11-14: "multiplayer pac-man in jackdaw games", with "a similar look/feel to pac man and
aesthetic". The game takes the genre (a maze, pellets, chasers, power pellets that flip the
chase, bonus fruit, arcade sound and scoring) and builds it in its own name, characters, mazes
and art. Nothing is taken from the original: not the name, the yellow wedge hero, the four
named ghosts, their colors as a set, or the original maze layouts. The game's name is still
open (working name: _Maze_).

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
  sends you back to your start corner after a short death animation. The round ends when the
  last pellet is eaten or the timer runs out (host option, about 2½–3 minutes). Highest score
  wins; the platform's running tally carries across rounds.
- **Race.** Everyone plays their own copy of the same mazes, in the same order, on their own
  phone. The host picks 1–5 mazes (default 3). Clearing a maze gives a bonus and moves you on;
  the first to clear the last maze ends the round and gets a big bonus, but the winner is the
  highest score. The timer is a backstop. Clearing pellets or eating ghosts sends trouble to
  opponents (_what and how much is the builder's call, drawn from the attack power-ups below_).
  The TV shows everyone's maze side by side, with which maze each player is on.

### Telling who's who (Shared maze)

Your own chomper is full strength, a little larger, with a pulsing ring and a **YOU** tag.
Everyone else is drawn at half opacity with their name above them. Other chompers are shown a
moment behind real time along their **exact reported path** (each report carries the turns since
the last one), so they glide smoothly and never jump. Pellets someone else took disappear when
their chomper is seen reaching them; if you reach one first that was already taken, it vanishes
quietly and scores nothing.

## Power-ups and fruit

Power pellets come in colors, and the color is the effect:

| Name   | Modes        | Effect                                                         |
| ------ | ------------ | -------------------------------------------------------------- |
| Hunt   | all          | Ghosts turn edible, for you only. Combo 200, 400, 800, 1600.   |
| Dash   | all          | Super speed for a few seconds, with an afterimage trail.       |
| Phase  | all          | Pass through ghosts for a few seconds.                         |
| Magnet | all          | Pulls nearby pellets in.                                       |
| Jinx   | multiplayer  | Sends an extra ghost after the leader (or second place, if you lead) for 8 s. |
| Freeze | multiplayer  | Everyone else crawls for about 2½ s.                           |
| Steal  | multiplayer  | Takes up to 200 (15%) from the leader (or second place).       |
| Fog    | multiplayer  | Everyone else sees only a small circle around their own chomper for 4 s. |

A big banner tells the target what happened ("FOGGED BY ROOK", "WREN STOLE 120!").

Host options, in every mode: **Classic** (Hunt only) or **Mixed**; in Mixed, each power-up can be
switched on or off (2026-11-14: "make sure you can turn those on/off too"). In Mixed, power
pellets come back about 12 s after they're eaten as a random enabled type. Bonus fruit
(cherries, a berry, a lemon; drawn fresh) pops up for points. Exact durations and values are the
builder's call, starting from the demo's.

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
(2026-11-14: "minimize this as much as possible for ANY game, especially pacman and later
tetra").

- **Live polling only in Shared-maze rounds**, at the existing floor or slower (about 800 ms).
  Solo needs no server mid-round: it reports once per maze cleared and at the end. Race uses the
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
- **Bots.** The host adds bots the way other Jackdaw games do. A bot's simulation runs on the
  host's phone, which reports for it; if the host drops, bots pause until the host rejoins.

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
