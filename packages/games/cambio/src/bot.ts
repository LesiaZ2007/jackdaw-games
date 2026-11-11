import { botSlips, type BotContext, type BotLevel } from '@jackdaw/engine';
import { houseValue, type House } from './cards';
import type { CambioAction, CambioPlayerView, CambioTableView } from './rules';

/**
 * (Card values and which cards give powers come from the view's house rules, so every variant
 * plays by its own table.)
 *
 * A computer player for Cambio, deciding from its own view (the faces it knows) and the public
 * table only. It keeps a drawn card when it beats a known high card of its own, or is low and
 * there is a card it hasn't seen; uses 7 and 8 to learn an unknown card of its own, 9 and 10 to
 * spy on one it doesn't know, and Jacks, Queens and Kings to trade a known high card for an
 * opponent's known low card or an unseen one. It takes the discard when it is 3 or lower and
 * beats a known card, and calls Cambio once all four of its cards are known and add up to
 * at most 4 (Easy), 6 (Normal) or 9 (Hard). After a very long round it calls regardless, so a
 * round can never drag on forever.
 *
 * Below Hard it now and then passes up a good move, like a person would.
 */

/** Called Cambio at or under this total, with all four cards known. */
const CALL_AT: Record<BotLevel, number> = { easy: 4, normal: 6, hard: 9 };
/** Turns per player after which a bot calls even without knowing its cards. */
const TOO_LONG = 12;

export function cambioBot(ctx: BotContext<CambioPlayerView, CambioTableView>): CambioAction | null {
  const { playerId: me, view: v, rng, level } = ctx;
  if (!v.players.includes(me)) return null;
  if (v.phase === 'peek') return v.ready.includes(me) ? null : { type: 'ready' };
  if (v.phase !== 'play' || v.toAct !== me) return null;

  const mine = v.grid[me] ?? [];
  const slots = mine.map((_, i) => i);
  const unknown = slots.filter((i) => mine[i] === null);
  const known = slots.filter((i) => mine[i] !== null);
  const worthOf = (c: number) => houseValue(c, v.house);
  const worth = (i: number) => worthOf(mine[i]!);
  // The highest card it knows of its own.
  const high = known.length ? known.reduce((a, b) => (worth(b) > worth(a) ? b : a)) : null;
  const rivals = v.players.filter((id) => id !== me && id !== v.caller);
  const slip = botSlips(level, rng);

  if (v.step === 'start') {
    const n = v.players.length;
    if (v.turns > 0 && !v.caller) {
      const sure =
        unknown.length === 0 && known.reduce((t, i) => t + worth(i), 0) <= callAt(level, v.house);
      if (sure || v.turns >= n * TOO_LONG) return { type: 'call' };
    }
    if (v.top !== null && high !== null && !slip) {
      const top = worthOf(v.top);
      if (top <= 3 && worth(high) > top) return { type: 'take' };
    }
    return { type: 'draw' };
  }

  if (v.step === 'held') {
    const card = v.held;
    if (card === null) return null;
    const value = worthOf(card);
    const fromPile = v.holding?.from === 'discard';
    if (slip) return place(rng.pick(slots));
    if (high !== null && value < worth(high)) return place(high);
    if (unknown.length && (fromPile || value < 5)) return place(rng.pick(unknown));
    if (fromPile) return place(high ?? 0);
    return { type: 'discard' };
  }

  if (v.step === 'power' && v.power) {
    switch (v.power.kind) {
      case 'peek':
        return unknown.length
          ? { type: 'peekOwn', slot: rng.pick(unknown) }
          : { type: 'skipPower' };
      case 'spy': {
        const options = rivals.flatMap((p) =>
          (v.grid[p] ?? []).flatMap((c, slot) => (c === null ? [{ player: p, slot }] : [])),
        );
        return options.length ? { type: 'spy', ...rng.pick(options) } : { type: 'skipPower' };
      }
      case 'swap': {
        if (slip || high === null || worth(high) < 7) return { type: 'skipPower' };
        const lows = rivals.flatMap((p) =>
          (v.grid[p] ?? []).flatMap((c, slot) =>
            c !== null && worthOf(c) <= 3 ? [{ player: p, slot, value: worthOf(c) }] : [],
          ),
        );
        const blind = rivals.flatMap((p) =>
          (v.grid[p] ?? []).flatMap((c, slot) => (c === null ? [{ player: p, slot }] : [])),
        );
        const pick = lows.length
          ? lows.reduce((a, b) => (b.value < a.value ? b : a))
          : blind.length
            ? rng.pick(blind)
            : null;
        return pick
          ? { type: 'swap', mySlot: high, player: pick.player, slot: pick.slot }
          : { type: 'skipPower' };
      }
      case 'king': {
        if (!rivals.length) return { type: 'skipPower' };
        const mySlot = high ?? (unknown.length ? rng.pick(unknown) : 0);
        const player = rng.pick(rivals);
        const theirs = (v.grid[player] ?? []).map((_, i) => i);
        const hidden = theirs.filter((i) => v.grid[player]![i] === null);
        return {
          type: 'kingLook',
          mySlot,
          player,
          slot: rng.pick(hidden.length ? hidden : theirs),
        };
      }
    }
  }

  if (v.step === 'king') {
    const l = v.look;
    const mineNow = l ? v.grid[me]?.[l.mySlot] : null;
    const theirs = l ? v.grid[l.player]?.[l.slot] : null;
    if (mineNow == null || theirs == null) return { type: 'skipPower' };
    return worthOf(theirs) < worthOf(mineNow) ? { type: 'kingSwap' } : { type: 'kingKeep' };
  }
  return null;
}

const place = (slot: number): CambioAction => ({ type: 'keep', slot });

/**
 * The total at or under which it calls, moved by the house rules: a steeper penalty (20, or
 * doubled) makes it wait for a lower hand, while a gentler one, or a bonus for winning, makes it
 * bolder.
 */
function callAt(level: BotLevel, house: House): number {
  let at = CALL_AT[level];
  if (house.penalty === 'double' || house.penalty >= 20) at -= 2;
  else if (house.penalty <= 5) at += 1;
  if (house.bonus !== 'total' && house.bonus < 0) at += 1;
  return at;
}
