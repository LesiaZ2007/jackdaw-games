'use client';

import type { ComponentType, CSSProperties, ReactNode } from 'react';
import { Glyph, Icon } from './icons';
import type { GameArt } from './pieces';
import './cover.css';

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');
const range = ([a, b]: [number, number]) => (a === b ? `${a}` : `${a}–${b}`);

/** A link component the app supplies (Next's Link), so the kit never imports a router. */
export type CoverLink = ComponentType<{
  href: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  'aria-label'?: string;
}>;

export interface GameCoverProps {
  name: string;
  art: GameArt;
  players: [number, number];
  minutes: [number, number];
  tagline?: string;
  /** A short kind label printed on the lid, e.g. "Hidden roles". */
  kind?: string;
  /** Not built yet: a "Coming soon" sash across the corner. */
  soon?: boolean;
  /** Why it can't be played right now, e.g. "Needs 5 to 15 players". Greys the cover. */
  unfit?: string | null;
  selected?: boolean;
  /** Opens a page: rendered as a link (pass `link` for client-side navigation). */
  href?: string;
  link?: CoverLink;
  /** Or acts in place: rendered as a button. */
  onClick?: () => void;
  className?: string;
}

/**
 * A game as a boxed set: the lid printed with the game's heraldic field and emblem, the name on a
 * paper plate, and the box side showing its depth. Used for every list of games.
 */
export function GameCover({
  name,
  art,
  players,
  minutes,
  tagline,
  kind,
  soon,
  unfit,
  selected,
  href,
  link: LinkAs,
  onClick,
  className,
}: GameCoverProps) {
  const classes = cx(
    'jd-cover',
    soon && 'jd-cover--soon',
    unfit && 'jd-cover--unfit',
    selected && 'jd-cover--selected',
    className,
  );
  const style = { '--band': `var(--${art.band})` } as CSSProperties;
  const inner = (
    <>
      <span className={`jd-cover__lid jd-field-${art.field}`}>
        {kind && <span className="jd-cover__kind">{kind}</span>}
        <span className="jd-cover__dev">
          <Glyph id={art.glyph} />
        </span>
        {soon && <span className="jd-cover__sash">Coming soon</span>}
      </span>
      <span className="jd-cover__plate">
        <span className="jd-cover__name">{name}</span>
        {unfit ? (
          <span className="jd-cover__why">{unfit}</span>
        ) : (
          <span className="jd-cover__side">
            <span>
              <Icon.people />
              {range(players)}
            </span>
            <span>
              <Icon.clock />
              {range(minutes)} min
            </span>
          </span>
        )}
        {tagline && <span className="jd-cover__tag">{tagline}</span>}
      </span>
    </>
  );

  if (href) {
    if (LinkAs) {
      return (
        <LinkAs href={href} className={classes} style={style}>
          {inner}
        </LinkAs>
      );
    }
    return (
      <a href={href} className={classes} style={style}>
        {inner}
      </a>
    );
  }
  return (
    <button
      type="button"
      className={classes}
      style={style}
      onClick={onClick}
      disabled={!onClick}
      aria-pressed={onClick ? Boolean(selected) : undefined}
    >
      {inner}
    </button>
  );
}

/** A game's emblem on its field, as a small square tile (compact rows, chips). */
export function GameTile({ art, size = 56 }: { art: GameArt; size?: number }) {
  return (
    <span
      className={`jd-tile jd-field-${art.field}`}
      style={{ '--band': `var(--${art.band})`, '--s': `${size}px` } as CSSProperties}
      aria-hidden="true"
    >
      <Glyph id={art.glyph} />
    </span>
  );
}
