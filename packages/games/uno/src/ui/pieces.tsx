'use client';

import { useId, type CSSProperties, type ReactNode } from 'react';
import { BirdMark } from '@jackdaw/ui';
import { cardName, cardOf, type Colour, type Face } from '../cards';

/** The four quarters of a wild's shield, in the deck's colour order. */
function Quartered({ children }: { children?: ReactNode }) {
  const clip = `uno-shield-${useId().replace(/:/g, '')}`;
  return (
    <svg className="uno-shield" viewBox="0 0 40 46" aria-hidden="true">
      <defs>
        <clipPath id={clip}>
          <path d="M2 2h36v20c0 12-8 19-18 22C10 41 2 34 2 22z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect x="0" y="0" width="20" height="23" fill="var(--uno-r)" />
        <rect x="20" y="0" width="20" height="23" fill="var(--uno-b)" />
        <rect x="0" y="23" width="20" height="23" fill="var(--uno-g)" />
        <rect x="20" y="23" width="20" height="23" fill="var(--uno-y)" />
      </g>
      <path
        d="M2 2h36v20c0 12-8 19-18 22C10 41 2 34 2 22z"
        fill="none"
        stroke="var(--uno-stock)"
        strokeWidth="2.4"
      />
      {children}
    </svg>
  );
}

/** Skip: a ring struck through. Reverse: two arrows chasing round. */
function Mark({ face }: { face: Face }) {
  if (face === 'skip') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" strokeWidth="2.8" />
        <path d="M6.3 17.7L17.7 6.3" stroke="currentColor" strokeWidth="2.8" />
      </svg>
    );
  }
  if (face === 'rev') {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
      >
        <path d="M5 10a7 7 0 0 1 12.2-3.6" strokeLinecap="round" />
        <path d="M19 14a7 7 0 0 1-12.2 3.6" strokeLinecap="round" />
        <path d="M18.6 2.6l-.6 4.8-4.6-1.2" fill="none" strokeLinejoin="round" />
        <path d="M5.4 21.4l.6-4.8 4.6 1.2" fill="none" strokeLinejoin="round" />
      </svg>
    );
  }
  return null;
}

/** What's printed in the corners and the middle. */
function Index({ face }: { face: Face }) {
  if (face === 'skip' || face === 'rev') return <Mark face={face} />;
  if (face === 'draw2') return <>+2</>;
  if (face === 'wild4') return <>+4</>;
  if (face === 'wild') return <>W</>;
  return <span className={face === '6' || face === '9' ? 'uno-under' : undefined}>{face}</span>;
}

/**
 * A printed card: cream stock with a field in its colour (gules, or, vert, azure) inside a cream
 * double rule, the number or mark large in the middle and small in the corners. Wilds are sable
 * with a quartered shield. Face down it shows the sable back with the jackdaw. `w` is its width.
 */
export function GameCard({
  id,
  w,
  down = false,
  /** Called colour, shown on a wild that's been played. */
  called,
  can,
  dim,
  className,
  style,
  onClick,
  label,
}: {
  id?: number;
  w?: string;
  down?: boolean;
  called?: Colour | null;
  can?: boolean;
  dim?: boolean;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  label?: string;
}) {
  const vars = { ...(w ? { '--w': w } : {}), ...style } as CSSProperties;
  if (down || id === undefined) {
    return (
      <span
        className={['uno-card uno-card--back', className].filter(Boolean).join(' ')}
        style={vars}
        role="img"
        aria-label={label ?? 'A face-down card'}
      >
        <span className="uno-card__field">
          <BirdMark className="uno-card__bird" />
        </span>
      </span>
    );
  }
  const c = cardOf(id);
  const wild = c.colour === null;
  const classes = [
    'uno-card',
    `uno-card--${c.colour ?? 'w'}`,
    wild && called && `uno-card--called-${called}`,
    can && 'uno-card--can',
    dim && 'uno-card--dim',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const inner = (
    <>
      <span className="uno-card__field">
        <span className="uno-card__corner" aria-hidden="true">
          <Index face={c.face} />
        </span>
        <span className="uno-card__big" aria-hidden="true">
          {wild ? (
            <Quartered>
              {c.face === 'wild4' && (
                <text x="20" y="29" textAnchor="middle" className="uno-shield__n">
                  +4
                </text>
              )}
            </Quartered>
          ) : (
            <Index face={c.face} />
          )}
        </span>
        <span className="uno-card__corner uno-card__corner--end" aria-hidden="true">
          <Index face={c.face} />
        </span>
      </span>
    </>
  );
  const name = label ?? cardName(id);
  if (onClick) {
    return (
      <button type="button" className={classes} style={vars} onClick={onClick} aria-label={name}>
        {inner}
      </button>
    );
  }
  return (
    <span className={classes} style={vars} role="img" aria-label={name}>
      {inner}
    </span>
  );
}

/** A small round swatch in a colour, for the colour picker and the colour in play. */
export function Swatch({ colour }: { colour: Colour }) {
  return <span className={`uno-swatch uno-swatch--${colour}`} aria-hidden="true" />;
}
