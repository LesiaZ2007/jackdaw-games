import type { BotContext } from '@jackdaw/engine';
import { HINTS, THEMES, type Theme } from './associations';
import type { Card, CodenamesAction, CodenamesPlayerView, CodenamesTableView } from './rules';
import type { Team } from './teams';

/**
 * Codenames' computer players. They decide from their own view only: a bot spymaster has the key
 * because a person in that seat would; a bot operative has the board, the clues and its
 * teammates' suggestions. What they know about words is the public table in associations.ts.
 *
 * Spymaster: the theme that covers the most of its team's words while steering clear of the
 * assassin and the other team ("ARCTIC 3" for ICE, SLED and GLACIER), or one word's hint
 * ("QUIVER 1" for ARROW) when no theme links two safely.
 * Operative: the board words the clue points to by the same table (or by spelling, for a
 * person's clue like SNOWMAN), as many as the number, then ends the turn. It backs a teammate's
 * suggestion when it likes it as much as its own, so a team of bots agrees instead of arguing.
 */

const norm = (w: string) => w.trim().toUpperCase();

const THEME_BY_NAME = new Map<string, Theme>();
for (const theme of THEMES) for (const name of theme.names) THEME_BY_NAME.set(name, theme);
const WORD_BY_HINT = new Map(Object.entries(HINTS).map(([word, hint]) => [hint, word]));

/** How strongly a clue points at each board word: 0 for not at all. */
export function readClue(clue: string, words: readonly string[]): number[] {
  const c = norm(clue);
  const theme =
    THEME_BY_NAME.get(c) ?? (c.endsWith('S') ? THEME_BY_NAME.get(c.slice(0, -1)) : undefined);
  const hinted = WORD_BY_HINT.get(c);
  return words.map((w) => {
    if (w === hinted) return 1.2;
    if (theme?.members.includes(w)) return 1;
    // A person's clue built on a board word (SNOWMAN for SNOW, or a word inside the clue).
    if (w.length >= 3 && c !== w && (c.startsWith(w) || c.endsWith(w))) return 0.8;
    if (c.length >= 4 && c !== w && (w.startsWith(c) || w.endsWith(c))) return 0.8;
    return 0;
  });
}

type View = CodenamesPlayerView;

function giveClue(view: View, me: Team, rng: BotContext<View, CodenamesTableView>['rng']) {
  const key = view.key!;
  const open = view.words.map((_, i) => view.revealed[i] === null);
  const given = new Set(view.clues.map((c) => c.word));
  const mine = view.words.filter((_, i) => open[i] && key[i] === me);

  type Pick = { word: string; count: number; score: number };
  const picks: Pick[] = [];
  for (const theme of THEMES) {
    const name = theme.names[0]!;
    if (given.has(name)) continue;
    let ours = 0;
    let risk = 0;
    let assassin = false;
    view.words.forEach((w, i) => {
      if (!open[i] || !theme.members.includes(w)) return;
      const card: Card = key[i]!;
      if (card === me) ours++;
      else if (card === 'assassin') assassin = true;
      else risk += card === 'bystander' ? 0.5 : 1;
    });
    if (assassin || ours < 2) continue;
    const score = ours - risk;
    if (score >= 0.5) picks.push({ word: name, count: ours, score: score + rng.next() * 0.01 });
  }
  picks.sort((a, b) => b.score - a.score);
  if (picks[0]) return { type: 'clue', word: picks[0].word, count: picks[0].count } as const;

  // No theme links two safely: one word, by its hint. Never the same hint twice in a row.
  const fresh = mine.filter((w) => HINTS[w] && !given.has(HINTS[w]));
  const word = rng.pick(fresh.length > 0 ? fresh : mine);
  const hint = HINTS[word];
  return { type: 'clue', word: hint ?? 'HUNCH', count: 1 } as const;
}

function guess(
  view: View,
  ctx: BotContext<View, CodenamesTableView>,
  me: Team,
): CodenamesAction | null {
  const clue = view.clues[view.clues.length - 1];
  if (!clue || clue.team !== me) return null;
  const open = (i: number) => view.revealed[i] === null;

  const weight = readClue(clue.word, view.words).map((w, i) => (open(i) ? w : 0));
  // Words an earlier clue of ours pointed at that are still hidden: worth a bonus guess.
  for (const old of view.clues.slice(0, -1)) {
    if (old.team !== me) continue;
    const found = old.guesses.filter((g) => g.card === me).length;
    if (old.count !== null && old.count > 0 && found >= old.count) continue;
    readClue(old.word, view.words).forEach((w, i) => {
      if (open(i) && w >= 1) weight[i] = Math.max(weight[i]!, 0.6);
    });
  }

  const strong = weight.filter((w) => w >= 0.8).length;
  const target = clue.count && clue.count > 0 ? clue.count : Math.max(1, strong);
  const made = clue.guesses.length;

  const team = view.players.filter(
    (id) => view.teams[id] === me && view.spymasters[me] !== id && id !== ctx.playerId,
  );
  const mySuggestion = view.suggestions[ctx.playerId];

  // Best word by this clue (a little noise breaks ties).
  let best = -1;
  let bestW = -1;
  weight.forEach((w, i) => {
    if (!open(i)) return;
    const v = w + ctx.rng.next() * 0.001;
    if (v > bestW) {
      bestW = v;
      best = i;
    }
  });
  if (best < 0) return null;
  const sure = weight[best]! >= 0.8 && made < target;
  const bonus = weight[best]! >= 0.6 && made === target;

  if (!sure && !bonus) {
    if (made > 0) return { type: 'pass' };
    // The rules ask for one guess at least: a teammate's idea, or a careful stab.
    const backed = team.map((id) => view.suggestions[id]).find((i) => i !== undefined);
    if (mySuggestion !== undefined && open(mySuggestion)) {
      best = mySuggestion;
    } else if (backed === undefined && weight[best]! < 0.5) {
      const hidden = view.words.map((_, i) => i).filter(open);
      best = ctx.rng.pick(hidden);
    } else if (backed !== undefined) {
      best = backed;
    }
  } else {
    // Keep to our own suggestion while it's as good, and back a teammate's we like as much.
    if (
      mySuggestion !== undefined &&
      open(mySuggestion) &&
      weight[mySuggestion]! >= weight[best]! - 0.01
    )
      best = mySuggestion;
    for (const id of team) {
      const s = view.suggestions[id];
      if (s !== undefined && s !== best && open(s) && weight[s]! >= weight[best]! - 0.01) best = s;
    }
  }

  if (mySuggestion !== best) return { type: 'suggest', index: best };
  return { type: 'guess', index: best };
}

export function codenamesBot(ctx: BotContext<View, CodenamesTableView>): CodenamesAction | null {
  const { view } = ctx;
  const me = view.myTeam;
  if (!me || view.phase === 'over' || view.turn !== me) return null;
  if (view.spymaster) return view.phase === 'clue' && view.key ? giveClue(view, me, ctx.rng) : null;
  return view.phase === 'guess' ? guess(view, ctx, me) : null;
}
