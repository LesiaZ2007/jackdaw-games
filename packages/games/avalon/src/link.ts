import {
  GameError,
  type GameLink,
  type GameResult,
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
 * Jackdaw's tint ids in the order of Avalon's AVATAR_TINTS (the same 15 colours), so a tint
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
