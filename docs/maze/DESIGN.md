# Maze chase: design

2026-11-14: "multiplayer pac-man in jackdaw games", with "a similar look/feel to pac man and
aesthetic". The game takes the genre (a maze, pellets, chasers, power pellets that flip the
chase, bonus fruit, arcade sound and scoring) and builds it in its own name, characters, mazes
and art. Nothing is taken from the original: not the name, the yellow wedge hero, the four
named ghosts, their colors as a set, or the original maze layouts. The game's name is still
open (working name: _Maze_).

A playable demo is signed off before the real build starts (2026-11-14: "before you start
really cooking you give me a short demo I can sign off on").

## Why, and what success looks like

A loud party game for the Jackdaw room: people on their phones, the TV showing the action,
everyone shouting when someone chomps the leader. Success is that it feels like the arcade
game (tight controls, the chomp, the panic when the power wears off) and that the shared maze
is fun even though it runs over Jackdaw's polling.

- **Goals:** three modes (Solo, Shared maze, Race), three looks (Neon by default, Classic,
  Cabinet), classic or mixed power-ups in every mode, bots, the TV view.
- **Non-goals:** a real-time transport, online leaderboards, a maze editor.
- **Anti-goals:** controls that feel mushy or lag on your own chomper; a shared maze where
  catches feel random; anything that reads as a copy of the original game.

## Modes

The host picks the mode in the lobby options. 1 player for Solo, 2–8 for Shared maze and Race.

- **Solo.** One chomper against the ghosts. The host (the only player) picks how many mazes,
  1–5 (default 3). Clearing a maze moves straight on to the next; later mazes are harder. The
  round ends when the last maze is cleared or the chomper is out of lives. _Lives (3) and an
  extra life at a score threshold are the builder's call, arcade-style._
- **Shared maze.** Everyone in one maze, each chomper in its own color (taken from the
  player's crest colors where it can). Computer ghosts roam. Pellets are shared, so every one
  someone else eats is one you can't. The round ends when the last pellet is eaten or the timer
  runs out (host option, about 3 minutes). Highest score wins; the platform's running tally
  carries across rounds.
- **Race.** Everyone plays their own copy of the same mazes, in the same order, on their own
  phone. The host picks 1–5 mazes (default 3). Clearing a maze gives a bonus and moves you to
  the next; the first player to clear the last maze ends the round and gets a big bonus. The
  winner is the highest score, not necessarily the finisher. The timer is a backstop. Clearing
  pellets or eating ghosts sends trouble to opponents (_what kinds and how much is the builder's
  call: an extra ghost, a short slowdown, a dimmed patch of maze_). The TV shows everyone's maze
  side by side, with which maze each player is on.

Difficulty ramps through a run of mazes the arcade way: ghosts get faster, power pellets wear
off sooner.

## Being caught, and chompers touching (Shared maze)

- A ghost catches a chomper: the chomper loses points and goes back to its start corner after
  a short wait. Nobody is knocked out of a party round.
- One chomper is powered (Hunt) and the other isn't: the powered one eats the other. The eaten
  one loses points and goes back to its corner.
- Neither is powered: **both lose the same amount** and bounce apart (so they don't collide
  every frame). Ramming is fair game; it always costs the rammer exactly what it costs the
  target (2026-11-14: "any collision should take off the same amount").
- Both powered: a plain bounce, no penalty.

## Power-ups and fruit

Power pellets come in colors, and the color is the effect:

| Color  | Name   | Effect                                                   |
| ------ | ------ | -------------------------------------------------------- |
| Cyan   | Hunt   | Ghosts and (Shared maze) other chompers become edible.   |
| Yellow | Dash   | Super speed for a few seconds.                           |
| Green  | Phase  | Pass through ghosts and chompers, no collisions.         |
| Pink   | Magnet | Pulls nearby pellets to you.                             |

A host option in every mode: **Classic** (Hunt only) or **Mixed**, and in Mixed each of the four
effects can be switched on or off. Bonus fruit (cherries, a berry, a lemon; drawn fresh) pops
up mid-maze for points, a race to grab it in the Shared maze. Durations and point values are the
builder's call.

## Look

Three looks, picked by the host; **Neon is the default**. All share the same proportions: a
dense maze with thin walls, and chompers and ghosts about 1.5 corridor tiles wide (close to the
arcade's ratio). Chompers are round with a mouth and an **eye** (keeps them our own); chasers
are little ghosts (rounded top, scalloped hem, white eyes), drawn fresh.

- **Neon:** glowing magenta outline walls on deep purple, a cyan ghost door, faint scanlines,
  outlined glowing chompers and ghosts.
- **Classic:** pixel art at a fine pixel size (half a unit; 2026-11-14: "a bit more high
  resolution"): solid blue block walls with a bright rim, pixel chompers and ghosts, square
  pellets, blocky frame.
- **Cabinet:** a wooden arcade machine: lit marquee, walnut walls with a gold rule, a dim dark
  green screen with a vignette, cream ghosts, softer chomper colors.

The approved mockups are the reference for all three (kept outside the repo).

Controls: swipe to turn on a phone, arrow keys or WASD on a keyboard. A turn can be queued
before the junction and happens when the corridor opens, arcade-style.

## Approaches considered

1. **Phones run the game; the server keeps score and settles what matters (chosen).** Each
   phone simulates its own chomper with no input lag. Ghost movement is deterministic from a
   seed and the round clock, so every phone computes the same ghosts without being told. Phones
   report position, direction and events (pellets, power-ups, catches) in cumulative,
   idempotent ticks, as Tetra does. In the Shared maze other chompers are drawn where they're
   probably heading (from their last known position and direction) so they glide rather than
   jump, and the server settles collisions and contested pellets generously.
2. **A live real-time service** for the Shared maze. Tightest feel, but new infrastructure and
   against the kickoff decision to stay on Vercel; passed on (2026-11-14: "Option 1 seems good").
3. **The TV runs the Shared maze and phones are controllers.** Every swipe would wait a round
   trip through the server before your chomper turns; worse than seeing others late.

## Constraints

- Rooms sync by HTTP polling over Vercel and Upstash. The platform's live poll (`GameUi.livePollMs`,
  `PollingTransport.setLivePoll`) exists on the unmerged Tetra branch, floored at 600 ms. This
  game borrows that platform change, not Tetra. The Shared maze wants about 250 ms while a
  round runs; lowering the floor for it must be checked against the Vercel and Upstash free
  limits (8 phones at 4 polls a second is about 7,000 requests per 3-minute round).
- The demo measures how the Shared maze feels at 800 ms, 250 ms and no lag before this is
  settled.
- Same game contract as every other game: rules, bot, phone/TV/results screens, recap, catalog
  entry and pictures, tests, end-to-end test.

## Sync decisions (builder's calls, settled at design time)

These came out of a builder review and are proposals, open to change after the demo.

- **Ghosts in the Shared maze.** Ghost movement is a pure function of the seed, the round clock
  and an **aim list**: at fixed beats (about every 2 s) the server records each chomper's last
  reported tile, and ghosts steer toward those tiles until the next beat. Every phone gets the
  same aim list, so every phone computes the same ghosts. A phone that receives a beat late
  re-simulates ghosts from that beat (cheap). The round clock is the server's start time plus
  each phone's measured clock offset (from the poll round trip). In Solo and Race, ghosts chase
  that phone's own chomper directly; nobody else needs to agree.
- **Authority.** A phone decides its own catches by ghosts, its own pellets in Solo and Race,
  and its own power-ups. In the Shared maze, contested pellets go to whichever report reached the
  server first (the loser's phone gives the pellet back quietly), and chomper-on-chomper
  collisions are decided by the server from reported positions with a tolerance (about half a
  tile at the reported time). Phones are trusted: it's a party game among friends, with no
  anti-cheat.
- **Poll rate.** The live poll is configurable per game; build the Shared maze to work at the
  current 600 ms floor and better at a lower one. The demo decides the target.
- **Platform change.** Cherry-pick the live-poll platform change from the Tetra branch into
  this game's branch (only `GameUi.livePollMs` and `PollingTransport.setLivePoll`, with tests);
  don't wait for Tetra.
- **Race.** Attacks go through the server and apply on the receiving phone at its next poll.
  Finishes are ordered by the finish time each phone reports on the round clock, so a late report
  can still win.
- **Bots.** The host adds bots the way other Jackdaw games do. A bot's simulation runs on the
  host's phone, which reports for it; if the host drops, the bots pause and resume at the host's
  rejoin.

## Reference

- `docs/maze/looks.html`: the approved mockup of the three looks, the power-up colors and the
  fruit.
- A throwaway playable demo (Solo, Shared maze with bots, a lag switch) lives outside the repo
  and is the sign-off point before the build.

## Left to the builder

Maze layouts (original, several, phone-friendly), point values, timings, lives, Race attacks,
sound, the ghosts' chase behavior (distinct personalities are welcome as long as they're our
own), how bots play, and the exact reconciliation rules for contested pellets and collisions.
