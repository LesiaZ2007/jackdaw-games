import type { BotContext, Rng } from '@jackdaw/engine';
import { cluesFor } from './clues';
import {
  MIDDLE,
  type WavelengthAction,
  type WavelengthPlayerView,
  type WavelengthTableView,
} from './rules';
import type { Spectrum } from './spectrums';

/**
 * Wavelength's computer players, deciding from their own view only (the psychic sees the target
 * because a person in that seat would).
 *
 * Psychic: of the two cards, the clue in clues.ts that sits nearest the target ("Bath water" at
 * 68 on Cold to Hot). Guesser: a clue it knows from the table goes near its spot, a clue that
 * names one end goes towards that end, anything else lands somewhere sensible; always with a
 * little wobble, as a person's hand has. On a shared dial the first bot to move sets it and the
 * rest agree, so bots never tug the dial back and forth. The other team calls left or right by
 * where it would have put the dial.
 */

const clean = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** A wobble of up to ±`size`, most often small. */
const wobble = (rng: Rng, size: number) => (rng.next() + rng.next() - 1) * size;
const clamp = (x: number) => Math.round(Math.min(100, Math.max(0, x)) * 10) / 10;

/** Where a clue for this card probably sits, before any wobble; null when it's anyone's guess. */
export function placeClue(spectrum: Spectrum, clue: string): number | null {
  const c = clean(clue);
  if (!c) return null;
  const known = cluesFor(spectrum).find((k) => clean(k.text) === c);
  if (known) return known.at;
  const [left, right] = spectrum.map(clean) as [string, string];
  const saysLeft = c.includes(left);
  const saysRight = c.includes(right);
  if (saysLeft && !saysRight) return 15;
  if (saysRight && !saysLeft) return 85;
  return null;
}

/** Where this bot would turn the dial for the round's clue. */
function estimate(view: WavelengthPlayerView, rng: Rng): number {
  const r = view.round;
  const spectrum = r.spectrums[r.card ?? 0];
  const spot = placeClue(spectrum, r.clue ?? '');
  return clamp(spot === null ? 30 + rng.next() * 40 : spot + wobble(rng, 7));
}

function giveClue(view: WavelengthPlayerView, rng: Rng): WavelengthAction {
  const target = view.target ?? MIDDLE;
  const picks = ([0, 1] as const).map((card) => {
    const options = cluesFor(view.round.spectrums[card]);
    let best = options[0];
    for (const o of options) if (Math.abs(o.at - target) < Math.abs(best!.at - target)) best = o;
    return { card, clue: best, off: best ? Math.abs(best.at - target) : Infinity };
  });
  const [a, b] = picks as [(typeof picks)[0], (typeof picks)[0]];
  const pick = a.off < b.off ? a : b.off < a.off ? b : rng.pick(picks);
  if (pick.clue) return { type: 'clue', card: pick.card, text: pick.clue.text };
  // A card the table doesn't know (never, while clues.test.ts passes): name the nearer end.
  const [left, right] = view.round.spectrums[pick.card];
  return {
    type: 'clue',
    card: pick.card,
    text: target < MIDDLE ? `Fairly ${left}` : `Fairly ${right}`,
  };
}

export function wavelengthBot(
  ctx: BotContext<WavelengthPlayerView, WavelengthTableView>,
): WavelengthAction | null {
  const { view, rng, playerId: me } = ctx;
  const r = view.round;

  if (view.phase === 'clue') return r.psychic === me ? giveClue(view, rng) : null;

  if (view.phase === 'guess') {
    if (!view.guessers.includes(me) || r.locks.includes(me)) return null;
    if (view.guessing === 'average') return { type: 'lock', on: true, at: estimate(view, rng) };
    // Shared dial: the first to touch it sets it, everyone after agrees with what's there.
    if (r.dialSeq === 0) {
      const at = estimate(view, rng);
      if (Math.abs(at - r.dial) >= 0.5) return { type: 'dial', at };
    }
    return { type: 'lock', on: true, at: r.dial };
  }

  if (view.phase === 'call') {
    if (!view.callers.includes(me) || r.calls[me] || r.guess === null) return null;
    // Like a team talking it over: the first call stands, the rest back the side ahead.
    const made = Object.values(r.calls);
    const left = made.filter((c) => c === 'left').length;
    const right = made.length - left;
    if (left !== right) return { type: 'call', side: left > right ? 'left' : 'right' };
    const mine = estimate(view, rng);
    const side =
      mine < r.guess ? 'left' : mine > r.guess ? 'right' : rng.pick(['left', 'right'] as const);
    return { type: 'call', side };
  }

  // The reveal moves on by itself; people get to enjoy it.
  return null;
}
