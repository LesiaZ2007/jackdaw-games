import type { ZodType } from 'zod';
import type { Rng } from './rng';

/**
 * The game module contract. Every game implements GameModule so the platform can run it without
 * special cases. Changing this file affects every game: ask Lesia first (see CLAUDE.md).
 */

export type GameCategory = 'social-deduction' | 'card' | 'board' | 'word';

export interface GameMeta {
  /** Stable id used in URLs and storage, e.g. "avalon". */
  id: string;
  name: string;
  /** One line for the catalog card. */
  tagline: string;
  minPlayers: number;
  maxPlayers: number;
  category: GameCategory;
  /** Typical length range in minutes. */
  minutes: [number, number];
  complexity: 1 | 2 | 3;
}

export interface SetupContext<Options> {
  /** Seated players, in seat order. */
  playerIds: string[];
  options: Options;
  /** Seeded and injected so tests are deterministic. */
  rng: Rng;
}

/**
 * One entry in a game's recap timeline. Games append these to their own state as they go, so the
 * recap is built from what happened, never reconstructed afterwards. `secret` holds the hidden
 * truth behind a public event; it is only ever shown once the game is over.
 */
export interface RecapEvent {
  round?: number;
  /** Player id of whoever acted, if anyone. */
  actor?: string;
  /** What everyone could see at the time, e.g. "Ana proposed Ben, Cy and Dee". */
  text: string;
  /** What was hidden at the time, e.g. "Cy played Fail". */
  secret?: string;
  /** Free-form structured data for a game's own recap renderer. */
  data?: unknown;
}

/**
 * How one player finished a game, for lobby stats. `team` and `role` are display labels
 * ("Evil", "Assassin"); leave them out when a game has no teams or roles.
 */
export interface Standing {
  playerId: string;
  outcome: 'win' | 'loss' | 'draw';
  team?: string;
  role?: string;
}

export interface GameResult {
  /** Player ids of the winners. */
  winners: string[];
  /** e.g. "Good wins: Merlin survived". */
  summary: string;
  /** Full state that is safe to show everyone now that the game is over. */
  reveal: unknown;
  /** Ordered timeline of the game, secrets included. */
  recap: RecapEvent[];
  /**
   * Optional per-player outcome, team and role, used for lobby stats. When a game leaves it
   * out, the platform derives win/loss from `winners`.
   */
  standings?: Standing[];
}

export interface GameModule<State, Action, View, TableView, Options> {
  meta: GameMeta;
  optionsSchema: ZodType<Options>;
  /** Zod schema for one action, used to validate untrusted client input before applyAction. */
  actionSchema: ZodType<Action>;
  defaultOptions(playerCount: number): Options;
  /** Error text to show the host, or null if these options work for this many players. */
  validateOptions?(options: Options, playerCount: number): string | null;

  setup(ctx: SetupContext<Options>): State;
  /** Everything this player may see right now. One of only two gates on hidden information. */
  getPlayerView(state: State, playerId: string): View;
  /** Public-only view: the TV and every phone render this. Must contain no secrets at all. */
  getTableView(state: State): TableView;
  /** Returns the next state, or throws GameError if the action is illegal. Must not mutate. */
  applyAction(state: State, playerId: string, action: Action, rng: Rng): State;
  /** Null while the game is in progress. */
  getResult(state: State): GameResult | null;

  /** Optional, for timed phases. How timers are scheduled is decided with the first timed game. */
  onTimer?(state: State, timerId: string): State;
}

/** A module with its type parameters erased, as the platform sees it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGameModule = GameModule<any, any, any, any, any>;

/** Every registered game, by id. */
export type GameRegistry = Readonly<Record<string, AnyGameModule>>;

/** Props for a game's phone screen. The table view is always included, so no TV is needed. */
export interface PlayerScreenProps<View, TableView, Action> {
  view: View;
  tableView: TableView;
  /** This player's id. */
  me: string;
  players: { id: string; name: string }[];
  sendAction(action: Action): void;
}

/** Props for a game's TV screen. It only ever gets the public table view. */
export interface TvScreenProps<TableView> {
  tableView: TableView;
  players: { id: string; name: string }[];
}
