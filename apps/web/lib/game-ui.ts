import { useGameLook, useTheme, type Theme } from '@jackdaw/ui';
import type { CatalogEntry } from './catalog';

export type { GameAbout, GameUi, ScreenPlayer } from '@jackdaw/ui';

/**
 * The look to start a game in: the game's own look on this device when it has one (Avalon:
 * Parchment unless switched to Night), otherwise Jackdaw's day or dark.
 */
export function useStartLook(entry: CatalogEntry | undefined): Theme {
  const shell = useTheme();
  const own = entry?.ui?.look;
  const picked = useGameLook(entry?.meta.id ?? '', own ?? shell);
  return own ? picked : shell;
}
