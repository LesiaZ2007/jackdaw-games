import type { LiveChomper } from '../live';
import type { MazeTableView } from '../rules';
import { DYING_MS } from '../sim/chomper';
import type { MazeLayout } from '../sim/layouts';
import { pelletIndex } from '../sim/pellets';
import { FRUIT, powerMs, type PowerKind } from '../sim/powers';
import type {
  FrameBanner,
  FrameChomper,
  FrameEffect,
  FrameGhost,
  FrameModel,
  FramePhase,
  FramePower,
} from './frame';
import type { LiveFrame } from './live-client';
import { BANNER_MS, GO_MS } from './runner';

/** An effect before it gets its key. */
type NewEffect = FrameEffect extends infer E ? (E extends unknown ? Omit<E, 'key'> : never) : never;

const MOUTH_PER_TILE = 16 / 7.8;
/** A pellet counts as taken by the nearest chomper within this many tiles. */
const NEAR_TILES = 1.5;

interface MazeFacts {
  /** Plain pellets: [x, y, pellet index]. */
  plain: [number, number, number][];
  /** Power spots in layout.powers order: their pellet index. */
  spotIdx: number[];
}

/**
 * Builds the renderer's FrameModel from a live round's frame (LiveClient.frame), so a Contact
 * round draws, sounds and banners like the Shared maze. It keeps what the model needs between
 * frames: mouths, the banner, the last scores and pellets (for effects) and the countdown.
 */
export class LiveFramer {
  private readonly me: string | null;
  private readonly layouts: readonly MazeLayout[];
  private table: MazeTableView;
  private readonly facts = new Map<number, MazeFacts>();
  private pellets: { maze: number; size: number; list: [number, number][]; rev: number } | null =
    null;
  private lastTaken = new Set<number>();
  private lastMaze = -1;
  private readonly mouths = new Map<string, { mouth: number; x: number; y: number }>();
  private readonly scoresSeen = new Map<string, number>();
  private banner: {
    text: string;
    tone: FrameBanner['tone'];
    power: PowerKind | null;
    at: number;
    key: number;
  } | null = null;
  private key = 0;
  private lastCount: number | null = null;
  private goUntil = 0;
  private finished = false;

  constructor(o: { me: string | null; layouts: readonly MazeLayout[]; table: MazeTableView }) {
    this.me = o.me;
    this.layouts = o.layouts;
    this.table = o.table;
  }

  setTable(t: MazeTableView): void {
    this.table = t;
  }

  /** `now` is any steady clock in ms (banner ages); it defaults to the round's own clock. */
  build(f: LiveFrame, now = f.t): FrameModel {
    const tv = this.table;
    const m = this.layouts[f.maze] ?? this.layouts[0]!;
    const facts = this.factsOf(f.maze, m);
    const effects: FrameEffect[] = [];
    const fx = (e: NewEffect) => effects.push({ ...e, key: ++this.key } as FrameEffect);
    const byId = new Map(f.chompers.map((c) => [c.id, c]));
    const nameOf = (id: string) => (byId.get(id)?.name ?? 'Someone').toUpperCase();
    const say = (text: string, tone: FrameBanner['tone'], power: PowerKind | null = null) => {
      this.banner = { text, tone, power, at: now, key: ++this.key };
    };
    const me = this.me;

    // A new maze: forget the last one's pellets.
    if (f.maze !== this.lastMaze) {
      this.lastMaze = f.maze;
      this.lastTaken = new Set(f.taken);
    }

    // Pellets taken since the last frame, credited to the nearest chomper.
    for (const i of f.taken) {
      if (this.lastTaken.has(i)) continue;
      const p = facts.plain.find((q) => q[2] === i);
      if (!p) continue;
      let best: LiveChomper | null = null;
      let d = NEAR_TILES;
      for (const c of f.chompers) {
        const e = Math.hypot(c.x - p[0], c.y - p[1]);
        if (e <= d) {
          d = e;
          best = c;
        }
      }
      if (best) fx({ kind: 'pellet', x: p[0], y: p[1], by: best.id, mine: best.id === me });
    }
    this.lastTaken = new Set(f.taken);

    // Contact.
    for (const e of f.events) {
      if (e.kind === 'bump') {
        if (me && (e.a === me || e.b === me)) say(`BUMP −${e.cost}`, 'info');
      } else if (e.eaten === me) {
        const c = byId.get(me);
        fx({ kind: 'caught', x: c?.x ?? 0, y: c?.y ?? 0, by: me, mine: true });
        say(`${nameOf(e.by)} ATE YOU −${e.cost}`, 'bad');
      } else if (e.by === me) say(`YOU ATE ${nameOf(e.eaten)} +${e.gain}`, 'good', 'hunt');
    }

    // Ghosts, fruit, attacks and cleared mazes.
    for (const n of f.notices) {
      const c = 'id' in n ? byId.get(n.id) : undefined;
      if (n.kind === 'caught') {
        fx({ kind: 'caught', x: c?.x ?? 0, y: c?.y ?? 0, by: n.id, mine: n.id === me });
        if (n.id === me) say(`CAUGHT −${n.cost}`, 'bad');
      } else if (n.kind === 'ghost') {
        fx({
          kind: 'ghostEaten',
          x: c?.x ?? 0,
          y: c?.y ?? 0,
          ghost: 0,
          points: n.points,
          by: n.id,
        });
      } else if (n.kind === 'fruit') {
        fx({
          kind: 'fruitEaten',
          x: m.fruit[0],
          y: m.fruit[1],
          fruit: 0,
          points: n.points,
          by: n.id,
        });
      } else if (n.kind === 'attack') {
        const from = nameOf(n.by);
        if (me && n.targets.includes(me)) {
          const text =
            n.attack === 'freeze'
              ? `FROZEN BY ${from}`
              : n.attack === 'fog'
                ? `FOGGED BY ${from}`
                : `${from} STOLE ${n.amount ?? 0}!`;
          fx({ kind: 'attackReceived', attack: n.attack, from: n.by, text });
          say(text, 'attack', n.attack);
        } else if (n.by === me) {
          const text =
            n.attack === 'freeze'
              ? 'FROZE EVERYONE'
              : n.attack === 'fog'
                ? 'FOGGED EVERYONE'
                : `STOLE ${n.amount ?? 0}`;
          fx({ kind: 'attackSent', attack: n.attack, text });
          say(text, 'good', n.attack);
        }
      } else if (n.kind === 'cleared') {
        fx({ kind: 'mazeCleared', maze: n.maze });
        say('MAZE CLEARED', 'good');
      }
    }

    // Scores.
    for (const c of f.chompers) {
      const was = this.scoresSeen.get(c.id);
      if (was !== undefined && was !== c.score)
        fx({ kind: 'score', id: c.id, delta: c.score - was });
      this.scoresSeen.set(c.id, c.score);
    }

    // Phase and countdown.
    let phase: FramePhase;
    let cdLeft: number | null = null;
    if (f.over || (tv.phase !== 'play' && tv.phase !== 'countdown')) phase = 'over';
    else if (f.t < 0) {
      phase = 'countdown';
      cdLeft = -f.t;
    } else if (f.pauseUntil > f.t) {
      phase = 'countdown';
      cdLeft = f.pauseUntil - f.t;
    } else phase = 'play';
    const n =
      cdLeft !== null && cdLeft > 0 ? Math.min(3, Math.max(1, Math.ceil(cdLeft / 1000))) : null;
    if (n !== this.lastCount) {
      if (n !== null) fx({ kind: 'count', n });
      else if (this.lastCount !== null && phase === 'play') {
        fx({ kind: 'count', n: 0 });
        this.goUntil = now + GO_MS;
      }
      this.lastCount = n;
    }
    if (phase === 'over' && !this.finished) {
      this.finished = true;
      fx({ kind: 'finished' });
    }

    // Chompers: others first, yours on top.
    const power = (c: LiveChomper): FramePower | null =>
      c.power && c.power.untilMs > f.t
        ? {
            kind: c.power.kind,
            msLeft: c.power.untilMs - f.t,
            totalMs: powerMs(c.power.kind, f.maze + 1),
          }
        : null;
    const chompers: FrameChomper[] = f.chompers.map((c) => {
      const isYou = c.id === me;
      const prev = this.mouths.get(c.id);
      const moved = prev ? Math.hypot(c.x - prev.x, c.y - prev.y) : 0;
      const mouth = (prev?.mouth ?? 0) + (moved < 2 ? moved * MOUTH_PER_TILE : 0);
      this.mouths.set(c.id, { mouth, x: c.x, y: c.y });
      const dying = c.dyingUntil > f.t ? 1 - (c.dyingUntil - f.t) / DYING_MS : null;
      return {
        id: c.id,
        name: c.name,
        colorIndex: c.seat,
        x: c.x,
        y: c.y,
        dir: c.dir ?? 'right',
        mouth,
        alpha: 1,
        isYou,
        power: power(c),
        frozenMs: isYou ? Math.max(0, (c.frozenUntil ?? 0) - f.t) : 0,
        foggedMs: isYou ? Math.max(0, (c.fogUntil ?? 0) - f.t) : 0,
        dying,
        shieldMs: dying !== null ? 0 : Math.max(0, c.shieldUntil - f.t),
        trail: [],
      };
    });
    chompers.sort((a, b) => Number(a.isYou) - Number(b.isYou));
    const mine = chompers.find((c) => c.isYou) ?? null;

    // Ghosts: with your own Hunt running, the ones you can eat show frightened.
    const hunting = mine?.power?.kind === 'hunt';
    const ghosts: FrameGhost[] = f.ghosts.map((g) => {
      const jinxTarget = g.jinxTarget ?? null;
      const mode = hunting && (g.mode === 'chase' || g.mode === 'scatter') ? 'fright' : g.mode;
      return {
        id: g.id,
        x: g.pos[0],
        y: g.pos[1],
        dir: g.dir,
        mode,
        ending: mode === 'fright' && (!hunting || (mine?.power?.msLeft ?? 0) < 2000),
        colorIndex: jinxTarget === null ? g.id % 4 : -1,
        jinxTarget,
        jinxIsYou: jinxTarget !== null && jinxTarget === me,
      };
    });

    // Pellets (the list is reused while nothing changes).
    if (!this.pellets || this.pellets.maze !== f.maze || this.pellets.size !== f.taken.size) {
      this.pellets = {
        maze: f.maze,
        size: f.taken.size,
        list: facts.plain.filter(([, , i]) => !f.taken.has(i)).map(([x, y]) => [x, y]),
        rev: (this.pellets?.rev ?? 0) + 1,
      };
    }
    const kinds = new Map(f.spots.map((s) => [s.i, s.kind]));
    const powerSpots = m.powers.map(([x, y], spot) => {
      const i = facts.spotIdx[spot] ?? -1;
      return { spot, x, y, kind: kinds.get(i) ?? tv.powers[0] ?? 'hunt', up: !f.taken.has(i) };
    });
    const fruit =
      f.fruit && f.fruit.untilMs > f.t
        ? {
            x: m.fruit[0],
            y: m.fruit[1],
            fruit: f.fruit.fruit,
            kind: FRUIT[f.fruit.fruit]?.kind ?? 'cherry',
            msLeft: f.fruit.untilMs - f.t,
          }
        : null;
    const fogMs = mine?.foggedMs ?? 0;

    const b = this.banner;
    const banner =
      b && now - b.at < BANNER_MS
        ? { text: b.text, tone: b.tone, power: b.power, key: b.key, ageMs: now - b.at }
        : null;
    if (!banner) this.banner = null;

    return {
      look: tv.options.look,
      mode: tv.mode,
      phase,
      tMs: f.t,
      me,
      board: {
        layout: m,
        w: m.w,
        h: m.h,
        maze: f.maze,
        level: f.maze + 1,
        pellets: this.pellets.list,
        pelletsRev: this.pellets.rev,
        powerSpots,
        fruit,
        chompers,
        ghosts,
        fog: mine && fogMs > 0 ? { x: mine.x, y: mine.y, msLeft: fogMs } : null,
        frozenMs: mine?.frozenMs ?? 0,
      },
      minis: [],
      scores: [...f.chompers]
        .sort((a, b) => a.seat - b.seat)
        .map((c) => ({
          id: c.id,
          name: c.name,
          colorIndex: c.seat,
          score: c.score,
          isYou: c.id === me,
          lives: 0,
          maze: f.maze,
          cleared: 0,
          power: power(c),
          done: false,
          finishMs: null,
        })),
      timerMs:
        phase !== 'over' && tv.endAt !== null && f.t >= 0
          ? Math.max(0, tv.endAt - (tv.startAt + f.t))
          : null,
      countdown: n !== null && cdLeft !== null ? { msLeft: cdLeft, n } : null,
      go: now < this.goUntil,
      banner,
      effects,
      you: null,
      sharedMaze: { maze: f.maze, mazes: this.layouts.length },
    };
  }

  private factsOf(maze: number, m: MazeLayout): MazeFacts {
    const had = this.facts.get(maze);
    if (had) return had;
    const plain: [number, number, number][] = [];
    const at = new Map<string, number>();
    for (const [k, i] of pelletIndex(m)) {
      at.set(k, i);
      const [x, y] = k.split(',').map(Number) as [number, number];
      if (m.rows[y]![x] === '.') plain.push([x, y, i]);
    }
    const facts = { plain, spotIdx: m.powers.map(([x, y]) => at.get(`${x},${y}`) ?? -1) };
    this.facts.set(maze, facts);
    return facts;
  }
}
