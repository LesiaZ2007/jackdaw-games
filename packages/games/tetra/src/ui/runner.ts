import type { TetraAction, TetraPlayerView } from '../rules';
import {
  draw,
  dropped,
  fits,
  freshStack,
  gravity,
  holdSwap,
  LOCK_DELAY_MS,
  LOCK_RESETS,
  lockPiece,
  rotate,
  shift,
  spawn,
  twist,
  type ClearOutcome,
  type Incoming,
  type Piece,
  type Stack,
} from '../sim';

/** Something the player just did worth a word under the well ("Quad", "Back-to-back"). */
export interface Shout {
  id: number;
  text: string;
  sub?: string;
  big: boolean;
}

export type Input = 'left' | 'right' | 'soft' | 'hard' | 'cw' | 'ccw' | 'half' | 'hold';

/** Auto-repeat: a held left or right waits this long, then moves a cell every ARR. */
const DAS_MS = 150;
const ARR_MS = 33;
/** Soft drop falls this many times faster than gravity (at least SOFT_MIN rows a second). */
const SOFT_FACTOR = 20;
const SOFT_MIN = 28;

/**
 * One player's well, played on this phone. It runs the falling stone (gravity, lock delay with
 * move resets, auto-repeat, soft and hard drop, turning with kicks, hold) on top of the shared
 * sim, and reports to the server at most every `gap` ms with a cumulative `tick`. Owed rubble
 * comes from the server's view; what this phone has used of each throw is kept here and always
 * reported as a running total, so a lost or repeated tick changes nothing.
 */
export class Runner {
  round = 0;
  seed = 0;
  stack: Stack = freshStack();
  piece: Piece | null = null;
  holdUsed = false;
  finished = false;
  finishMs: number | undefined;
  shout: Shout | null = null;
  /** Bumps whenever something the HUD shows changed. */
  version = 0;

  private view: TetraPlayerView | null = null;
  private consumed = new Map<number, number>();
  private lastTurn = false;
  private lastKick = 0;
  private fall = 0;
  private resting = 0;
  private resets = 0;
  private lowest = 0;
  private softCells = 0;
  private held = new Map<Input, { since: number; last: number }>();
  private dirty = false;
  private sending = false;
  private sentAt = 0;
  private shoutId = 0;

  /** How a tick reaches the server, set by the screen through `connect`. */
  private send: (a: TetraAction) => Promise<boolean> = async () => false;
  /** The least time between ticks, in ms. */
  private gap: () => number = () => 800;

  connect(send: (a: TetraAction) => Promise<boolean>, gap: () => number) {
    this.send = send;
    this.gap = gap;
  }

  /** Takes in each new snapshot: a new round resets the well; a refresh picks up the server's. */
  sync(v: TetraPlayerView) {
    this.view = v;
    if (v.seed === null || !v.stack) return;
    const mine = v.boards.find((b) => b.id === v.me);
    if (v.round !== this.round) {
      this.round = v.round;
      this.seed = v.seed;
      this.stack = v.stack;
      this.piece = null;
      this.holdUsed = false;
      this.finished = Boolean(mine?.done);
      this.finishMs = undefined;
      this.consumed.clear();
      this.dirty = false;
      this.version++;
      return;
    }
    // The server knows a later well than this phone (a refresh or a second tab): take it.
    if (v.stack.pieces > this.stack.pieces) {
      this.stack = v.stack;
      this.piece = null;
      this.version++;
    }
    if (mine?.done && !this.finished) {
      this.finished = true;
      this.piece = null;
      this.version++;
    }
  }

  /** Rubble still owed, after what this phone has already used. */
  owed(): Incoming[] {
    const v = this.view;
    if (!v) return [];
    return v.owed
      .map((g) => {
        const used = Math.max(g.used, this.consumed.get(g.id) ?? 0);
        return { id: g.id, lines: g.total - used, hole: g.hole, at: g.at };
      })
      .filter((g) => g.lines > 0);
  }

  owing(): number {
    return this.owed().reduce((a, g) => a + g.lines, 0);
  }

  playing(now: number): boolean {
    const v = this.view;
    return Boolean(
      v &&
      v.phase === 'play' &&
      v.seed !== null &&
      !this.finished &&
      !this.stack.topped &&
      now >= v.startAt,
    );
  }

  press(input: Input, t: number) {
    this.held.set(input, { since: t, last: t });
    this.act(input);
  }

  release(input: Input) {
    this.held.delete(input);
  }

  releaseAll() {
    this.held.clear();
  }

  /** One frame: `now` is server time, `dt` real ms since the last frame. */
  step(now: number, dt: number, t: number) {
    this.serverNow = now;
    const v = this.view;
    if (!v) return;
    if (this.playing(now)) {
      if (v.endsAt !== null && now >= v.endsAt) {
        this.finished = true;
        this.piece = null;
        this.dirty = true;
        this.version++;
      } else {
        if (!this.piece) this.next();
        this.repeat(t);
        this.gravityStep(now, dt);
      }
    }
    this.flush(now);
  }

  /** The ghost: where the stone would land. */
  ghost(): Piece | null {
    return this.piece ? dropped(this.stack.well, this.piece) : null;
  }

  private act(input: Input) {
    const p = this.piece;
    if (!p) return;
    const well = this.stack.well;
    switch (input) {
      case 'left':
      case 'right': {
        const q = shift(well, p, input === 'left' ? -1 : 1, 0);
        if (q) this.moved(q, false, 0);
        return;
      }
      case 'cw':
      case 'ccw':
      case 'half': {
        const r = rotate(well, p, input === 'cw' ? 1 : input === 'ccw' ? -1 : 2);
        if (r) this.moved(r.piece, true, r.kick);
        return;
      }
      case 'hard': {
        const q = dropped(well, p);
        const cells = q.y - p.y;
        if (cells > 0) this.lastTurn = false;
        this.lock(q, cells * 2);
        return;
      }
      case 'hold': {
        if (this.holdUsed) return;
        const h = holdSwap(this.stack, p.kind, this.seed);
        this.stack = h.stack;
        this.holdUsed = true;
        this.place(spawn(h.kind));
        this.version++;
        return;
      }
      case 'soft':
        return;
    }
  }

  private moved(q: Piece, turned: boolean, kick: number) {
    this.piece = q;
    this.lastTurn = turned;
    this.lastKick = kick;
    if (this.resting > 0 && this.resets < LOCK_RESETS) {
      this.resting = 0;
      this.resets++;
    }
  }

  private repeat(t: number) {
    for (const dir of ['left', 'right'] as const) {
      const h = this.held.get(dir);
      if (!h || t - h.since < DAS_MS) continue;
      while (t - h.last >= ARR_MS) {
        h.last += ARR_MS;
        this.act(dir);
      }
    }
  }

  private gravityStep(now: number, dt: number) {
    const p = this.piece;
    const v = this.view!;
    if (!p) return;
    let g = gravity(v.mode, v.pace, now - v.startAt, this.stack.lines);
    const soft = this.held.has('soft');
    if (soft) g = Math.max(g * SOFT_FACTOR, SOFT_MIN);
    this.fall += (dt / 1000) * g;
    while (this.fall >= 1 && this.piece) {
      this.fall -= 1;
      const q = shift(this.stack.well, this.piece, 0, 1);
      if (!q) {
        this.fall = 0;
        break;
      }
      this.piece = q;
      this.lastTurn = false;
      if (soft) this.softCells++;
      if (q.y > this.lowest) {
        this.lowest = q.y;
        this.resets = 0;
      }
    }
    if (this.piece && !shift(this.stack.well, this.piece, 0, 1)) {
      this.resting += dt;
      if (this.resting >= LOCK_DELAY_MS || this.resets >= LOCK_RESETS) this.lock(this.piece, 0);
    } else {
      this.resting = 0;
    }
  }

  private place(p: Piece) {
    this.lastTurn = false;
    this.lastKick = 0;
    this.fall = 0;
    this.resting = 0;
    this.resets = 0;
    this.lowest = p.y;
    this.softCells = 0;
    if (!fits(this.stack.well, p)) {
      this.piece = null;
      this.stack = { ...this.stack, topped: true };
      this.dirty = true;
      this.sentAt = 0;
      this.version++;
      return;
    }
    this.piece = p;
  }

  private next() {
    const d = draw(this.stack, this.seed);
    this.stack = d.stack;
    this.holdUsed = false;
    this.place(spawn(d.kind));
    this.version++;
  }

  private lock(p: Piece, hardPoints: number) {
    const v = this.view!;
    const spin = twist(this.stack.well, p, this.lastTurn, this.lastKick);
    const owed = this.owed();
    const r = lockPiece(this.stack, p, {
      spin,
      dropPoints: hardPoints + this.softCells,
      owed,
      now: this.serverNow,
    });
    for (const u of r.used) {
      const g = v.owed.find((x) => x.id === u.id);
      const base = Math.max(g?.used ?? 0, this.consumed.get(u.id) ?? 0);
      this.consumed.set(u.id, base + u.n);
    }
    this.stack = r.stack;
    this.piece = null;
    this.dirty = true;
    this.say(r.clear, r.out);
    if (r.out > 0 || r.stack.topped) this.sentAt = 0;
    if (v.mode === 'sprint' && r.stack.lines >= 40) {
      this.finished = true;
      this.finishMs = Math.max(0, Math.round(this.serverNow - v.startAt));
      this.sentAt = 0;
    }
    this.version++;
  }

  /** Server time as of the current frame, set by `frame` before stepping. */
  serverNow = 0;

  private say(c: ClearOutcome, out: number) {
    const bits: string[] = [];
    if (c.name) bits.push(c.name);
    else if (c.lines === 3) bits.push('Triple');
    else if (c.lines === 2) bits.push('Double');
    const chained = c.lines > 0 && c.b2b >= 1;
    const sub = [
      chained ? 'Back-to-back' : null,
      c.combo >= 1 ? `${c.combo + 1} chain` : null,
      out > 0 ? `${out} thrown` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    if (bits.length === 0 && c.combo < 1) return;
    this.shout = {
      id: ++this.shoutId,
      text: bits[0] ?? `${c.combo + 1} chain`,
      ...(sub ? { sub } : {}),
      big: c.lines >= 4 || c.spin !== 'none' || c.perfect,
    };
  }

  private flush(now: number) {
    if (!this.dirty || this.sending || !this.view) return;
    if (now - this.sentAt < this.gap()) return;
    const v = this.view;
    const live = new Set(v.owed.map((g) => g.id));
    const used: [number, number][] = [...this.consumed].filter(([id]) => live.has(id));
    const action: TetraAction = {
      type: 'tick',
      round: this.round,
      stack: this.stack,
      used,
      ...(this.finishMs !== undefined ? { finishMs: this.finishMs } : {}),
    };
    this.dirty = false;
    this.sending = true;
    this.sentAt = now;
    this.send(action)
      .then((ok) => {
        if (!ok) this.dirty = true;
      })
      .catch(() => {
        this.dirty = true;
      })
      .finally(() => {
        this.sending = false;
      });
  }
}
