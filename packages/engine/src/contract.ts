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
  /** Server time in ms. Rules never read the clock themselves (approved by Lesia, 2026-10-13). */
  now: number;
  /** For a linked game: what its `GameLink.start` returned (e.g. the other app's room). */
  linked?: unknown;
}

/** A timer a game wants fired: `onTimer(state, id, now)` runs once server time reaches `at`. */
export interface GameTimer {
  id: string;
  /** Server time in ms. */
  at: number;
}

/**
 * A line the platform posts in chat on a game's behalf, e.g. "Roles are dealt." Write players as
 * `{playerId}`; the platform swaps in their current name.
 */
export type Announcement = string;

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

/**
 * A standout moment for the night's awards ("Best word: QUIXOTIC for 98, by Bran"). Across the
 * night, the highest `value` under each `award` wins it. Public, like the rest of a result.
 */
export interface Highlight {
  /** The award's name, the same in every game of this kind: "Best word", "Biggest pot". */
  award: string;
  playerIds: string[];
  /** What happened, without the names: "QUIXOTIC for 98". */
  text: string;
  /** Bigger is better, to compare across games. */
  value: number;
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
  /** Optional standout moments for the night's awards. */
  highlights?: Highlight[];
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
  /**
   * Returns the next state, or throws GameError if the action is illegal. Must not mutate.
   * `now` is server time in ms, for timed phases.
   */
  applyAction(state: State, playerId: string, action: Action, rng: Rng, now: number): State;
  /** Null while the game is in progress. */
  getResult(state: State): GameResult | null;

  /**
   * Optional, for timed phases. The platform checks `nextTimer` lazily on every read and write
   * (there are no alarms on Vercel) and calls `onTimer` once `now >= at`; screens poll right at
   * `at`, so a timer fires within a moment of it whenever anyone has the game open. A timer's
   * time is public (it's sent to every screen). `onTimer` returning the same state means nothing
   * happened. Must not mutate. Put deadlines a screen should count down in the table view.
   */
  nextTimer?(state: State): GameTimer | null;
  onTimer?(state: State, timerId: string, rng: Rng, now: number): State;

  /**
   * Optional: who the game is waiting on right now (whose turn it is, who still has to vote).
   * Public facts only; the platform uses it to alert those players on their phones.
   */
  waitingOn?(state: State): string[];

  /**
   * Optional chat lines for what just happened (prev is null right after setup). Public facts
   * only: everyone in the lobby reads them.
   */
  announce?(prev: State | null, next: State): Announcement[];

  /** Played in another app through a `GameLink` registered with the runtime (see GameLink). */
  linked?: boolean;
}

/**
 * Linked games (Lesia, 2026-10-13) are played in another app, e.g. the live Avalon app. Jackdaw
 * is their lobby: the module still declares meta, options and views, and sets `linked: true`.
 * The server registers a `GameLink` for it with the room runtime, which does the network calls
 * outside the pure lobby machine:
 *
 * - On Start (and Play again) the runtime calls `start` before the session is created and passes
 *   what it returns to `setup` as `ctx.linked`. If it throws, nothing changes and the host sees
 *   the error.
 * - While the session runs, polls call `check` at most every few seconds. `over` with a result
 *   finishes the game as usual (history, scores, results screen); `abandoned` goes back to the
 *   lobby with nothing scored.
 * - When the Jackdaw host ends the game early, the runtime calls `end` (if given) after saving,
 *   so the other app closes its game too. A failed `end` is logged, not shown.
 *
 * See docs/avalon/LINK.md.
 */
export interface GameLink<State = unknown, Options = unknown> {
  start(ctx: LinkStartContext<Options>): Promise<unknown>;
  check(state: State): Promise<LinkStatus>;
  end?(state: State): Promise<void>;
}

export interface LinkStartContext<Options> {
  lobbyCode: string;
  hostId: string;
  /** Seated players, in seat order. */
  players: { id: string; name: string; avatar: { crest: string; tint: string } }[];
  options: Options;
  /** This lobby's page, for the other app's "Back to Jackdaw" link. */
  returnUrl: string;
  /** The starter's day/dark choice. */
  look: 'light' | 'dark';
}

export type LinkStatus =
  { over: false } | { over: true; result: GameResult } | { over: true; abandoned: true };

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
  /** Resolves true once the move is saved, false if it was refused (the platform shows why). */
  sendAction(action: Action): Promise<boolean>;
  /** Server time in ms, corrected for this device's clock drift. */
  now(): number;
  /** Reactions from the last few seconds, for the game to draw over its own seats. */
  reactions: Reaction[];
}

/** Props for a game's TV screen. It only ever gets the public table view. */
export interface TvScreenProps<TableView> {
  tableView: TableView;
  players: { id: string; name: string }[];
  /** Server time in ms, corrected for this device's clock drift. */
  now(): number;
  reactions: Reaction[];
}

/** A short-lived pop-up over a player's seat (Avalon's six reactions, offered to every game). */
export interface Reaction {
  id: string;
  playerId: string;
  /** One of REACTIONS, in packages/engine/src/protocol.ts. */
  kind: string;
  /** Server time in ms. */
  at: number;
}
