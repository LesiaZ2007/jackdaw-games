import {
  GameError,
  buildStory,
  type GameLink,
  type GameResult,
  type GameStory,
  type StoryFact,
  type StoryHeadline,
  type RecapEvent,
  type RecapStats,
  type LinkStatus,
  type Standing,
} from '@jackdaw/engine';
import { ROLES, type Role } from './lineup';
import type { AvalonOptions, AvalonState } from './rules';

/**
 * The server half of the Avalon link (docs/avalon/LINK.md): opens a room in the live Avalon app
 * with the table seated and the roles dealt, and asks it whether the game is over. Server only:
 * it carries the shared secret. Web-standard `fetch`, no Node APIs.
 */

/** Avalon's crests by id; Jackdaw's crests came from Avalon, so the ids are the same. */
const AVALON_ICONS = [
  'helm',
  'crown',
  'swords',
  'shield',
  'tower',
  'key',
  'rose',
  'sun',
  'moon',
  'fleur',
  'oak',
  'owl',
  'wolf',
  'fox',
  'stag',
  'raven',
];

/**
 * Jackdaw's tint ids in the order of Avalon's AVATAR_TINTS (the same 15 colors), so a tint
 * crosses over as its index. A test checks this against @jackdaw/ui's TINT_CHOICES.
 */
export const AVALON_TINT_ORDER = [
  'slate',
  'plum',
  'moss',
  'umber',
  'teal',
  'mauve',
  'indigo',
  'olive',
  'pewter',
  'rust',
  'ochre',
  'pine',
  'violet',
  'orchid',
  'lagoon',
];

export interface AvalonLinkConfig {
  /** The Avalon app's public base URL, e.g. https://play-avalon.vercel.app */
  baseUrl: string;
  /** JACKDAW_LINK_SECRET, shared with the Avalon app. */
  secret: string;
  fetch?: typeof fetch;
}

interface CreateResponse {
  code: string;
  seats: Record<string, { playerId: string; token: string }>;
}

interface StatusResponse {
  phase?: string;
  over?: boolean;
  endedEarly?: boolean;
  winner?: 'good' | 'evil';
  reason?: string;
  players?: { id: string; side: 'good' | 'evil'; role: string; won: boolean }[];
  /** Newer Avalon builds also send the story: every quest, every team vote, Lady checks, the stab. */
  quests?: { result: 'success' | 'fail' | null; fails: number | null; failsNeeded: number }[];
  proposals?: {
    quest: number;
    leader: string;
    team: string[];
    approve: string[];
    reject: string[];
    approved: boolean;
  }[];
  lady?: { holder: string; target: string; evil: boolean; quest: number }[];
  assassin?: { by: string | null; target: string } | null;
}

const NUMERALS = ['I', 'II', 'III', 'IV', 'V'];
const braced = (ids: string[]) =>
  ids.length < 2
    ? ids.map((id) => `{${id}}`).join('')
    : `${ids
        .slice(0, -1)
        .map((id) => `{${id}}`)
        .join(', ')} and {${ids[ids.length - 1]}}`;

/**
 * Quest by quest, as Avalon's own recap tells it: each team put up and how the table voted, what
 * the quest drew (with the traitors on it as the secret), Lady checks, and the Assassin's pick.
 */
function questStory(status: StatusResponse): RecapEvent[] {
  const evil = new Set((status.players ?? []).filter((p) => p.side === 'evil').map((p) => p.id));
  const goodWon = status.winner === 'good';
  const events: RecapEvent[] = [];
  (status.quests ?? []).forEach((q, i) => {
    const round = i + 1;
    for (const p of (status.proposals ?? []).filter((h) => h.quest === i)) {
      const traitors = p.team.filter((id) => evil.has(id));
      events.push({
        round,
        actor: p.leader,
        text: `{${p.leader}} put up ${braced(p.team)}. Approve: ${braced(p.approve) || 'nobody'}. Reject: ${braced(p.reject) || 'nobody'}.`,
        tag: `${p.approved ? 'Approved' : 'Rejected'} ${p.approve.length}–${p.reject.length}`,
        ...(traitors.length ? { secret: `Evil on this team: ${braced(traitors)}.` } : {}),
      });
    }
    if (q.result) {
      const fail = q.result === 'fail';
      events.push({
        round,
        text: `Quest ${NUMERALS[i] ?? round} ${fail ? 'failed' : 'succeeded'}.`,
        tag: fail ? `Failed, ${q.fails} Fail card${q.fails === 1 ? '' : 's'}` : 'Succeeded',
        tone: fail === goodWon ? 'bad' : 'good',
        key: true,
      });
    }
    for (const l of (status.lady ?? []).filter((c) => c.quest === i)) {
      events.push({
        round,
        actor: l.holder,
        text: `{${l.holder}} used the Lady of the Lake on {${l.target}}.`,
        secret: `{${l.target}} was ${l.evil ? 'Evil' : 'Good'}.`,
      });
    }
  });
  if (status.assassin) {
    const merlin = (status.players ?? []).find((p) => p.role === 'merlin')?.id;
    const hit = status.assassin.target === merlin;
    events.push({
      ...(status.assassin.by ? { actor: status.assassin.by } : {}),
      text: `The Assassin named {${status.assassin.target}} as Merlin.`,
      tag: hit ? 'Merlin found' : 'Missed',
      tone: hit === goodWon ? 'bad' : 'good',
      key: true,
    });
  }
  return events;
}

/** Per player: quests led to a vote, quests gone on, and how often they approved a team. */
function questStats(status: StatusResponse): RecapStats | undefined {
  const proposals = status.proposals ?? [];
  if (!proposals.length) return undefined;
  const players = [...(status.players ?? [])].sort((a, b) => Number(b.won) - Number(a.won));
  const sent = proposals.filter((p) => p.approved);
  return {
    columns: ['Led', 'Quests', 'Approved'],
    rows: players.map((p) => ({
      playerId: p.id,
      values: [
        proposals.filter((h) => h.leader === p.id).length,
        sent.filter((h) => h.team.includes(p.id)).length,
        `${proposals.filter((h) => h.approve.includes(p.id)).length}/${proposals.length}`,
      ],
    })),
  };
}

/**
 * The stats page, from the quest data Avalon sends back: the quest track (Good against Evil),
 * how teams were voted, who led, and the Assassin's guess. Older builds send no quests, and then
 * there is no story.
 */
function avalonStory(status: StatusResponse): GameStory | undefined {
  const quests = (status.quests ?? []).filter((q) => q.result);
  const proposals = status.proposals ?? [];
  if (!quests.length) return undefined;
  const players = status.players ?? [];
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

  // The quest track, quest by quest.
  let good = 0;
  let evil = 0;
  const goodTrack = [0];
  const evilTrack = [0];
  const marks: { x: number; text: string }[] = [];
  quests.forEach((q, i) => {
    if (q.result === 'success') good++;
    else evil++;
    goodTrack.push(good);
    evilTrack.push(evil);
    if (q.result === 'fail' && (q.fails ?? 0) >= 2)
      marks.push({ x: i + 1, text: `${plural(q.fails ?? 0, 'Fail card')}` });
  });

  const headlines: StoryHeadline[] = [
    { label: 'Quests', value: `${good}–${evil}`, detail: 'Good to Evil' },
  ];
  const facts: StoryFact[] = [];
  const bars: GameStory['bars'] = [];

  if (proposals.length) {
    const approvedCount = proposals.filter((p) => p.approved).length;
    const rate = Math.round((approvedCount / proposals.length) * 100);
    headlines.push({
      label: 'Teams approved',
      value: `${rate}%`,
      detail: `${approvedCount} of ${proposals.length}`,
    });
    const rejected = proposals.length - approvedCount;
    if (rejected > 0) headlines.push({ label: 'Teams rejected', value: String(rejected) });

    // Longest run of rejected teams.
    let run = 0;
    let bestRun = 0;
    let runQuest = 0;
    for (const p of proposals) {
      run = p.approved ? 0 : run + 1;
      if (run > bestRun) {
        bestRun = run;
        runQuest = p.quest + 1;
      }
    }
    if (bestRun >= 3)
      facts.push({
        label: 'Gridlock',
        text:
          bestRun >= 5
            ? `Five teams in a row were rejected, ending on quest ${runQuest}.`
            : `${bestRun} teams in a row were rejected on the way to quest ${runQuest}.`,
        tone: 'bad',
      });

    // Who led the most teams.
    const led = players
      .map((p) => ({ id: p.id, n: proposals.filter((h) => h.leader === p.id).length }))
      .sort((a, b) => b.n - a.n);
    if (led.length)
      bars.push({
        title: 'Teams led',
        rows: led.map((l) => ({ playerId: l.id, value: l.n })),
      });
    if (led[0] && led[0].n >= 3 && led[0].n > (led[1]?.n ?? 0))
      facts.push({
        label: 'Kingmaker',
        text: `{${led[0].id}} led ${led[0].n} team proposals, more than anyone.`,
        playerIds: [led[0].id],
      });

    // Teams that went on a quest, per player.
    const sent = proposals.filter((p) => p.approved);
    const onTeams = players
      .map((p) => ({ id: p.id, n: sent.filter((h) => h.team.includes(p.id)).length }))
      .sort((a, b) => b.n - a.n);
    if (onTeams.length)
      bars.push({
        title: 'Quests joined',
        rows: onTeams.map((l) => ({ playerId: l.id, value: l.n })),
      });

    // A team that passed by one vote, or was shot down by one.
    const split = proposals.find(
      (p) =>
        p.approve.length > 0 &&
        p.reject.length > 0 &&
        Math.abs(p.approve.length - p.reject.length) <= 1 &&
        players.length >= 7,
    );
    if (split)
      facts.push({
        label: split.approved ? 'Squeaker' : 'Narrow veto',
        text: `{${split.leader}}'s team for quest ${split.quest + 1} ${split.approved ? 'passed' : 'fell'} by ${split.approve.length}–${split.reject.length}.`,
        playerIds: [split.leader],
      });
    // A team nobody backed.
    const unanimous = proposals.find(
      (p) => !p.approved && p.approve.length === 0 && players.length >= 5,
    );
    if (unanimous)
      facts.push({
        label: 'No takers',
        text: `Nobody voted for {${unanimous.leader}}'s team for quest ${unanimous.quest + 1}.`,
        playerIds: [unanimous.leader],
        tone: 'bad',
      });
  }

  // How the track went.
  if (status.winner === 'good' && evil === 0 && quests.length >= 3)
    facts.unshift({ label: 'Clean sweep', text: 'Good won every quest it sent.', tone: 'good' });
  else if (status.winner === 'evil' && good === 0 && quests.length >= 3)
    facts.unshift({ label: 'Clean sweep', text: 'Evil failed every quest.', tone: 'bad' });
  else {
    const first = quests.slice(0, 2).every((q) => q.result === 'fail');
    const firstGood = quests.slice(0, 2).every((q) => q.result === 'success');
    if (status.winner === 'good' && first && quests.length >= 3)
      facts.unshift({
        label: 'Comeback',
        text: 'Good lost the first two quests and still won.',
        tone: 'good',
      });
    else if (status.winner === 'evil' && firstGood && quests.length >= 3)
      facts.unshift({ label: 'Comeback', text: 'Evil trailed 0–2 and still won.', tone: 'bad' });
  }
  const heavy = [...quests].sort((a, b) => (b.fails ?? 0) - (a.fails ?? 0))[0];
  if (heavy && (heavy.fails ?? 0) >= 2)
    facts.push({
      label: 'Double cross',
      text: `Quest ${quests.indexOf(heavy) + 1} drew ${heavy.fails} Fail cards.`,
    });

  const caught = (status.lady ?? []).find((l) => l.evil);
  if (caught)
    facts.push({
      label: 'Lady knew',
      text: `{${caught.holder}} used the Lady of the Lake on {${caught.target}} and found Evil.`,
      playerIds: [caught.holder, caught.target],
      tone: 'good',
    });

  const a = status.assassin;
  if (a) {
    const merlin = players.find((p) => p.role === 'merlin')?.id;
    const hit = a.target === merlin;
    headlines.push({
      label: 'Assassin',
      value: hit ? 'Hit' : 'Missed',
      detail: `named {${a.target}}`,
      playerId: a.target,
    });
    facts.unshift({
      label: hit ? 'Merlin found' : 'Merlin hid',
      text: hit
        ? `The Assassin${a.by ? ` ({${a.by}})` : ''} named {${a.target}} and found Merlin.`
        : `The Assassin${a.by ? ` ({${a.by}})` : ''} named {${a.target}}, but Merlin was ${merlin ? `{${merlin}}` : 'someone else'}.`,
      playerIds: [a.target, ...(merlin && !hit ? [merlin] : [])],
    });
  }

  return buildStory({
    headlines,
    charts: [
      {
        title: 'Quests won',
        xLabel: 'Quest',
        series: [
          { label: 'Good', points: goodTrack },
          { label: 'Evil', points: evilTrack },
        ],
        ...(marks.length ? { marks } : {}),
      },
    ],
    bars,
    facts,
  });
}

/** The avatar as Avalon stores it: a crest id (or null for initials) and a tint index. */
export function avalonAvatar(avatar: { crest: string; tint: string }) {
  const tint = AVALON_TINT_ORDER.indexOf(avatar.tint);
  return {
    icon: AVALON_ICONS.includes(avatar.crest) ? avatar.crest : null,
    tint: tint >= 0 ? tint : 0,
  };
}

/** Avalon's nested settings from Jackdaw's flattened options, plus the look. */
export function avalonSettings(o: AvalonOptions, look: 'light' | 'dark') {
  return {
    mode: o.mode,
    custom: {
      merlin: o.merlin,
      percival: o.percival,
      morgana: o.morgana,
      mordred: o.mordred,
      oberon: o.oberon,
    },
    lady: o.lady,
    timers: { talk: o.talkTimer, vote: o.voteTimer },
    theme: look === 'dark' ? 'night' : 'parchment',
  };
}

/** How long to wait on Avalon before giving up on a call (Start fails, a check retries later). */
const AVALON_TIMEOUT_MS = 8000;

const roleName = (role: string) => ROLES[role as Role]?.name ?? role;

/** A finished Avalon game as a Jackdaw result: winners, Avalon's reason, teams and roles. */
export function resultFrom(status: StatusResponse): GameResult {
  const players = status.players ?? [];
  const winner = status.winner === 'evil' ? 'Evil' : 'Good';
  const standings: Standing[] = players.map((p) => ({
    playerId: p.id,
    outcome: p.won ? 'win' : 'loss',
    team: p.side === 'evil' ? 'Evil' : 'Good',
    role: roleName(p.role),
  }));
  // Jackdaw's summaries carry no closing stop; the results screen adds its own.
  const reason = status.reason?.trim().replace(/\.+$/, '');
  const summary = reason ? `${winner} wins: ${reason}` : `${winner} wins`;
  const stats = questStats(status);
  const story = avalonStory(status);
  return {
    winners: players.filter((p) => p.won).map((p) => p.id),
    summary,
    reveal: { winner: status.winner ?? null, roles: standings },
    // The quest-by-quest story when Avalon sends it (older builds don't), then how it ended.
    recap: [
      ...questStory(status),
      {
        text: summary,
        tag: `${winner} wins`,
        tone: winner === 'Good' ? 'good' : 'bad',
        key: true,
      },
      ...(players.length
        ? [
            {
              text: 'The sides and roles were revealed.',
              secret: `${players.map((p) => `{${p.id}} was ${roleName(p.role)} (${p.side === 'evil' ? 'Evil' : 'Good'})`).join(', ')}.`,
              key: true,
            },
          ]
        : []),
    ],
    roundName: 'Quest',
    ...(story ? { story } : {}),
    ...(stats ? { stats } : {}),
    standings,
  };
}

/** Is this 404 Avalon's own "that room does not exist or has expired" (a JSON error)? */
async function saysRoomGone(res: Response): Promise<boolean> {
  if (!res.headers.get('content-type')?.includes('application/json')) return false;
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  return typeof body?.error === 'string';
}

export function createAvalonLink(config: AvalonLinkConfig): GameLink<AvalonState, AvalonOptions> {
  const baseUrl = config.baseUrl.replace(/\/$/, '');
  const doFetch = config.fetch ?? fetch;
  const headers = {
    authorization: `Bearer ${config.secret}`,
    'content-type': 'application/json',
  };

  return {
    async start(ctx) {
      let res: Response;
      try {
        res = await doFetch(`${baseUrl}/api/jackdaw/rooms`, {
          method: 'POST',
          headers,
          signal: AbortSignal.timeout(AVALON_TIMEOUT_MS),
          body: JSON.stringify({
            jackdawCode: ctx.lobbyCode,
            returnUrl: ctx.returnUrl,
            hostId: ctx.hostId,
            players: ctx.players.map((p) => ({
              id: p.id,
              name: p.name,
              avatar: avalonAvatar(p.avatar),
            })),
            settings: avalonSettings(ctx.options, ctx.look),
          }),
        });
      } catch {
        throw new GameError('LINK_FAILED', "Couldn't reach Avalon. Try again in a moment.");
      }
      const body = (await res.json().catch(() => ({}))) as Partial<CreateResponse> & {
        error?: string;
      };
      if (!res.ok || !body.code || !body.seats) {
        throw new GameError(
          'LINK_FAILED',
          typeof body.error === 'string' && body.error
            ? body.error
            : "Avalon couldn't open the room. Try again in a moment.",
        );
      }
      const state: AvalonState = { avalonCode: body.code, avalonUrl: baseUrl, seats: body.seats };
      return state;
    },

    async check(state): Promise<LinkStatus> {
      // A timeout throws, and a failed check is logged and tried again on a later poll.
      const res = await doFetch(`${baseUrl}/api/jackdaw/rooms/${state.avalonCode}`, {
        headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(AVALON_TIMEOUT_MS),
      });
      // The room expired or was never there: nothing to record. Avalon says so in JSON
      // ({ error }); any other 404 (an HTML page, a wrong URL or deployment) is a failed check.
      if (res.status === 404) {
        if (await saysRoomGone(res)) return { over: true, abandoned: true };
        throw new Error('Avalon status 404 (not from Avalon)');
      }
      if (!res.ok) throw new Error(`Avalon status ${res.status}`);
      const body = (await res.json()) as StatusResponse;
      if (!body.over) return { over: false };
      if (body.endedEarly || !body.winner) return { over: true, abandoned: true };
      return { over: true, result: resultFrom(body) };
    },

    async end(state) {
      const res = await doFetch(`${baseUrl}/api/jackdaw/rooms/${state.avalonCode}`, {
        method: 'DELETE',
        headers,
        signal: AbortSignal.timeout(AVALON_TIMEOUT_MS),
      });
      if (!res.ok && res.status !== 404) throw new Error(`Avalon end ${res.status}`);
    },
  };
}
