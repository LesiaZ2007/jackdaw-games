import {
  GameError,
  type GameModule,
  type GameResult,
  type GameStory,
  type Highlight,
  type RecapEvent,
  type RecapStats,
  type Rng,
  type StoryBars,
  type StoryFact,
  type StoryHeadline,
  buildStory,
  raceStory,
} from '@jackdaw/engine';
import { z } from 'zod';
import { BANK } from './bank';
import { CATEGORIES, type Category, type Fact } from './bank/types';
import { fictionaryBot } from './bot';
import { meta } from './meta';
import {
  CHOOSE_MS,
  DECKS,
  FINAL_EXTRA_MS,
  FOOL_POINTS,
  LENGTHS,
  LIE_BEAT_MS,
  LIE_MAX,
  LIKE_POINTS,
  MIN_ANSWERS,
  NUDGE_MS,
  OFFER,
  ROUND_CARDS,
  SCORES_BEAT_MS,
  TABS,
  TIMERS,
  TIMES,
  TRUTH_BEAT_MS,
  TRUTH_POINTS,
} from './constants';
import { isTruth } from './truth';

/**
 * Fictionary for 2–12 players: the old parlor game, grown into bluffing trivia. Each card is a
 * true but unlikely fact (or a real, obscure word) with one blank. Everyone writes a lie for the
 * blank, then everyone tries to pick the truth out of all the lies. Finding the truth scores, and
 * so does every player your lie fools.
 *
 * A game is three rounds: Round 1, Round 2 (points doubled) and the Final Fib (one card, points
 * tripled). Before each card a rotating chooser picks one of three tabs (categories) from the
 * dictionary, unless the host has the tabs dealt at random.
 *
 * The bank (./bank) never leaves the server: views carry the card in play, and its answer and
 * note only from the reveal on.
 */

export { CATEGORIES, type Category };
export * from './constants';

export const optionsSchema = z.object({
  deck: z.enum(DECKS).describe('Deck'),
  length: z.enum(LENGTHS).describe('Length'),
  timer: z.enum(TIMERS).describe('Timer'),
  tabs: z.enum(TABS).describe('Tabs'),
});
export type FictionaryOptions = z.infer<typeof optionsSchema>;

export const actionSchema = z.discriminatedUnion('type', [
  /** The chooser picks one of the tabs offered. */
  z.object({ type: z.literal('choose'), tab: z.string().max(20) }),
  /** Write (or rewrite) your lie for the card in play. */
  z.object({ type: z.literal('write'), text: z.string().max(LIE_MAX * 3) }),
  /** Ask the house for two lies to borrow (once a card). */
  z.object({ type: z.literal('help') }),
  /** Pick the answer you think is true. */
  z.object({ type: z.literal('pick'), id: z.string().max(4) }),
  /** Like an answer (one a card; the same id again takes it back). */
  z.object({ type: z.literal('like'), id: z.string().max(4) }),
  /** Someone who's done starts a short countdown for everyone else. */
  z.object({ type: z.literal('nudge') }),
  /** From a finished reveal: the next card now (after = the card it's leaving). */
  z.object({ type: z.literal('next'), after: z.number().int().positive() }),
]);
export type FictionaryAction = z.infer<typeof actionSchema>;

export type Phase = 'choose' | 'write' | 'pick' | 'reveal' | 'over';
export type Stage = 1 | 2 | 3;

/** One answer on the list. `by` is empty for a house lie and for the truth. */
export interface Entry {
  id: string;
  text: string;
  by: string[];
  truth: boolean;
}

/** The card being played. Lies, picks, likes and the house's help stay on the server until the reveal. */
export interface Play {
  n: number;
  stage: Stage;
  chooser: string | null;
  offer: Category[];
  cat: Category | null;
  /** The card's index in BANK[cat]. */
  idx: number;
  lies: Record<string, string>;
  /** Fact.lies indices each player was handed by "Help me lie". */
  help: Record<string, number[]>;
  entries: Entry[];
  picks: Record<string, string>;
  likes: Record<string, string>;
}

/** An answer as it shows on the reveal and in the results. */
export interface RevealEntry extends Entry {
  /** Who picked it. */
  pickers: string[];
  likes: number;
}

/** One finished card, public from its reveal on. */
export interface CardResult {
  n: number;
  stage: Stage;
  cat: Category;
  q: string;
  answer: string;
  note: string;
  src: string;
  entries: RevealEntry[];
  /** Points each player made on this card. */
  gains: Record<string, number>;
}

export interface FictionaryState {
  players: string[];
  deck: 'mixed' | 'facts' | 'words';
  /** Cards in Round 1 and Round 2. */
  plan: [number, number];
  times: { write: number; pick: number } | null;
  randomTabs: boolean;
  phase: Phase;
  play: Play;
  scores: Record<string, number>;
  history: CardResult[];
  /** "cat:idx" of every card dealt this game. */
  used: string[];
  /** When the current phase closes by itself; null with no timer running. */
  actBy: number | null;
  /** When the reveal started, and when it moves on by itself. */
  revealAt: number | null;
  nextAt: number | null;
  /** Rotates the chooser. */
  turns: number;
  recap: RecapEvent[];
}

/** The card as everyone sees it before the reveal: the question and the answers, no authors. */
export interface PublicPlay {
  n: number;
  stage: Stage;
  chooser: string | null;
  offer: Category[];
  cat: Category | null;
  q: string | null;
  /** From the pick on: the answers, in their shuffled order. */
  entries: { id: string; text: string }[];
  /** Who has written a lie, and who has picked. */
  written: string[];
  picked: string[];
}

export interface FictionaryTableView {
  players: string[];
  deck: FictionaryState['deck'];
  plan: [number, number];
  /** Cards in the whole game. */
  total: number;
  timed: boolean;
  phase: Phase;
  play: PublicPlay;
  scores: Record<string, number>;
  history: CardResult[];
  /** The card being revealed, in full (also the last entry of history). */
  reveal: CardResult | null;
  actBy: number | null;
  revealAt: number | null;
  nextAt: number | null;
}

export interface FictionaryPlayerView extends FictionaryTableView {
  me: string;
  myLie: string | null;
  /** Lies the house handed me, once I asked. */
  suggestions: string[];
  /** Answers I can't pick (my own lie, merged or not). */
  mine: string[];
  myPick: string | null;
  myLike: string | null;
}

/** What the results screen gets. */
export interface FictionaryReveal {
  players: string[];
  scores: Record<string, number>;
  history: CardResult[];
}

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export const factOf = (cat: Category, idx: number): Fact => BANK[cat][idx]!;

/** The categories a deck deals from (only those with cards in the bank). */
export function deckCategories(deck: FictionaryState['deck']): Category[] {
  const all = (Object.keys(CATEGORIES) as Category[]).filter((c) => BANK[c].length > 0);
  if (deck === 'words') return all.filter((c) => c === 'words');
  if (deck === 'facts') return all.filter((c) => c !== 'words');
  return all;
}

const totalOf = (plan: [number, number]) => plan[0] + plan[1] + 1;
export const stageOf = (n: number, plan: [number, number]): Stage =>
  n <= plan[0] ? 1 : n <= plan[0] + plan[1] ? 2 : 3;

/** Tidy a typed lie: one line, single spaces, no full stop at the end. */
export const cleanLie = (text: string) =>
  text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.。]+$/, '')
    .trim();

/** Same lie, whatever the case, spacing or punctuation: those merge. */
const sameKey = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Fresh cards left in a category. */
function freshIn(cat: Category, used: string[]): number[] {
  return BANK[cat].map((_, i) => i).filter((i) => !used.includes(`${cat}:${i}`));
}

/** Up to OFFER tabs for the chooser, each with a card left. */
function dealOffer(deck: FictionaryState['deck'], used: string[], rng: Rng): Category[] {
  const cats = deckCategories(deck);
  const open = cats.filter((c) => freshIn(c, used).length > 0);
  return rng.shuffle(open.length > 0 ? open : cats).slice(0, OFFER);
}

/** Deal a card from a tab (starting the tab over if it has run dry). */
function dealCard(cat: Category, used: string[], rng: Rng): number {
  const fresh = freshIn(cat, used);
  return rng.pick(fresh.length > 0 ? fresh : BANK[cat].map((_, i) => i));
}

const blankPlay = (n: number, stage: Stage): Play => ({
  n,
  stage,
  chooser: null,
  offer: [],
  cat: null,
  idx: -1,
  lies: {},
  help: {},
  entries: [],
  picks: {},
  likes: {},
});

/** Open the write phase on a card from `cat`. */
function openCard(s: FictionaryState, cat: Category, rng: Rng, now: number): FictionaryState {
  const idx = dealCard(cat, s.used, rng);
  return {
    ...s,
    phase: 'write',
    play: { ...s.play, cat, idx },
    used: [...s.used, `${cat}:${idx}`],
    actBy: s.times ? now + s.times.write * 1000 : null,
  };
}

/** Start card `n`: offer the chooser tabs, or deal straight from a random one. */
function startCard(s: FictionaryState, n: number, rng: Rng, now: number): FictionaryState {
  const play = blankPlay(n, stageOf(n, s.plan));
  const offer = dealOffer(s.deck, s.used, rng);
  const base: FictionaryState = { ...s, play, revealAt: null, nextAt: null };
  if (s.randomTabs || offer.length === 1) return openCard(base, rng.pick(offer), rng, now);
  const chooser = s.players[s.turns % s.players.length]!;
  return {
    ...base,
    phase: 'choose',
    play: { ...play, chooser, offer },
    turns: s.turns + 1,
    actBy: now + CHOOSE_MS,
  };
}

/** Writing is over: build the list of answers (truth, merged lies, house lies) and open the pick. */
function openPick(s: FictionaryState, rng: Rng, now: number): FictionaryState {
  const p = s.play;
  const fact = factOf(p.cat!, p.idx);
  const groups = new Map<string, { text: string; by: string[] }>();
  for (const id of s.players) {
    const lie = p.lies[id];
    if (!lie) continue;
    const key = sameKey(lie);
    const g = groups.get(key);
    if (g) g.by.push(id);
    else groups.set(key, { text: lie, by: [id] });
  }
  const answers: Omit<Entry, 'id'>[] = [
    { text: fact.a, by: [], truth: true },
    ...[...groups.values()].map((g) => ({ ...g, truth: false })),
  ];
  // House lies fill up to MIN_ANSWERS, first the ones nobody was handed.
  const handed = new Set(Object.values(p.help).flat());
  const house = rng
    .shuffle(fact.lies.map((_, i) => i))
    .sort((a, b) => Number(handed.has(a)) - Number(handed.has(b)))
    .map((i) => fact.lies[i]!)
    .filter((text) => !groups.has(sameKey(text)));
  while (answers.length < MIN_ANSWERS && house.length > 0)
    answers.push({ text: house.shift()!, by: [], truth: false });
  const entries = rng.shuffle(answers).map((e, i) => ({ ...e, id: LETTERS[i]! }));
  return {
    ...s,
    phase: 'pick',
    play: { ...p, entries },
    actBy: s.times ? now + s.times.pick * 1000 : null,
  };
}

/** Picking is over: score the card and start the reveal. */
function openReveal(s: FictionaryState, now: number): FictionaryState {
  const p = s.play;
  const fact = factOf(p.cat!, p.idx);
  const mult = p.stage;
  const gains: Record<string, number> = Object.fromEntries(s.players.map((id) => [id, 0]));
  const entries: RevealEntry[] = p.entries.map((e) => ({
    ...e,
    pickers: s.players.filter((id) => p.picks[id] === e.id),
    likes: s.players.filter((id) => p.likes[id] === e.id).length,
  }));
  for (const e of entries) {
    for (const id of e.pickers) {
      if (e.truth) gains[id]! += TRUTH_POINTS * mult;
      else for (const a of e.by) gains[a]! += FOOL_POINTS * mult;
    }
    if (!e.truth) for (const a of e.by) gains[a]! += e.likes * LIKE_POINTS * mult;
  }
  const scores = { ...s.scores };
  for (const id of s.players) scores[id] = (scores[id] ?? 0) + gains[id]!;
  const result: CardResult = {
    n: p.n,
    stage: p.stage,
    cat: p.cat!,
    q: fact.q,
    answer: fact.a,
    note: fact.note,
    src: fact.src,
    entries,
    gains,
  };
  const fooled = entries.filter((e) => !e.truth && e.pickers.length > 0);
  const duration =
    fooled.length * LIE_BEAT_MS +
    TRUTH_BEAT_MS +
    SCORES_BEAT_MS +
    (p.stage === 3 ? FINAL_EXTRA_MS : 0);
  const recap = [...s.recap, ...recapOf(result, p.chooser)];
  return {
    ...s,
    phase: 'reveal',
    scores,
    history: [...s.history, result],
    recap,
    actBy: null,
    revealAt: now,
    nextAt: now + duration,
  };
}

/** Players for a recap line: "{wren}", "{wren} and {rook}", "{wren}, {rook} and {finch}". */
function who(ids: string[]): string {
  const n = ids.map((id) => `{${id}}`);
  return n.length <= 1 ? (n[0] ?? '') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
}

const pts = (n: number) => n.toLocaleString('en-US');

/** The card with its answer in the blank, quoted unless the blank already sits in quotes. */
export function fillBlank(q: string, answer: string): string {
  return /[“‘"]____/.test(q) ? q.replace('____', answer) : q.replace('____', `“${answer}”`);
}

/**
 * What a card adds to the recap (2026-11-16: "make sure there's a game recap"): the fact with
 * its truth, who found it, every lie that fooled someone (with who fell for it), and the
 * favorite lie when it was liked. The Final Fib and any lie that fooled two or more are the
 * turning points the TV shows first.
 */
export function recapOf(card: CardResult, chooser: string | null): RecapEvent[] {
  const mult = card.stage;
  const truth = card.entries.find((e) => e.truth)!;
  const found = truth.pickers;
  const stage = card.stage === 3 ? 'The Final Fib' : `Round ${card.stage}`;
  const out: RecapEvent[] = [
    {
      round: card.n,
      actor: chooser ?? undefined,
      text: `${stage}, ${CATEGORIES[card.cat]}${chooser ? ` (chosen by {${chooser}})` : ''}: ${fillBlank(card.q, card.answer)}`,
      tag: found.length === 0 ? 'Nobody found it' : `${found.length} found it`,
      tone: found.length > 0 ? 'good' : 'bad',
      key: card.stage === 3,
      data: { kind: 'card', cat: card.cat, stage: card.stage },
    },
  ];
  if (found.length > 0)
    out.push({
      round: card.n,
      actor: found[0],
      text: `${who(found)} found the truth.`,
      tag: `+${pts(1000 * mult)}${found.length > 1 ? ' each' : ''}`,
      tone: 'good',
      data: { kind: 'truth' },
    });
  const fooled = card.entries
    .filter((e) => !e.truth && e.pickers.length > 0)
    .sort((a, b) => b.pickers.length - a.pickers.length);
  for (const e of fooled) {
    if (e.by.length === 0) {
      out.push({
        round: card.n,
        text: `A house lie, “${e.text}”, fooled ${who(e.pickers)}.`,
        tag: `${e.pickers.length} fooled`,
        tone: 'bad',
        data: { kind: 'house' },
      });
      continue;
    }
    out.push({
      round: card.n,
      actor: e.by[0],
      text: `${who(e.by)}’s lie “${e.text}” fooled ${who(e.pickers)}.`,
      tag: `+${pts(FOOL_POINTS * mult * e.pickers.length)}${e.by.length > 1 ? ' each' : ''}`,
      tone: 'good',
      key: e.pickers.length >= 2,
      data: { kind: 'fib', fooled: e.pickers.length },
    });
  }
  const fave = card.entries
    .filter((e) => !e.truth && e.by.length > 0 && e.likes > 0)
    .sort((a, b) => b.likes - a.likes)[0];
  if (fave)
    out.push({
      round: card.n,
      actor: fave.by[0],
      text: `${who(fave.by)}’s “${fave.text}” was the favorite lie, with ${fave.likes} like${fave.likes === 1 ? '' : 's'}.`,
      tag: `+${pts(LIKE_POINTS * mult * fave.likes)}`,
      tone: 'good',
      data: { kind: 'like' },
    });
  return out;
}

/** After a reveal: the next card, or the end. */
function advance(s: FictionaryState, rng: Rng, now: number): FictionaryState {
  if (s.play.n >= totalOf(s.plan))
    return { ...s, phase: 'over', actBy: null, revealAt: null, nextAt: null };
  return startCard(s, s.play.n + 1, rng, now);
}

/** Who still has to act in this phase. */
function pending(s: FictionaryState): string[] {
  const p = s.play;
  if (s.phase === 'choose') return p.chooser ? [p.chooser] : [];
  if (s.phase === 'write') return s.players.filter((id) => !p.lies[id]);
  if (s.phase === 'pick') return s.players.filter((id) => !p.picks[id]);
  return [];
}

/** Close the phase when nobody is left to act. */
function settle(s: FictionaryState, rng: Rng, now: number): FictionaryState {
  if (pending(s).length > 0) return s;
  if (s.phase === 'write') return openPick(s, rng, now);
  if (s.phase === 'pick') return openReveal(s, now);
  return s;
}

/** Time's up on the phase in play. */
function force(s: FictionaryState, rng: Rng, now: number): FictionaryState {
  if (s.phase === 'choose') return openCard(s, rng.pick(s.play.offer), rng, now);
  if (s.phase === 'write') return openPick(s, rng, now);
  if (s.phase === 'pick') return openReveal(s, now);
  return s;
}

/** The answers a player can't pick: the ones they wrote. */
const mineOf = (p: Play, playerId: string) =>
  p.entries.filter((e) => e.by.includes(playerId)).map((e) => e.id);

function tableView(s: FictionaryState): FictionaryTableView {
  const p = s.play;
  const fact = p.cat && p.idx >= 0 ? factOf(p.cat, p.idx) : null;
  return {
    players: s.players,
    deck: s.deck,
    plan: s.plan,
    total: totalOf(s.plan),
    timed: s.times !== null,
    phase: s.phase,
    play: {
      n: p.n,
      stage: p.stage,
      chooser: p.chooser,
      offer: p.offer,
      cat: p.cat,
      q: s.phase === 'choose' ? null : (fact?.q ?? null),
      entries: p.entries.map((e) => ({ id: e.id, text: e.text })),
      written: s.players.filter((id) => p.lies[id]),
      picked: s.players.filter((id) => p.picks[id]),
    },
    scores: s.scores,
    history: s.history,
    reveal: s.phase === 'reveal' ? (s.history[s.history.length - 1] ?? null) : null,
    actBy: s.actBy,
    revealAt: s.revealAt,
    nextAt: s.nextAt,
  };
}

/** Per-player numbers for the end screen, best score first. */
function statsOf(s: FictionaryState, order: string[]): RecapStats {
  return {
    columns: ['Points', 'Truths found', 'Players fooled', 'Likes'],
    rows: order.map((playerId) => {
      let truths = 0;
      let fooled = 0;
      let likes = 0;
      for (const h of s.history)
        for (const e of h.entries) {
          if (e.truth && e.pickers.includes(playerId)) truths++;
          if (e.by.includes(playerId)) {
            fooled += e.pickers.length;
            likes += e.likes;
          }
        }
      return { playerId, values: [s.scores[playerId] ?? 0, truths, fooled, likes] };
    }),
  };
}

function highlightsOf(s: FictionaryState): Highlight[] {
  const out: Highlight[] = [];
  const lies = s.history.flatMap((h) => h.entries.filter((e) => !e.truth && e.by.length > 0));
  const fib = [...lies].sort((a, b) => b.pickers.length - a.pickers.length)[0];
  if (fib && fib.pickers.length > 0)
    out.push({
      award: 'Biggest fib',
      playerIds: fib.by,
      text: `“${fib.text}” fooled ${fib.pickers.length}`,
      value: fib.pickers.length,
    });
  const fave = [...lies].sort((a, b) => b.likes - a.likes)[0];
  if (fave && fave.likes > 0)
    out.push({
      award: 'Crowd favorite',
      playerIds: fave.by,
      text: `“${fave.text}”, ${fave.likes} like${fave.likes === 1 ? '' : 's'}`,
      value: fave.likes,
    });
  return out;
}

const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
const players = (n: number) => `${n} ${n === 1 ? 'player' : 'players'}`;

/** The stats page: the score race by card, the best liar, the truth finders and who fell for whom. */
function fictionaryStory(s: FictionaryState, winners: string[]): GameStory | undefined {
  const ids = s.players;
  const history = s.history;
  if (history.length === 0) return undefined;

  const race =
    history.length >= 2
      ? raceStory({
          series: ids.map((id) => ({
            playerId: id,
            points: history.reduce(
              (acc, h) => [...acc, acc[acc.length - 1]! + (h.gains[id] ?? 0)],
              [0],
            ),
          })),
          winners,
          step: 'card',
          title: 'Score',
          unit: ' points',
        })
      : undefined;

  const headlines: StoryHeadline[] = [];
  const facts: StoryFact[] = [];

  // Players fooled, truths found, and who fell for whose lies.
  const fooled: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  const truths: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  const fell = new Map<string, number>();
  let best: { by: string[]; text: string; n: number; card: number } | null = null;
  let liked: { by: string[]; text: string; n: number; card: number } | null = null;
  for (const h of history)
    for (const e of h.entries) {
      if (e.truth) {
        for (const p of e.pickers) truths[p] = (truths[p] ?? 0) + 1;
        continue;
      }
      for (const a of e.by) {
        fooled[a] = (fooled[a] ?? 0) + e.pickers.length;
        for (const p of e.pickers) fell.set(`${p}|${a}`, (fell.get(`${p}|${a}`) ?? 0) + 1);
      }
      if (e.by.length === 0) continue;
      if (e.pickers.length > (best?.n ?? 0))
        best = { by: e.by, text: e.text, n: e.pickers.length, card: h.n };
      if (e.likes > (liked?.n ?? 0)) liked = { by: e.by, text: e.text, n: e.likes, card: h.n };
    }

  if (best && best.n >= 2) {
    headlines.push({
      label: 'Best fib',
      value: `${best.n} fooled`,
      detail: `{${best.by[0]}}, card ${best.card}`,
      playerId: best.by[0],
    });
    facts.push({
      label: 'Best fib',
      text: `{${best.by[0]}}’s “${best.text}” on card ${best.card} fooled ${players(best.n)}.`,
      playerIds: best.by,
      tone: 'good',
    });
  }
  const liar = [...ids].sort((a, b) => fooled[b]! - fooled[a]!)[0]!;
  if (fooled[liar]! >= 3)
    facts.push({
      label: 'Best liar',
      text: `{${liar}} fooled other players ${fooled[liar]} times over the game.`,
      playerIds: [liar],
      tone: 'good',
    });
  const cards = history.length;
  const sharp = [...ids].sort((a, b) => truths[b]! - truths[a]!)[0]!;
  if (cards >= 3 && truths[sharp] === cards)
    facts.push({
      label: 'Lie detector',
      text: `{${sharp}} found the truth on every card.`,
      playerIds: [sharp],
      tone: 'good',
    });
  else if (cards >= 4 && truths[sharp]! / cards >= 0.75)
    facts.push({
      label: 'Truth finder',
      text: `{${sharp}} found the truth on ${truths[sharp]} of ${cards} cards.`,
      playerIds: [sharp],
      tone: 'good',
    });
  const gullible = [...ids].sort((a, b) => truths[a]! - truths[b]!)[0]!;
  if (cards >= 4 && truths[gullible] === 0)
    facts.push({
      label: 'Easily fooled',
      text: `{${gullible}} never found the truth, not once in ${cards} cards.`,
      playerIds: [gullible],
      tone: 'bad',
    });
  let nemesis: { victim: string; liar: string; n: number } | null = null;
  for (const [key, n] of fell) {
    const [victim, liar2] = key.split('|') as [string, string];
    if (victim !== liar2 && n > (nemesis?.n ?? 0)) nemesis = { victim, liar: liar2, n };
  }
  if (nemesis && nemesis.n >= 2)
    facts.push({
      label: 'Nemesis',
      text: `{${nemesis.victim}} fell for {${nemesis.liar}}’s lies ${times(nemesis.n)}.`,
      playerIds: [nemesis.victim, nemesis.liar],
    });
  if (liked && liked.n >= 2)
    facts.push({
      label: 'Crowd favorite',
      text: `{${liked.by[0]}}’s “${liked.text}” on card ${liked.card} got ${liked.n} likes.`,
      playerIds: liked.by,
      tone: 'good',
    });
  const stumpers = history.filter((h) => h.entries.find((e) => e.truth)!.pickers.length === 0);
  if (stumpers.length > 0)
    facts.push({
      label: 'Stumper',
      text:
        stumpers.length === 1
          ? `Nobody found the truth on card ${stumpers[0]!.n}: “${stumpers[0]!.answer}”.`
          : `Nobody found the truth on ${stumpers.length} of the ${cards} cards.`,
      tone: 'bad',
    });

  const bars: StoryBars[] = [];
  const foolRows = ids
    .map((playerId) => ({ playerId, value: fooled[playerId]! }))
    .sort((a, b) => b.value - a.value);
  if (foolRows[0]!.value > 0) bars.push({ title: 'Players fooled', rows: foolRows });
  const truthRows = ids
    .map((playerId) => ({
      playerId,
      value: truths[playerId]!,
      display: `${Math.round((truths[playerId]! / cards) * 100)}%`,
    }))
    .sort((a, b) => b.value - a.value);
  if (cards >= 2 && truthRows[0]!.value > 0) bars.push({ title: 'Truths found', rows: truthRows });

  return buildStory({ race, headlines, facts, bars });
}

function resultOf(s: FictionaryState, early: boolean): GameResult {
  const top = Math.max(...s.players.map((id) => s.scores[id] ?? 0));
  const winners = s.players.filter((id) => (s.scores[id] ?? 0) === top);
  const order = [...s.players].sort((a, b) => (s.scores[b] ?? 0) - (s.scores[a] ?? 0));
  const reveal: FictionaryReveal = { players: s.players, scores: s.scores, history: s.history };
  const names = winners.map((id) => `{${id}}`);
  const who =
    names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return {
    winners,
    summary: `${who} ${early ? 'led' : 'won'} with ${top.toLocaleString('en-US')}`,
    reveal,
    recap: s.recap,
    roundName: 'Card',
    story: fictionaryStory(s, winners),
    stats: statsOf(s, order),
    highlights: highlightsOf(s),
    standings: s.players.map((playerId) => ({
      playerId,
      outcome:
        winners.length === s.players.length ? 'draw' : winners.includes(playerId) ? 'win' : 'loss',
    })),
  };
}

export function defaultOptions(): FictionaryOptions {
  return { deck: 'Mixed', length: 'Standard', timer: 'Relaxed', tabs: 'Chooser picks' };
}

export const fictionary: GameModule<
  FictionaryState,
  FictionaryAction,
  FictionaryPlayerView,
  FictionaryTableView,
  FictionaryOptions
> = {
  meta,
  optionsSchema,
  actionSchema,
  defaultOptions,

  setup({ playerIds, options, rng, now }) {
    const deck = options.deck === 'Facts' ? 'facts' : options.deck === 'Words' ? 'words' : 'mixed';
    const base: FictionaryState = {
      players: playerIds,
      deck,
      plan: ROUND_CARDS[options.length],
      times: TIMES[options.timer],
      randomTabs: options.tabs === 'Random',
      phase: 'choose',
      play: blankPlay(1, 1),
      scores: Object.fromEntries(playerIds.map((id) => [id, 0])),
      history: [],
      used: [],
      actBy: null,
      revealAt: null,
      nextAt: null,
      turns: rng.int(playerIds.length),
      recap: [],
    };
    return startCard(base, 1, rng, now);
  },

  getPlayerView(s, playerId) {
    const p = s.play;
    const fact = p.cat && p.idx >= 0 ? factOf(p.cat, p.idx) : null;
    return {
      ...tableView(s),
      me: playerId,
      myLie: p.lies[playerId] ?? null,
      suggestions: fact ? (p.help[playerId] ?? []).map((i) => fact.lies[i]!) : [],
      mine: mineOf(p, playerId),
      myPick: p.picks[playerId] ?? null,
      myLike: p.likes[playerId] ?? null,
    };
  },
  getTableView: tableView,

  applyAction(s, playerId, action, rng, now) {
    if (s.phase === 'over') throw new GameError('GAME_OVER', 'The game is over.');
    if (!s.players.includes(playerId))
      throw new GameError('NOT_A_PLAYER', 'You’re not in this game.');
    const p = s.play;

    switch (action.type) {
      case 'choose': {
        if (s.phase !== 'choose') return s;
        if (p.chooser !== playerId)
          throw new GameError('NOT_CHOOSER', 'Someone else is choosing the tab.');
        const tab = p.offer.find((c) => c === action.tab);
        if (!tab) throw new GameError('BAD_TAB', 'That tab isn’t on offer.');
        return openCard(s, tab, rng, now);
      }

      case 'write': {
        if (s.phase !== 'write') throw new GameError('WRONG_PHASE', 'Writing is closed.');
        const text = cleanLie(action.text);
        if (!text) throw new GameError('EMPTY', 'Write a lie first.');
        if (text.length > LIE_MAX)
          throw new GameError('TOO_LONG', `Keep it under ${LIE_MAX} characters.`);
        const fact = factOf(p.cat!, p.idx);
        if (isTruth(text, fact))
          throw new GameError('TRUTH', 'That’s the truth! Write a lie instead.');
        if (p.lies[playerId] === text) return s;
        return settle({ ...s, play: { ...p, lies: { ...p.lies, [playerId]: text } } }, rng, now);
      }

      case 'help': {
        if (s.phase !== 'write') throw new GameError('WRONG_PHASE', 'Writing is closed.');
        if (p.help[playerId]) return s;
        // Two of the card's house lies, the ones handed out least so far first.
        const fact = factOf(p.cat!, p.idx);
        const handed = Object.values(p.help).flat();
        const count = (i: number) => handed.filter((h) => h === i).length;
        const two = rng
          .shuffle(fact.lies.map((_, i) => i))
          .sort((a, b) => count(a) - count(b))
          .slice(0, 2);
        return { ...s, play: { ...p, help: { ...p.help, [playerId]: two } } };
      }

      case 'pick': {
        if (s.phase !== 'pick') throw new GameError('WRONG_PHASE', 'It isn’t time to pick.');
        const e = p.entries.find((x) => x.id === action.id);
        if (!e) throw new GameError('BAD_PICK', 'That answer isn’t on the list.');
        if (e.by.includes(playerId))
          throw new GameError('OWN_LIE', 'That’s your own lie. Pick another.');
        if (p.picks[playerId] === e.id) return s;
        return settle({ ...s, play: { ...p, picks: { ...p.picks, [playerId]: e.id } } }, rng, now);
      }

      case 'like': {
        if (s.phase !== 'pick' && s.phase !== 'reveal')
          throw new GameError('WRONG_PHASE', 'Wait for the answers.');
        const e = p.entries.find((x) => x.id === action.id);
        if (!e) throw new GameError('BAD_LIKE', 'That answer isn’t on the list.');
        if (e.by.includes(playerId)) throw new GameError('OWN_LIE', 'You can’t like your own lie.');
        const likes = { ...p.likes };
        if (likes[playerId] === e.id) delete likes[playerId];
        else likes[playerId] = e.id;
        const next = { ...s, play: { ...p, likes } };
        // During the reveal a like still counts: rescore the card on show.
        if (s.phase === 'reveal') return rescoreLikes(next, s);
        return next;
      }

      case 'nudge': {
        if (s.phase !== 'write' && s.phase !== 'pick')
          throw new GameError('WRONG_PHASE', 'There’s nobody to hurry.');
        if (pending(s).includes(playerId))
          throw new GameError('NOT_DONE', 'Finish your own first.');
        const at = now + NUDGE_MS;
        if (s.actBy !== null && s.actBy <= at) return s;
        return { ...s, actBy: at };
      }

      case 'next': {
        if (s.phase !== 'reveal' || action.after !== p.n) return s;
        return advance(s, rng, now);
      }
    }
  },

  waitingOn: pending,

  nextTimer(s) {
    if (s.phase === 'reveal' && s.nextAt) return { id: 'next', at: s.nextAt };
    if (s.actBy && (s.phase === 'choose' || s.phase === 'write' || s.phase === 'pick'))
      return { id: 'act', at: s.actBy };
    return null;
  },

  onTimer(s, id, rng, now) {
    if (id === 'next' && s.phase === 'reveal') return advance(s, rng, now);
    if (id === 'act') return force(s, rng, now);
    return s;
  },

  announce(prev, next) {
    if (!prev) return [];
    const lines: string[] = [];
    if (prev.phase === 'choose' && next.phase === 'write' && next.play.chooser && next.play.cat)
      lines.push(`{${next.play.chooser}} chose ${CATEGORIES[next.play.cat]}.`);
    if (next.history.length > prev.history.length) {
      const h = next.history[next.history.length - 1]!;
      const found = h.entries.find((e) => e.truth)!.pickers.length;
      lines.push(
        `The truth was “${h.answer}”. ${found === 0 ? 'Nobody' : found === 1 ? '1 player' : `${found} players`} found it.`,
      );
    }
    return lines;
  },

  botDelayMs: (s) => (s.phase === 'write' ? 6_000 : s.phase === 'pick' ? 4_000 : 2_000),
  bot: fictionaryBot,

  partialResult(s) {
    if (s.phase === 'over' || s.history.length === 0) return null;
    return resultOf(s, true);
  },

  getResult(s) {
    if (s.phase !== 'over') return null;
    return resultOf(s, false);
  },
};

/** Likes given during the reveal: refigure the card on show and everyone's score. */
function rescoreLikes(next: FictionaryState, before: FictionaryState): FictionaryState {
  const last = next.history[next.history.length - 1];
  if (!last) return next;
  const p = next.play;
  const mult = p.stage;
  const entries = last.entries.map((e) => ({
    ...e,
    likes: next.players.filter((id) => p.likes[id] === e.id).length,
  }));
  const delta: Record<string, number> = {};
  for (const e of entries) {
    if (e.truth) continue;
    const old = last.entries.find((x) => x.id === e.id)!.likes;
    for (const a of e.by) delta[a] = (delta[a] ?? 0) + (e.likes - old) * LIKE_POINTS * mult;
  }
  const gains = { ...last.gains };
  const scores = { ...before.scores };
  for (const [id, d] of Object.entries(delta)) {
    gains[id] = (gains[id] ?? 0) + d;
    scores[id] = (scores[id] ?? 0) + d;
  }
  const card = { ...last, entries, gains };
  return {
    ...next,
    scores,
    history: [...next.history.slice(0, -1), card],
    // The card's recap lines follow its likes.
    recap: [...next.recap.filter((e) => e.round !== last.n), ...recapOf(card, p.chooser)],
  };
}
