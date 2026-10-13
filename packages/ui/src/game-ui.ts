import type { ComponentType } from 'react';
import type { Avatar, GameResult, PlayerScreenProps, TvScreenProps } from '@jackdaw/engine';
import type { GameArt } from './pieces';

/**
 * The client half of a game: how it looks in the catalog, its detail page, and its two screens.
 * Each game package exports one of these from `./ui`; `lib/catalog.ts` registers them.
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

/** What a game's themed waiting room receives from the lobby. */
export interface GameLobbyProps {
  players: ScreenPlayer[];
  me: string | null;
  hostId: string;
  isHost: boolean;
  options: Record<string, unknown>;
  setOptions: (options: Record<string, unknown>) => void;
  /** Why the game can't start yet, or null. */
  blocker: string | null;
  start: () => void;
}
