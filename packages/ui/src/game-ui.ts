import type { ComponentType } from 'react';
import type {
  Avatar,
  GameResult,
  PlayerScreenProps,
  Reaction,
  ReactionKind,
  TvScreenProps,
} from '@jackdaw/engine';
import type { GameArt } from './pieces';

/**
 * The client half of a game: how it looks in the catalog, its detail page, and its two screens.
 * Each game package exports one of these from `./ui`; `lib/catalog.ts` registers them.
 *
 * Two things every game's screens do, so all games feel like one compendium:
 *
 * - **Outcome moments.** Whenever a round, a mission or a vote resolves, each phone shows that
 *   player's own result with the kit's `VerdictMoment` (`celebrate.tsx`): `win`, `loss`, `draw`, or
 *   `reveal` for someone only watching. Key it on something public that moves on when the round
 *   resolves (`useMoment(history.length)`) so a refresh doesn't replay it, and work the outcome
 *   out from the public table view only, never from hidden state. The TV shows the same moment
 *   at `size="tv"` naming the winners. Rows that change colour with a result use `OutcomeChip`,
 *   and running scores use `Tally` so they pop when they go up. The end-of-game results screen
 *   already gives each player their `Verdict`; a game's `Reveal` sits under it.
 * - **Day and dark.** Screens follow the shell's choice via `useTheme()` (`theme.ts`). A game
 *   with its own looks maps day and dark onto them (Avalon: day is its Parchment look, dark its Night).
 */
export interface GameAbout {
  /** A short paragraph: what it's like to play. */
  description: string;
  /** How a round goes, in order. */
  steps: string[];
  /** Credit for the original game, shown at the bottom of its detail page. */
  credit?: string;
  /** Screenshots of the game in play (paths under /public). */
  pictures?: { src: string; alt: string; wide?: boolean }[];
}

/** Players as the screens receive them: the engine's {id, name} plus look and presence. */
export interface ScreenPlayer {
  id: string;
  name: string;
  avatar: Avatar;
  online: boolean;
}

export interface GameUi {
  art: GameArt;
  about: GameAbout;
  // Each game narrows these; the shell only passes what the server sent.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  PlayerScreen: ComponentType<PlayerScreenProps<any, any, any> & { players: ScreenPlayer[] }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TvScreen: ComponentType<TvScreenProps<any> & { players: ScreenPlayer[] }>;
  /** Optional game-specific end-of-game reveal; the shell shows the recap timeline otherwise. */
  Reveal?: ComponentType<{ result: GameResult; players: ScreenPlayer[]; me: string | null }>;
  /**
   * Optional themed waiting room shown in the lobby once this game is chosen (e.g. Avalon's
   * round table). The lobby shows the game's box lid and options when it's absent.
   */
  Lobby?: ComponentType<GameLobbyProps>;
}

/**
 * What a game's themed waiting room receives from the lobby. Every game's lobby keeps Jackdaw's
 * frame (the bar with the code, chat, stats, the TV) and draws its own centre: the players, the
 * options and Start, in the game's own look (Avalon: its round table of shields).
 */
export interface GameLobbyProps {
  /** The lobby code. */
  code: string;
  players: ScreenPlayer[];
  me: string | null;
  hostId: string;
  isHost: boolean;
  options: Record<string, unknown>;
  setOptions: (options: Record<string, unknown>) => void;
  /** Why the game can't start yet, or null. */
  blocker: string | null;
  /** Resolves once the game has started (or Start was refused; the lobby shows why). */
  start: () => Promise<unknown>;
  /**
   * A seat was tapped: your own opens your name and look; the host's tap on someone else opens
   * remove / make host. Only offer it where the lobby would act (own seat, or host).
   */
  onSeat: (playerId: string) => void;
  /** Host only: back to the list of games. */
  changeGame?: () => void;
  /** Reactions from the last few seconds, to pop over the game's own seats. */
  reactions: Reaction[];
  /** Send a reaction (only offered to seated players: `me` is set). */
  react: (kind: ReactionKind) => void;
}
