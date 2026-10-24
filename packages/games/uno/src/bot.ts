import type { BotContext, Rng } from '@jackdaw/engine';
import { COLOURS, cardOf, isWild, points, type Colour } from './cards';
import { playable, type UnoAction, type UnoPlayerView, type UnoTableView } from './rules';

/**
 * A computer player for UNO (Lesia, 2026-10-24: "play against bots"), deciding from its own hand
 * and the public table only. It catches anyone who forgets to call UNO, always calls its own,
 * plays its most costly matching cards first and saves its wilds, hits a player close to going
 * out with Skips, Draw Twos and Wild Draw Fours, never bluffs a Wild Draw Four when it has a
 * choice, names the colour it holds most of, passes draw cards on when stacking is allowed, and
 * sometimes challenges a Wild Draw Four from a player with several cards left.
 *
 * A function declaration: rules.ts imports this file and this file imports rules.ts.
 */
export function unoBot(ctx: BotContext<UnoPlayerView, UnoTableView>): UnoAction | null {
  const { playerId: me, view: v, rng } = ctx;
  if (v.phase !== 'play' || !v.players.includes(me)) return null;
  if (v.uncalled && v.uncalled !== me) return { type: 'catch' };
  if (v.hand.length === 1 && !v.called.includes(me)) return { type: 'call' };
  if (v.toAct !== me) return null;

  const options = playable(v);
  if (v.pending) {
    if (options.length) return playCard(v, best(v, options, rng), rng);
    const from = v.counts[v.pending.from] ?? 0;
    if (v.pending.wild4 && from >= 3 && rng.next() < 0.5) return { type: 'challenge' };
    return { type: 'draw' };
  }
  if (v.drawn !== null) {
    // Keep a drawn Wild Draw Four rather than bluff it.
    if (cardOf(v.drawn).face === 'wild4' && holdsColour(v, v.drawn)) return { type: 'pass' };
    return playCard(v, v.drawn, rng);
  }
  if (!options.length) return { type: 'draw' };
  return playCard(v, best(v, options, rng), rng);
}

/** Holding something in the colour in play, besides `except`: a Wild Draw Four would be a bluff. */
const holdsColour = (v: UnoPlayerView, except: number) =>
  v.hand.some((id) => id !== except && cardOf(id).colour === v.colour);

/** The next player in the direction of play. */
function nextSeat(v: UnoPlayerView): string {
  const n = v.players.length;
  const i = v.players.indexOf(v.me);
  return v.players[(((i + v.dir) % n) + n) % n]!;
}

/** The card to play: the costliest to be caught with, action cards on a player close to out. */
function best(v: UnoPlayerView, options: number[], rng: Rng): number {
  const threat = (v.counts[nextSeat(v)] ?? 7) <= 2;
  const most = favourite(v.hand, null, rng);
  const score = (id: number) => {
    const { face, colour } = cardOf(id);
    let n: number;
    if (face === 'wild4') n = holdsColour(v, id) ? -50 : threat ? 40 : 1;
    else if (face === 'wild') n = threat ? 6 : 2;
    else if (face === 'skip' || face === 'rev' || face === 'draw2')
      n = 14 + (threat ? 30 : 0) + (face === 'draw2' ? 2 : 0);
    else n = 4 + points(id);
    if (colour === most) n += 2;
    return n + rng.next() * 0.5;
  };
  const scored = options.map((id) => ({ id, n: score(id) }));
  return scored.reduce((a, b) => (b.n > a.n ? b : a)).id;
}

/** The colour held most (ignoring `except` and the wilds); a random one when there's none. */
function favourite(hand: number[], except: number | null, rng: Rng): Colour {
  const count: Record<Colour, number> = { r: 0, y: 0, g: 0, b: 0 };
  for (const id of hand) {
    const c = cardOf(id).colour;
    if (id !== except && c) count[c]++;
  }
  const top = Math.max(...COLOURS.map((c) => count[c]));
  return rng.pick(COLOURS.filter((c) => count[c] === top));
}

function playCard(v: UnoPlayerView, card: number, rng: Rng): UnoAction {
  const call = v.hand.length === 2;
  return isWild(card)
    ? { type: 'play', card, colour: favourite(v.hand, card, rng), call }
    : { type: 'play', card, call };
}
