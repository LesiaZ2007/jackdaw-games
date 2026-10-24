import type { BotContext, Rng } from '@jackdaw/engine';
import {
  BINGO,
  CENTRE,
  PREMIUM,
  RACK,
  SIZE,
  VALUE,
  checkPlay,
  type Board,
  type Placement,
} from './board';
import type { WordhoardAction, WordhoardPlayerView, WordhoardTableView } from './rules';
import { isWord, wordSet } from './words';

/**
 * A computer player for Letterhoard (2026-10-24: "play against bots"). It sees only its
 * own rack and the public board, and finds its plays the classic way (Appel and Jacobson's
 * crossword move generator): a letter tree of the game's own word list, the empty squares next
 * to tiles as anchors, and the letters each square allows going the other way. It takes one of
 * its best plays (usually the very best), swaps when it finds none, and passes when the bag is
 * too low to swap.
 *
 * The search has a fixed budget of steps, so a turn never takes long (blanks multiply the
 * choices); the first call on a server builds the letter tree once (a few hundred ms).
 */

// ── The letter tree ─────────────────────────────────────────────────────────

interface Trie {
  /** First child of each node, or -1. */
  first: Int32Array;
  /** Next sibling of each node, or -1. */
  next: Int32Array;
  /** The letter (0–25) on the edge into each node. */
  letter: Uint8Array;
  /** 1 where a word ends. */
  end: Uint8Array;
  /** Bit per letter that has a child. */
  mask: Int32Array;
}

let trie: Trie | null = null;

function buildTrie(): Trie {
  const first: number[] = [-1];
  const next: number[] = [-1];
  const letter: number[] = [0];
  const end: number[] = [0];
  const mask: number[] = [0];
  for (const word of wordSet()) {
    let node = 0;
    for (let i = 0; i < word.length; i++) {
      const l = word.charCodeAt(i) - 97;
      if (l < 0 || l > 25) {
        node = -1;
        break;
      }
      let c = first[node]!;
      while (c !== -1 && letter[c] !== l) c = next[c]!;
      if (c === -1) {
        c = first.length;
        first.push(-1);
        next.push(first[node]!);
        letter.push(l);
        end.push(0);
        mask.push(0);
        first[node] = c;
        mask[node]! |= 1 << l;
      }
      node = c;
    }
    if (node > 0) end[node] = 1;
  }
  return {
    first: Int32Array.from(first),
    next: Int32Array.from(next),
    letter: Uint8Array.from(letter),
    end: Uint8Array.from(end),
    mask: Int32Array.from(mask),
  };
}

const getTrie = () => (trie ??= buildTrie());

function child(t: Trie, node: number, l: number): number {
  if (!(t.mask[node]! & (1 << l))) return -1;
  for (let c = t.first[node]!; c !== -1; c = t.next[c]!) if (t.letter[c] === l) return c;
  return -1;
}

// ── Move generation ─────────────────────────────────────────────────────────

const ALL = (1 << 26) - 1;
const N = SIZE * SIZE;
/** Most search steps per turn: keeps a turn to a few milliseconds even with two blanks. */
const BUDGET = 100_000;
/** How many of the best plays to keep for the final choice. */
const KEEP = 8;

const LETTER_VALUE = Array.from({ length: 26 }, (_, i) => VALUE[String.fromCharCode(65 + i)] ?? 0);

export interface FoundPlay {
  tiles: Placement[];
  score: number;
  blanks: number;
}

/** One reading of the board, along rows (across) or along columns (down, transposed). */
interface Grid {
  /** Letter 0–25 per square, -1 when empty. */
  letters: Int8Array;
  /** Points per square (0 for a blank on the board). */
  values: Uint8Array;
  letterMult: Uint8Array;
  wordMult: Uint8Array;
}

function grids(board: Board): [Grid, Grid] {
  const make = (down: boolean): Grid => {
    const g: Grid = {
      letters: new Int8Array(N).fill(-1),
      values: new Uint8Array(N),
      letterMult: new Uint8Array(N).fill(1),
      wordMult: new Uint8Array(N).fill(1),
    };
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) {
        const [br, bc] = down ? [c, r] : [r, c];
        const i = r * SIZE + c;
        const cell = board[br]![bc];
        if (cell) {
          const l = cell.letter.charCodeAt(0) - 65;
          g.letters[i] = l;
          g.values[i] = cell.blank ? 0 : LETTER_VALUE[l]!;
        }
        const p = PREMIUM[br]![bc];
        if (p === 'dl') g.letterMult[i] = 2;
        if (p === 'tl') g.letterMult[i] = 3;
        if (p === 'dw') g.wordMult[i] = 2;
        if (p === 'tw') g.wordMult[i] = 3;
      }
    return g;
  };
  return [make(false), make(true)];
}

/**
 * Every play this rack can make (within the step budget), keeping the best few. `rack` counts
 * letters 0–25; `blanks` counts blanks.
 */
export function findPlays(board: Board, rackTiles: string[], budget = BUDGET): FoundPlay[] {
  const t = getTrie();
  const rack = new Int8Array(26);
  let blanks = 0;
  for (const tile of rackTiles) {
    if (tile === '?') blanks++;
    else rack[tile.charCodeAt(0) - 65]!++;
  }
  const rackSize = rackTiles.length;
  const firstPlay = board.every((row) => row.every((c) => !c));
  const best: FoundPlay[] = [];
  let steps = budget;

  const keep = (
    score: number,
    placed: { pos: number; l: number; blank: boolean }[],
    down: boolean,
    row: number,
  ) => {
    const used = placed.filter((p) => p.blank).length;
    if (best.length >= KEEP && score <= best[best.length - 1]!.score) return;
    const tiles: Placement[] = placed.map((p) => {
      const [r, c] = down ? [p.pos, row] : [row, p.pos];
      return {
        row: r,
        col: c,
        letter: String.fromCharCode(65 + p.l),
        ...(p.blank ? { blank: true } : {}),
      };
    });
    best.push({ tiles, score, blanks: used });
    best.sort((a, b) => b.score - a.score);
    if (best.length > KEEP) best.pop();
  };

  const [across, down] = grids(board);
  for (const [g, isDown] of [
    [across, false],
    [down, true],
  ] as const) {
    const L = g.letters;
    const cross = new Int32Array(SIZE);
    /** Points of the tiles already above and below a square, or -1 when there are none. */
    const crossBase = new Int32Array(SIZE);
    const anchor = new Uint8Array(SIZE);
    const placed: { pos: number; l: number; blank: boolean }[] = [];

    for (let r = 0; r < SIZE; r++) {
      const at = (c: number) => L[r * SIZE + c]!;
      const atRC = (rr: number, c: number) => (rr < 0 || rr >= SIZE ? -1 : L[rr * SIZE + c]!);
      let anyAnchor = false;
      for (let c = 0; c < SIZE; c++) {
        cross[c] = ALL;
        crossBase[c] = -1;
        anchor[c] = 0;
        if (at(c) !== -1) continue;
        const up = atRC(r - 1, c) !== -1;
        const dn = atRC(r + 1, c) !== -1;
        if (firstPlay) {
          anchor[c] = r === CENTRE && c === CENTRE ? 1 : 0;
        } else {
          anchor[c] =
            up || dn || (c > 0 && at(c - 1) !== -1) || (c < SIZE - 1 && at(c + 1) !== -1) ? 1 : 0;
        }
        if (anchor[c]) anyAnchor = true;
        if (!up && !dn) continue;
        // The letters that make a word with the tiles above and below.
        let top = r;
        while (atRC(top - 1, c) !== -1) top--;
        let base = 0;
        let node = 0;
        for (let rr = top; rr < r && node !== -1; rr++) {
          base += g.values[rr * SIZE + c]!;
          node = child(t, node, atRC(rr, c));
        }
        for (let rr = r + 1; atRC(rr, c) !== -1; rr++) base += g.values[rr * SIZE + c]!;
        let m = 0;
        if (node !== -1) {
          for (let ch = t.first[node]!; ch !== -1; ch = t.next[ch]!) {
            let n = ch;
            for (let rr = r + 1; n !== -1 && atRC(rr, c) !== -1; rr++) n = child(t, n, atRC(rr, c));
            if (n !== -1 && t.end[n]) m |= 1 << t.letter[ch]!;
          }
        }
        cross[c] = m;
        crossBase[c] = base;
      }
      if (!anyAnchor) continue;

      let anchorAt = 0;
      let start = 0;
      const extend = (
        pos: number,
        node: number,
        mainSum: number,
        mainMult: number,
        crossTotal: number,
      ) => {
        if (--steps < 0) return;
        if (pos >= SIZE || at(pos) === -1) {
          if (pos - 1 >= anchorAt && t.end[node] && placed.length > 0 && pos - start >= 2) {
            const score = mainSum * mainMult + crossTotal + (placed.length === RACK ? BINGO : 0);
            keep(score, placed, isDown, r);
          }
          if (pos >= SIZE) return;
        }
        const here = at(pos);
        if (here !== -1) {
          const n = child(t, node, here);
          if (n !== -1)
            extend(pos + 1, n, mainSum + g.values[r * SIZE + pos]!, mainMult, crossTotal);
          return;
        }
        if (placed.length >= rackSize) return;
        const allowed = cross[pos]! & t.mask[node]!;
        if (!allowed) return;
        const i = r * SIZE + pos;
        const lm = g.letterMult[i]!;
        const wm = g.wordMult[i]!;
        for (let ch = t.first[node]!; ch !== -1; ch = t.next[ch]!) {
          const l = t.letter[ch]!;
          if (!(allowed & (1 << l))) continue;
          for (let pass = 0; pass < 2; pass++) {
            const blank = pass === 1;
            if (blank ? blanks === 0 : rack[l] === 0) continue;
            if (blank) blanks--;
            else rack[l]!--;
            const v = (blank ? 0 : LETTER_VALUE[l]!) * lm;
            const cb = crossBase[pos]!;
            placed.push({ pos, l, blank });
            extend(
              pos + 1,
              ch,
              mainSum + v,
              mainMult * wm,
              cb >= 0 ? crossTotal + (cb + v) * wm : crossTotal,
            );
            placed.pop();
            if (blank) blanks++;
            else rack[l]!++;
          }
        }
      };

      for (let c = 0; c < SIZE; c++) {
        if (!anchor[c]) continue;
        anchorAt = c;
        if (c > 0 && at(c - 1) !== -1) {
          // Tiles run up to the anchor from the left: the word starts with them.
          let s = c - 1;
          while (s > 0 && at(s - 1) !== -1) s--;
          let node = 0;
          let sum = 0;
          for (let k = s; k < c && node !== -1; k++) {
            node = child(t, node, at(k));
            sum += g.values[r * SIZE + k]!;
          }
          if (node === -1) continue;
          start = s;
          extend(c, node, sum, 1, 0);
        } else {
          // Free squares to the left (up to the previous anchor) can take rack tiles.
          let limit = 0;
          for (let k = c - 1; k >= 0 && at(k) === -1 && !anchor[k]; k--) limit++;
          limit = Math.min(limit, rackSize - 1);
          for (let left = 0; left <= limit; left++) {
            start = c - left;
            extend(start, 0, 0, 1, 0);
          }
        }
      }
    }
  }
  return best;
}

// ── Choosing a move ─────────────────────────────────────────────────────────

/** Tiles worth keeping when swapping: blanks, S, and a few easy letters. */
const KEEPERS = 'ESAIRTNLOD';

function swapTiles(rack: string[]): string[] {
  const kept: string[] = [];
  const out: string[] = [];
  for (const tile of rack) {
    if (tile === '?' || (tile === 'S' && !kept.includes('S'))) kept.push(tile);
    else if (KEEPERS.includes(tile) && !kept.includes(tile) && kept.length < 4) kept.push(tile);
    else out.push(tile);
  }
  if (out.length === 0) out.push(kept.find((x) => x !== '?') ?? kept[0]!);
  return out;
}

/** A play the server will accept: checked with the game's own placement rules and word list. */
function legal(board: Board, tiles: Placement[]): boolean {
  const check = checkPlay(board, tiles);
  return check.ok && check.words.every((w) => isWord(w.word));
}

export function wordhoardBot(
  ctx: BotContext<WordhoardPlayerView, WordhoardTableView>,
): WordhoardAction | null {
  const v = ctx.view;
  if (v.over || v.turn !== v.side || v.rack.length === 0) return null;
  const rng: Rng = ctx.rng;
  const plays = findPlays(v.board, v.rack);
  // Spending a blank on a small score wastes it.
  const worth = (p: FoundPlay) => p.score - (p.blanks > 0 && p.score < 30 ? 10 * p.blanks : 0);
  const ranked = plays.filter((p) => p.score > 0).sort((a, b) => worth(b) - worth(a));
  if (ranked.length > 0) {
    const top = worth(ranked[0]!);
    const close = ranked.filter((p) => worth(p) >= top * 0.75);
    const order = rng.next() < 0.7 ? ranked : [rng.pick(close), ...ranked];
    for (const p of order) if (legal(v.board, p.tiles)) return { type: 'play', tiles: p.tiles };
  }
  if (v.bagCount >= RACK) return { type: 'swap', tiles: swapTiles(v.rack) };
  // A zero-point play (blanks only) still beats a pass when that's all there is.
  for (const p of plays) if (legal(v.board, p.tiles)) return { type: 'play', tiles: p.tiles };
  return { type: 'pass' };
}
