import {
  GameError,
  type GameLink,
  type GameResult,
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
  return {
    winners: players.filter((p) => p.won).map((p) => p.id),
    summary,
    reveal: { winner: status.winner ?? null, roles: standings },
    // Avalon keeps the quest-by-quest story in its own app; here, the sides and how it ended.
    recap: [
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
