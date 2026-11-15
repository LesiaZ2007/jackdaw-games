import type { MazeOptions } from '../options';
import type { Mode } from '../rules';
import type { GhostView } from '../sim/ghosts';
import type { MazeLayout } from '../sim/layouts';
import type { PowerKind } from '../sim/powers';
import type { Dir } from '../sim/walker';

/**
 * What the renderer draws for one frame. The runner (runner.ts) builds it from the local
 * simulation and the latest table view; the renderer only reads it. Positions are in tile units
 * (tile centers at whole numbers; x may sit just past either edge in a tunnel, between -0.5 and
 * w - 0.5). Times are milliseconds.
 */

export type Look = MazeOptions['look'];

/**
 * Where this viewer is in the round.
 * - `countdown`: before the round starts, or before this player's next maze starts.
 * - `play`: playing (the TV is in `play` the whole round).
 * - `cleared`: this player cleared a maze and waits for the next one (Solo and Race).
 * - `finished`: this player is out of the round: last maze cleared (Race) or no lives left.
 * - `over`: the round has ended; the results come next.
 */
export type FramePhase = 'countdown' | 'play' | 'cleared' | 'finished' | 'over';

export interface FramePower {
  kind: PowerKind;
  msLeft: number;
  /** Its full length, for a timer bar. */
  totalMs: number;
}

export interface FrameChomper {
  id: string;
  name: string;
  /** Seat index: picks the player's color in the look. */
  colorIndex: number;
  x: number;
  y: number;
  /** Heading; the last one it had while standing still. */
  dir: Dir;
  /** Mouth phase in radians: opening = 0.06 + 0.6 × |sin(mouth)|; advances only while moving. */
  mouth: number;
  /** 1 for your own chomper (and everyone on the TV); others are drawn at half strength. */
  alpha: number;
  /** Your own chomper: a little larger, a pulsing ring and a YOU tag. */
  isYou: boolean;
  power: FramePower | null;
  /** Slowed by someone's Freeze (your own chomper only; 0 otherwise). */
  frozenMs: number;
  /** Fogged by someone (your own chomper only; 0 otherwise). */
  foggedMs: number;
  /** Caught: 0 → 1 over the dying animation, null otherwise. */
  dying: number | null;
  /**
   * Just spawned (round start, maze start, respawn): ghosts can't catch it for this many more
   * ms (0 when not shielded). The renderer blinks the chomper meanwhile.
   */
  shieldMs: number;
  /** Recent positions, newest first, while Dash runs (the afterimage trail). */
  trail: [number, number][];
}

export interface FrameGhost {
  id: number;
  x: number;
  y: number;
  dir: Dir;
  /** `fright` also when only you can eat it (your own Hunt in the Shared maze). */
  mode: GhostView['mode'];
  /** Frightened, and the fright ends within 2 s: flash. */
  ending: boolean;
  /** 0–3 for the four regular ghosts; -1 for a Jinx ghost (drawn in the Jinx color). */
  colorIndex: number;
  /** A Jinx ghost: whom it hunts (it ignores everyone else). */
  jinxTarget: string | null;
  /** A Jinx ghost after you. */
  jinxIsYou: boolean;
}

export interface FrameSpot {
  /** Index in layout.powers. */
  spot: number;
  x: number;
  y: number;
  /** What it holds (or will hold when back). */
  kind: PowerKind | null;
  /** On the board now. */
  up: boolean;
}

export interface FrameFruit {
  x: number;
  y: number;
  /** Index into FRUIT. */
  fruit: number;
  kind: 'cherry' | 'berry' | 'lemon';
  msLeft: number;
}

/** One maze with everything on it (your own maze, or the Shared maze). */
export interface FrameBoard {
  layout: MazeLayout;
  w: number;
  h: number;
  /** 0-based maze number, and its level (later mazes are faster). */
  maze: number;
  level: number;
  /** Plain pellets still drawn, as tile coordinates. */
  pellets: [number, number][];
  /** Goes up whenever `pellets` changes (the same array is reused while it doesn't). */
  pelletsRev: number;
  powerSpots: FrameSpot[];
  fruit: FrameFruit | null;
  chompers: FrameChomper[];
  ghosts: FrameGhost[];
  /** You are fogged: draw only a small circle around (x, y). */
  fog: { x: number; y: number; msLeft: number } | null;
  /** You are frozen: draw frost. */
  frozenMs: number;
}

/** Race: another player's maze in miniature (the TV shows everyone's). */
export interface MiniBoard {
  id: string;
  name: string;
  colorIndex: number;
  layout: MazeLayout;
  maze: number;
  /** Pellets and power spots still there, from the player's reported eaten pellets. */
  pellets: [number, number][];
  /** Where the player is drawn (a moment behind, along their reported path). */
  x: number;
  y: number;
  dir: Dir;
  done: boolean;
}

export interface FrameScore {
  id: string;
  name: string;
  colorIndex: number;
  /** Your own score includes what the server hasn't counted yet. */
  score: number;
  isYou: boolean;
  lives: number;
  /** 0-based maze the player is on, and mazes cleared. */
  maze: number;
  cleared: number;
  power: FramePower | null;
  done: boolean;
  finishMs: number | null;
}

export interface FrameBanner {
  /** Upper case, ready to draw: "FOGGED BY ROOK", "MAZE 2". */
  text: string;
  tone: 'attack' | 'info' | 'good' | 'bad';
  /** The power-up whose color the banner takes, if any. */
  power: PowerKind | null;
  /** How long it has been up; the renderer fades it out (the runner drops it after BANNER_MS). */
  ageMs: number;
  /** Changes for each new banner (to restart its animation). */
  key: number;
}

/**
 * One-off things that happened since the last frame, for animations and sound. Positions are in
 * tiles. `by` is the player id who did it; `mine` is true when that's you.
 */
export type FrameEffect = { key: number } & (
  | { kind: 'pellet'; x: number; y: number; by: string; mine: boolean }
  /** A pellet pulled in by Magnet: fly it from (x, y) to its chomper. */
  | { kind: 'magnet'; x: number; y: number; by: string }
  | { kind: 'power'; x: number; y: number; power: PowerKind; by: string; mine: boolean }
  | { kind: 'ghostEaten'; x: number; y: number; ghost: number; points: number; by: string }
  | { kind: 'caught'; x: number; y: number; by: string; mine: boolean }
  | { kind: 'respawn'; by: string; mine: boolean }
  | { kind: 'mazeCleared'; maze: number }
  /** An attack reached you (also shown as the banner). */
  | {
      kind: 'attackReceived';
      attack: 'jinx' | 'freeze' | 'steal' | 'fog';
      from: string;
      text: string;
    }
  /** You picked up an attack power-up (also shown as the banner). */
  | { kind: 'attackSent'; attack: 'jinx' | 'freeze' | 'steal' | 'fog'; text: string }
  | { kind: 'fruitSpawned'; x: number; y: number; fruit: number }
  | { kind: 'fruitEaten'; x: number; y: number; fruit: number; points: number; by: string }
  /** A score moved (for the score card bump and a floating number). */
  | { kind: 'score'; id: string; delta: number }
  /** The countdown changed: 3, 2, 1, then 0 for GO. */
  | { kind: 'count'; n: number }
  | { kind: 'finished' }
);

export interface FrameModel {
  look: Look;
  mode: Mode;
  phase: FramePhase;
  /** Round ms now (the server's clock). */
  tMs: number;
  /** You, or null on the TV. */
  me: string | null;
  /**
   * The maze to draw big: your own maze on a phone, the Shared maze on the TV (everyone at full
   * strength). Null on the TV in Solo and Race, which draws `minis`.
   */
  board: FrameBoard | null;
  /** Race: the other players' mazes (on the TV, everyone's). Solo on the TV: the one player. */
  minis: MiniBoard[];
  /** Everyone, in seat order. */
  scores: FrameScore[];
  /** Shared and Race: time left until the bell. Null in Solo (its bell is only a backstop). */
  timerMs: number | null;
  /** Counting down to play: ms left, and the number to show (3, 2, 1). */
  countdown: { msLeft: number; n: number } | null;
  /** True for a moment after a countdown ends (show GO). */
  go: boolean;
  banner: FrameBanner | null;
  /** Since the last frame; each frame gets each effect once. */
  effects: FrameEffect[];
  /** Your lives (Solo), maze and mazes in the round; null on the TV. */
  you: { lives: number; maze: number; mazes: number } | null;
}
