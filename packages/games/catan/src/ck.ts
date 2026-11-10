import type { Rng } from '@jackdaw/engine';
import { pips } from './board';
import type { Buildings } from './build';
import type { Layout } from './geometry';
import {
  add,
  cardsText,
  covers,
  layoutOf,
  logged,
  points,
  recountRoads,
  refuse,
  robberTiles,
  type CatanAction,
  type CatanState,
  type Phase,
} from './rules';
import {
  CARDS,
  COMMODITIES,
  GOOD,
  YIELD,
  countCards,
  emptyCards,
  isCommodity,
  type Card,
  type Cards,
  type Commodity,
  type Resource,
  type Size,
} from './types';

/**
 * Cities & Knights (2026-11-08: "add the option to select the expansion pack"): commodities
 * from cities, three tracks of city improvements with metropolises, knights who defend the
 * island from the barbarian ship, city walls, and progress cards in place of development cards.
 * Played to 13 (the lobby's target plus 3). The robber waits until the barbarians first land.
 *
 * Where the box has a player choose cards in secret for someone else's card (Wedding, Saboteur,
 * Master Merchant, Spy, Commercial Harbor, Deserter), which city the barbarians take, or where a
 * displaced knight goes, the game chooses for them (fairly, by plain rules written below), so no
 * one's turn waits on another phone.
 */

export type Track = 'trade' | 'politics' | 'science';
export const TRACKS: readonly Track[] = ['science', 'trade', 'politics'];
/** The commodity each track's improvements cost. */
export const TRACK_GOOD: Record<Track, Commodity> = {
  science: 'paper',
  trade: 'cloth',
  politics: 'coin',
};
export const TRACK_NAME: Record<Track, string> = {
  science: 'Science',
  trade: 'Trade',
  politics: 'Politics',
};

export type EventFace = 'ship' | Track;
/** The event die: three ship faces, and one city gate in each track's color. */
export const EVENT_FACES: readonly EventFace[] = [
  'ship',
  'ship',
  'ship',
  'trade',
  'politics',
  'science',
];

export type KnightLevel = 1 | 2 | 3;
export interface Knight {
  owner: string;
  level: KnightLevel;
  active: boolean;
  /** The turn it was activated (it can't act in that turn). */
  woke?: number;
  /** The turn it was promoted (once a turn). */
  promoted?: number;
}

export type Progress =
  | 'alchemist'
  | 'inventor'
  | 'crane'
  | 'engineer'
  | 'irrigation'
  | 'medicine'
  | 'mining'
  | 'printer'
  | 'roadBuilding'
  | 'smith'
  | 'commercialHarbor'
  | 'masterMerchant'
  | 'merchant'
  | 'merchantFleet'
  | 'resourceMonopoly'
  | 'tradeMonopoly'
  | 'bishop'
  | 'constitution'
  | 'deserter'
  | 'diplomat'
  | 'intrigue'
  | 'saboteur'
  | 'spy'
  | 'warlord'
  | 'wedding';

/** The three decks of 18. */
export const DECKS: Record<Track, Partial<Record<Progress, number>>> = {
  science: {
    alchemist: 2,
    inventor: 2,
    crane: 2,
    engineer: 1,
    irrigation: 2,
    medicine: 2,
    mining: 2,
    printer: 1,
    roadBuilding: 2,
    smith: 2,
  },
  trade: {
    commercialHarbor: 2,
    masterMerchant: 2,
    merchant: 6,
    merchantFleet: 2,
    resourceMonopoly: 4,
    tradeMonopoly: 2,
  },
  politics: {
    bishop: 2,
    constitution: 1,
    deserter: 2,
    diplomat: 2,
    intrigue: 2,
    saboteur: 2,
    spy: 3,
    warlord: 2,
    wedding: 2,
  },
};

/** Victory point progress cards: shown as soon as they are drawn. */
export const VP_PROGRESS: readonly Progress[] = ['printer', 'constitution'];

export const PROGRESS_TRACK = Object.fromEntries(
  TRACKS.flatMap((t) => Object.keys(DECKS[t]).map((c) => [c, t])),
) as Record<Progress, Track>;

export const PROGRESS_NAME: Record<Progress, string> = {
  alchemist: 'Alchemist',
  inventor: 'Inventor',
  crane: 'Crane',
  engineer: 'Engineer',
  irrigation: 'Irrigation',
  medicine: 'Medicine',
  mining: 'Mining',
  printer: 'Printer',
  roadBuilding: 'Road Building',
  smith: 'Smith',
  commercialHarbor: 'Commercial Harbor',
  masterMerchant: 'Master Merchant',
  merchant: 'Merchant',
  merchantFleet: 'Merchant Fleet',
  resourceMonopoly: 'Resource Monopoly',
  tradeMonopoly: 'Trade Monopoly',
  bishop: 'Bishop',
  constitution: 'Constitution',
  deserter: 'Deserter',
  diplomat: 'Diplomat',
  intrigue: 'Intrigue',
  saboteur: 'Saboteur',
  spy: 'Spy',
  warlord: 'Warlord',
  wedding: 'Wedding',
};

/** What each card does, in a line (the phone's card sheet). */
export const PROGRESS_TEXT: Record<Progress, string> = {
  alchemist: 'Before you roll: choose what the two number dice show.',
  inventor: 'Swap two number tokens (not 2, 12, 6 or 8).',
  crane: 'Your next city improvement this turn costs one commodity less.',
  engineer: 'Build a city wall for free.',
  irrigation: 'Take 2 grain for each fields tile beside your buildings.',
  medicine: 'Upgrade a settlement to a city for 2 ore and 1 grain.',
  mining: 'Take 2 ore for each mountains tile beside your buildings.',
  printer: 'One victory point.',
  roadBuilding: 'Build two roads for free.',
  smith: 'Promote up to two knights for free this turn.',
  commercialHarbor: 'Give each rival one resource; each gives you a commodity back.',
  masterMerchant: 'Take two cards at random from a player with more points.',
  merchant: 'Place the merchant beside your building: 2:1 for that tile, and a point.',
  merchantFleet: 'Trade one kind of card 2:1 with the bank this turn.',
  resourceMonopoly: 'Name a resource: every rival gives you up to two.',
  tradeMonopoly: 'Name a commodity: every rival gives you one.',
  bishop: 'Move the robber and take a card from each player beside it.',
  constitution: 'One victory point.',
  deserter: 'A rival removes their weakest knight; you may place one as strong.',
  diplomat: 'Remove an open road. If it’s yours, build it again elsewhere.',
  intrigue: 'Displace a rival knight that stands on your road.',
  saboteur: 'Everyone with as many points as you or more loses half their cards.',
  spy: 'Take a progress card at random from a rival.',
  warlord: 'Activate all your knights for free.',
  wedding: 'Everyone with more points gives you two cards.',
};

export const CK_COSTS = {
  knight: { wool: 1, ore: 1 },
  promote: { wool: 1, ore: 1 },
  activate: { grain: 1 },
  wall: { brick: 2 },
  medicine: { ore: 2, grain: 1 },
} satisfies Record<string, Partial<Cards>>;

export const KNIGHTS_EACH = 2;
export const WALLS_EACH = 3;
/** Steps the ship sails before it lands. */
export const SHIP_STEPS = 7;
export const PROGRESS_HAND = 4;
export const COMMODITY_COUNT: Record<Size, number> = { classic: 12, big: 18 };

export interface Attack {
  seq: number;
  strength: number;
  defence: Record<string, number>;
  won: boolean;
  /** Who took a Defender of Catan point. */
  defender: string | null;
  /** Tied best defenders, who each draw a progress card. */
  tied: string[];
  /** Who lost a city. */
  lost: string[];
}

export interface CkState {
  knights: Record<string, Knight>;
  walls: string[];
  /** Each track's metropolis, by corner. */
  metros: Partial<Record<Track, string>>;
  levels: Record<string, Record<Track, number>>;
  /** How far the ship has sailed (0 to SHIP_STEPS). */
  ship: number;
  attacks: number;
  event: EventFace | null;
  decks: Record<Track, Progress[]>;
  /** Progress cards in hand: secret. */
  hands: Record<string, Progress[]>;
  /** Victory point progress cards, face up. */
  shown: Record<string, Progress[]>;
  defenders: Record<string, number>;
  merchant: { tile: number; owner: string } | null;
  /** This turn's Crane, Merchant Fleet and Smith. */
  crane: boolean;
  fleet: Card | null;
  smith: number;
  attack: Attack | null;
  played: { seq: number; pid: string; card: Progress; text: string } | null;
}

/** The public part, for every screen. */
export interface CkTable {
  knights: Record<string, Knight>;
  walls: string[];
  metros: Partial<Record<Track, string>>;
  levels: Record<string, Record<Track, number>>;
  ship: number;
  attacks: number;
  event: EventFace | null;
  deckLeft: Record<Track, number>;
  progressCounts: Record<string, number>;
  shown: Record<string, Progress[]>;
  defenders: Record<string, number>;
  merchant: CkState['merchant'];
  crane: boolean;
  fleet: Card | null;
  smith: number;
  attack: Attack | null;
  played: CkState['played'];
  /** Whether the robber has woken (after the first landing). */
  robberLive: boolean;
}

const seq = (s: CatanState) => s.eventSeq + 1;

export function newCk(players: string[], rng: Rng): CkState {
  const deck = (t: Track) =>
    rng.shuffle(
      Object.entries(DECKS[t]).flatMap(([c, n]) => Array<Progress>(n).fill(c as Progress)),
    );
  const each = <X>(f: () => X) => Object.fromEntries(players.map((p) => [p, f()]));
  return {
    knights: {},
    walls: [],
    metros: {},
    levels: each(() => ({ science: 0, trade: 0, politics: 0 })),
    ship: 0,
    attacks: 0,
    event: null,
    decks: { science: deck('science'), trade: deck('trade'), politics: deck('politics') },
    hands: each(() => []),
    shown: each(() => []),
    defenders: each(() => 0),
    merchant: null,
    crane: false,
    fleet: null,
    smith: 0,
    attack: null,
    played: null,
  };
}

export function ckTable(ck: CkState, seats: string[]): CkTable {
  return {
    knights: ck.knights,
    walls: ck.walls,
    metros: ck.metros,
    levels: ck.levels,
    ship: ck.ship,
    attacks: ck.attacks,
    event: ck.event,
    deckLeft: {
      science: ck.decks.science.length,
      trade: ck.decks.trade.length,
      politics: ck.decks.politics.length,
    },
    progressCounts: Object.fromEntries(seats.map((p) => [p, ck.hands[p]?.length ?? 0])),
    shown: ck.shown,
    defenders: ck.defenders,
    merchant: ck.merchant,
    crane: ck.crane,
    fleet: ck.fleet,
    smith: ck.smith,
    attack: ck.attack,
    played: ck.played,
    robberLive: ck.attacks > 0,
  };
}

const withCk = (s: CatanState, patch: Partial<CkState>): CatanState => ({
  ...s,
  ck: { ...s.ck!, ...patch },
});

/** The robber stays on the desert until the barbarians first land. */
export const robberLive = (s: Pick<CatanState, 'ck'>): boolean => !s.ck || s.ck.attacks > 0;

/** Buildings with knights added, so knights block other players' roads and road trails. */
export function occupied(
  s: Pick<CatanState, 'buildings'> & { ck?: { knights: Record<string, Knight> } | null },
): Buildings {
  if (!s.ck) return s.buildings;
  const out: Buildings = { ...s.buildings };
  for (const [c, k] of Object.entries(s.ck.knights)) out[c] = { owner: k.owner, city: false };
  return out;
}

const touchesRoad = (L: Layout, roads: Record<string, string>, pid: string, c: string) =>
  L.corners[c]!.edges.some((e) => roads[e] === pid);

type Board = Pick<CatanState, 'buildings' | 'roads'> & {
  ck?: { knights: Record<string, Knight> } | null;
};

const empty = (s: Board, c: string) => !s.buildings[c] && !s.ck?.knights[c];

/** Corners where `pid` may stand a new knight: empty, on their road. */
export function knightSpots(L: Layout, s: Board, pid: string): string[] {
  return L.cornerIds.filter((c) => empty(s, c) && touchesRoad(L, s.roads, pid, c));
}

/** Corners reachable from `from` along the owner's roads, never through someone else's piece. */
function reach(L: Layout, s: Board, pid: string, from: string): string[] {
  const seen = new Set([from]);
  const queue = [from];
  const out: string[] = [];
  while (queue.length) {
    const c = queue.shift()!;
    for (const e of L.corners[c]!.edges) {
      if (s.roads[e] !== pid) continue;
      const { a, b } = L.edges[e]!;
      const n = a === c ? b : a;
      if (seen.has(n)) continue;
      seen.add(n);
      out.push(n);
      const b2 = s.buildings[n];
      const k = s.ck?.knights[n];
      if ((b2 && b2.owner !== pid) || k) continue; // may stop here, not pass
      queue.push(n);
    }
  }
  return out;
}

/** Where a knight on `from` may go: an empty corner, or a weaker rival's knight. */
export function knightMoves(L: Layout, s: Board, from: string): string[] {
  const k = s.ck?.knights[from];
  if (!k) return [];
  return reach(L, s, k.owner, from).filter((c) => {
    if (s.buildings[c]) return false;
    const other = s.ck!.knights[c];
    if (!other) return true;
    return other.owner !== k.owner && other.level < k.level;
  });
}

/** Whether a knight's turn is free: active, and not woken this turn. */
export const canAct = (k: Knight, turnSeq: number): boolean => k.active && k.woke !== turnSeq;

export function knightsLeft(
  ck: Pick<CkState, 'knights'>,
  pid: string,
): Record<KnightLevel, number> {
  const mine = Object.values(ck.knights).filter((k) => k.owner === pid);
  const n = (l: KnightLevel) => KNIGHTS_EACH - mine.filter((k) => k.level === l).length;
  return { 1: n(1), 2: n(2), 3: n(3) };
}

export const wallsOf = (s: Pick<CatanState, 'buildings'>, walls: string[], pid: string): number =>
  walls.filter((c) => s.buildings[c]?.owner === pid).length;

/** Cards you may hold before a 7 makes you discard: 7, plus 2 for each city wall. */
export const handLimit = (s: CatanState, pid: string): number =>
  7 + (s.ck ? 2 * wallsOf(s, s.ck.walls, pid) : 0);

/** Corners of metropolises. */
const metroCorners = (ck: Pick<CkState, 'metros'>) => new Set(Object.values(ck.metros));

/** Extra points in Cities & Knights: metropolises, defenders, printer and constitution, merchant. */
export function ckPoints(ck: CkState, pid: string, buildings: Buildings): number {
  let n = 0;
  for (const c of Object.values(ck.metros)) if (c && buildings[c]?.owner === pid) n += 2;
  n += ck.defenders[pid] ?? 0;
  n += ck.shown[pid]?.length ?? 0;
  if (ck.merchant?.owner === pid) n += 1;
  return n;
}

/** Commodities the next level in a track costs `pid`, or null when it can't be built. */
export function improveCost(ck: CkState, pid: string, track: Track): number | null {
  const lvl = ck.levels[pid]![track];
  if (lvl >= 5) return null;
  return Math.max(0, lvl + 1 - (ck.crane ? 1 : 0));
}

/** The fewest pips first: the city least missed. */
const cityPips = (L: Layout, s: CatanState, c: string) =>
  L.corners[c]!.tiles.reduce(
    (n, t) => n + (s.board.tiles[t]!.number ? pips(s.board.tiles[t]!.number!) : 0),
    0,
  );

/** Moves a metropolis to `pid`'s richest plain city, if they have one. */
function giveMetro(s: CatanState, pid: string, track: Track): CatanState {
  const L = layoutOf(s);
  const ck = s.ck!;
  const taken = metroCorners(ck);
  const cities = Object.keys(s.buildings).filter(
    (c) => s.buildings[c]!.owner === pid && s.buildings[c]!.city && !taken.has(c),
  );
  if (!cities.length) return s;
  const at = cities.reduce((a, b) => (cityPips(L, s, b) > cityPips(L, s, a) ? b : a));
  const from = ck.metros[track] ? (s.buildings[ck.metros[track]!]?.owner ?? null) : null;
  const n = seq(s);
  const next = withCk(
    { ...s, eventSeq: n, award: { seq: n, kind: track, from, to: pid } },
    { metros: { ...ck.metros, [track]: at } },
  );
  return logged(
    next,
    from
      ? `{actor} took the ${TRACK_NAME[track]} metropolis from {${from}}`
      : `{actor} raised the ${TRACK_NAME[track]} metropolis`,
    pid,
    { tag: 'Metropolis', tone: 'good', key: true },
  );
}

function improve(s: CatanState, who: string, track: Track): CatanState {
  const ck = s.ck!;
  if (!Object.values(s.buildings).some((b) => b.owner === who && b.city))
    return refuse('no-city', 'You need a city to build city improvements.');
  const cost = improveCost(ck, who, track);
  if (cost === null) return refuse('maxed', `Your ${TRACK_NAME[track]} is at the top.`);
  const good = TRACK_GOOD[track];
  if (s.hands[who]![good] < cost) return refuse('cant-afford', `That takes ${cost} ${good}.`);
  const lvl = ck.levels[who]![track] + 1;
  const pay = { [good]: cost } as Partial<Cards>;
  let next: CatanState = withCk(
    { ...s, hands: { ...s.hands, [who]: add(s.hands[who]!, pay, -1) }, bank: add(s.bank, pay) },
    { levels: { ...ck.levels, [who]: { ...ck.levels[who]!, [track]: lvl } }, crane: false },
  );
  next = logged(next, `{actor} raised ${TRACK_NAME[track]} to ${lvl}`, who, {
    tag: `${TRACK_NAME[track]} ${lvl}`,
  });
  if (lvl >= 4) {
    const corner = ck.metros[track];
    const holder = corner ? s.buildings[corner]?.owner : null;
    const holderLvl = holder ? ck.levels[holder]![track] : 0;
    if (!corner || (holder !== who && lvl === 5 && holderLvl < 5))
      next = giveMetro(next, who, track);
  }
  return next;
}

function buildKnight(s: CatanState, who: string, at: string): CatanState {
  const L = layoutOf(s);
  if (!covers(s.hands[who]!, CK_COSTS.knight))
    return refuse('cant-afford', 'A knight takes 1 wool and 1 ore.');
  if (knightsLeft(s.ck!, who)[1] <= 0)
    return refuse('no-pieces', 'You have no basic knights left.');
  if (!knightSpots(L, s, who).includes(at))
    return refuse('bad-spot', 'A knight stands on an empty corner on your road.');
  const next = withCk(
    {
      ...s,
      hands: { ...s.hands, [who]: add(s.hands[who]!, CK_COSTS.knight, -1) },
      bank: add(s.bank, CK_COSTS.knight),
    },
    { knights: { ...s.ck!.knights, [at]: { owner: who, level: 1, active: false } } },
  );
  return recountRoads(logged(next, '{actor} raised a knight', who, { tag: 'Knight' }));
}

function buildWall(s: CatanState, who: string, at: string, free: boolean): CatanState {
  const ck = s.ck!;
  const b = s.buildings[at];
  if (!b || b.owner !== who || !b.city)
    return refuse('bad-spot', 'A wall goes round one of your cities.');
  if (ck.walls.includes(at)) return refuse('bad-spot', 'That city has a wall already.');
  if (wallsOf(s, ck.walls, who) >= WALLS_EACH)
    return refuse('no-pieces', 'You have no walls left.');
  if (!free && !covers(s.hands[who]!, CK_COSTS.wall))
    return refuse('cant-afford', 'A city wall takes 2 brick.');
  const paid = free
    ? s
    : {
        ...s,
        hands: { ...s.hands, [who]: add(s.hands[who]!, CK_COSTS.wall, -1) },
        bank: add(s.bank, CK_COSTS.wall),
      };
  return logged(withCk(paid, { walls: [...ck.walls, at] }), '{actor} walled a city', who, {
    tag: 'Wall',
  });
}

const knightAt = (s: CatanState, who: string, at: string): Knight => {
  const k = s.ck!.knights[at];
  if (!k || k.owner !== who) return refuse('no-knight', 'Pick one of your knights.');
  return k;
};

function activate(s: CatanState, who: string, at: string): CatanState {
  const k = knightAt(s, who, at);
  if (k.active) return refuse('active', 'That knight is active already.');
  if (!covers(s.hands[who]!, CK_COSTS.activate))
    return refuse('cant-afford', 'Activating a knight takes 1 grain.');
  const next = withCk(
    {
      ...s,
      hands: { ...s.hands, [who]: add(s.hands[who]!, CK_COSTS.activate, -1) },
      bank: add(s.bank, CK_COSTS.activate),
    },
    { knights: { ...s.ck!.knights, [at]: { ...k, active: true, woke: s.turnSeq } } },
  );
  return logged(next, '{actor} activated a knight', who);
}

function promote(s: CatanState, who: string, at: string): CatanState {
  const ck = s.ck!;
  const k = knightAt(s, who, at);
  if (k.level === 3) return refuse('top', 'That knight is as strong as knights get.');
  if (k.promoted === s.turnSeq) return refuse('once', 'A knight can be promoted once a turn.');
  const to = (k.level + 1) as KnightLevel;
  if (to === 3 && ck.levels[who]!.politics < 3)
    return refuse('fortress', 'Mighty knights need Politics at 3 (the fortress).');
  if (knightsLeft(ck, who)[to] <= 0)
    return refuse('no-pieces', 'You have none of those knights left.');
  const free = ck.smith > 0;
  if (!free && !covers(s.hands[who]!, CK_COSTS.promote))
    return refuse('cant-afford', 'Promoting takes 1 wool and 1 ore.');
  const paid = free
    ? s
    : {
        ...s,
        hands: { ...s.hands, [who]: add(s.hands[who]!, CK_COSTS.promote, -1) },
        bank: add(s.bank, CK_COSTS.promote),
      };
  const next = withCk(paid, {
    knights: { ...ck.knights, [at]: { ...k, level: to, promoted: s.turnSeq } },
    smith: free ? ck.smith - 1 : ck.smith,
  });
  return logged(next, `{actor} promoted a knight to ${to === 2 ? 'strong' : 'mighty'}`, who);
}

/** A displaced knight goes to the nearest free corner on its owner's roads, or home if none. */
function relocate(s: CatanState, k: Knight, from: string): { s: CatanState; to: string | null } {
  const L = layoutOf(s);
  const to = reach(L, s, k.owner, from).find((c) => empty(s, c)) ?? null;
  if (!to) return { s, to: null };
  return { s: withCk(s, { knights: { ...s.ck!.knights, [to]: k } }), to };
}

function moveKnight(s: CatanState, who: string, from: string, to: string): CatanState {
  const k = knightAt(s, who, from);
  if (!canAct(k, s.turnSeq))
    return refuse(
      'inactive',
      k.active ? 'A knight can’t act on the turn it was activated.' : 'Activate the knight first.',
    );
  if (!knightMoves(layoutOf(s), s, from).includes(to))
    return refuse('bad-spot', 'The knight can’t reach there along your roads.');
  const ck = s.ck!;
  const other = ck.knights[to];
  const knights = { ...ck.knights };
  delete knights[from];
  knights[to] = { ...k, active: false };
  let next = withCk(s, { knights });
  if (!other) return recountRoads(logged(next, '{actor} moved a knight', who));
  const placed = relocate(next, other, to);
  next = logged(
    placed.s,
    placed.to
      ? `{actor} displaced a knight of {${other.owner}}`
      : `{actor} displaced a knight of {${other.owner}}, who had nowhere to go`,
    who,
    { tag: 'Displaced', tone: 'good' },
  );
  return recountRoads(next);
}

function chase(s: CatanState, who: string, from: string): CatanState {
  if (!robberLive(s)) return refuse('asleep', 'The robber stays put until the barbarians land.');
  const k = knightAt(s, who, from);
  if (!canAct(k, s.turnSeq)) return refuse('inactive', 'That knight can’t act this turn.');
  if (!layoutOf(s).tiles[s.robber]!.corners.includes(from))
    return refuse('far', 'The knight must stand beside the robber.');
  const next = withCk(s, { knights: { ...s.ck!.knights, [from]: { ...k, active: false } } });
  return logged(
    { ...next, phase: 'robber', robberBy: who, afterRobber: 'main' },
    '{actor} chased the robber away',
    who,
    { tag: 'Chase' },
  );
}

// ---------- Rolling ----------

/** Rolls the three dice (or the Alchemist's chosen pair, with the event die still rolled). */
export function ckRoll(
  s: CatanState,
  who: string,
  rng: Rng,
  produce: (s: CatanState, total: number) => CatanState,
  fixed?: [number, number],
): CatanState {
  const dice: [number, number] = fixed ?? [rng.int(6) + 1, rng.int(6) + 1];
  const face = EVENT_FACES[rng.int(6)]!;
  const total = dice[0] + dice[1];
  let next: CatanState = withCk(
    { ...s, dice, rollSeq: s.rollSeq + 1, produced: {}, owed: {} },
    { event: face },
  );
  next = logged(
    next,
    `{actor} rolled ${total}${face === 'ship' ? ', and the ship sails' : ''}`,
    who,
  );
  next = face === 'ship' ? sail(next) : drawProgress(next, face, dice[0], who);
  let phase: Phase;
  if (total === 7) {
    const discards: Record<string, number> = {};
    for (const p of next.seats) {
      const n = countCards(next.hands[p]!);
      if (n > handLimit(next, p)) discards[p] = Math.floor(n / 2);
    }
    const after = robberLive(next) ? 'robber' : 'main';
    phase = Object.keys(discards).length ? 'discard' : after;
    next = { ...next, discards, robberBy: who, afterRobber: 'main', afterDiscard: after };
    if (!robberLive(next)) next = logged(next, 'The robber sleeps until the barbarians land');
  } else {
    next = produce(next, total);
    const owed = { ...next.owed };
    for (const p of next.seats)
      if (next.ck!.levels[p]!.science >= 3 && !countCards(next.produced[p] ?? {}))
        owed[p] = [...(owed[p] ?? []), 'aqueduct'];
    next = { ...next, owed };
    phase = 'main';
  }
  return owedOrOn(next, phase);
}

/** Into the `pick` phase while anyone owes a choice, else straight on. */
export function owedOrOn(s: CatanState, phase: Phase): CatanState {
  const owes = Object.values(s.owed ?? {}).some((o) => o.length);
  return owes ? { ...s, phase: 'pick', owedNext: phase } : { ...s, phase };
}

/** Production in Cities & Knights: a city on forest, pasture or mountains takes a commodity. */
export function ckYield(
  terrain: CatanState['board']['tiles'][number]['terrain'],
  city: boolean,
): Partial<Cards> {
  const r = YIELD[terrain];
  if (!r) return {};
  if (!city) return { [r]: 1 };
  const g = GOOD[terrain];
  return g ? { [r]: 1, [g]: 1 } : { [r]: 2 };
}

function sail(s: CatanState): CatanState {
  const ship = s.ck!.ship + 1;
  if (ship < SHIP_STEPS) return withCk(s, { ship });
  return attack(withCk(s, { ship: 0 }));
}

/** Non-VP progress cards in a hand. */
const held = (ck: CkState, p: string) => ck.hands[p]!.length;

function drawOne(s: CatanState, p: string, track: Track): CatanState {
  const ck = s.ck!;
  const deck = ck.decks[track];
  if (!deck.length || held(ck, p) >= PROGRESS_HAND) return s;
  const [card, ...rest] = deck;
  const decks = { ...ck.decks, [track]: rest };
  if (VP_PROGRESS.includes(card!)) {
    return logged(
      withCk(s, { decks, shown: { ...ck.shown, [p]: [...ck.shown[p]!, card!] } }),
      `{actor} drew the ${PROGRESS_NAME[card!]}: a point`,
      p,
      { tag: '+1', tone: 'good' },
    );
  }
  return logged(
    withCk(s, { decks, hands: { ...ck.hands, [p]: [...ck.hands[p]!, card!] } }),
    `{actor} drew a ${TRACK_NAME[track].toLowerCase()} card`,
    p,
    { tag: 'Progress', secret: `Drew ${PROGRESS_NAME[card!]}` },
  );
}

/** A city gate: everyone with that track high enough for the red die draws a card. */
function drawProgress(s: CatanState, track: Track, red: number, roller: string): CatanState {
  const i = s.seats.indexOf(roller);
  const order = [...s.seats.slice(i), ...s.seats.slice(0, i)];
  let next = s;
  for (const p of order) {
    const lvl = next.ck!.levels[p]![track];
    if (lvl >= 1 && red <= lvl + 1) next = drawOne(next, p, track);
  }
  return next;
}

/** The ship lands: the island's cities against everyone's active knights. */
function attack(s: CatanState): CatanState {
  const L = layoutOf(s);
  const ck = s.ck!;
  const strength = Object.values(s.buildings).filter((b) => b.city).length;
  const defence = Object.fromEntries(s.seats.map((p) => [p, 0]));
  for (const k of Object.values(ck.knights)) if (k.active) defence[k.owner]! += k.level;
  const total = Object.values(defence).reduce((a, b) => a + b, 0);
  const won = total >= strength;
  const n = seq(s);
  let next: CatanState = { ...s, eventSeq: n };
  let defender: string | null = null;
  let tied: string[] = [];
  const lost: string[] = [];
  const owed = { ...s.owed };
  let buildings = s.buildings;
  let walls = ck.walls;
  let defenders = ck.defenders;
  if (won) {
    const top = Math.max(...Object.values(defence));
    const best = s.seats.filter((p) => defence[p] === top);
    if (top > 0 && best.length === 1) {
      defender = best[0]!;
      defenders = { ...defenders, [defender]: (defenders[defender] ?? 0) + 1 };
    } else if (top > 0) {
      tied = best;
      for (const p of best) owed[p] = [...(owed[p] ?? []), 'progress'];
    }
  } else {
    const metros = metroCorners(ck);
    const plain = (p: string) =>
      Object.keys(s.buildings).filter(
        (c) => s.buildings[c]!.owner === p && s.buildings[c]!.city && !metros.has(c),
      );
    const exposed = s.seats.filter((p) => plain(p).length > 0);
    if (exposed.length) {
      const low = Math.min(...exposed.map((p) => defence[p]!));
      for (const p of exposed.filter((q) => defence[q] === low)) {
        // The city least missed goes: one without a wall first, then the fewest pips.
        const at = plain(p).sort(
          (a, b) =>
            Number(walls.includes(a)) - Number(walls.includes(b)) ||
            cityPips(L, s, a) - cityPips(L, s, b),
        )[0]!;
        buildings = { ...buildings, [at]: { owner: p, city: false } };
        walls = walls.filter((c) => c !== at);
        lost.push(p);
      }
    }
  }
  const knights = Object.fromEntries(
    Object.entries(ck.knights).map(([c, k]) => [c, { ...k, active: false }]),
  );
  next = withCk(
    { ...next, buildings, owed },
    {
      knights,
      walls,
      defenders,
      attacks: ck.attacks + 1,
      attack: { seq: n, strength, defence, won, defender, tied, lost },
    },
  );
  const words = won
    ? defender
      ? `The barbarians landed and were beaten back (${total} against ${strength}); {${defender}} is Defender of Catan`
      : `The barbarians landed and were beaten back (${total} against ${strength})`
    : `The barbarians landed and won (${strength} against ${total})${
        lost.length ? `; ${lost.map((p) => `{${p}}`).join(' and ')} lost a city` : ''
      }`;
  next = logged(next, words, defender ?? undefined, {
    tag: won ? 'Defended' : 'Pillaged',
    tone: won ? 'good' : 'bad',
    key: true,
  });
  return ck.attacks === 0 ? logged(next, 'The robber wakes') : next;
}

// ---------- Choices owed ----------

type PickAction = Extract<CatanAction, { type: 'pick' }>;

/** Settles the first choice `who` owes: a resource (aqueduct, gold field) or a progress deck. */
export function pickOwed(s: CatanState, who: string, a: PickAction): CatanState {
  const mine = s.owed?.[who] ?? [];
  if (!mine.length) return refuse('nothing-owed', 'You have nothing to choose.');
  let next: CatanState;
  if (mine[0] === 'progress') {
    const ck = s.ck!;
    const t = a.track;
    if (!t) return refuse('pick', 'Choose a deck.');
    if (!ck.decks[t].length && TRACKS.some((x) => ck.decks[x].length))
      return refuse('empty', 'That deck is empty: pick another.');
    next = drawOne(s, who, t);
  } else {
    const r = a.resource;
    if (!r) return refuse('pick', 'Choose a resource.');
    if (s.bank[r] < 1) return refuse('bank-short', `The bank has no ${r} left.`);
    next = logged(
      {
        ...s,
        hands: { ...s.hands, [who]: add(s.hands[who]!, { [r]: 1 }) },
        bank: add(s.bank, { [r]: 1 }, -1),
        produced: { ...s.produced, [who]: add(fullOf(s.produced[who]), { [r]: 1 }) },
      },
      mine[0] === 'gold'
        ? `{actor} panned ${r} from the gold field`
        : `{actor} took ${r} from the aqueduct`,
      who,
    );
  }
  const owed = { ...next.owed, [who]: mine.slice(1) };
  if (!owed[who]!.length) delete owed[who];
  next = { ...next, owed };
  if (Object.keys(owed).length) return next;
  return { ...next, phase: next.owedNext ?? 'main' };
}

const fullOf = (c: Partial<Cards> | undefined): Cards => ({ ...emptyCards(), ...c });

// ---------- Progress cards ----------

type ProgressAction = Extract<CatanAction, { type: 'progress' }>;

const visiblePoints = (s: CatanState, p: string) => points(s, p, false);

/** Takes `n` cards at random from `from` to `to`. */
function takeRandom(
  s: CatanState,
  from: string,
  to: string,
  n: number,
  rng: Rng,
): { s: CatanState; took: Partial<Cards> } {
  let hands = s.hands;
  const took: Partial<Cards> = {};
  for (let k = 0; k < n; k++) {
    const pool = CARDS.flatMap((r) => Array<Card>(hands[from]![r]).fill(r));
    if (!pool.length) break;
    const r = rng.pick(pool);
    hands = {
      ...hands,
      [from]: { ...hands[from]!, [r]: hands[from]![r] - 1 },
      [to]: { ...hands[to]!, [r]: hands[to]![r] + 1 },
    };
    took[r] = (took[r] ?? 0) + 1;
  }
  return { s: { ...s, hands }, took };
}

/** `n` cards someone gives up by their own lights: commodities first, then their biggest piles. */
function givenUp(hand: Cards, n: number): Partial<Cards> {
  const left = { ...hand };
  const out: Partial<Cards> = {};
  for (let k = 0; k < n; k++) {
    const pool = CARDS.filter((r) => left[r] > 0);
    if (!pool.length) break;
    const goods = pool.filter(isCommodity);
    const from = goods.length ? goods : pool;
    const r = from.reduce((a, b) => (left[b] > left[a] ? b : a));
    left[r]--;
    out[r] = (out[r] ?? 0) + 1;
  }
  return out;
}

const move = (s: CatanState, from: string, to: string, c: Partial<Cards>): CatanState => ({
  ...s,
  hands: { ...s.hands, [from]: add(s.hands[from]!, c, -1), [to]: add(s.hands[to]!, c) },
});

/** Tiles of a terrain beside `pid`'s buildings, each counted once. */
function besideTiles(s: CatanState, pid: string, terrain: string): number[] {
  const L = layoutOf(s);
  const out = new Set<number>();
  for (const [c, b] of Object.entries(s.buildings))
    if (b.owner === pid)
      for (const t of L.corners[c]!.tiles) if (s.board.tiles[t]!.terrain === terrain) out.add(t);
  return [...out];
}

/** An open road: one of its ends touches neither its owner's building nor another of their roads. */
export function openRoad(L: Layout, s: Board, e: string): boolean {
  const owner = s.roads[e];
  if (!owner) return false;
  const { a, b } = L.edges[e]!;
  const loose = (c: string) =>
    s.buildings[c]?.owner !== owner &&
    !L.corners[c]!.edges.some((f) => f !== e && s.roads[f] === owner);
  return loose(a) || loose(b);
}

/** Whether `pid` may play this progress card right now. */
export function canPlayProgress(s: CatanState, pid: string, card: Progress): boolean {
  if (!s.ck || s.paired || s.turn !== pid) return false;
  if (card === 'alchemist') return s.phase === 'roll';
  return s.phase === 'main';
}

export function ckProgress(
  s: CatanState,
  who: string,
  a: ProgressAction,
  rng: Rng,
  produce: (s: CatanState, total: number) => CatanState,
): CatanState {
  const ck = s.ck!;
  const card = a.card;
  const i = ck.hands[who]!.indexOf(card);
  if (i < 0) return refuse('no-card', 'You don’t have that card.');
  if (!canPlayProgress(s, who, card))
    return refuse(
      'wrong-phase',
      card === 'alchemist'
        ? 'The Alchemist is played before you roll.'
        : 'Play progress cards after you roll.',
    );
  const L = layoutOf(s);
  const n = seq(s);
  let next: CatanState = withCk(
    { ...s, eventSeq: n },
    { hands: { ...ck.hands, [who]: ck.hands[who]!.filter((_, k) => k !== i) } },
  );
  const told = (text: string, chip: Parameters<typeof logged>[3] = {}) =>
    logged(
      withCk(next, { played: { seq: n, pid: who, card, text } }),
      `{actor} played ${PROGRESS_NAME[card]}: ${text}`,
      who,
      { tag: PROGRESS_NAME[card], ...chip },
    );
  const rivals = s.seats.filter((p) => p !== who);
  switch (card) {
    case 'alchemist': {
      const d = a.dice;
      if (!d) return refuse('pick', 'Choose the two dice.');
      next = told(`the dice show ${d[0]} and ${d[1]}`);
      return ckRoll(next, who, rng, produce, d);
    }
    case 'inventor': {
      const t = a.tiles;
      if (!t || t[0] === t[1]) return refuse('pick', 'Choose two number tokens.');
      const [x, y] = t;
      const tx = next.board.tiles[x];
      const ty = next.board.tiles[y];
      const ok = (n2: number | null | undefined) => n2 != null && ![2, 12, 6, 8].includes(n2);
      if (!tx || !ty || !ok(tx.number) || !ok(ty.number))
        return refuse('bad-tile', 'Pick two tokens other than 2, 12, 6 and 8.');
      const tiles = [...next.board.tiles];
      tiles[x] = { ...tx, number: ty.number };
      tiles[y] = { ...ty, number: tx.number };
      next = { ...next, board: { ...next.board, tiles } };
      return told(`swapped a ${tx.number} and a ${ty.number}`);
    }
    case 'crane':
      next = withCk(next, { crane: true });
      return told('the next improvement costs one less');
    case 'engineer': {
      if (!a.at) return refuse('pick', 'Pick a city for the wall.');
      next = buildWall(next, who, a.at, true);
      return told('a free city wall');
    }
    case 'irrigation':
    case 'mining': {
      const terrain = card === 'irrigation' ? 'fields' : 'mountains';
      const r: Resource = card === 'irrigation' ? 'grain' : 'ore';
      const want = 2 * besideTiles(next, who, terrain).length;
      const got = Math.min(want, next.bank[r]);
      next = {
        ...next,
        hands: { ...next.hands, [who]: add(next.hands[who]!, { [r]: got }) },
        bank: add(next.bank, { [r]: got }, -1),
      };
      return told(`${got} ${r}`, { tone: got ? 'good' : undefined });
    }
    case 'medicine': {
      const at = a.at;
      const b = at ? next.buildings[at] : undefined;
      if (!at || !b || b.owner !== who || b.city)
        return refuse('pick', 'Pick one of your settlements.');
      if (!covers(next.hands[who]!, CK_COSTS.medicine))
        return refuse('cant-afford', 'Medicine takes 2 ore and 1 grain.');
      const citiesLeft =
        4 - Object.values(next.buildings).filter((x) => x.owner === who && x.city).length;
      if (citiesLeft <= 0) return refuse('no-pieces', 'You have no cities left.');
      next = {
        ...next,
        hands: { ...next.hands, [who]: add(next.hands[who]!, CK_COSTS.medicine, -1) },
        bank: add(next.bank, CK_COSTS.medicine),
        buildings: { ...next.buildings, [at]: { owner: who, city: true } },
      };
      return told('a city for less', { tone: 'good' });
    }
    case 'roadBuilding': {
      next = { ...next, phase: 'roadBuilding', roadsToBuild: 2 };
      return told('two free roads');
    }
    case 'smith':
      next = withCk(next, { smith: 2 });
      return told('two free promotions');
    case 'commercialHarbor': {
      const r = a.resource;
      if (!r || isCommodity(r)) return refuse('pick', 'Choose a resource to give.');
      let swaps = 0;
      for (const p of rivals) {
        if (next.hands[who]![r] < 1) break;
        const goods = COMMODITIES.filter((g) => next.hands[p]![g] > 0);
        if (!goods.length) continue;
        const g = goods.reduce((x, y) => (next.hands[p]![y] > next.hands[p]![x] ? y : x));
        next = move(move(next, who, p, { [r]: 1 }), p, who, { [g]: 1 });
        swaps++;
      }
      return told(`${swaps} ${swaps === 1 ? 'swap' : 'swaps'} of ${r} for commodities`);
    }
    case 'masterMerchant': {
      const v = a.victim;
      if (!v || !rivals.includes(v) || visiblePoints(next, v) <= visiblePoints(next, who))
        return refuse('pick', 'Pick a player with more points than you.');
      const r = takeRandom(next, v, who, 2, rng);
      next = r.s;
      return told(`took ${countCards(r.took)} cards from {${v}}`, {
        secret: `Took ${cardsText(r.took)} from {${v}}`,
      });
    }
    case 'merchant': {
      const t = a.tile;
      const tile = t === undefined ? undefined : next.board.tiles[t];
      if (t === undefined || !tile || !YIELD[tile.terrain])
        return refuse('pick', 'Pick a land tile for the merchant.');
      if (!L.tiles[t]!.corners.some((c) => next.buildings[c]?.owner === who))
        return refuse('bad-tile', 'The merchant goes beside one of your buildings.');
      next = withCk(next, { merchant: { tile: t, owner: who } });
      return told(`the merchant trades ${YIELD[tile.terrain]} 2:1`);
    }
    case 'merchantFleet': {
      const r = a.resource;
      if (!r) return refuse('pick', 'Choose a kind of card.');
      next = withCk(next, { fleet: r });
      return told(`${r} trades 2:1 this turn`);
    }
    case 'resourceMonopoly':
    case 'tradeMonopoly': {
      const r = a.resource;
      const goods = card === 'tradeMonopoly';
      if (!r || isCommodity(r) !== goods)
        return refuse('pick', goods ? 'Name a commodity.' : 'Name a resource.');
      let took = 0;
      for (const p of rivals) {
        const k = Math.min(goods ? 1 : 2, next.hands[p]![r]);
        if (!k) continue;
        next = move(next, p, who, { [r]: k });
        took += k;
      }
      const m = seq(next);
      next = { ...next, eventSeq: m, monopoly: { seq: m, pid: who, resource: r, took } };
      return told(`${took} ${r}`, { tone: took ? 'good' : undefined });
    }
    case 'bishop': {
      if (!robberLive(next))
        return refuse('asleep', 'The robber stays put until the barbarians land.');
      const t = a.tile;
      if (
        t === undefined ||
        t === next.robber ||
        !next.board.tiles[t] ||
        !robberTiles(next, who).includes(t)
      )
        return refuse('bad-tile', 'Move the robber to a different land tile.');
      next = { ...next, robber: t };
      const owners = [...new Set(L.tiles[t]!.corners.map((c) => next.buildings[c]?.owner))].filter(
        (p): p is string => !!p && p !== who,
      );
      let took = 0;
      for (const p of owners) {
        const r = takeRandom(next, p, who, 1, rng);
        next = r.s;
        took += countCards(r.took);
      }
      return told(`moved the robber and took ${took} ${took === 1 ? 'card' : 'cards'}`);
    }
    case 'deserter': {
      const v = a.victim;
      if (!v || !rivals.includes(v)) return refuse('pick', 'Pick a rival.');
      const theirs = Object.entries(next.ck!.knights).filter(([, k]) => k.owner === v);
      if (!theirs.length) return refuse('no-knight', 'They have no knights.');
      // They give up their weakest knight, an inactive one first.
      const [at, k] = theirs.sort(
        ([, x], [, y]) => x.level - y.level || Number(x.active) - Number(y.active),
      )[0]!;
      const knights = { ...next.ck!.knights };
      delete knights[at];
      next = withCk(next, { knights });
      if (a.at && knightsLeft(next.ck!, who)[k.level] > 0) {
        if (!knightSpots(L, next, who).includes(a.at))
          return refuse('bad-spot', 'Your knight stands on an empty corner on your road.');
        next = withCk(next, {
          knights: { ...next.ck!.knights, [a.at]: { owner: who, level: k.level, active: false } },
        });
      }
      return recountRoads(told(`a knight of {${v}} deserted`, { tone: 'good' }));
    }
    case 'diplomat': {
      const e = a.at;
      if (!e || !next.roads[e] || !openRoad(L, next, e))
        return refuse('pick', 'Pick an open road: one with a loose end.');
      const owner = next.roads[e]!;
      const roads = { ...next.roads };
      delete roads[e];
      next = { ...next, roads };
      if (owner === who) next = { ...next, phase: 'roadBuilding', roadsToBuild: 1 };
      return recountRoads(
        told(owner === who ? 'moved one of their roads' : `removed a road of {${owner}}`),
      );
    }
    case 'intrigue': {
      const at = a.at;
      const k = at ? next.ck!.knights[at] : undefined;
      if (!at || !k || k.owner === who || !L.corners[at]!.edges.some((e) => next.roads[e] === who))
        return refuse('pick', 'Pick a rival knight on your road.');
      const knights = { ...next.ck!.knights };
      delete knights[at];
      next = relocate(withCk(next, { knights }), k, at).s;
      return recountRoads(told(`displaced a knight of {${k.owner}}`));
    }
    case 'saboteur': {
      const mine = visiblePoints(next, who);
      const discards: Record<string, number> = {};
      for (const p of rivals) {
        const c = countCards(next.hands[p]!);
        if (visiblePoints(next, p) >= mine && c >= 2) discards[p] = Math.floor(c / 2);
      }
      next = told(
        Object.keys(discards).length
          ? `${Object.keys(discards)
              .map((p) => `{${p}}`)
              .join(' and ')} discard half`
          : 'nobody had to discard',
      );
      return Object.keys(discards).length
        ? { ...next, discards, phase: 'discard', afterDiscard: 'main' }
        : next;
    }
    case 'spy': {
      const v = a.victim;
      if (!v || !rivals.includes(v) || !next.ck!.hands[v]!.length)
        return refuse('pick', 'Pick a rival who holds progress cards.');
      const theirs = next.ck!.hands[v]!;
      const k = rng.int(theirs.length);
      const got = theirs[k]!;
      next = withCk(next, {
        hands: {
          ...next.ck!.hands,
          [v]: theirs.filter((_, j) => j !== k),
          [who]: [...next.ck!.hands[who]!, got],
        },
      });
      return told(`took a progress card from {${v}}`, { secret: `Took ${PROGRESS_NAME[got]}` });
    }
    case 'warlord': {
      const knights = Object.fromEntries(
        Object.entries(next.ck!.knights).map(([c, k]) => [
          c,
          k.owner === who && !k.active ? { ...k, active: true, woke: next.turnSeq } : k,
        ]),
      );
      next = withCk(next, { knights });
      return told('every knight stands ready');
    }
    case 'wedding': {
      const mine = visiblePoints(next, who);
      let took = 0;
      for (const p of rivals) {
        if (visiblePoints(next, p) <= mine) continue;
        const c = givenUp(next.hands[p]!, 2);
        next = move(next, p, who, c);
        took += countCards(c);
      }
      return told(`${took} ${took === 1 ? 'gift' : 'gifts'}`, { tone: took ? 'good' : undefined });
    }
    case 'printer':
    case 'constitution':
      return refuse('no-card', 'That card counts as soon as it’s drawn.');
  }
}

/** Saboteur victims and anyone else discarding pick by their own lights only when they act. */

// ---------- Turn actions ----------

type CkMove = Extract<
  CatanAction,
  { type: 'improve' | 'activate' | 'promote' | 'knight' | 'chase' }
>;

export function ckAct(s: CatanState, who: string, a: CkMove): CatanState {
  if (!s.ck) return refuse('no-expansion', 'That’s a Cities & Knights move.');
  if (s.phase !== 'main') return refuse('wrong-phase', 'You can’t do that now.');
  switch (a.type) {
    case 'improve':
      return improve(s, who, a.track);
    case 'activate':
      return activate(s, who, a.at);
    case 'promote':
      return promote(s, who, a.at);
    case 'knight':
      if (s.paired) return refuse('paired', 'Knights only act on your own turn.');
      return moveKnight(s, who, a.from, a.to);
    case 'chase':
      if (s.paired) return refuse('paired', 'Knights only act on your own turn.');
      return chase(s, who, a.from);
  }
}

export function ckBuild(
  s: CatanState,
  who: string,
  kind: 'wall' | 'knight',
  at: string,
): CatanState {
  if (!s.ck) return refuse('no-expansion', 'That’s a Cities & Knights piece.');
  return kind === 'wall' ? buildWall(s, who, at, false) : buildKnight(s, who, at);
}

/** The bank's rate for one card of `give`, with harbors, trading house, merchant and fleet. */
export function ckRatio(
  s: Pick<CatanState, 'board' | 'size'> & { ck: Pick<CkState, 'levels' | 'merchant' | 'fleet'> },
  pid: string,
  give: Card,
  harbourRatio: number,
): number {
  let r = harbourRatio;
  const ck = s.ck;
  if (ck.fleet === give) r = Math.min(r, 2);
  if (isCommodity(give)) {
    if (ck.levels[pid]!.trade >= 3) r = Math.min(r, 2);
  } else if (
    ck.merchant?.owner === pid &&
    YIELD[s.board.tiles[ck.merchant.tile]!.terrain] === give
  ) {
    r = Math.min(r, 2);
  }
  return r;
}

/** Resets the turn's one-turn cards. */
export const ckTurnEnds = (s: CatanState): CatanState =>
  s.ck ? withCk(s, { crane: false, fleet: null, smith: 0 }) : s;
