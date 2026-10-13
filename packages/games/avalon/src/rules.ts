import { GameError, type GameModule } from '@jackdaw/engine';
import { z } from 'zod';
import { OPTIONAL_ROLES, TIMER_CHOICES, type LineupSettings } from './lineup';
import { meta } from './meta';

/**
 * Avalon, linked (docs/avalon/LINK.md). Jackdaw is the lobby; the live Avalon app runs the game.
 * The options are Avalon's own settings, flattened so the shell can summarise them. Start opens a
 * room in the Avalon app with everyone seated (`link.ts`), and the state is just that room and
 * each player's seat in it. A seat is a password for that player's place at the table, so it
 * only ever goes to its own player.
 */

const literals = <T extends number>(values: readonly T[]) =>
  z.union(values.map((v) => z.literal(v)) as unknown as [z.ZodLiteral<T>, z.ZodLiteral<T>]);

export const optionsSchema = z.object({
  mode: z.enum(['classic', 'full', 'custom', 'plain']).describe('Roles'),
  merlin: z.boolean().describe('Merlin & Assassin'),
  percival: z.boolean().describe('Percival'),
  morgana: z.boolean().describe('Morgana'),
  mordred: z.boolean().describe('Mordred'),
  oberon: z.boolean().describe('Oberon'),
  lady: z.boolean().describe('Lady of the Lake'),
  talkTimer: literals(TIMER_CHOICES.talk).describe('Talk timer'),
  voteTimer: literals(TIMER_CHOICES.vote).describe('Vote timer'),
});
export type AvalonOptions = z.infer<typeof optionsSchema>;

/** The app's DEFAULT_SETTINGS, flattened. */
export const defaultOptions = (): AvalonOptions => ({
  mode: 'classic',
  merlin: true,
  percival: true,
  morgana: true,
  mordred: false,
  oberon: false,
  lady: false,
  talkTimer: 0,
  voteTimer: 0,
});

export const lineupSettings = (o: AvalonOptions): LineupSettings => ({
  mode: o.mode,
  custom: Object.fromEntries(OPTIONAL_ROLES.map((r) => [r, o[r]])) as LineupSettings['custom'],
});

/** One player's place in the Avalon room: their Avalon id and the token that holds the seat. */
export const AvalonSeat = z.object({
  playerId: z.string().min(1).max(64),
  token: z.string().min(1).max(256),
});
export type AvalonSeat = z.infer<typeof AvalonSeat>;

/** What the link's start returns and `setup` receives as `ctx.linked`. */
export const AvalonRoom = z.object({
  avalonCode: z.string().regex(/^[A-Z]{4}$/),
  /** The Avalon app's public base URL, so phones and the TV know where to go. */
  avalonUrl: z.url(),
  seats: z.record(z.string(), AvalonSeat),
});
export type AvalonState = z.infer<typeof AvalonRoom>;

export interface AvalonTableView {
  avalonCode: string;
  avalonUrl: string;
}

export interface AvalonPlayerView extends AvalonTableView {
  /** Only this player's own seat. */
  seat: AvalonSeat | null;
}

/** There are no moves in Jackdaw: everything is played in the Avalon app. */
export const actionSchema = z.never();

export const avalon: GameModule<
  AvalonState,
  never,
  AvalonPlayerView,
  AvalonTableView,
  AvalonOptions
> = {
  meta,
  linked: true,
  optionsSchema,
  actionSchema,
  defaultOptions,
  // Like the app, never refuse a mix: roles that don't fit are dropped and the lobby says so.
  validateOptions: () => null,
  setup(ctx) {
    const room = AvalonRoom.safeParse(ctx.linked);
    if (!room.success) throw new GameError('LINK_FAILED', "Avalon didn't open the room properly.");
    const missing = ctx.playerIds.filter((id) => !room.data.seats[id]);
    if (missing.length)
      throw new GameError('LINK_FAILED', "Avalon didn't seat everyone. Press Start again.");
    return room.data;
  },
  getPlayerView: (s, playerId) => ({
    avalonCode: s.avalonCode,
    avalonUrl: s.avalonUrl,
    seat: s.seats[playerId] ?? null,
  }),
  getTableView: (s) => ({ avalonCode: s.avalonCode, avalonUrl: s.avalonUrl }),
  applyAction() {
    throw new GameError('NO_MOVES', 'Avalon is played in the Avalon app.');
  },
  // The result comes from the Avalon app through the link, never from this state.
  getResult: () => null,
};

/** Where a player's phone goes: the app's entry page, with the seat in the fragment. */
export const seatUrl = (v: AvalonPlayerView) =>
  v.seat
    ? `${v.avalonUrl}/j/${v.avalonCode}#seat=${encodeURIComponent(v.seat.playerId)}.${encodeURIComponent(v.seat.token)}`
    : `${v.avalonUrl}/tv/${v.avalonCode}`;

/** Where a TV (or someone watching) goes. */
export const tvUrl = (v: AvalonTableView) => `${v.avalonUrl}/tv/${v.avalonCode}`;
