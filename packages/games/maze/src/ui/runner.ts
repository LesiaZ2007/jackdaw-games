import { walkerAt } from '../bot';
import type { MazeOptions } from '../options';
import { LIVES, catchCost, factPoints, mazePoints } from '../rules';
import type {
  MazeAction,
  MazeFacts,
  MazePlayerView,
  MazePublicPlayer,
  MazeTableView,
  MazeTick,
  Mode,
} from '../rules';
import {
  AIM_MS,
  claimList,
  sharedFruitAt,
  decodeOwners,
  ghostCheckpoints,
  sharedGhosts,
  sharedMaze,
  spotPellets,
  spotUp,
  syncGhosts,
  syncSharedGhosts,
} from '../shared';
import type { GhostCheckpoints } from '../shared';
import { ChomperSim, DYING_MS, MAGNET_RANGE, SPAWN_SHIELD_MS, spawnShield } from '../sim/chomper';
import type { ChomperEvent, ChomperParams, Turn } from '../sim/chomper';
import { GhostSim, ghostSeed } from '../sim/ghosts';
import type { GhostEvent, GhostInput } from '../sim/ghosts';
import { layoutAt } from '../sim/generate';
import { DIRS, DIR_ORDER, opposite, wrapX } from '../sim/layouts';
import type { MazeLayout } from '../sim/layouts';
import { decodeBits, encodeBits, pelletIndex } from '../sim/pellets';
import { ATTACK_POWERS, FRUIT, POINTS, POWER_MS, powerMs, speeds } from '../sim/powers';
import type { PowerKind } from '../sim/powers';
import { advance, canEnter, posOf } from '../sim/walker';
import type { Dir } from '../sim/walker';
import type {
  FrameBanner,
  FrameBoard,
  FrameChomper,
  FrameEffect,
  FrameGhost,
  FrameModel,
  FramePhase,
  FramePower,
  FrameScore,
  FrameSpot,
  MiniBoard,
} from './frame';

/**
 * The client loop for one phone (or the TV): input, the local chomper and ghosts, when to
 * report, and what to draw. No DOM and no canvas: the screen calls `frame()` each animation
 * frame and draws the FrameModel it returns; `update()` takes each new snapshot from the server.
 * Time comes only from the injected `now()` (the server's clock), so it runs the same in tests.
 *
 * Reports (`tick`s) are cumulative and idempotent:
 * - Shared maze: when something changed (a turn, pellets, power-ups, ghosts, catches, fruit) and
 *   at least SEND_GAP_MS since the last one. Race: the same for ghosts, power-ups, catches,
 *   fruit and clears (they route attacks); turns and pellets alone wait RACE_PACE_MS.
 * - Solo: only on a maze clear, when the last life goes, and a final one at the bell.
 * - Never while a report is in flight. A clear is sent again until the server shows the next
 *   maze (the server ignores ticks for a maze it has moved past, so nothing doubles).
 *
 * Ghosts: Solo and Race run them locally (they chase only you). The Shared maze restores the
 * server's ghost base and steps on with its aims and events (syncSharedGhosts), plus your own
 * ghost eats until the server has them.
 *
 * Other players (Shared maze, and the Race minis; on the TV too) are drawn where they probably
 * are now: from their latest report on along the maze (`predictAlong`), for at most
 * PREDICT_MAX_MS. Chompers never touch, so this needn't be their exact path, and it's closer than
 * replaying the path a moment late. When a new report disagrees, the difference is eased out over
 * EASE_MS (and never by stepping back along their heading); only a respawn or a gap of more
 * than SNAP_TILES is drawn at once. Pellets go when the drawn chomper passes over them (and
 * come back if no report claims them), or when the server says they're taken and the drawn
 * chomper is past them. One you reach that someone already took just goes.
 */

/** A phone reports at most this often. */
export const SEND_GAP_MS = 450;
/** Race: turns and pellets alone are reported no more often than this. */
export const RACE_PACE_MS = 1_500;
/** A maze clear the server hasn't shown yet is sent again after this long. */
export const CLEAR_RESEND_MS = 1_500;
/** The Shared maze's live poll (the platform's floor). */
export const LIVE_POLL_MS = 600;
/** Solo's poll while a maze is being played: slow, as nothing is needed from the server. */
export const SOLO_POLL_MS = 7_500;
/** Others are predicted on from their last report for at most this long (then they hold). */
export const PREDICT_MAX_MS = 1_200;
/** A pellet someone else took goes after this long even if their chomper isn't seen at it. */
export const HIDE_MAX_MS = 2_500;
/** A pellet hidden because someone's drawn chomper passed over it comes back after this long
 * if no report claims it (the guess about where they went was wrong). */
export const GUESS_MS = 2_500;
/** Banners stay up this long. */
export const BANNER_MS = 2_200;
/** GO shows this long after a countdown. */
export const GO_MS = 700;
/** An attack older than this when it first arrives (a refresh) is not applied again. */
export const STALE_ATTACK_MS = 6_000;
/** A report that hasn't settled after this long is given up on (and sent again). */
export const SEND_TIMEOUT_MS = 5_000;
/** Fixed simulation step (about 60 Hz), like the bots. */
const DT = 50 / 3;
/** After a stall (a hidden tab), at most this much is simulated; the rest is skipped. */
const MAX_CATCHUP_MS = 2_000;
/** A correction to where another player is drawn fades out over this long. */
const EASE_MS = 180;
/**
 * A drawn chomper moves at most this fast, correction and running together, in tiles per ms
 * (0.45 tile per 60 Hz frame): a correction fades out with what their own speed leaves of it.
 */
const EASE_BUDGET_PER_MS = 0.027;
/**
 * A correction bigger than this is drawn at once, not eased: more than two predictions of
 * PREDICT_MAX_MS can be apart, so something else went wrong. A wrong guess at a fork can be many
 * tiles off by the time the report comes in; that is still eased (see EASE_BUDGET_PER_MS): a
 * quick glide reads better than a jump.
 */
const SNAP_TILES = 20;
/** Frames this far apart mean the screen wasn't drawing (a hidden tab): others are just placed. */
const STALL_MS = 500;
/** A drawn chomper this close to a pellet's center has passed over it. */
const PASS_REACH = 0.5;
/** Mouth phase per tile moved (the demo's 16 per second at 7.8 tiles per second). */
const MOUTH_PER_TILE = 16 / 7.8;
const TRAIL_LEN = 7;
/** A power spot you picked up stays down this long while the server catches up. */
const SPOT_HOLD_MS = 3_000;
/** Your own ghost eats are kept for the Shared ghosts at most this long before the server's. */
const OWN_EVENT_MS = 4_000;
/** Ghost ids a tick can carry. */
const MAX_GHOST_ID = 15;

export interface RunnerOptions {
  /** This player's id; null on the TV (no input, no reports). */
  me: string | null;
  table: MazeTableView;
  /** The player view, if there is one yet (a refreshed phone resumes from it). */
  view?: MazePlayerView | null;
  /** Defaults to the table's options. */
  options?: MazeOptions;
  /** Display names by id, for banners and labels; ids are used when missing. */
  names?: Record<string, string>;
  /** Server time in ms. */
  now(): number;
  /** Sends a report; resolves false if it didn't get through. */
  send(a: MazeAction): Promise<boolean>;
  /** Steers the chomper at each tile center instead of the player (tests, attract screens). */
  steer?: ChomperParams['steer'];
}

/** Where a player has reported being: their turns, and their position at round ms `lastT`. */
export interface Track {
  turns: Turn[];
  lastT: number;
  pos: [number, number, Dir | null];
}

/** Where a prediction got to: its heading, and whether it is holding (a wall, a fork). */
export interface Predicted {
  x: number;
  y: number;
  dir: Dir | null;
  held: boolean;
}

/** x brought into [-0.5, w - 0.5). */
const normX = (m: MazeLayout, x: number): number => {
  const w = m.w;
  return ((((x + 0.5) % w) + w) % w) - 0.5;
};

/** The shortest x difference a - b, through a tunnel if that is shorter. */
const wrapDx = (m: MazeLayout, a: number, b: number): number => {
  const d = a - b;
  return d - m.w * Math.round(d / m.w);
};

/**
 * Where a chomper that was at `pos` probably is `dist` tiles later. It keeps its heading through
 * corridors; at a tile where straight on is blocked it takes the only other way that isn't back
 * (a corner), and where there are two or more (a fork) it holds at the center: a left or right
 * guess would be wrong half the time. It also holds at walls, as a chomper does.
 */
export function predictAlong(
  m: MazeLayout,
  pos: [number, number, Dir | null],
  dist: number,
): Predicted {
  const [x0, y0, d0] = pos;
  if (!d0 || dist <= 0) return { x: normX(m, x0), y: y0, dir: d0, held: !d0 };
  const w = walkerAt(m, [normX(m, x0), y0, d0]);
  let held = false;
  for (let left = dist; left > 1e-9;) {
    // At a tile center: straight on if it's open (at a fork too: the likeliest single way).
    if (w.prog === 0 && w.dir && !canEnter(m, w.tile, w.dir, false)) {
      const back = opposite(w.dir);
      const ways = DIR_ORDER.filter((d) => d !== back && canEnter(m, w.tile, d, false));
      if (ways.length !== 1) {
        held = true;
        break;
      }
      w.dir = ways[0]!;
    }
    const step = Math.min(left, 1 - w.prog);
    advance(w, step, m, { ghost: false });
    left -= step;
  }
  const [x, y] = posOf(w);
  return { x: normX(m, x), y, dir: w.dir, held };
}

/** Turns merged so they only grow, newest kept. */
function mergeTurns(prev: Turn[], add: Turn[], keep = 40): Turn[] {
  const last = prev[prev.length - 1]?.[0] ?? -Infinity;
  const more = add.filter((t) => t[0] > last);
  return more.length ? [...prev, ...more].slice(-keep) : prev;
}

const emptyFacts = (): MazeFacts => ({ ghosts: [], fruit: [], powers: [], caughtAt: [] });
const copyFacts = (f: MazeFacts): MazeFacts => ({
  ghosts: f.ghosts.map((x) => [...x] as [number, number]),
  fruit: [...f.fruit],
  powers: f.powers.map((x) => [...x] as [number, number, PowerKind]),
  caughtAt: [...(f.caughtAt ?? [])],
});

const layoutFor = (tv: MazeTableView, maze: number): MazeLayout => layoutAt(tv, maze);

/** What a phone had done on its maze at some moment (for its own score card). */
interface Snap {
  eaten: Uint8Array;
  facts: MazeFacts;
  caught: number;
  cleared: boolean;
}

interface Other {
  maze: number;
  track: Track;
  caught: number;
  /** Server ms when they were seen caught. */
  dyingAt: number | null;
  mouth: number;
  last: [number, number] | null;
  dir: Dir;
  trail: [number, number][];
  /** Where they're drawn this frame. */
  at: [number, number];
  /** What the prediction starts from (their last report, or their start after a catch). */
  base: Base | null;
  /** The prediction last frame. */
  pred: [number, number] | null;
  /** The correction still being eased out (drawn = prediction + ease), and how fast it goes. */
  ease: [number, number];
  easeRate: number;
  frameAt: number;
  /** Their report time when they were seen caught: reports before the respawn are stale. */
  caughtT: number | null;
  /** Server ms until which they are drawn shielded after being seen caught. */
  shieldUntil?: number;
}

interface Base {
  key: string;
  pos: [number, number, Dir | null];
  t: number;
  /** Round ms their Dash runs until, as known with this report (0 for none). */
  dashUntil: number;
}

type Effect = FrameEffect extends infer E ? (E extends unknown ? Omit<E, 'key'> : never) : never;

export class Runner {
  private readonly me: string | null;
  private readonly now: () => number;
  private readonly sendFn: (a: MazeAction) => Promise<boolean>;
  private readonly names: Record<string, string>;
  private readonly steer: ChomperParams['steer'];
  private readonly lookOverride: MazeOptions['look'] | undefined;
  private table: MazeTableView;
  private view: MazePlayerView | null;
  private round = -1;

  // The maze on the board.
  private maze = 0;
  private m: MazeLayout;
  private n = 0;
  private pelletXY: [number, number][] = [];
  private spotIdx: number[] = [];
  private isSpot = new Set<number>();
  private mazeAt = 0;
  private chomper: ChomperSim | null = null;
  private ghosts: GhostSim | null = null;
  private cps: GhostCheckpoints | null = null;
  private localInput: GhostInput = { aims: [], events: [] };
  private ownEvents: { e: GhostEvent; at: number }[] = [];
  private lastBeat = -Infinity;
  private simT = 0;
  private simTf = 0;
  private queued: Dir | null = null;

  // What this player has done (cumulative; reported in each tick).
  private myEaten: Uint8Array = new Uint8Array(0);
  private facts: MazeFacts = emptyFacts();
  private caught = 0;
  private lives = LIVES;
  private deadUntil = 0;
  private finishMs: number | undefined;
  /** A maze this phone cleared that the server hasn't moved past yet. */
  private cleared: { maze: number } | null = null;
  /** Whether this maze was built with a player view (a refreshed phone resumes from it). */
  private viewSeen = false;

  // What is drawn.
  private shown = new Uint8Array(0);
  private pelletsDirty = true;
  private pelletsRev = 0;
  private pelletsList: [number, number][] = [];
  private pendingHide = new Map<number, { owner: string; since: number }>();
  /**
   * Shared: pellets hidden because someone's drawn chomper passed over them, by when (-1 once a
   * report backed the guess up, or the pellet came back).
   */
  private guessed = new Map<number, number>();
  /** Shared: the server's pellet owners (seat + 1, 0 for none). */
  private owners: Uint8Array = new Uint8Array(0);
  private pelletAt = new Map<string, number>();
  /** Shared: power spots this phone picked up, by spot, at round ms. */
  private localPick = new Map<number, number>();
  /** Shared: the fruit (by its atMs) this phone claimed. */
  private fruitClaimed = -1;
  private fruitWas = false;
  private others = new Map<string, Other>();
  private miniPellets = new Map<string, { key: string; list: [number, number][] }>();
  private mouth = 0;
  private lastPos: [number, number] | null = null;
  private lastDir: Dir = 'left';
  private trail: [number, number][] = [];
  private shownScores = new Map<string, number>();
  private lastCount: number | null = null;
  private goUntil = -Infinity;
  private finishedShown = false;

  // Reports.
  private seq = 0;
  private inFlight = false;
  private inFlightAt = 0;
  /** Which send is in flight, so a stale one finishing late can't clear a newer one. */
  private sendId = 0;
  private lastSendAt = -Infinity;
  private lastSig = '';
  private lastFast = '';
  private lastFailed = false;
  private sentAny = false;

  /**
   * One score for everyone: your own card shows the server's score plus only what your reports
   * it hasn't taken in yet add (`acked` is what you had done when you sent the last report the
   * server's view covers; `sentSnaps` the reports still out, by seq).
   */
  private acked: Snap = {
    eaten: new Uint8Array(0),
    facts: emptyFacts(),
    caught: 0,
    cleared: false,
  };
  private sentSnaps = new Map<number, Snap>();

  private seenAttacks = new Set<number>();
  private effects: FrameEffect[] = [];
  private effectKey = 0;
  private banner: (Omit<FrameBanner, 'ageMs'> & { at: number }) | null = null;

  constructor(o: RunnerOptions) {
    this.me = o.me;
    this.now = o.now;
    this.sendFn = o.send;
    this.names = o.names ?? {};
    this.steer = o.steer;
    this.lookOverride = o.options?.look;
    this.table = o.table;
    this.view = o.view ?? null;
    this.m = layoutFor(o.table, 0);
    this.init();
  }

  /** Reports sent so far. */
  get sends(): number {
    return this.seq;
  }

  /** A new snapshot from the server (the table, and this player's view on a phone). */
  update(table: MazeTableView, view: MazePlayerView | null): void {
    this.table = table;
    if (view) this.view = view;
    if (table.round !== this.round) {
      this.init();
      return;
    }
    const now = this.now();
    const rec = this.rec();
    if (this.me && rec) {
      if (rec.done) this.cleared = null;
      else if (rec.maze !== this.maze) this.startMaze(rec.maze, true);
      else if (this.cleared && rec.maze > this.cleared.maze) this.cleared = null;
      else if (!this.viewSeen && view) {
        this.viewSeen = true;
        if (view.seq > 0 && !this.sentAny) this.startMaze(rec.maze, false);
      }
    } else if (table.mode === 'Shared') {
      // The TV (or anyone not playing) follows the Shared maze from one maze to the next.
      const { maze } = sharedMaze(table.shared);
      if (maze !== this.maze) this.startMaze(maze, true);
    }
    if (view && rec && rec.maze === this.maze) this.ackUpTo(view.seq);
    if (table.mode === 'Shared') this.syncOwners(now);
    this.syncOthers(now);
    if (view) this.applyInbox(view);
    // Own ghost eats leave once the server has them (or didn't take them: its next base says so).
    const sh = table.shared;
    if (sh && this.ownEvents.length) {
      const keys = new Set(sh.events.map((e) => JSON.stringify(e)));
      this.ownEvents = this.ownEvents.filter(
        ({ e, at }) => !keys.has(JSON.stringify(e)) && now - at < OWN_EVENT_MS,
      );
    }
  }

  /** A turn from a swipe or a key; queued until the next open junction (or play starts). */
  input(d: Dir): void {
    if (!this.me) return;
    this.queued = d;
    this.chomper?.input(d);
  }

  /** Steps everything to now and returns what to draw. `dtMs` is the time since the last frame. */
  frame(dtMs: number): FrameModel {
    void dtMs;
    const now = this.now();
    const tMs = now - this.table.startAt;
    this.advance(now, tMs);
    this.placeOthers(now, tMs);
    if (this.table.mode === 'Shared') this.hidePellets(now);
    this.maybeSend(now, tMs);
    return this.model(now, tMs);
  }

  // -------------------------------------------------------------------------------------------
  // Setup

  private rec(id: string | null = this.me): MazePublicPlayer | null {
    if (!id) return null;
    return this.table.players.find((p) => p.id === id) ?? null;
  }

  private get mode(): Mode {
    return this.table.mode;
  }

  private name(id: string): string {
    return this.names[id] ?? id;
  }

  private init(): void {
    const tv = this.table;
    this.round = tv.round;
    this.others.clear();
    this.miniPellets.clear();
    this.shownScores.clear();
    this.seenAttacks.clear();
    this.effects = [];
    this.banner = null;
    this.cleared = null;
    this.caught = 0;
    this.lives = LIVES;
    this.seq = 0;
    this.sentAny = false;
    this.lastSig = '';
    this.lastFast = '';
    this.lastSendAt = -Infinity;
    this.lastFailed = false;
    this.finishedShown = false;
    this.lastCount = null;
    const rec = this.rec();
    this.startMaze(rec ? rec.maze : tv.mode === 'Shared' ? sharedMaze(tv.shared).maze : 0, false);
    const now = this.now();
    if (tv.mode === 'Shared') this.syncOwners(now);
    this.syncOthers(now);
    if (this.view) this.applyInbox(this.view);
  }

  /** Builds maze `maze` for this viewer: resumed from the server's record when it has one. */
  private startMaze(maze: number, announce: boolean): void {
    const tv = this.table;
    const me = this.me;
    const shared = tv.mode === 'Shared';
    const rec = this.rec();
    const m = layoutFor(tv, maze);
    this.maze = maze;
    this.m = m;
    const idx = pelletIndex(m);
    this.n = idx.size;
    this.pelletAt = idx;
    this.owners = new Uint8Array(this.n);
    this.pelletXY = [];
    for (const [k, i] of idx) this.pelletXY[i] = k.split(',').map(Number) as [number, number];
    this.spotIdx = spotPellets(m);
    this.isSpot = new Set(this.spotIdx.filter((i) => i >= 0));
    // The Shared maze's play starts for everyone at once; the record says when.
    const sh = shared ? sharedMaze(tv.shared) : null;
    this.mazeAt = sh ? (sh.maze === maze ? sh.mazeAt : (rec?.mazeAt ?? 0)) : (rec?.mazeAt ?? 0);
    const level = maze + 1;
    this.ghosts = shared
      ? sharedGhosts(m, tv.seed, maze, this.mazeAt)
      : new GhostSim(m, ghostSeed(tv.seed, maze), level);
    this.cps = ghostCheckpoints(this.ghosts, shared ? this.mazeAt : 0);
    this.localInput = { aims: [], events: [], ...(me && !shared ? { frightFor: me } : {}) };
    this.ownEvents = [];
    this.lastBeat = -Infinity;
    this.facts = emptyFacts();
    this.myEaten = new Uint8Array(this.n);
    this.shown = new Uint8Array(this.n).fill(1);
    this.pelletsDirty = true;
    this.pendingHide.clear();
    this.guessed.clear();
    this.localPick.clear();
    this.fruitClaimed = -1;
    this.fruitWas = false;
    this.deadUntil = 0;
    this.cleared = null;
    this.finishMs = undefined;
    this.trail = [];
    this.lastPos = null;
    this.simT = this.simTf = this.mazeAt;
    this.viewSeen = !!this.view;
    if (announce && maze > 0) this.say(`MAZE ${maze + 1}`, 'info', null);

    if (!me || !rec) {
      this.chomper = null;
      return;
    }
    const v = this.view;
    if (v) {
      this.caught = Math.max(this.caught, v.caught);
      this.lives = Math.min(this.lives, v.lives);
      this.seq = Math.max(this.seq, v.seq);
    }
    const seat = tv.players.findIndex((p) => p.id === me);
    const st = m.starts[shared ? Math.max(0, seat) % m.starts.length : 0] ?? m.starts[0]!;
    const taken = new Uint8Array(this.n);
    if (shared && tv.shared && sharedMaze(tv.shared).maze === maze) {
      const owners = decodeOwners(tv.shared.owner, this.n);
      for (let i = 0; i < this.n; i++) if (owners[i] && !this.isSpot.has(i)) taken[i] = 1;
    }
    const resume = !!v && v.seq > 0 && rec.maze === maze && rec.lastT > this.mazeAt;
    if (resume) {
      this.myEaten = decodeBits(v.eaten, this.n);
      this.facts = copyFacts(v.facts);
      for (let i = 0; i < this.n; i++) if (this.myEaten[i]) taken[i] = 1;
    }
    const ch = new ChomperSim({
      m,
      start: [st[0], st[1], st[2]],
      level,
      powers: tv.powers,
      ghosts: this.ghosts,
      taken,
      fruit: !shared,
      id: me,
      ...(this.steer ? { steer: this.steer } : {}),
    });
    this.chomper = ch;
    for (let i = 0; i < this.n; i++) if (taken[i]) this.shown[i] = 0;
    if (resume) {
      const lastDead = this.facts.caughtAt[this.facts.caughtAt.length - 1];
      const dyingUntil = lastDead !== undefined ? lastDead + DYING_MS : 0;
      ch.resume({
        walker: walkerAt(m, rec.pos),
        power: rec.power && rec.power.untilMs > rec.lastT ? rec.power : null,
        dyingUntil,
        shieldUntil: spawnShield(this.mazeAt, this.facts.caughtAt),
        ate: this.myEaten.reduce((a, b) => a + b, 0),
        fruitN: this.facts.fruit.length,
      });
      this.simT = this.simTf = rec.lastT;
      this.deadUntil = dyingUntil > rec.lastT ? dyingUntil : 0;
      if (!shared) this.rebuildLocalGhosts(v.turns, st);
    } else {
      ch.respawn(this.mazeAt);
    }
    if (this.queued) ch.input(this.queued);
    // The server's score covers everything up to here (a fresh maze, or the resumed report).
    this.sentSnaps.clear();
    this.acked = this.snap();
  }

  /** Solo and Race after a refresh: the ghost inputs again, from the facts and turns. */
  private rebuildLocalGhosts(turns: Turn[], st: [number, number, Dir]): void {
    const m = this.m;
    const off = this.mazeAt;
    const level = this.maze + 1;
    const input = this.localInput;
    for (const [t, , kind] of this.facts.powers)
      if (kind === 'hunt')
        input.events.push({
          atMs: t - off,
          kind: 'fright',
          untilMs: t - off + powerMs('hunt', level),
        });
    for (const [t, g] of this.facts.ghosts)
      input.events.push({ atMs: t - off, kind: 'eaten', ghost: g });
    const tileAt = (t: number): [number, number] => {
      let tile: [number, number] = [st[0], st[1]];
      for (const [tt, x, y] of turns) if (tt <= t) tile = [wrapX(m, Math.round(x)), Math.round(y)];
      return tile;
    };
    for (let b = 0; b <= this.simT - off; b += AIM_MS) {
      input.aims.push({ atMs: b, tiles: { [this.me!]: tileAt(b + off) } });
      this.lastBeat = b;
    }
    syncGhosts(this.ghosts!, this.cps!, input, this.simT - off);
  }

  // -------------------------------------------------------------------------------------------
  // Simulation

  private advance(now: number, tMs: number): void {
    const tv = this.table;
    // Play starts at startAt; the server's snapshot saying so may come a poll later.
    if (tv.phase !== 'play' && !(tv.phase === 'countdown' && tMs >= 0)) return;
    const shared = tv.mode === 'Shared';
    const solo = tv.mode === 'Solo';
    if (!this.me) {
      if (shared && this.ghosts && this.cps && tv.shared && tMs > this.mazeAt)
        syncSharedGhosts(this.ghosts, this.cps, tv.shared, tMs);
      return;
    }
    const ch = this.chomper;
    const rec = this.rec();
    if (!ch || !rec || rec.done || this.cleared) return;
    if (shared) this.syncSpots(tMs);
    const end = tv.endAt !== null ? tv.endAt - tv.startAt : Infinity;
    const target = Math.min(tMs, end);
    if (target < this.mazeAt) return;
    if (this.simT < this.mazeAt) this.simT = this.simTf = this.mazeAt;
    if (target - this.simT > MAX_CATCHUP_MS) this.simT = this.simTf = target - MAX_CATCHUP_MS;
    const off = shared ? 0 : this.mazeAt;
    while (this.simTf + DT <= target) {
      if (solo && this.lives <= 0 && this.deadUntil === 0) break;
      this.simTf += DT;
      const t = Math.round(this.simTf);
      const dt = t - this.simT;
      this.simT = t;
      const g = t - off;
      if (!shared && g - this.lastBeat >= AIM_MS) {
        const [px, py] = ch.position();
        this.localInput.aims.push({
          atMs: g,
          tiles: { [this.me]: [wrapX(this.m, Math.round(px)), Math.round(py)] },
        });
        this.lastBeat = g;
      }
      this.stepGhosts(g);
      if (this.deadUntil > 0 && t >= this.deadUntil) {
        this.deadUntil = 0;
        if (!solo || this.lives > 0) {
          ch.respawn(t);
          this.fx({ kind: 'respawn', by: this.me, mine: true });
        } else break;
      }
      if (shared) this.offerFruit(t);
      for (const e of ch.step(dt, t)) this.onEvent(e, t, g, now);
      if (this.cleared) break;
    }
    const fruit = ch.state().fruit;
    if (!shared && !!fruit !== this.fruitWas) {
      this.fruitWas = !!fruit;
      if (fruit)
        this.fx({
          kind: 'fruitSpawned',
          x: this.m.fruit[0],
          y: this.m.fruit[1],
          fruit: fruit.fruit,
        });
    }
  }

  private stepGhosts(g: number): void {
    const sim = this.ghosts;
    const cps = this.cps;
    if (!sim || !cps) return;
    const sh = this.table.shared;
    if (this.table.mode === 'Shared') {
      if (sh)
        syncSharedGhosts(
          sim,
          cps,
          sh,
          g,
          this.ownEvents.map((x) => x.e),
        );
    } else syncGhosts(sim, cps, this.localInput, g);
  }

  private onEvent(e: ChomperEvent, t: number, g: number, now: number): void {
    const me = this.me!;
    const ch = this.chomper!;
    const shared = this.table.mode === 'Shared';
    const level = this.maze + 1;
    switch (e.kind) {
      case 'pellet': {
        this.myEaten[e.i] = 1;
        this.hide(e.i);
        const [x, y] = this.pelletXY[e.i]!;
        this.fx({ kind: 'pellet', x, y, by: me, mine: true });
        const [px, py] = ch.position();
        if (ch.state().power?.kind === 'magnet' && Math.hypot(x - px, y - py) > 0.75)
          this.fx({ kind: 'magnet', x, y, by: me });
        break;
      }
      case 'power': {
        this.myEaten[e.i] = 1;
        this.hide(e.i);
        const spot = this.spotIdx.indexOf(e.i);
        if (spot >= 0 && this.facts.powers.length < 32) this.facts.powers.push([t, spot, e.power]);
        if (shared && spot >= 0) this.localPick.set(spot, t);
        const [x, y] = this.pelletXY[e.i]!;
        this.fx({ kind: 'power', x, y, power: e.power, by: me, mine: true });
        if (e.power === 'hunt' && !shared)
          this.localInput.events.push({
            atMs: g,
            kind: 'fright',
            untilMs: g + powerMs('hunt', level),
          });
        if (ATTACK_POWERS.includes(e.power)) this.sentAttack(e.power as AttackKind);
        break;
      }
      case 'fruit': {
        if (shared) {
          const sh = this.table.shared;
          if (!sh?.fruit) break;
          this.fruitClaimed = sh.fruit.atMs;
          this.facts.fruit = claimList(this.facts.fruit, sh.fruitSeen[me] ?? 0, e.fruit);
        } else if (this.facts.fruit.length < 16) this.facts.fruit.push(e.fruit);
        this.fx({
          kind: 'fruitEaten',
          x: this.m.fruit[0],
          y: this.m.fruit[1],
          fruit: e.fruit,
          points: FRUIT[e.fruit]?.pts ?? 0,
          by: me,
        });
        break;
      }
      case 'ghost': {
        if (e.ghost <= MAX_GHOST_ID && this.facts.ghosts.length < 64)
          this.facts.ghosts.push([t, e.ghost]);
        if (shared) this.ownEvents.push({ e: { atMs: t, kind: 'eaten', ghost: e.ghost }, at: now });
        else this.localInput.events.push({ atMs: g, kind: 'eaten', ghost: e.ghost });
        const gv = this.ghosts?.ghosts().find((x) => x.id === e.ghost);
        const [px, py] = ch.position();
        this.fx({
          kind: 'ghostEaten',
          x: gv?.pos[0] ?? px,
          y: gv?.pos[1] ?? py,
          ghost: e.ghost,
          points: POINTS.ghost[e.combo] ?? 0,
          by: me,
        });
        break;
      }
      case 'caught': {
        this.caught++;
        this.facts.caughtAt.push(t);
        this.deadUntil = t + DYING_MS;
        if (this.table.mode === 'Solo') this.lives = Math.max(0, this.lives - 1);
        const [x, y] = ch.position();
        this.fx({ kind: 'caught', x, y, by: me, mine: true });
        if (this.table.mode === 'Solo' && this.lives === 0) this.say('GAME OVER', 'bad', null);
        break;
      }
      case 'cleared': {
        if (shared) break;
        this.cleared = { maze: this.maze };
        if (this.maze >= this.table.layouts.length - 1) this.finishMs = t;
        this.fx({ kind: 'mazeCleared', maze: this.maze });
        this.say('MAZE CLEARED', 'good', null);
        break;
      }
    }
  }

  /**
   * Shared: puts the server's fruit in front of the chomper while it's up and not yet claimed
   * here, so reaching it (within FRUIT_REACH) is a claim; the server gives it to the first.
   */
  private offerFruit(t: number): void {
    const sh = this.table.shared;
    const f = sharedFruitAt(sh, this.me!, t, this.fruitClaimed);
    this.chomper?.offerFruit(f ? { fruit: f.fruit, untilMs: f.untilMs } : null);
  }

  /** Shared: power spots follow the server (they come back as whatever it picked). */
  private syncSpots(tMs: number): void {
    const sh = this.table.shared;
    const ch = this.chomper;
    if (!sh || !ch) return;
    sh.spots.forEach((sp, k) => {
      const pi = this.spotIdx[k] ?? -1;
      if (pi < 0) return;
      const picked = this.localPick.get(k);
      if (picked !== undefined && (sp.backAt > picked || tMs - picked >= SPOT_HOLD_MS))
        this.localPick.delete(k);
      const held = this.localPick.has(k);
      const up = spotUp(sp, tMs) && !held;
      if (up && !ch.has(pi) && sp.kind) ch.restoreSpot(pi, sp.kind);
      else if (!up && ch.has(pi)) {
        const b = new Uint8Array(this.n);
        b[pi] = 1;
        ch.take(b);
      }
    });
  }

  // -------------------------------------------------------------------------------------------
  // Others and the Shared pellets

  /** Shared: pellets others own go from the chomper at once, and from the board when seen. */
  private syncOwners(now: number): void {
    const sh = this.table.shared;
    if (!sh || sharedMaze(sh).maze !== this.maze) return;
    const ids = this.table.players.map((p) => p.id);
    const mySeat = this.me ? ids.indexOf(this.me) + 1 : 0;
    const owners = decodeOwners(sh.owner, this.n);
    this.owners = owners;
    const taken = new Uint8Array(this.n);
    for (let i = 0; i < this.n; i++) {
      const k = owners[i]!;
      if (!k || this.isSpot.has(i)) continue;
      taken[i] = 1;
      if (k !== mySeat && this.shown[i] && !this.pendingHide.has(i))
        this.pendingHide.set(i, { owner: ids[k - 1] ?? '', since: now });
    }
    this.chomper?.take(taken);
  }

  private syncOthers(now: number): void {
    for (const p of this.table.players) {
      if (p.id === this.me) continue;
      let o = this.others.get(p.id);
      if (!o || o.maze !== p.maze) {
        o = {
          maze: p.maze,
          track: { turns: [], lastT: p.lastT, pos: p.pos },
          caught: p.caught,
          dyingAt: null,
          mouth: 0,
          last: null,
          dir: p.pos[2] ?? 'left',
          trail: [],
          at: [p.pos[0], p.pos[1]],
          base: null,
          pred: null,
          ease: [0, 0],
          easeRate: 0,
          frameAt: now,
          caughtT: null,
        };
        this.others.set(p.id, o);
      }
      o.track = {
        turns: mergeTurns(o.track.turns, p.turns),
        lastT: Math.max(o.track.lastT, p.lastT),
        pos: p.lastT >= o.track.lastT ? p.pos : o.track.pos,
      };
      if (p.caught > o.caught) {
        o.dyingAt = now;
        o.caughtT = p.lastT;
        o.shieldUntil = now + DYING_MS + SPAWN_SHIELD_MS;
        if (this.table.mode === 'Shared')
          this.fx({ kind: 'caught', x: o.at[0], y: o.at[1], by: p.id, mine: false });
      }
      o.caught = p.caught;
    }
  }

  /** Where a player probably is at round ms `tMs`, from a base (see predictAlong). */
  private predictOther(m: MazeLayout, p: MazePublicPlayer, base: Base, tMs: number): Predicted {
    const tv = this.table;
    let to = tMs;
    if (tv.endAt !== null) to = Math.min(to, tv.endAt - tv.startAt);
    if (p.done || (tv.phase !== 'play' && tv.phase !== 'countdown')) to = base.t;
    const from = Math.max(base.t, p.mazeAt);
    to = Math.min(to, from + PREDICT_MAX_MS);
    const sp = speeds(1);
    const dashed = Math.max(0, Math.min(to, base.dashUntil) - from);
    const dist = (sp.chomper * Math.max(0, to - from) + (sp.dash - sp.chomper) * dashed) / 1000;
    return predictAlong(m, base.pos, dist);
  }

  /** Where everyone else is drawn this frame: where they probably are now. */
  private placeOthers(now: number, tMs: number): void {
    const shared = this.table.mode === 'Shared';
    for (const [seat, p] of this.table.players.entries()) {
      const o = this.others.get(p.id);
      if (!o) continue;
      const m = layoutFor(this.table, p.maze);
      const gapMs = now - o.frameAt;
      const dt = Math.min(1_000, Math.max(0, gapMs));
      o.frameAt = now;
      // Caught: they stay put while dying, then come back at their start.
      if (o.dyingAt !== null) {
        if (now - o.dyingAt <= DYING_MS) {
          o.trail.pop();
          continue;
        }
        o.dyingAt = null;
      }
      let base: Base;
      const back = o.caughtT !== null ? o.caughtT + DYING_MS : -Infinity;
      if (o.track.lastT < back) {
        const st = m.starts[shared ? seat % m.starts.length : 0] ?? m.starts[0]!;
        base = { key: `start@${back}`, pos: [st[0], st[1], st[2]], t: back, dashUntil: 0 };
      } else {
        const { pos, lastT } = o.track;
        const dashUntil = p.power?.kind === 'dash' ? p.power.untilMs : 0;
        base = { key: `${lastT}|${pos.join(',')}|${dashUntil}`, pos, t: lastT, dashUntil };
      }
      const pred = this.predictOther(m, p, base, tMs);
      // Fade the correction out, linearly, at the rate it was given, within the speed budget.
      const size = Math.hypot(o.ease[0], o.ease[1]);
      if (size > 0) {
        const sp = speeds(1);
        const speed = (tMs < (o.base?.dashUntil ?? 0) ? sp.dash : sp.chomper) / 1000;
        const rate = Math.min(o.easeRate, Math.max(0, EASE_BUDGET_PER_MS - speed));
        const k = Math.max(0, size - rate * dt) / size;
        o.ease = k * size < 1e-3 ? [0, 0] : [o.ease[0] * k, o.ease[1] * k];
      }
      let snap = false;
      // First sight, or the screen wasn't drawing (a hidden tab): nobody saw the way there.
      if (!o.base || gapMs > STALL_MS) snap = true;
      else if (base.key !== o.base.key) {
        // A new report: carry on from where they're drawn and ease into the new prediction.
        const was = this.predictOther(m, p, o.base, tMs);
        const ex = wrapDx(m, was.x + o.ease[0], pred.x);
        const ey = was.y + o.ease[1] - pred.y;
        const gap = Math.hypot(ex, ey);
        if (gap > SNAP_TILES || base.key.startsWith('start@')) snap = true;
        else {
          o.ease = [ex, ey];
          o.easeRate = gap / EASE_MS;
        }
      }
      if (snap) o.ease = [0, 0];
      o.base = base;
      let dx = pred.x + o.ease[0];
      let dy = pred.y + o.ease[1];
      // Never step back along their heading (unless they really turned round): wait instead.
      const prevPred = o.pred;
      if (!snap && o.last && prevPred && pred.dir && pred.dir === o.dir) {
        const predMoved = Math.hypot(wrapDx(m, pred.x, prevPred[0]), pred.y - prevPred[1]) > 1e-6;
        const [hx, hy] = DIRS[pred.dir];
        const along = wrapDx(m, dx, o.last[0]) * hx + (dy - o.last[1]) * hy;
        if (predMoved && along < 0) {
          dx -= hx * along;
          dy -= hy * along;
          o.ease = [wrapDx(m, dx, pred.x), dy - pred.y];
        }
      }
      o.pred = [pred.x, pred.y];
      dx = normX(m, dx);
      o.at = [dx, dy];
      if (pred.dir) o.dir = pred.dir;
      if (o.last) {
        const moved = Math.hypot(wrapDx(m, dx, o.last[0]), dy - o.last[1]);
        if (moved < 2) o.mouth += moved * MOUTH_PER_TILE;
      }
      o.last = [dx, dy];
      if (p.power?.kind === 'dash' && p.power.untilMs > tMs) {
        o.trail.unshift([dx, dy]);
        o.trail.length = Math.min(o.trail.length, TRAIL_LEN);
      } else o.trail.pop();
    }
  }

  /**
   * Shared: a pellet goes when someone's drawn chomper passes over it (it comes back if no report
   * claims it within GUESS_MS), or when the server says someone took it and their drawn chomper is
   * near it or settled on its prediction (which is past everything they reported eating).
   */
  private hidePellets(now: number): void {
    const m = this.m;
    for (const p of this.table.players) {
      const o = this.others.get(p.id);
      if (!o || p.id === this.me || p.maze !== this.maze || o.dyingAt !== null || !o.base) continue;
      const reach = p.power?.kind === 'magnet' ? MAGNET_RANGE : PASS_REACH;
      const r = Math.ceil(reach);
      const cx = Math.round(o.at[0]);
      const cy = Math.round(o.at[1]);
      for (let y = cy - r; y <= cy + r; y++)
        for (let x = cx - r; x <= cx + r; x++) {
          const i = this.pelletAt.get(`${wrapX(m, x)},${y}`);
          if (i === undefined || !this.shown[i] || this.isSpot.has(i) || this.guessed.has(i))
            continue;
          const [px, py] = this.pelletXY[i]!;
          if (Math.hypot(wrapDx(m, o.at[0], px), o.at[1] - py) >= reach) continue;
          this.hide(i);
          this.pendingHide.delete(i);
          this.guessed.set(i, this.owners[i] ? -1 : now);
          this.fx({ kind: 'pellet', x: px, y: py, by: p.id, mine: false });
        }
    }
    for (const [i, h] of this.pendingHide) {
      const o = this.others.get(h.owner);
      const [x, y] = this.pelletXY[i]!;
      const p = this.rec(h.owner);
      const reach = p?.power?.kind === 'magnet' ? MAGNET_RANGE : 0.6;
      let wait = false;
      if (o && o.base && p?.maze === this.maze) {
        const near = Math.hypot(wrapDx(m, o.at[0], x), o.at[1] - y) < reach;
        wait = !near && Math.hypot(o.ease[0], o.ease[1]) > 0.5;
      }
      if (wait && now - h.since < HIDE_MAX_MS) continue;
      this.pendingHide.delete(i);
      if (!this.shown[i]) continue;
      this.hide(i);
      this.fx({ kind: 'pellet', x, y, by: h.owner, mine: false });
    }
    // A guess no report backed up: the pellet comes back (and isn't guessed at again).
    for (const [i, at] of this.guessed) {
      if (at < 0) continue;
      if (this.owners[i] || this.myEaten[i]) this.guessed.set(i, -1);
      else if (now - at >= GUESS_MS) {
        this.guessed.set(i, -1);
        this.shown[i] = 1;
        this.pelletsDirty = true;
      }
    }
  }

  private hide(i: number): void {
    if (!this.shown[i]) return;
    this.shown[i] = 0;
    this.pelletsDirty = true;
  }

  // -------------------------------------------------------------------------------------------
  // Attacks

  private applyInbox(view: MazePlayerView): void {
    const tMs = this.now() - this.table.startAt;
    for (const a of view.inbox) {
      if (this.seenAttacks.has(a.id)) continue;
      this.seenAttacks.add(a.id);
      if (tMs - a.atMs > STALE_ATTACK_MS) continue;
      const from = this.name(a.from).toUpperCase();
      const ch = this.chomper;
      let text: string;
      if (a.kind === 'freeze') {
        ch?.freeze(this.simT + POWER_MS.freeze);
        text = `FROZEN BY ${from}`;
      } else if (a.kind === 'fog') {
        ch?.fog(this.simT + POWER_MS.fog);
        text = `FOGGED BY ${from}`;
      } else if (a.kind === 'jinx') {
        // The Shared maze's jinx ghost comes with the server's ghost events.
        if (this.table.mode !== 'Shared' && this.me && ch) {
          const g = this.simT - this.mazeAt;
          this.localInput.events.push({
            atMs: g,
            kind: 'jinx',
            target: this.me,
            untilMs: g + POWER_MS.jinx,
          });
        }
        text = `${from} JINXED YOU!`;
      } else text = `${from} STOLE ${a.amount ?? 0}!`;
      this.fx({ kind: 'attackReceived', attack: a.kind, from: a.from, text });
      this.say(text, 'attack', a.kind);
    }
  }

  private sentAttack(kind: AttackKind): void {
    const leader = this.leaderOther();
    const who = leader ? this.name(leader).toUpperCase() : 'THE LEADER';
    const text =
      kind === 'jinx'
        ? `JINX SENT AFTER ${who}`
        : kind === 'freeze'
          ? 'EVERYONE ELSE FROZEN'
          : kind === 'fog'
            ? 'EVERYONE ELSE IN THE FOG'
            : `STEALING FROM ${who}`;
    this.fx({ kind: 'attackSent', attack: kind, text });
    this.say(text, 'attack', kind);
  }

  private leaderOther(): string | null {
    let best: MazePublicPlayer | null = null;
    for (const p of this.table.players)
      if (p.id !== this.me && !p.done && (!best || p.score > best.score)) best = p;
    return best?.id ?? null;
  }

  // -------------------------------------------------------------------------------------------
  // Reports

  private signature(): { all: string; fast: string } {
    const f = this.facts;
    const eaten = this.myEaten.reduce((a, b) => a + b, 0);
    const turns = this.chomper?.state().turns.length ?? 0;
    const fast = `${f.ghosts.length}|${f.powers.length}|${this.caught}|${f.fruit.length}|${this.cleared ? 1 : 0}`;
    return { all: `${fast}|${turns}|${eaten}`, fast };
  }

  private maybeSend(now: number, tMs: number): void {
    const tv = this.table;
    if (!this.me || !this.chomper || tv.phase !== 'play') return;
    if (this.inFlight) {
      // A send that never settles must not stall every report after it.
      if (now - this.inFlightAt < SEND_TIMEOUT_MS) return;
      this.inFlight = false;
      this.lastFailed = true;
      this.lastSig = '';
      this.lastFast = '';
    }
    const rec = this.rec();
    if (!rec || rec.done || rec.maze !== this.maze) return;
    const gap = now - this.lastSendAt;
    if (gap < SEND_GAP_MS) return;
    const sig = this.signature();
    const dirty = sig.all !== this.lastSig;
    const end = tv.endAt !== null ? tv.endAt - tv.startAt : Infinity;
    const final = dirty && tMs >= end;
    let go: boolean;
    if (this.cleared) go = dirty || this.lastFailed || gap >= CLEAR_RESEND_MS;
    else if (tv.mode === 'Solo') go = final || (this.lives <= 0 && (dirty || this.lastFailed));
    else if (!dirty) go = false;
    else if (tv.mode === 'Race') go = final || sig.fast !== this.lastFast || gap >= RACE_PACE_MS;
    else go = true;
    if (!go) return;
    this.lastSendAt = now;
    this.lastSig = sig.all;
    this.lastFast = sig.fast;
    this.lastFailed = false;
    this.inFlight = true;
    this.inFlightAt = now;
    const id = ++this.sendId;
    this.sentAny = true;
    const done = (ok: boolean) => {
      if (id !== this.sendId) return;
      this.inFlight = false;
      if (!ok) {
        this.lastFailed = true;
        this.lastSig = '';
        this.lastFast = '';
      }
    };
    let p: Promise<boolean>;
    try {
      const tick = this.buildTick(tMs);
      this.sentSnaps.set(tick.seq, this.snap());
      if (this.sentSnaps.size > 64) this.sentSnaps.delete(this.sentSnaps.keys().next().value!);
      p = this.sendFn(tick);
    } catch {
      p = Promise.resolve(false);
    }
    p.then(done, () => done(false));
  }

  private buildTick(tMs: number): MazeTick {
    const ch = this.chomper!;
    const tv = this.table;
    this.seq = Math.max(this.seq, this.view?.seq ?? 0) + 1;
    const turns: Turn[] = ch
      .state()
      .turns.slice(-40)
      .map(([a, x, y, d]) => [Math.round(a), x, y, d]);
    const f = this.facts;
    const t = Math.max(0, Math.min(Math.round(this.simT), Math.round(tMs)));
    const last = this.maze >= tv.layouts.length - 1;
    return {
      type: 'tick',
      round: tv.round,
      seq: this.seq,
      t,
      maze: this.maze,
      pos: ch.position(),
      turns,
      eaten: encodeBits(this.myEaten),
      ghosts: f.ghosts.slice(-64),
      caught: this.caught,
      caughtAt: f.caughtAt.slice(-16),
      fruit: f.fruit.slice(0, 16),
      powers: f.powers.slice(-32),
      lives: tv.mode === 'Solo' ? this.lives : (this.view?.lives ?? LIVES),
      ...(this.finishMs !== undefined && last ? { finishMs: Math.round(this.finishMs) } : {}),
    };
  }

  // -------------------------------------------------------------------------------------------
  // The frame model

  private fx(e: Effect): void {
    this.effects.push({ ...e, key: ++this.effectKey } as FrameEffect);
  }

  private say(text: string, tone: FrameBanner['tone'], power: PowerKind | null): void {
    this.banner = { text, tone, power, key: ++this.effectKey, at: this.now() };
  }

  /** Your score as the server will count it once it has your latest report. */
  private predicted(rec: MazePublicPlayer): number {
    if (rec.maze !== this.maze || !this.chomper) return rec.score;
    const now = this.snap();
    const gain = this.localPoints(now, rec.id) - this.localPoints(this.acked, rec.id);
    const score = Math.max(0, rec.score + gain);
    return score - catchCost(this.table.mode, score, now.caught - this.acked.caught);
  }

  /** What this phone has done on this maze so far (what a report would carry). */
  private snap(): Snap {
    return {
      eaten: this.myEaten.slice(),
      facts: copyFacts(this.facts),
      caught: this.caught,
      cleared: !!this.cleared,
    };
  }

  /**
   * Points a snapshot is worth on this maze, as the server counts them (Shared: pellets someone
   * else owns don't count). Only differences between two snapshots are used.
   */
  private localPoints(s: Snap, me: string): number {
    if (this.table.mode !== 'Shared')
      return mazePoints(this.m, encodeBits(s.eaten), s.facts) + (s.cleared ? POINTS.mazeClear : 0);
    const sh = this.table.shared;
    const mySeat = this.table.players.findIndex((p) => p.id === me) + 1;
    const owners = sh ? decodeOwners(sh.owner, this.n) : new Uint8Array(this.n);
    let mine = 0;
    for (let i = 0; i < this.n; i++)
      if (s.eaten[i] && !this.isSpot.has(i) && (!owners[i] || owners[i] === mySeat)) mine++;
    return mine * POINTS.pellet + factPoints(s.facts);
  }

  /** The server has taken in every report up to `seq`: its score now covers them. */
  private ackUpTo(seq: number): void {
    let best = -1;
    for (const k of this.sentSnaps.keys()) if (k <= seq && k > best) best = k;
    if (best < 0) return;
    this.acked = this.sentSnaps.get(best)!;
    for (const k of [...this.sentSnaps.keys()]) if (k <= best) this.sentSnaps.delete(k);
  }

  private powerOf(p: { kind: PowerKind; untilMs: number } | null, tMs: number, maze: number) {
    if (!p || p.untilMs <= tMs) return null;
    const level = maze + 1;
    const out: FramePower = {
      kind: p.kind,
      msLeft: p.untilMs - tMs,
      totalMs: powerMs(p.kind, level),
    };
    return out;
  }

  private model(now: number, tMs: number): FrameModel {
    const tv = this.table;
    const me = this.me;
    const rec = this.rec();
    const shared = tv.mode === 'Shared';
    const solo = tv.mode === 'Solo';
    const seats = tv.players.map((p) => p.id);

    // Phase and countdown.
    let phase: FramePhase;
    let cdLeft: number | null = null;
    if (tv.phase === 'countdown' && now < tv.startAt) {
      phase = 'countdown';
      cdLeft = tv.startAt - now;
    } else if (tv.phase !== 'play' && tv.phase !== 'countdown') phase = 'over';
    else if (me && rec && (rec.done || (solo && this.lives <= 0 && this.deadUntil === 0)))
      phase = 'finished';
    else if (me && this.cleared) phase = 'cleared';
    else if ((me || shared) && tMs < this.mazeAt) {
      phase = 'countdown';
      cdLeft = this.mazeAt - tMs;
    } else phase = 'play';
    const n =
      cdLeft !== null && cdLeft > 0 ? Math.min(3, Math.max(1, Math.ceil(cdLeft / 1000))) : null;
    if (n !== this.lastCount) {
      if (n !== null) this.fx({ kind: 'count', n });
      else if (this.lastCount !== null && phase === 'play') {
        this.fx({ kind: 'count', n: 0 });
        this.goUntil = now + GO_MS;
      }
      this.lastCount = n;
    }
    if (phase === 'finished' && !this.finishedShown && rec?.done) {
      this.finishedShown = true;
      this.fx({ kind: 'finished' });
      this.say(tv.mode === 'Race' ? 'FINISHED' : 'ALL CLEAR', 'good', null);
    }

    // Scores.
    const scores: FrameScore[] = tv.players.map((p, i) => {
      const isYou = p.id === me;
      const score = isYou ? this.predicted(p) : p.score;
      const power = isYou && this.chomper ? this.chomper.state().power : p.power;
      return {
        id: p.id,
        name: this.name(p.id),
        colorIndex: i,
        score,
        isYou,
        lives: isYou && solo ? this.lives : p.lives,
        maze: p.maze,
        cleared: p.cleared,
        power: this.powerOf(power, isYou ? this.simT : tMs, p.maze),
        done: p.done,
        finishMs: p.finishMs,
      };
    });
    for (const s of scores) {
      const was = this.shownScores.get(s.id);
      if (was !== undefined && was !== s.score)
        this.fx({ kind: 'score', id: s.id, delta: s.score - was });
      this.shownScores.set(s.id, s.score);
    }

    const board = me || shared ? this.board(tMs, seats) : null;
    const minis = this.minis(seats);

    const banner =
      this.banner && now - this.banner.at < BANNER_MS
        ? {
            text: this.banner.text,
            tone: this.banner.tone,
            power: this.banner.power,
            key: this.banner.key,
            ageMs: now - this.banner.at,
          }
        : null;
    if (!banner) this.banner = null;

    const effects = this.effects;
    this.effects = [];
    return {
      look: this.lookOverride ?? tv.options.look,
      mode: tv.mode,
      phase,
      tMs,
      me,
      board,
      minis,
      scores,
      timerMs:
        !solo && tv.endAt !== null && tv.phase === 'play' ? Math.max(0, tv.endAt - now) : null,
      countdown: n !== null && cdLeft !== null ? { msLeft: cdLeft, n } : null,
      go: now < this.goUntil,
      banner,
      effects,
      you:
        me && rec
          ? { lives: solo ? this.lives : rec.lives, maze: this.maze, mazes: tv.layouts.length }
          : null,
      sharedMaze: shared ? { maze: this.maze, mazes: tv.layouts.length } : null,
    };
  }

  private board(tMs: number, seats: string[]): FrameBoard {
    const tv = this.table;
    const m = this.m;
    const shared = tv.mode === 'Shared';
    const ch = this.chomper;
    if (this.pelletsDirty) {
      this.pelletsDirty = false;
      this.pelletsRev++;
      this.pelletsList = [];
      for (let i = 0; i < this.n; i++)
        if (this.shown[i] && !this.isSpot.has(i)) this.pelletsList.push(this.pelletXY[i]!);
    }

    // Power spots.
    const powerSpots: FrameSpot[] = m.powers.map(([x, y], spot) => {
      const pi = this.spotIdx[spot] ?? -1;
      const sp = tv.shared?.spots[spot];
      if (shared && sp) {
        const up = ch ? ch.has(pi) : spotUp(sp, tMs);
        return { spot, x, y, kind: sp.kind, up };
      }
      return { spot, x, y, kind: ch ? ch.powerAt(pi) : null, up: ch ? ch.has(pi) : true };
    });

    // Fruit.
    let fruit: FrameBoard['fruit'] = null;
    if (shared) {
      const f = tv.shared?.fruit;
      if (f && tMs >= f.atMs && tMs < f.untilMs && this.fruitClaimed !== f.atMs)
        fruit = {
          x: m.fruit[0],
          y: m.fruit[1],
          fruit: f.fruit,
          kind: FRUIT[f.fruit]?.kind ?? 'cherry',
          msLeft: f.untilMs - tMs,
        };
    } else {
      const f = ch?.state().fruit;
      if (f)
        fruit = {
          x: m.fruit[0],
          y: m.fruit[1],
          fruit: f.fruit,
          kind: FRUIT[f.fruit]?.kind ?? 'cherry',
          msLeft: f.untilMs - this.simT,
        };
    }

    // Chompers.
    const chompers: FrameChomper[] = [];
    let fog: FrameBoard['fog'] = null;
    let frozenMs = 0;
    let myPower: FramePower | null = null;
    for (const p of tv.players) {
      const colorIndex = seats.indexOf(p.id);
      if (p.id === this.me && ch) {
        const st = ch.state();
        const [x, y, dir] = ch.position();
        if (dir) this.lastDir = dir;
        if (this.lastPos) {
          const moved = Math.hypot(x - this.lastPos[0], y - this.lastPos[1]);
          if (moved < 2) this.mouth += moved * MOUTH_PER_TILE;
        }
        this.lastPos = [x, y];
        myPower = this.powerOf(st.power, this.simT, this.maze);
        if (myPower?.kind === 'dash') {
          this.trail.unshift([x, y]);
          this.trail.length = Math.min(this.trail.length, TRAIL_LEN);
        } else this.trail.pop();
        frozenMs = Math.max(0, st.frozenUntil - this.simT);
        const foggedMs = Math.max(0, st.fogUntil - this.simT);
        if (foggedMs > 0) fog = { x, y, msLeft: foggedMs };
        chompers.push({
          id: p.id,
          name: this.name(p.id),
          colorIndex,
          x,
          y,
          dir: this.lastDir,
          mouth: this.mouth,
          alpha: 1,
          isYou: true,
          power: myPower,
          frozenMs,
          foggedMs,
          dying: st.dyingUntil > this.simT ? 1 - (st.dyingUntil - this.simT) / DYING_MS : null,
          shieldMs: st.dyingUntil > this.simT ? 0 : Math.max(0, st.shieldUntil - this.simT),
          trail: [...this.trail],
        });
        continue;
      }
      if (!shared) continue;
      const o = this.others.get(p.id);
      if (!o) continue;
      chompers.push({
        id: p.id,
        name: this.name(p.id),
        colorIndex,
        x: o.at[0],
        y: o.at[1],
        dir: o.dir,
        mouth: o.mouth,
        alpha: this.me ? 0.5 : 1,
        isYou: false,
        power: this.powerOf(p.power, tMs, p.maze),
        frozenMs: 0,
        foggedMs: 0,
        dying: o.dyingAt !== null ? Math.min(1, (this.now() - o.dyingAt) / DYING_MS) : null,
        shieldMs: Math.max(
          0,
          (o.shieldUntil ?? 0) - this.now(),
          tMs >= 0 ? SPAWN_SHIELD_MS - tMs : 0,
        ),
        trail: [...o.trail],
      });
    }
    // Your own chomper on top.
    chompers.sort((a, b) => Number(a.isYou) - Number(b.isYou));

    // Ghosts.
    const hunting = shared && myPower?.kind === 'hunt';
    const ghosts: FrameGhost[] = (this.ghosts?.ghosts() ?? []).map((g) => {
      const jinxTarget = g.jinxTarget ?? null;
      const forMe = jinxTarget === null || jinxTarget === this.me;
      const mode =
        hunting && forMe && (g.mode === 'chase' || g.mode === 'scatter') ? 'fright' : g.mode;
      return {
        id: g.id,
        x: g.pos[0],
        y: g.pos[1],
        dir: g.dir,
        mode,
        ending: mode === 'fright' && (myPower?.kind !== 'hunt' || myPower.msLeft < 2000),
        colorIndex: jinxTarget === null ? g.id % 4 : -1,
        jinxTarget,
        jinxIsYou: jinxTarget !== null && jinxTarget === this.me,
      };
    });

    return {
      layout: m,
      w: m.w,
      h: m.h,
      maze: this.maze,
      level: this.maze + 1,
      pellets: this.pelletsList,
      pelletsRev: this.pelletsRev,
      powerSpots,
      fruit,
      chompers,
      ghosts,
      fog,
      frozenMs,
    };
  }

  /** Race (and Solo on the TV): other players' mazes in miniature. */
  private minis(seats: string[]): MiniBoard[] {
    const tv = this.table;
    if (tv.mode === 'Shared' || (tv.mode === 'Solo' && this.me)) return [];
    const out: MiniBoard[] = [];
    for (const p of tv.players) {
      if (p.id === this.me) continue;
      const o = this.others.get(p.id);
      const m = layoutFor(tv, p.maze);
      const key = `${p.maze}:${p.eaten}`;
      let cached = this.miniPellets.get(p.id);
      if (!cached || cached.key !== key) {
        const idx = pelletIndex(m);
        const bits = decodeBits(p.eaten, idx.size);
        const list: [number, number][] = [];
        for (const [k, i] of idx)
          if (!bits[i]) list.push(k.split(',').map(Number) as [number, number]);
        cached = { key, list };
        this.miniPellets.set(p.id, cached);
      }
      out.push({
        id: p.id,
        name: this.name(p.id),
        colorIndex: seats.indexOf(p.id),
        layout: m,
        maze: p.maze,
        pellets: cached.list,
        x: o?.at[0] ?? p.pos[0],
        y: o?.at[1] ?? p.pos[1],
        dir: o?.dir ?? p.pos[2] ?? 'left',
        done: p.done,
      });
    }
    return out;
  }
}

type AttackKind = 'jinx' | 'freeze' | 'steal' | 'fog';
