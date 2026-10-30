import type { Outcome } from '@jackdaw/ui';
import { ROLE_INFO, SETTING, type Mode, type Role } from '../roles';
import type { MafiaPlayerView, MafiaTableView, NightAct, Prompt } from '../rules';

/**
 * Everything the narrator says and the front page prints, worked out from public table facts
 * (plus, on a phone, that player's own card for their prompt and their moments).
 */

type Name = (id: string) => string;

const list = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

/** Night is when the page goes dark: the night itself and the Witch's turn. */
export const isNight = (t: MafiaTableView) => t.phase === 'night' || t.phase === 'witch';

/** The paper's name over every page. */
export const MASTHEAD: Record<Mode, string> = {
  Mafia: 'The Jackdaw Courier',
  Werewolf: 'The Wolves of Thiercelieux',
};
/** The same, short enough for a phone's top line. */
export const MASTHEAD_SHORT: Record<Mode, string> = {
  Mafia: 'The Jackdaw Courier',
  Werewolf: 'Thiercelieux',
};

/** "Night 2", "Day 3": which edition this is. */
export function edition(t: MafiaTableView): string {
  const village = t.mode === 'Werewolf';
  // The Hunter shoots at dawn (before the day has started) or at dusk (after the vote).
  const morning = t.phase === 'dawn' || (t.phase === 'hunter' && t.day < t.night);
  if (t.phase === 'deal') return 'The deal';
  if (t.phase === 'over') return village ? 'The end' : 'Final edition';
  if (village) {
    if (isNight(t)) return `The ${ordinal(t.night)} night`;
    if (morning) return `The ${ordinal(t.night)} dawn`;
    return `The ${ordinal(t.day)} day`;
  }
  if (isNight(t)) return `Night ${t.night}`;
  if (morning) return `Morning ${t.night}`;
  return `Day ${t.day}`;
}

const ORDINALS = [
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
  'eleventh',
  'twelfth',
  'thirteenth',
  'fourteenth',
  'fifteenth',
];
/** "first", "second"… as a chronicle counts its days (numbers past the fifteenth). */
const ordinal = (n: number) => ORDINALS[n - 1] ?? `${n}th`;

function roleOf(t: MafiaTableView, id: string): Role | null {
  return t.deaths.find((d) => d.id === id)?.role ?? null;
}

const theRole = (r: Role | null) => (r ? `the ${ROLE_INFO[r].name}` : null);

/** The front-page headline and the line under it. */
export function headline(t: MafiaTableView, name: Name): { head: string; sub: string } {
  const wolf = t.mode === 'Werewolf';
  switch (t.phase) {
    case 'deal':
      return {
        head: 'The cards are dealt',
        sub: 'Look at your card in secret, and keep a straight face.',
      };
    case 'night':
      return {
        head: wolf ? 'Night falls on the village' : 'Night falls on the city',
        sub: 'Shield your screen and make your choice.',
      };
    case 'witch':
      return {
        head: 'The Witch is stirring',
        sub: 'She looks at her potions. Everyone else, wait.',
      };
    case 'dawn': {
      if (!t.dawn.length)
        return {
          head: wolf ? 'A quiet night' : 'Quiet night in the city',
          sub: 'Everyone woke up. Somebody’s plan went wrong.',
        };
      const who = t.dawn.map((id) => {
        const r = theRole(roleOf(t, id));
        return r ? `${name(id)}, ${r},` : name(id);
      });
      return {
        head: wolf ? 'The village wakes to grief' : 'Slain in the night',
        sub: `${list(who)} ${t.dawn.length === 1 ? 'was' : 'were'} found dead.`,
      };
    }
    case 'day':
      return {
        head: wolf ? 'Who among us?' : 'Who did it?',
        sub: t.talkTimed
          ? 'Talk it over. Ready to vote when you’ve heard enough.'
          : 'Talk it over. The vote opens when most of you are ready.',
      };
    case 'vote':
      return {
        head: wolf ? 'The village decides' : 'The town decides',
        sub: 'Vote for who you want out, or skip.',
      };
    case 'dusk': {
      const out = t.lastVote?.out;
      if (!out)
        return {
          head: 'No verdict',
          sub: 'Nobody got enough votes. Everyone goes home, for now.',
        };
      const r = theRole(roleOf(t, out));
      return {
        head: wolf ? `${name(out)} to the gallows` : `Town runs ${name(out)} out`,
        sub: r ? `${name(out)} was ${r}.` : `${name(out)} takes their secret with them.`,
      };
    }
    case 'hunter':
      return {
        head: 'The Hunter takes aim',
        sub: `${name(t.hunter ?? '')} gets one last shot before they fall.`,
      };
    case 'over':
      return {
        head: winHead(t),
        sub: t.win?.line ?? '',
      };
  }
}

function winHead(t: MafiaTableView): string {
  switch (t.win?.team) {
    case 'town':
      return t.alive.length === 0
        ? 'Nobody left'
        : t.mode === 'Mafia'
          ? 'The town is saved'
          : 'The village is saved';
    case 'pack':
      return t.mode === 'Mafia' ? 'The Mafia win' : 'The wolves win';
    case 'jester':
      return 'The Jester wins';
    case 'killer':
      return 'The Serial Killer wins';
    case 'lovers':
      return 'Love wins';
    default:
      return 'Game over';
  }
}

/** What the narrator reads out at each step. */
export function narration(t: MafiaTableView, name: Name): string {
  const wolf = t.mode === 'Werewolf';
  const s = SETTING[t.mode];
  switch (t.phase) {
    case 'deal':
      return 'The cards are dealt. Look at yours in secret, and keep a straight face.';
    case 'night': {
      const powers = t.cast
        .map(([r]) => r)
        .filter((r) => ROLE_INFO[r].team === 'town' && r !== s.plain);
      const who = powers
        .filter((r) => r !== 'cupid' || t.night === 1)
        .filter((r) => r !== 'witch' && r !== 'hunter' && r !== 'mayor')
        .map((r) => ROLE_INFO[r].name);
      return [
        wolf ? `Night falls on Thiercelieux.` : `Night falls on the city.`,
        'Everyone, shield your screen.',
        wolf ? 'Werewolves, choose your prey.' : 'Mafia, choose your target.',
        who.length ? `${list(who)}, do your work.` : '',
        'Everyone else, name who you suspect.',
      ]
        .filter(Boolean)
        .join(' ');
    }
    case 'witch':
      return 'The Witch wakes, and looks at her potions.';
    case 'day':
      return wolf
        ? 'The village gathers. Who among you is a wolf?'
        : 'The town gathers. Who among you is lying?';
    case 'vote':
      return 'Time to vote.';
    case 'hunter':
      return `${name(t.hunter ?? '')}, the Hunter, takes aim.`;
    default: {
      const h = headline(t, name);
      return `${h.head}. ${h.sub}`;
    }
  }
}

/** Your prompt, in words: the title over the players, and the button. */
export function promptWords(
  p: Prompt,
  mode: Mode,
  name: Name,
): { title: string; hint: string; go: string } {
  const wolf = mode === 'Werewolf';
  const words: Record<Prompt['act'], { title: string; hint: string; go: string }> = {
    kill: {
      title: wolf ? 'Choose your prey' : 'Choose your target',
      hint: wolf
        ? 'The pack must agree. Tap a villager; your packmates see your pick.'
        : 'The family must agree. Tap someone; your partners see your pick.',
      go: 'Kill',
    },
    stab: {
      title: 'Who dies tonight?',
      hint: 'You kill alone. Nobody sees your pick.',
      go: 'Kill',
    },
    save: {
      title: 'Watch over someone',
      hint: 'If they’re attacked tonight, they live. You can pick yourself.',
      go: 'Protect',
    },
    ask: {
      title: 'Who do you ask about?',
      hint: 'You’ll hear whether they’re Mafia.',
      go: 'Ask',
    },
    see: {
      title: 'Whose card do you look at?',
      hint: 'You’ll see who they really are.',
      go: 'Look',
    },
    love: {
      title: 'Choose two lovers',
      hint: 'Tap two players. If one dies, so does the other.',
      go: 'Fire the arrows',
    },
    suspect: {
      title: 'Who do you suspect?',
      hint: 'Nobody sees this. Everyone taps something at night, so the tapping gives nothing away.',
      go: 'Suspect',
    },
    potion: {
      title: 'Your potions',
      hint: 'Save tonight’s victim, poison someone, both or neither.',
      go: 'Done',
    },
    vote: { title: 'Vote someone out', hint: 'Votes show when everyone has voted.', go: 'Vote' },
    shoot: {
      title: 'Take someone with you',
      hint: 'You’re dying. Tap who you shoot.',
      go: 'Shoot',
    },
  };
  const w = words[p.act];
  if (p.act === 'love' && p.pick && !p.second)
    return { ...w, hint: `${name(p.pick)}, and who else?` };
  return w;
}

/** What a night act's pick is called, on the card you picked. */
export const PICK_MARK: Record<NightAct | 'vote' | 'shoot' | 'potion', string> = {
  kill: 'Target',
  stab: 'Target',
  save: 'Protected',
  ask: 'Asked',
  see: 'Seen',
  love: 'Lover',
  suspect: 'Suspect',
  vote: 'Your vote',
  shoot: 'Aim',
  potion: 'Poison',
};

/**
 * Your own moment when the night's dead are found or the vote is counted. From the table, plus
 * your own card (which only you see) to tell a friend from a foe.
 */
export function moment(
  t: MafiaTableView,
  me: MafiaPlayerView | null,
  name: Name,
): { outcome: Outcome; title: string; detail: string } | null {
  const h = headline(t, name);
  if (t.phase !== 'dawn' && t.phase !== 'dusk') return null;
  const gone = t.phase === 'dawn' ? t.dawn : t.lastVote?.out ? [t.lastVote.out] : [];
  if (!me) return { outcome: 'reveal', title: h.head, detail: h.sub };
  if (gone.includes(me.me)) {
    if (t.phase === 'dusk' && me.role === 'jester')
      return {
        outcome: 'win',
        title: 'They fell for it',
        detail: 'The town voted you out. You win.',
      };
    return {
      outcome: 'loss',
      title: t.phase === 'dawn' ? 'You didn’t wake up' : 'You’re out',
      detail: 'Watch the rest in silence. No hints!',
    };
  }
  if (!me.alive_) return { outcome: 'reveal', title: h.head, detail: h.sub };
  if (gone.length === 0) {
    if (t.phase === 'dawn' && me.team === 'pack')
      return {
        outcome: 'loss',
        title: 'They got away',
        detail: 'Your target lived through the night.',
      };
    return { outcome: 'draw', title: h.head, detail: h.sub };
  }
  const foes = gone.filter((id) => {
    const r = me.known[id] ?? roleOf(t, id);
    return r ? ROLE_INFO[r].team !== me.team && me.team !== 'jester' : null;
  });
  const friends = gone.filter((id) => {
    const r = me.known[id] ?? roleOf(t, id);
    return r ? ROLE_INFO[r].team === me.team || id === me.lover : false;
  });
  if (friends.length) return { outcome: 'loss', title: h.head, detail: h.sub };
  if (foes.length) return { outcome: 'win', title: h.head, detail: h.sub };
  return { outcome: 'draw', title: h.head, detail: h.sub };
}
