/**
 * The two settings and their roles. Both play the same way (night, morning, talk, vote); the
 * setting changes who is dealt, what their powers are called and how the game looks.
 *
 * - Mafia, in a 1920s city: the Mafia kill together; the Angel saves one person a night (themself
 *   too); the Sheriff asks whether someone is Mafia; Civilians. The host can add the Jester (wins
 *   if the town votes them out), the Mayor (their vote counts twice) and the Serial Killer (kills
 *   alone each night and wins by being the last one standing).
 * - Werewolf, in the village of Thiercelieux: the Werewolves kill together; the Seer sees one
 *   player's card a night; Villagers. The host can add the Witch (one potion to save the wolves'
 *   victim, one to kill), the Hunter (shoots someone as they die) and Cupid (binds two lovers on
 *   the first night; if one dies, so does the other).
 */

export const MODES = ['Mafia', 'Werewolf'] as const;
export type Mode = (typeof MODES)[number];

export const ROLES = [
  'mafia',
  'angel',
  'sheriff',
  'civilian',
  'jester',
  'mayor',
  'killer',
  'wolf',
  'seer',
  'witch',
  'hunter',
  'cupid',
  'villager',
] as const;
export type Role = (typeof ROLES)[number];

/** The side a role starts on. Lovers from opposite sides become a side of their own. */
export type Team = 'town' | 'pack' | 'jester' | 'killer' | 'lovers';

export interface RoleInfo {
  mode: Mode;
  name: string;
  /** Plural, for the cast list ("2 Mafia", "3 Civilians"). */
  plural: string;
  team: Team;
  /** One line on the card: what you do. */
  power: string;
  /** Optional roles are the host's to add; the rest are always dealt. */
  optional?: boolean;
}

export const ROLE_INFO: Record<Role, RoleInfo> = {
  mafia: {
    mode: 'Mafia',
    name: 'Mafia',
    plural: 'Mafia',
    team: 'pack',
    power: 'Each night, agree with your family on someone to kill. By day, blend in.',
  },
  angel: {
    mode: 'Mafia',
    name: 'Angel',
    plural: 'Angels',
    team: 'town',
    power:
      'Each night, watch over one person. If the Mafia come for them, they live. You can pick yourself.',
  },
  sheriff: {
    mode: 'Mafia',
    name: 'Sheriff',
    plural: 'Sheriffs',
    team: 'town',
    power: 'Each night, ask about one person. You learn whether they’re Mafia.',
  },
  civilian: {
    mode: 'Mafia',
    name: 'Civilian',
    plural: 'Civilians',
    team: 'town',
    power: 'No powers, just your wits. Find the Mafia and vote them out.',
  },
  jester: {
    mode: 'Mafia',
    name: 'Jester',
    plural: 'Jesters',
    team: 'jester',
    power: 'You win alone if the town votes you out. Look guilty, but not too guilty.',
    optional: true,
  },
  mayor: {
    mode: 'Mafia',
    name: 'Mayor',
    plural: 'Mayors',
    team: 'town',
    power: 'You’re on the town’s side, and your vote counts twice.',
    optional: true,
  },
  killer: {
    mode: 'Mafia',
    name: 'Serial Killer',
    plural: 'Serial Killers',
    team: 'killer',
    power: 'Each night, kill someone on your own. You win if you’re the last one standing.',
    optional: true,
  },
  wolf: {
    mode: 'Werewolf',
    name: 'Werewolf',
    plural: 'Werewolves',
    team: 'pack',
    power: 'Each night, agree with the pack on a villager to devour. By day, act human.',
  },
  seer: {
    mode: 'Werewolf',
    name: 'Seer',
    plural: 'Seers',
    team: 'town',
    power: 'Each night, look at one player’s card and learn who they really are.',
  },
  witch: {
    mode: 'Werewolf',
    name: 'Witch',
    plural: 'Witches',
    team: 'town',
    power: 'You see who the wolves chose. One potion saves a life, one takes a life, once each.',
    optional: true,
  },
  hunter: {
    mode: 'Werewolf',
    name: 'Hunter',
    plural: 'Hunters',
    team: 'town',
    power: 'When you die, by night or by vote, you shoot one player and take them with you.',
    optional: true,
  },
  cupid: {
    mode: 'Werewolf',
    name: 'Cupid',
    plural: 'Cupids',
    team: 'town',
    power:
      'On the first night, make two players fall in love. If one dies, the other dies of grief.',
    optional: true,
  },
  villager: {
    mode: 'Werewolf',
    name: 'Villager',
    plural: 'Villagers',
    team: 'town',
    power: 'No powers, just your wits. Find the wolves and hang them.',
  },
};

/** What each setting deals: the killers, the always-dealt roles, the extras, the plain role. */
export const SETTING: Record<
  Mode,
  { killer: Role; core: Role[]; extras: Role[]; plain: Role; town: string; pack: string }
> = {
  Mafia: {
    killer: 'mafia',
    core: ['angel', 'sheriff'],
    extras: ['jester', 'mayor', 'killer'],
    plain: 'civilian',
    town: 'The town',
    pack: 'The Mafia',
  },
  Werewolf: {
    killer: 'wolf',
    core: ['seer'],
    extras: ['witch', 'hunter', 'cupid'],
    plain: 'villager',
    town: 'The village',
    pack: 'The werewolves',
  },
};

export const TEAM_NAME: Record<Mode, Record<Team, string>> = {
  Mafia: {
    town: 'Town',
    pack: 'Mafia',
    jester: 'Jester',
    killer: 'Serial Killer',
    lovers: 'Lovers',
  },
  Werewolf: {
    town: 'Village',
    pack: 'Werewolves',
    jester: 'Jester',
    killer: 'Serial Killer',
    lovers: 'Lovers',
  },
};

/** How many killers a table of this size gets on Auto: about one in four. */
export function autoKillers(players: number): number {
  if (players <= 6) return 1;
  if (players <= 9) return 2;
  if (players <= 12) return 3;
  return 4;
}

/** The deal for a table: every role card, in a fixed order (shuffled when dealt). */
export function castFor(mode: Mode, players: number, killers: number, extras: Role[]): Role[] {
  const s = SETTING[mode];
  const cards: Role[] = [];
  for (let i = 0; i < killers; i++) cards.push(s.killer);
  for (const r of s.core) if (cards.length < players) cards.push(r);
  for (const r of s.extras) if (extras.includes(r) && cards.length < players) cards.push(r);
  while (cards.length < players) cards.push(s.plain);
  return cards;
}

/** The deal as counts, in cast order: [["mafia", 2], ["angel", 1], …]. */
export function castCounts(cards: Role[]): [Role, number][] {
  const out: [Role, number][] = [];
  for (const r of cards) {
    const row = out.find(([x]) => x === r);
    if (row) row[1]++;
    else out.push([r, 1]);
  }
  return out;
}
