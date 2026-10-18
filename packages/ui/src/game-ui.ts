import type { ComponentType, ReactNode } from 'react';
import type {
  Avatar,
  GameResult,
  PlayerScreenProps,
  Reaction,
  ReactionKind,
  TvScreenProps,
} from '@jackdaw/engine';
import type { GameArt, Seat } from './pieces';

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
  PlayerScreen: ComponentType<PlayerScreenProps<any, any, any> & ScreenExtras>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TvScreen: ComponentType<TvScreenProps<any> & ScreenExtras>;
  /** Optional game-specific end-of-game reveal; the shell shows the recap timeline otherwise. */
  Reveal?: ComponentType<{ result: GameResult; players: ScreenPlayer[]; me: string | null }>;
  /**
   * Optional: drawn on the TV's results in place of the recap, beside the standings (Letterhoard:
   * the finished board). It fills a size container, so it can fit itself to the space.
   */
  TvReveal?: ComponentType<{ result: GameResult; players: ScreenPlayer[] }>;
  /**
   * Optional: the whole end-of-game screen on phones, in the game's own look, in place of
   * Jackdaw's results (Secret Hitler: secret-hitler.online's victory popup over the board). It
   * gets the host's two choices to offer.
   */
  Results?: ComponentType<GameResultsProps>;
  /**
   * Optional: the seats in Jackdaw's lobby on phones and laptops once this game is chosen, drawn the
   * game's way in place of the seat track (poker: everyone round the card table). It gets the
   * same seats as the track, the game's most players, and the options chosen so far.
   */
  LobbySeats?: ComponentType<LobbySeatsProps>;
  /**
   * Optional themed waiting room shown in the lobby once this game is chosen (e.g. Avalon's
   * round table). The lobby shows the game's box lid and options when it's absent.
   */
  Lobby?: ComponentType<GameLobbyProps>;
  /**
   * Optional: the TV's lobby once this game is chosen, in the game's own look (Avalon: its round
   * table). The platform hands it the join panel (address, code chits, QR) to place, and keeps the
   * night so far below it. Without it the TV shows Jackdaw's lobby with the game's box lid.
   */
  TvLobby?: ComponentType<GameTvLobbyProps>;
  /**
   * The TV screen fills the whole display, with no Jackdaw strip above it (Avalon: its own TV
   * page, which has its own header).
   */
  fullTv?: boolean;
  /**
   * The phone screen is drawn edge to edge (Secret Hitler, as secret-hitler.online draws it): it
   * fills the column under Jackdaw's bar with no padding or width cap. The game draws table talk
   * itself from `chat` (as its own lobby does), and the players' tokens fly between the lobby and
   * the game (`seatTransition`) when it starts and ends.
   */
  fullBleed?: boolean;
  /**
   * The phone screen fits the height under Jackdaw's bar and never scrolls (Letterhoard: the whole
   * board, the rack and the buttons at once). The screen's root should fill its parent (`flex: 1`
   * in a flex column); it is a size container named `game` for container queries.
   */
  fit?: boolean;
}

export interface LobbySeatsProps {
  /** In seat order, as the seat track gets them. */
  seats: Seat[];
  /** The game's most players: how many places to draw. */
  max: number;
  options: Record<string, unknown>;
  /** A seat with an `action` was tapped (your own opens your look; the host's opens remove). */
  onSeat?: (id: string) => void;
  reactions?: Reaction[];
}

/** What the platform adds to the engine's screen props. */
export interface ScreenExtras {
  players: ScreenPlayer[];
  /** Table talk, for a `fullBleed` game to draw in its own style (phones only; never a TV). */
  chat?: LobbyChat;
}

/**
 * What a game's own lobby receives. It fills the screen under Jackdaw's bar (the code, invite and
 * TV, stats, the chat button, the menu) and draws the players, the options, Start and the chat,
 * in the game's own look (Avalon: its round table of shields, and its own Table talk).
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
  /** The lobby's chat, drawn in the game's own style. */
  chat: LobbyChat;
}

/** What a game's own end-of-game screen receives. */
export interface GameResultsProps {
  result: GameResult;
  players: ScreenPlayer[];
  me: string | null;
  hostId: string;
  isHost: boolean;
  /** Host only: deal again with the same table. */
  playAgain: () => void;
  /** Host only: everyone back to the lobby. */
  backToLobby: () => void;
  /** Table talk, drawn in the game's own style. */
  chat?: LobbyChat;
}

/** What a game's TV lobby receives: public facts only (a TV has no seat). */
export interface GameTvLobbyProps {
  code: string;
  players: ScreenPlayer[];
  hostId: string;
  options: Record<string, unknown>;
  reactions: Reaction[];
  /** How to join: the address, the code chits and the QR code, ready to place. */
  join: ReactNode;
  /** "Waiting for Lesia to start", or why the game can't start yet. */
  status: string;
}

/**
 * The lobby's chat for a game's own lobby. Laptops (at least 1240px wide) show it docked beside
 * the game; narrower screens show it as a drawer that the bar's chat button opens.
 */
export interface LobbyChat {
  /** Oldest first, with system lines already worded. */
  lines: ChatLine[];
  /** Resolves true once the message is saved. */
  send: (text: string) => Promise<boolean>;
  /** The drawer is open (narrow screens). */
  open: boolean;
  close: () => void;
}

export interface ChatLine {
  id: string;
  /** A join, leave or game line from the lobby itself. */
  system: boolean;
  text: string;
  playerId?: string;
  name?: string;
  mine?: boolean;
}
