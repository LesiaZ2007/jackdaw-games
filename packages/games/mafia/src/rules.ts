import {
  GameError,
  type GameModule,
  type GameResult,
  type Highlight,
  type RecapEvent,
  type RecapStats,
  type Rng,
} from '@jackdaw/engine';
import { z } from 'zod';
import { mafiaBot } from './bot';
import { meta } from './meta';
import {
  autoKillers,
  castCounts,
  castFor,
  MODES,
  ROLE_INFO,
  ROLES,
  SETTING,
  TEAM_NAME,
  type Mode,
  type Role,
  type Team,
} from './roles';

/**
 * Mafia and Werewolf for 5–15 players, with the app as the moderator, so nobody sits out to run
 * it (docs/mafia/DESIGN.md).
 *
 * The cards are dealt and everyone checks theirs. Night: every living player picks someone on
 * their phone, so the tapping never gives a power away (the killers pick a victim together, the
 * powers pick their target, everyone else names who they suspect). Werewolf's Witch then gets her
 * turn. Morning: the dead are announced. Day: the table talks until most are ready (or the talk
 * timer runs out), then everyone votes at once; the most votes is out, unless it's a tie or
 * skipping got as many. Then night again, until one side has won.
 */

const KILLERS = ['Auto', '1', '2', '3', '4'] as const;
const TALK = ['Off', '2 minutes', '3 minutes', '5 minutes'] as const;
const REVEAL = ['Shown', 'Hidden'] as const;

/** How long each step waits before it moves on by itself. */
export const DEAL_MS = 45_000;
export const NIGHT_MS = 75_000;
export const WITCH_MS = 30_000;
export const DAWN_MS = 9_000;
export const VOTE_MS = 60_000;
/** Long enough to read who voted for whom. */
export const DUSK_MS = 15_000;
export const HUNTER_MS = 30_000;
const TALK_MS: Record<(typeof TALK)[number], number> = {
  Off: 0,
  '2 minutes': 120_000,
  '3 minutes': 180_000,
  '5 minutes': 300_000,
};

export const optionsSchema = z.object({
  mode: z.enum(MODES).describe('Setting'),
  killers: z.enum(KILLERS).describe('Killers'),
  /** The host's optional roles (the lobby's cast list draws these; the other setting's are ignored). */
  extras: z.array(z.enum(ROLES)),
  talk: z.enum(TALK).describe('Talk time'),
  reveal: z.enum(REVEAL).describe('Roles of the dead'),
});
export type MafiaOptions = z.infer<typeof optionsSchema>;

/** Someone, or nobody ("skip" when voting). */
const target = z.string().min(1).max(64);

export const actionSchema = z.discriminatedUnion('type', [
  /** Seen my card (the deal), or ready to vote (the day). `on: false` takes it back. */
  z.object({ type: z.literal('ready'), on: z.boolean() }),
  /** The night: my one pick (Cupid picks two). */
  z.object({ type: z.literal('pick'), target, second: target.optional() }),
  /** The Witch: save tonight's victim, and/or poison someone. */
  z.object({ type: z.literal('potion'), heal: z.boolean(), poison: target.nullable() }),
  /** The day's vote: a living player, or "skip". */
  z.object({ type: z.literal('vote'), target }),
  /** The Hunter, dying: who they take with them (null: nobody). */
  z.object({ type: z.literal('shoot'), target: target.nullable() }),
]);
export type MafiaAction = z.infer<typeof actionSchema>;

export type Phase =
  'deal' | 'night' | 'witch' | 'dawn' | 'day' | 'vote' | 'dusk' | 'hunter' | 'over';

/** What a player does at night: decides their prompt, and what their pick means. */
export type NightAct = 'kill' | 'stab' | 'save' | 'ask' | 'see' | 'love' | 'suspect';

export type Cause = 'night' | 'vote' | 'grief' | 'shot';

export interface Death {
  id: string;
  cause: Cause;
  /** The night or day it happened. */
  night: number;
  day: number;
}

/** A check by the Sheriff (is it Mafia?) or the Seer (their card). */
export interface Check {
  night: number;
  target: string;
  /** Sheriff: 'mafia' or 'clean'. Seer: the role. */
  result: Role | 'mafia' | 'clean';
}

export interface VoteResult {
  day: number;
  /** voter -> target or 'skip'. Everyone who voted. */
  votes: Record<string, string>;
  /** Votes counted per target (the Mayor's count twice), 'skip' included. */
  counts: Record<string, number>;
  /** Who's out, or null (a tie, or not enough). */
  out: string | null;
  /** Who counted twice (the Mayor), once votes are public. */
  double: string[];
}

export interface Win {
  team: Team;
  /** "The town caught every last one of the Mafia." */
  line: string;
}

export interface MafiaState {
  mode: Mode;
  players: string[];
  roles: Record<string, Role>;
  /** Every card dealt, in cast order (public: everyone knows what's in the deck). */
  cast: Role[];
  alive: string[];
  deaths: Death[];
  lovers: [string, string] | null;
  revealRoles: boolean;
  talkMs: number;
  phase: Phase;
  night: number;
  day: number;
  /** Counts every step, so screens can tell a new one from the same one. */
  step: number;
  /** When this step began (server time). */
  since: number;
  deadline: number | null;
  /** The deal: who has seen their card. The day: who is ready to vote. */
  ready: string[];
  /** Tonight's picks. Cupid's second lover is in `second`. */
  picks: Record<string, string>;
  second: string | null;
  /** The pack's choice tonight, once it's made (the Witch sees it). */
  victim: string | null;
  /** When a Witch who can't act "decides" (never shown: her clock reads the same as ever). */
  wakeAt?: number | null;
  potions: { heal: boolean; poison: boolean };
  checks: Record<string, Check[]>;
  votes: Record<string, string>;
  lastVote: VoteResult | null;
  /** The last morning's dead, in order. */
  dawn: string[];
  /** A dying Hunter, and where the game goes after the shot. */
  hunter: { id: string; then: 'day' | 'night' } | null;
  /** Lives saved: by whom (the Angel or the Witch), for the awards. */
  saves: string[];
  win: Win | null;
  recap: RecapEvent[];
}

/** One dead player as everyone sees them. */
export interface PublicDeath extends Death {
  /** Their card, if the dead are shown (or the game is over). */
  role: Role | null;
}

export interface MafiaTableView {
  mode: Mode;
  phase: Phase;
  night: number;
  day: number;
  step: number;
  since: number;
  deadline: number | null;
  players: string[];
  alive: string[];
  deaths: PublicDeath[];
  /** The cast as counts: [["mafia", 2], ["angel", 1], …]. */
  cast: [Role, number][];
  revealRoles: boolean;
  talkTimed: boolean;
  /** The deal and the day: who is ready. */
  ready: string[];
  /** How many have to be ready to start the vote. */
  readyNeed: number;
  /** The night: how many living players have made their pick (never who). */
  nightDone: number;
  /** The vote: who has voted (never for whom, until it's counted). */
  voted: string[];
  lastVote: VoteResult | null;
  dawn: string[];
  /** The Hunter taking aim. */
  hunter: string | null;
  /** The lovers, once one has died of grief (or the game is over). */
  lovers: [string, string] | null;
  win: Win | null;
}

export interface Prompt {
  act: NightAct | 'potion' | 'vote' | 'shoot';
  /** Who can be picked. */
  targets: string[];
  /** What's picked so far (Cupid's first lover). */
  pick: string | null;
  second: string | null;
  /** Your pick is in and can't change (the pack can keep changing until it agrees). */
  locked: boolean;
}

export interface MafiaPlayerView extends MafiaTableView {
  me: string;
  role: Role;
  team: Team;
  alive_: boolean;
  /** Who you know the card of: your pack, your checks' results, everyone once you're dead. */
  known: Record<string, Role>;
  /** Sheriff: who you asked about and what you heard. Seer: the cards you saw. */
  checks: Check[];
  /** Your lover, if Cupid chose you. */
  lover: string | null;
  /** The pack: each living member's pick tonight. */
  packPicks: Record<string, string> | null;
  /** The Witch on her turn: tonight's victim and what she has left. */
  witch: { victim: string | null; heal: boolean; poison: boolean } | null;
  /** What you can do right now, or null. */
  prompt: Prompt | null;
}

const isPack = (r: Role) => ROLE_INFO[r].team === 'pack';

/** A player's side right now: lovers from opposite sides play for themselves. */
export function teamOf(s: Pick<MafiaState, 'roles' | 'lovers'>, id: string): Team {
  const base = ROLE_INFO[s.roles[id]!].team;
  if (s.lovers && s.lovers.includes(id) && mixedLovers(s)) return 'lovers';
  return base;
}

export function mixedLovers(s: Pick<MafiaState, 'roles' | 'lovers'>): boolean {
  if (!s.lovers) return false;
  const [a, b] = s.lovers;
  return ROLE_INFO[s.roles[a]!].team !== ROLE_INFO[s.roles[b]!].team;
}

export function defaultOptions(): MafiaOptions {
  return { mode: 'Mafia', killers: 'Auto', extras: [], talk: '3 minutes', reveal: 'Shown' };
}

export function killersFor(o: Pick<MafiaOptions, 'killers'>, players: number): number {
  return o.killers === 'Auto' ? autoKillers(players) : Number(o.killers);
}

export function validateOptions(o: MafiaOptions, players: number): string | null {
  const k = killersFor(o, players);
  if (k * 2 >= players)
    return `${k} killers is too many for ${players} players. Pick fewer, or Auto.`;
  return null;
}

/** What this living player does tonight. */
export function nightAct(s: MafiaState, id: string): NightAct | null {
  if (!s.alive.includes(id) || (s.phase !== 'night' && s.phase !== 'witch')) return null;
  switch (s.roles[id]) {
    case 'mafia':
    case 'wolf':
      return 'kill';
    case 'killer':
      return 'stab';
    case 'angel':
      return 'save';
    case 'sheriff':
      return 'ask';
    case 'seer':
      return 'see';
    case 'cupid':
      return s.night === 1 ? 'love' : 'suspect';
    default:
      return 'suspect';
  }
}

/** Who a night act can pick. */
export function targetsFor(s: MafiaState, id: string, act: NightAct): string[] {
  switch (act) {
    case 'kill':
      return s.alive.filter((x) => !isPack(s.roles[x]!));
    case 'save':
    case 'love':
      return s.alive;
    default:
      return s.alive.filter((x) => x !== id);
  }
}

const packAlive = (s: MafiaState) => s.alive.filter((id) => isPack(s.roles[id]!));

/** The pack's choice: everyone's pick if they agree, otherwise null. */
function packChoice(s: MafiaState): string | null {
  const pack = packAlive(s);
  if (pack.length === 0) return null;
  const first = s.picks[pack[0]!];
  return first && pack.every((id) => s.picks[id] === first) ? first : null;
}

/** The night is over once everyone has picked (Cupid both lovers) and the pack agrees. */
function nightDone(s: MafiaState): boolean {
  for (const id of s.alive) {
    if (!s.picks[id]) return false;
    if (nightAct(s, id) === 'love' && !s.second) return false;
  }
  return packAlive(s).length === 0 || packChoice(s) !== null;
}

/** The Witch's turn comes every night she was dealt, even dead or out of potions, so it gives nothing away. */
const witchDealt = (s: MafiaState) => s.cast.includes('witch');
const witchOf = (s: MafiaState) => s.players.find((id) => s.roles[id] === 'witch') ?? null;
function witchCanAct(s: MafiaState): boolean {
  const w = witchOf(s);
  return !!w && s.alive.includes(w) && (s.potions.heal || s.potions.poison);
}

function pushRecap(s: MafiaState, ...evs: RecapEvent[]): MafiaState {
  return { ...s, recap: [...s.recap, ...evs] };
}

/** Recap text and secrets name players only as `{id}`; the platform swaps in their names. */
const brace = (id: string) => `{${id}}`;
const named = (s: Pick<MafiaState, 'roles'>, id: string) =>
  `${brace(id)} (the ${ROLE_INFO[s.roles[id]!].name})`;

/**
 * What a recap event happened to, so its colour can be settled once the winners are known:
 * `about` are the players it touched and `harm` says whether it hurt them (a death) or helped
 * them (a save). It is good for the winners when it hurt their opponents or helped themselves.
 */
interface Touch {
  about: string[];
  harm: boolean;
}

const at = (now: number, ms: number) => now + ms;

function startNight(s: MafiaState, now: number): MafiaState {
  const night = s.night + 1;
  return pushRecap(
    {
      ...s,
      phase: 'night',
      night,
      step: s.step + 1,
      since: now,
      deadline: at(now, NIGHT_MS),
      picks: {},
      second: null,
      victim: null,
      ready: [],
      votes: {},
    },
    { round: night, text: `Night ${night} fell.`, data: { kind: 'night', night } },
  );
}

/** Ends the night's picking: the pack's victim is settled, then the Witch, then the morning. */
function closeNight(s: MafiaState, rng: Rng, now: number): MafiaState {
  let victim = packChoice(s);
  const pack = packAlive(s);
  if (!victim && pack.length) {
    // Out of time without agreeing: the most-picked target, a tie drawn at random.
    const tally = new Map<string, number>();
    for (const id of pack) {
      const p = s.picks[id];
      if (p) tally.set(p, (tally.get(p) ?? 0) + 1);
    }
    const top = Math.max(0, ...tally.values());
    const tied = [...tally].filter(([, n]) => n === top && n > 0).map(([x]) => x);
    victim = tied.length ? rng.pick(tied) : null;
  }
  let lovers = s.lovers;
  const cupid = s.players.find((id) => s.roles[id] === 'cupid');
  if (s.night === 1 && cupid && s.alive.includes(cupid) && s.picks[cupid] && s.second)
    lovers = [s.picks[cupid]!, s.second];
  const next: MafiaState = { ...s, victim, lovers };
  if (witchDealt(s)) {
    // A Witch who can't act still gets her turn, with the same clock on every screen, so
    // nobody learns she's gone; it just ends a few seconds in, as if she'd decided quickly.
    const wakeAt = witchCanAct(next) ? null : at(now, 4_000 + rng.int(5_000));
    return {
      ...next,
      phase: 'witch',
      step: s.step + 1,
      since: now,
      deadline: at(now, WITCH_MS),
      wakeAt,
    };
  }
  return dawn(next, null, now);
}

/** Who dies with these deaths: lovers follow each other. */
function withGrief(s: MafiaState, dying: string[]): { id: string; grief: boolean }[] {
  const out = dying.map((id) => ({ id, grief: false }));
  if (s.lovers) {
    const [a, b] = s.lovers;
    for (const [x, y] of [
      [a, b],
      [b, a],
    ] as const) {
      if (out.some((d) => d.id === x) && !out.some((d) => d.id === y) && s.alive.includes(y))
        out.push({ id: y, grief: true });
    }
  }
  return out;
}

function kill(s: MafiaState, dying: { id: string; grief: boolean }[], cause: Cause): MafiaState {
  const ids = new Set(dying.map((d) => d.id));
  return {
    ...s,
    alive: s.alive.filter((id) => !ids.has(id)),
    deaths: [
      ...s.deaths,
      ...dying.map((d) => ({
        id: d.id,
        cause: d.grief ? ('grief' as const) : cause,
        night: s.night,
        day: s.day,
      })),
    ],
  };
}

/** The night's outcome: who the pack, the Serial Killer and the Witch's poison took. */
function dawn(
  s: MafiaState,
  potion: { heal: boolean; poison: string | null } | null,
  now: number,
): MafiaState {
  const angel = s.alive.find((id) => s.roles[id] === 'angel');
  const guarded = angel ? s.picks[angel] : undefined;
  const killer = s.alive.find((id) => s.roles[id] === 'killer');
  const stabbed = killer ? s.picks[killer] : undefined;
  const witch = witchOf(s);

  const dying: string[] = [];
  const saves: string[] = [];
  const events: RecapEvent[] = [];
  const round = s.night;
  const names = TEAM_NAME[s.mode];
  const cupid = s.players.find((id) => s.roles[id] === 'cupid');
  if (s.night === 1 && s.lovers)
    events.push({
      round,
      text: 'Cupid’s arrow flew.',
      secret: `${cupid ? named(s, cupid) : 'Cupid'} made ${brace(s.lovers[0])} and ${brace(s.lovers[1])} lovers.`,
      tag: 'Lovers',
      key: true,
      data: { kind: 'lovers', lovers: s.lovers },
    });
  if (s.victim) {
    const saver = guarded === s.victim ? angel : potion?.heal ? witch : null;
    if (saver) saves.push(saver);
    else dying.push(s.victim);
    events.push({
      round,
      text: `The ${names.pack} chose their victim.`,
      secret: `${packAlive(s).map(brace).join(', ')} chose ${brace(s.victim)}.${saver ? ` ${named(s, saver)} saved them.` : ''}`,
      tag: saver ? 'Saved' : 'Targeted',
      key: !!saver,
      data: { kind: 'attack', about: [s.victim], harm: !saver },
    });
  }
  if (stabbed) {
    const saved = guarded === stabbed;
    if (saved) {
      if (!saves.includes(angel!)) saves.push(angel!);
    } else if (!dying.includes(stabbed)) dying.push(stabbed);
    events.push({
      round,
      text: 'The Serial Killer struck.',
      secret: `${brace(killer!)} went after ${brace(stabbed)}.${saved ? ` ${named(s, angel!)} saved them.` : ''}`,
      tag: saved ? 'Saved' : 'Stabbed',
      key: saved,
      data: { kind: 'stab', about: [stabbed], harm: !saved },
    });
  }
  if (potion?.poison) {
    if (!dying.includes(potion.poison)) dying.push(potion.poison);
    events.push({
      round,
      text: 'A poison slipped into the night.',
      secret: `${named(s, witch!)} poisoned ${brace(potion.poison)}.`,
      tag: 'Poisoned',
      data: { kind: 'poison', about: [potion.poison], harm: true },
    });
  }
  for (const id of s.alive) {
    const act = nightAct({ ...s, phase: 'night' }, id);
    const check = (s.checks[id] ?? []).find((c) => c.night === s.night);
    if ((act !== 'ask' && act !== 'see') || !check) continue;
    const found =
      act === 'see'
        ? ROLE_INFO[check.result as Role].name
        : check.result === 'mafia'
          ? 'Mafia'
          : 'Clean';
    events.push({
      round,
      text: 'A suspect was checked in the dark.',
      secret: `${named(s, id)} checked ${brace(check.target)}: ${found === 'Clean' ? 'not Mafia' : found}.`,
      tag: found,
      data: { kind: 'check', by: id, target: check.target },
    });
  }

  const dead = withGrief(s, dying);
  let next = kill(s, dead, 'night');
  const hunter = dead.find((d) => s.roles[d.id] === 'hunter');
  next = {
    ...next,
    phase: 'dawn',
    step: s.step + 1,
    since: now,
    deadline: at(now, DAWN_MS),
    dawn: dead.map((d) => d.id),
    victim: null,
    saves: [...s.saves, ...saves],
    potions: potion
      ? {
          heal: s.potions.heal && !potion.heal,
          poison: s.potions.poison && !potion.poison,
        }
      : s.potions,
    hunter: hunter ? { id: hunter.id, then: 'day' } : null,
  };
  const shown = (d: { id: string; grief: boolean }) =>
    `${s.revealRoles ? named(s, d.id) : brace(d.id)}${d.grief ? ' (of grief)' : ''}`;
  // Who used a power tonight, for the end screen's count of night actions.
  const acted = s.alive.filter((id) =>
    id === witch ? !!potion : nightAct({ ...s, phase: 'night' }, id) !== 'suspect',
  );
  return pushRecap(next, ...events, {
    round,
    text: dead.length
      ? `Morning ${s.night}: ${dead.map(shown).join(', ')} found dead.`
      : `Morning ${s.night}: nobody died.`,
    secret: s.revealRoles
      ? undefined
      : dead.map((d) => `${brace(d.id)} was the ${ROLE_INFO[s.roles[d.id]!].name}.`).join(' ') ||
        undefined,
    tag: dead.length ? (dead.length > 1 ? `${dead.length} dead` : 'Killed') : 'No deaths',
    // The game's first blood is a turning point; later mornings are not.
    key: dead.length > 0 && s.deaths.length === 0,
    data: {
      kind: 'dawn',
      night: s.night,
      dead: dead.map((d) => d.id),
      acted,
      ...(dead.length ? { about: dead.map((d) => d.id), harm: true } : {}),
    },
  });
}

function startDay(s: MafiaState, now: number): MafiaState {
  return {
    ...s,
    phase: 'day',
    day: s.day + 1,
    step: s.step + 1,
    since: now,
    deadline: s.talkMs ? at(now, s.talkMs) : null,
    ready: [],
    votes: {},
  };
}

function startVote(s: MafiaState, now: number): MafiaState {
  return {
    ...s,
    phase: 'vote',
    step: s.step + 1,
    since: now,
    deadline: at(now, VOTE_MS),
    votes: {},
  };
}

/** Counts the vote: the most votes is out, unless it's a tie or skipping got as many. */
export function tallyVotes(s: MafiaState): VoteResult {
  const counts: Record<string, number> = {};
  const double: string[] = [];
  for (const [voter, t] of Object.entries(s.votes)) {
    const w = s.roles[voter] === 'mayor' ? 2 : 1;
    if (w === 2) double.push(voter);
    counts[t] = (counts[t] ?? 0) + w;
  }
  const people = Object.entries(counts).filter(([t]) => t !== 'skip');
  const top = Math.max(0, ...people.map(([, n]) => n));
  const leaders = people.filter(([, n]) => n === top);
  const out = top > 0 && leaders.length === 1 && top > (counts.skip ?? 0) ? leaders[0]![0] : null;
  return { day: s.day, votes: s.votes, counts, out, double };
}

function closeVote(s: MafiaState, now: number): MafiaState {
  const result = tallyVotes(s);
  let next: MafiaState = {
    ...s,
    lastVote: result,
    phase: 'dusk',
    step: s.step + 1,
    since: now,
    deadline: at(now, DUSK_MS),
  };
  const round = s.day;
  const events: RecapEvent[] = [
    {
      round,
      text: ballotText(result),
      data: { kind: 'ballots', day: s.day, votes: result.votes },
    },
  ];
  // The Mayor's double vote comes out with the ballots.
  for (const m of result.double)
    events.push({
      round,
      text: `${brace(m)} was the Mayor: their vote counted twice.`,
      tag: 'Mayor',
      data: { kind: 'mayor', by: m },
    });
  let text = `Day ${s.day}: no one was voted out.`;
  let secret: string | undefined;
  let tag = voteStall(result);
  let key = false;
  let touch: Partial<Touch> = {};
  if (result.out) {
    const dead = withGrief(s, [result.out]);
    next = kill(next, dead, 'vote');
    const hunter = dead.find((d) => s.roles[d.id] === 'hunter');
    if (hunter) next = { ...next, hunter: { id: hunter.id, then: 'night' } };
    const said = s.revealRoles ? named(s, result.out) : brace(result.out);
    text = `Day ${s.day}: ${said} was voted out${dead.length > 1 ? `, and ${brace(dead[1]!.id)} died of grief` : ''}.`;
    if (!s.revealRoles) secret = `${named(s, result.out)} was voted out.`;
    const second = Math.max(
      0,
      ...Object.entries(result.counts)
        .filter(([t]) => t !== result.out)
        .map(([, n]) => n),
    );
    tag = `Lynched ${result.counts[result.out]}–${second}`;
    // Catching anyone who wasn't plain town is a turning point.
    key = ROLE_INFO[s.roles[result.out]!].team !== 'town' || !!hunter;
    touch = { about: dead.map((d) => d.id), harm: true };
    if (s.roles[result.out] === 'jester')
      next = {
        ...next,
        win: { team: 'jester', line: 'The Jester fooled the town into voting them out.' },
      };
  }
  events.push({
    round,
    text,
    secret,
    tag,
    key,
    data: { kind: 'vote', day: s.day, votes: result.votes, out: result.out, ...touch },
  });
  return pushRecap(next, ...events);
}

/** Who voted for whom, grouped by the person they named. */
function ballotText(r: VoteResult): string {
  const by = new Map<string, string[]>();
  for (const [voter, t] of Object.entries(r.votes)) by.set(t, [...(by.get(t) ?? []), voter]);
  const parts = [...by]
    .sort(([a], [b]) => Number(a === 'skip') - Number(b === 'skip'))
    .map(
      ([t, voters]) =>
        `${voters.map(brace).join(', ')} ${t === 'skip' ? 'skipped' : `voted ${brace(t)}`}`,
    );
  return parts.length
    ? `Day ${r.day} ballots: ${parts.join('; ')}.`
    : `Day ${r.day}: nobody cast a vote.`;
}

/** Why nobody went out: a tie, skipping, or no votes at all. */
function voteStall(r: VoteResult): string {
  const people = Object.entries(r.counts).filter(([t]) => t !== 'skip');
  if (!people.length) return Object.keys(r.votes).length ? 'Skipped' : 'No votes';
  const top = Math.max(...people.map(([, n]) => n));
  return people.filter(([, n]) => n === top).length > 1 ? 'Tied' : 'Skipped';
}

/** Who has won, if anyone, from who's alive. */
export function checkWin(s: MafiaState): Win | null {
  const { alive, mode } = s;
  if (alive.length === 0) return { team: 'town', line: 'Nobody is left standing.' };
  if (mixedLovers(s) && alive.length === 2 && s.lovers!.every((id) => alive.includes(id)))
    return { team: 'lovers', line: 'The lovers are the last two standing.' };
  const killer = alive.find((id) => s.roles[id] === 'killer');
  if (killer && alive.length <= 2)
    return { team: 'killer', line: 'The Serial Killer is the last one standing.' };
  const pack = alive.filter((id) => isPack(s.roles[id]!));
  if (pack.length === 0 && !killer)
    return {
      team: 'town',
      line:
        mode === 'Mafia'
          ? 'The town caught every last one of the Mafia.'
          : 'The village hunted down every werewolf.',
    };
  const loyal = pack.filter((id) => teamOf(s, id) === 'pack');
  if (!killer && loyal.length > 0 && loyal.length >= alive.length - loyal.length)
    return {
      team: 'pack',
      line:
        mode === 'Mafia'
          ? 'The Mafia run this town now.'
          : 'The werewolves have taken the village.',
    };
  return null;
}

/** After the morning or the vote: the Hunter's shot, then a win or the next step. */
function settle(s: MafiaState, then: 'day' | 'night', now: number): MafiaState {
  if (s.hunter)
    return { ...s, phase: 'hunter', step: s.step + 1, since: now, deadline: at(now, HUNTER_MS) };
  const win = s.win ?? checkWin(s);
  if (win) {
    const name = TEAM_NAME[s.mode][win.team];
    return pushRecap(
      { ...s, win, phase: 'over', step: s.step + 1, since: now, deadline: null },
      {
        round: then === 'day' ? s.night : s.day,
        text: win.line,
        // Nobody left is no one's win.
        tag: s.alive.length
          ? `${name} ${win.team === 'pack' || win.team === 'lovers' ? 'win' : 'wins'}`
          : 'Draw',
        key: true,
        data: { kind: 'win', team: win.team },
      },
    );
  }
  return then === 'day' ? startDay(s, now) : startNight(s, now);
}

function shoot(s: MafiaState, shot: string | null, now: number): MafiaState {
  const h = s.hunter!;
  let next: MafiaState = { ...s, hunter: null };
  // A Hunter killed at dawn shoots in that night's round, one killed by the vote in that day's.
  const round = h.then === 'day' ? s.night : s.day;
  if (shot) {
    const dead = withGrief(s, [shot]);
    next = kill(next, dead, 'shot');
    const said = s.revealRoles ? named(s, shot) : brace(shot);
    next = pushRecap(next, {
      round,
      actor: h.id,
      text: `${brace(h.id)}, the Hunter, shot ${said}${dead.length > 1 ? `, and ${brace(dead[1]!.id)} died of grief` : ''}.`,
      secret: s.revealRoles ? undefined : `${named(s, shot)} was shot.`,
      tag: 'Hunter shot',
      key: true,
      data: {
        kind: 'shot',
        by: h.id,
        target: shot,
        at: h.then === 'day' ? 'Night' : 'Day',
        about: dead.map((d) => d.id),
        harm: true,
      },
    });
  } else
    next = pushRecap(next, {
      round,
      actor: h.id,
      text: `${brace(h.id)}, the Hunter, lowered the gun.`,
      tag: 'Spared',
      data: { kind: 'shot', by: h.id, target: null },
    });
  return settle(next, h.then, now);
}

function publicDeaths(s: MafiaState, all: boolean): PublicDeath[] {
  return s.deaths.map((d) => ({ ...d, role: all || s.revealRoles ? s.roles[d.id]! : null }));
}

function tableView(s: MafiaState): MafiaTableView {
  const over = s.phase === 'over';
  const grief = s.deaths.some((d) => d.cause === 'grief');
  return {
    mode: s.mode,
    phase: s.phase,
    night: s.night,
    day: s.day,
    step: s.step,
    since: s.since,
    deadline: s.deadline,
    players: s.players,
    alive: s.alive,
    deaths: publicDeaths(s, over),
    cast: castCounts(s.cast),
    revealRoles: s.revealRoles,
    talkTimed: s.talkMs > 0,
    ready: s.phase === 'deal' || s.phase === 'day' ? s.ready : [],
    readyNeed: Math.floor(s.alive.length / 2) + 1,
    nightDone: s.phase === 'night' ? s.alive.filter((id) => s.picks[id]).length : 0,
    voted: s.phase === 'vote' ? Object.keys(s.votes) : [],
    lastVote: s.lastVote,
    dawn: s.dawn,
    hunter: s.phase === 'hunter' && s.hunter ? s.hunter.id : null,
    lovers: over || grief ? s.lovers : null,
    win: s.win,
  };
}

function promptFor(s: MafiaState, id: string): Prompt | null {
  const alive = s.alive.includes(id);
  if (s.phase === 'night' && alive) {
    const act = nightAct(s, id)!;
    const pick = s.picks[id] ?? null;
    const locked = act === 'kill' ? false : act === 'love' ? !!(pick && s.second) : !!pick;
    return {
      act,
      targets: targetsFor(s, id, act),
      pick,
      second: act === 'love' ? s.second : null,
      locked,
    };
  }
  if (s.phase === 'witch' && alive && s.roles[id] === 'witch' && witchCanAct(s))
    return { act: 'potion', targets: s.alive, pick: null, second: null, locked: false };
  if (s.phase === 'vote' && alive)
    return {
      act: 'vote',
      targets: s.alive.filter((x) => x !== id),
      pick: s.votes[id] ?? null,
      second: null,
      locked: false,
    };
  if (s.phase === 'hunter' && s.hunter?.id === id)
    return { act: 'shoot', targets: s.alive, pick: null, second: null, locked: false };
  return null;
}

function playerView(s: MafiaState, id: string): MafiaPlayerView {
  const role = s.roles[id]!;
  const over = s.phase === 'over';
  const alive = s.alive.includes(id);
  const known: Record<string, Role> = { [id]: role };
  // The dead watch with every card face up; the living know their own pack.
  if (!alive || over) Object.assign(known, s.roles);
  if (isPack(role)) for (const x of s.players) if (isPack(s.roles[x]!)) known[x] = s.roles[x]!;
  const checks = s.checks[id] ?? [];
  if (role === 'seer') for (const c of checks) known[c.target] = c.result as Role;
  const t = tableView(s);
  const lover = s.lovers?.includes(id) ? s.lovers.find((x) => x !== id)! : null;
  return {
    ...t,
    deaths: alive && !over ? t.deaths : publicDeaths(s, true),
    lovers: lover || !alive || over ? s.lovers : t.lovers,
    me: id,
    role,
    team: teamOf(s, id),
    alive_: alive,
    known,
    checks,
    lover,
    packPicks:
      isPack(role) && alive && s.phase === 'night'
        ? Object.fromEntries(packAlive(s).flatMap((x) => (s.picks[x] ? [[x, s.picks[x]!]] : [])))
        : null,
    witch:
      s.phase === 'witch' && role === 'witch' && alive
        ? { victim: s.victim, heal: s.potions.heal, poison: s.potions.poison }
        : null,
    prompt: promptFor(s, id),
  };
}

const sideLost = (s: MafiaState, pack: boolean) => {
  const side = s.players.filter((id) => isPack(s.roles[id]!) === pack);
  const dead = side.filter((id) => !s.alive.includes(id)).length;
  return side.length ? dead / side.length : 0;
};

/**
 * Colours an event once the winners are known: good if it hurt only players who lost or helped
 * only players who won (and bad the other way round); mixed or unknown events stay plain.
 */
function withTone(e: RecapEvent, winners: string[]): RecapEvent {
  const d = e.data as (Partial<Touch> & { kind?: string }) | undefined;
  if (d?.kind === 'win') return winners.length ? { ...e, tone: 'good' } : e;
  if (!d?.about?.length || !winners.length) return e;
  const won = d.about.filter((id) => winners.includes(id)).length;
  if (won > 0 && won < d.about.length) return e;
  const goodForWinners = won > 0 !== !!d.harm;
  return { ...e, tone: goodForWinners ? 'good' : 'bad' };
}

/** When a player went out, from the morning, vote or shot that took them: "Night 2", "Day 3". */
function outAt(s: MafiaState, id: string): string {
  for (const e of s.recap) {
    const d = e.data as { kind?: string; about?: string[]; at?: string } | undefined;
    if (!d?.about?.includes(id)) continue;
    if (d.kind === 'dawn') return `Night ${e.round}`;
    if (d.kind === 'vote') return `Day ${e.round}`;
    if (d.kind === 'shot') return `${d.at} ${e.round}`;
  }
  return 'Alive';
}

/** Ballots cast and received, how long each lasted and the nights they used a power, winners first. */
function statsOf(s: MafiaState, winners: string[]): RecapStats {
  const order = [...winners, ...s.players.filter((id) => !winners.includes(id))];
  const cast: Record<string, number> = {};
  const got: Record<string, number> = {};
  const acts: Record<string, number> = {};
  for (const e of s.recap) {
    const d = e.data as
      { kind?: string; votes?: Record<string, string>; acted?: string[] } | undefined;
    if (d?.kind === 'ballots')
      for (const [voter, t] of Object.entries(d.votes ?? {})) {
        cast[voter] = (cast[voter] ?? 0) + 1;
        got[t] = (got[t] ?? 0) + 1;
      }
    if (d?.kind === 'dawn') for (const id of d.acted ?? []) acts[id] = (acts[id] ?? 0) + 1;
  }
  return {
    columns: ['Votes cast', 'Votes received', 'Survived to', 'Night actions'],
    rows: order.map((playerId) => ({
      playerId,
      values: [cast[playerId] ?? 0, got[playerId] ?? 0, outAt(s, playerId), acts[playerId] ?? 0],
    })),
  };
}

function result(s: MafiaState, win: Win, early: boolean): GameResult {
  // Nobody left standing is a draw for everyone.
  const draw = s.alive.length === 0;
  const winners = draw ? [] : s.players.filter((id) => teamOf(s, id) === win.team);
  const names = TEAM_NAME[s.mode];
  const highlights: Highlight[] = [];
  const savers = new Map<string, number>();
  for (const id of s.saves) savers.set(id, (savers.get(id) ?? 0) + 1);
  for (const [id, n] of savers)
    highlights.push({
      award: 'Saved a life',
      playerIds: [id],
      text: `${n} ${n === 1 ? 'life' : 'lives'} saved as the ${ROLE_INFO[s.roles[id]!].name}`,
      value: n,
    });
  const reveal: MafiaReveal = {
    mode: s.mode,
    roles: s.roles,
    alive: s.alive,
    deaths: s.deaths,
    lovers: s.lovers,
    win,
    checks: s.checks,
  };
  return {
    winners,
    summary: early ? `Ended early. ${win.line}` : win.line,
    reveal,
    recap: s.recap.map((e) => withTone(e, winners)),
    roundName: 'Round',
    stats: statsOf(s, winners),
    highlights,
    standings: s.players.map((playerId) => {
      const team = teamOf(s, playerId);
      return {
        playerId,
        outcome: draw ? 'draw' : winners.includes(playerId) ? 'win' : 'loss',
        team: names[team],
        role: ROLE_INFO[s.roles[playerId]!].name,
      };
    }),
  };
}

/** What the results screen gets: every card, who died how, and who won. */
export interface MafiaReveal {
  mode: Mode;
  roles: Record<string, Role>;
  alive: string[];
  deaths: Death[];
  lovers: [string, string] | null;
  win: Win;
  checks: Record<string, Check[]>;
}

const need = (cond: unknown, code: string, message: string): void => {
  if (!cond) throw new GameError(code, message);
};

export const mafia: GameModule<
  MafiaState,
  MafiaAction,
  MafiaPlayerView,
  MafiaTableView,
  MafiaOptions
> = {
  meta,
  optionsSchema,
  actionSchema,
  defaultOptions,
  validateOptions,

  setup({ playerIds, options, rng, now }) {
    const mode = options.mode;
    const extras = options.extras.filter((r) => SETTING[mode].extras.includes(r));
    const k = Math.min(killersFor(options, playerIds.length), Math.ceil(playerIds.length / 2) - 1);
    const cast = castFor(mode, playerIds.length, Math.max(1, k), extras);
    const dealt = rng.shuffle(cast);
    const roles: Record<string, Role> = {};
    playerIds.forEach((id, i) => (roles[id] = dealt[i]!));
    return {
      mode,
      players: playerIds,
      roles,
      cast,
      alive: playerIds,
      deaths: [],
      lovers: null,
      revealRoles: options.reveal === 'Shown',
      talkMs: TALK_MS[options.talk],
      phase: 'deal',
      night: 0,
      day: 0,
      step: 0,
      since: now,
      deadline: now + DEAL_MS,
      ready: [],
      picks: {},
      second: null,
      victim: null,
      potions: { heal: true, poison: true },
      checks: {},
      votes: {},
      lastVote: null,
      dawn: [],
      hunter: null,
      saves: [],
      win: null,
      recap: [
        {
          text: `The cards were dealt: ${castCounts(cast)
            .map(([r, n]) => (n === 1 ? ROLE_INFO[r].name : `${n} ${ROLE_INFO[r].plural}`))
            .join(', ')}.`,
          secret: playerIds.map((id) => `${brace(id)}: ${ROLE_INFO[roles[id]!].name}`).join('. '),
          data: { kind: 'deal', roles },
        },
      ],
    };
  },

  getPlayerView: playerView,
  getTableView: tableView,

  applyAction(s, id, action, rng, now) {
    need(s.phase !== 'over', 'GAME_OVER', 'The game is over.');
    need(s.roles[id], 'NOT_A_PLAYER', 'You’re not in this game.');
    const alive = s.alive.includes(id);

    switch (action.type) {
      case 'ready': {
        need(
          s.phase === 'deal' || s.phase === 'day',
          'WRONG_PHASE',
          'There’s nothing to be ready for.',
        );
        need(alive, 'DEAD', 'The dead don’t vote.');
        const has = s.ready.includes(id);
        if (has === action.on) return s;
        const ready = action.on ? [...s.ready, id] : s.ready.filter((x) => x !== id);
        const next = { ...s, ready };
        if (s.phase === 'deal')
          return ready.length === s.players.length ? startNight(next, now) : next;
        return ready.length >= Math.floor(s.alive.length / 2) + 1 ? startVote(next, now) : next;
      }

      case 'pick': {
        need(s.phase === 'night', 'WRONG_PHASE', 'It isn’t night.');
        need(alive, 'DEAD', 'The dead sleep through the night.');
        const act = nightAct(s, id)!;
        const targets = targetsFor(s, id, act);
        need(targets.includes(action.target), 'BAD_TARGET', 'You can’t pick them.');
        let next: MafiaState;
        if (act === 'love') {
          need(!(s.picks[id] && s.second), 'LOCKED', 'Your arrows have flown.');
          need(
            action.second && targets.includes(action.second) && action.second !== action.target,
            'BAD_TARGET',
            'Pick two different players to fall in love.',
          );
          next = { ...s, picks: { ...s.picks, [id]: action.target }, second: action.second! };
        } else {
          if (act !== 'kill' && s.picks[id]) return s;
          if (s.picks[id] === action.target) return s;
          next = { ...s, picks: { ...s.picks, [id]: action.target } };
          if (act === 'ask' || act === 'see') {
            const role = s.roles[action.target]!;
            const check: Check = {
              night: s.night,
              target: action.target,
              result: act === 'see' ? role : role === 'mafia' ? 'mafia' : 'clean',
            };
            next = { ...next, checks: { ...s.checks, [id]: [...(s.checks[id] ?? []), check] } };
          }
        }
        return nightDone(next) ? closeNight(next, rng, now) : next;
      }

      case 'potion': {
        need(s.phase === 'witch', 'WRONG_PHASE', 'It isn’t the Witch’s turn.');
        need(
          alive && s.roles[id] === 'witch' && witchCanAct(s),
          'NOT_WITCH',
          'Only the Witch brews.',
        );
        need(!action.heal || (s.potions.heal && s.victim), 'NO_POTION', 'There’s nobody to save.');
        if (action.poison) {
          need(s.potions.poison, 'NO_POTION', 'Your poison is gone.');
          need(s.alive.includes(action.poison), 'BAD_TARGET', 'You can’t poison them.');
        }
        return dawn(s, { heal: action.heal, poison: action.poison }, now);
      }

      case 'vote': {
        need(s.phase === 'vote', 'WRONG_PHASE', 'It isn’t time to vote.');
        need(alive, 'DEAD', 'The dead don’t vote.');
        need(
          action.target === 'skip' || (action.target !== id && s.alive.includes(action.target)),
          'BAD_TARGET',
          'You can’t vote for them.',
        );
        if (s.votes[id] === action.target) return s;
        const next = { ...s, votes: { ...s.votes, [id]: action.target } };
        return s.alive.every((x) => next.votes[x]) ? closeVote(next, now) : next;
      }

      case 'shoot': {
        need(s.phase === 'hunter' && s.hunter?.id === id, 'WRONG_PHASE', 'Only the Hunter shoots.');
        need(
          action.target === null || s.alive.includes(action.target),
          'BAD_TARGET',
          'They’re already dead.',
        );
        return shoot(s, action.target, now);
      }
    }
  },

  waitingOn(s) {
    switch (s.phase) {
      case 'deal':
        return s.players.filter((id) => !s.ready.includes(id));
      case 'night':
        return s.alive.filter((id) => !s.picks[id]);
      case 'witch':
        return witchCanAct(s) ? [witchOf(s)!] : [];
      case 'vote':
        return s.alive.filter((id) => !s.votes[id]);
      case 'hunter':
        return s.hunter ? [s.hunter.id] : [];
      default:
        return [];
    }
  },

  nextTimer(s) {
    if (s.phase === 'witch' && s.wakeAt) return { id: `witch:${s.step}`, at: s.wakeAt };
    return s.phase !== 'over' && s.deadline ? { id: `${s.phase}:${s.step}`, at: s.deadline } : null;
  },

  onTimer(s, id, rng, now) {
    if (id !== `${s.phase}:${s.step}`) return s;
    switch (s.phase) {
      case 'deal':
        return startNight(s, now);
      case 'night':
        return closeNight(s, rng, now);
      case 'witch':
        return dawn(s, null, now);
      case 'dawn':
        return settle(s, 'day', now);
      case 'day':
        return startVote(s, now);
      case 'vote':
        return closeVote(s, now);
      case 'dusk':
        return settle(s, 'night', now);
      case 'hunter':
        return shoot(s, null, now);
      default:
        return s;
    }
  },

  announce(prev, next) {
    if (!prev || prev.step === next.step) return [];
    const lines: string[] = [];
    const newDeaths = next.deaths.slice(prev.deaths.length);
    const said = (d: Death) =>
      next.revealRoles ? `{${d.id}} (${ROLE_INFO[next.roles[d.id]!].name})` : `{${d.id}}`;
    if (next.phase === 'night') lines.push(`Night ${next.night} falls.`);
    if (next.phase === 'dawn')
      lines.push(
        newDeaths.length
          ? `Morning: ${newDeaths.map((d) => (d.cause === 'grief' ? `${said(d)}, of a broken heart` : said(d))).join(' and ')} found dead.`
          : 'Morning: nobody died in the night.',
      );
    if (next.phase === 'vote') lines.push('The vote is open.');
    if (prev.phase === 'vote' && next.lastVote)
      lines.push(
        next.lastVote.out ? `${said(newDeaths[0]!)} was voted out.` : 'No one was voted out.',
      );
    if (prev.phase === 'hunter') {
      const shot = newDeaths.find((d) => d.cause === 'shot');
      lines.push(shot ? `The Hunter shot ${said(shot)}.` : 'The Hunter lowered the gun.');
    }
    return lines;
  },

  /**
   * Ended early: the side that has lost the smaller share of its players is ahead (the killers
   * against everyone else); level is a draw. Nothing to save before anyone has died.
   */
  partialResult(s) {
    if (s.phase === 'over' || s.deaths.length === 0) return null;
    const pack = sideLost(s, true);
    const town = sideLost(s, false);
    if (pack === town) {
      const r = result(s, { team: 'town', line: 'Level when it ended.' }, true);
      return {
        ...r,
        winners: [],
        recap: r.recap.map(({ tone: _, ...e }) => e),
        standings: r.standings!.map((x) => ({ ...x, outcome: 'draw' as const })),
      };
    }
    const names = SETTING[s.mode];
    return result(
      s,
      pack < town
        ? { team: 'pack', line: `${names.pack} were ahead.` }
        : { team: 'town', line: `${names.town} was ahead.` },
      true,
    );
  },

  bot: mafiaBot,
  botDelayMs: 2500,

  getResult(s) {
    return s.phase === 'over' && s.win ? result(s, s.win, false) : null;
  },
};
