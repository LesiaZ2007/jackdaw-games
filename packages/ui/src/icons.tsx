import type { ReactNode, SVGProps } from 'react';

/**
 * Line icons in the house style (2.2–3.4 rounded strokes in currentColor), the game emblems,
 * and the bird mark.
 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number | string };

function svg(viewBox: string, children: ReactNode, { size, ...rest }: IconProps) {
  return (
    <svg
      viewBox={viewBox}
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

const stroke = (w: number) => ({
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: w,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

/**
 * The Jackdaw mark: "Black bird" by OpenMoji (openmoji.org), line variant, CC BY-SA 4.0.
 * Lines take the current colour, so it is ink by day and cream in dark mode. Pass a heavier
 * `weight` when drawing it small.
 */
export function BirdMark({ weight = 2.2, ...props }: IconProps & { weight?: number }) {
  return svg(
    '7 10 56 56',
    <>
      <g {...stroke(weight)}>
        <path d="M32.625 55.625 L37 54" />
        <path d="m31.625,40.875s8.375-1.875,11.375-11.875" />
        <path d="m41,22s3-9,11-4c0,0,8.25.75,8.625,3.375,0,0-7.625,1.625-9.625,5.625s3,7-5.125,15.625c0,0-3.875,4.375-9.875,4.375l-1,2,2,5,6,1" />
        <path d="m10.125,46.875s24.875-22.875,32.875-21.875,2,13.25-5.5,17.625-27.375,4.25-27.375,4.25Z" />
      </g>
      <circle cx="49.6" cy="20.6" r="1.7" fill="currentColor" />
    </>,
    { className: 'jd-mark', ...props },
  );
}

export const Icon = {
  people: (p: IconProps) =>
    svg(
      '0 0 24 24',
      <g {...stroke(2.2)}>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c.8-4 3.3-6 6.5-6s5.7 2 6.5 6M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.5c1.6.9 2.6 2.7 3 5.5" />
      </g>,
      p,
    ),
  clock: (p: IconProps) =>
    svg(
      '0 0 24 24',
      <g {...stroke(2.2)}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.5 2" />
      </g>,
      p,
    ),
  tv: (p: IconProps) =>
    svg(
      '0 0 24 24',
      <g {...stroke(2.2)}>
        <rect x="3" y="5" width="18" height="12" rx="1" />
        <path d="M8 21h8M12 17v4" />
      </g>,
      p,
    ),
  chat: (p: IconProps) =>
    svg('0 0 24 24', <path d="M4 5h16v11H10l-5 4v-4H4z" {...stroke(2.2)} />, p),
  share: (p: IconProps) =>
    svg(
      '0 0 24 24',
      <g {...stroke(2.2)}>
        <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z" />
        <path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" />
      </g>,
      p,
    ),
  stats: (p: IconProps) =>
    svg(
      '0 0 24 24',
      <g {...stroke(2.2)}>
        <path d="M5 3h11l3 3v15H5z" />
        <path d="M8 9h8M8 13h8M8 17h5" />
      </g>,
      p,
    ),
  back: (p: IconProps) => svg('0 0 24 24', <path d="M15 5l-7 7 7 7" {...stroke(2.4)} />, p),
  close: (p: IconProps) => svg('0 0 24 24', <path d="M6 6l12 12M18 6L6 18" {...stroke(2.4)} />, p),
  down: (p: IconProps) => svg('0 0 24 24', <path d="M6 9l6 6 6-6" {...stroke(2.4)} />, p),
  plus: (p: IconProps) => svg('0 0 24 24', <path d="M12 5v14M5 12h14" {...stroke(2.4)} />, p),
  copy: (p: IconProps) =>
    svg(
      '0 0 24 24',
      <g {...stroke(2.2)}>
        <rect x="8" y="8" width="12" height="12" />
        <path d="M16 8V4H4v12h4" />
      </g>,
      p,
    ),
  edit: (p: IconProps) =>
    svg(
      '0 0 24 24',
      <g {...stroke(2.4)}>
        <path d="M4 20l1-5L15.5 4.5l4 4L9 19z" />
        <path d="M13 7l4 4" />
      </g>,
      p,
    ),
  /** Host badge: a crown */
  host: (p: IconProps) =>
    svg('0 0 32 32', <path d="M6 24L7.5 10l5.5 7 3-9 3 9 5.5-7L26 24z" {...stroke(2.8)} />, p),
  fleuron: (p: IconProps) =>
    svg(
      '0 0 22 22',
      <g {...stroke(1.6)}>
        <path d="M3 19V9c0-3 3-6 6-6h10" />
        <path d="M7 15c0-4 4-8 8-8" />
        <circle cx="11" cy="11" r="1.6" fill="currentColor" />
      </g>,
      p,
    ),
};

/** Game emblems, drawn on 64×64. A game's box lid shows one of these. */
export const GLYPHS: Record<string, ReactNode> = {
  avalon: (
    <g {...stroke(3.4)}>
      <path d="M32 5l3.2 5V38h-6.4V10z" />
      <path d="M22 38h20M32 38v7" />
      <circle cx="32" cy="47.5" r="2.6" />
      <path d="M8 51c4-3 8-3 12 0s8 3 12 0 8-3 12 0 8 3 12 0M14 58c3-2.2 6-2.2 9 0s6 2.2 9 0 6-2.2 9 0 6 2.2 9 0" />
    </g>
  ),
  ballot: (
    <g {...stroke(3.4)}>
      <path d="M10 30h44v26H10zM20 30V10h24v20M26 18h12M26 24h8M24 38h16" />
    </g>
  ),
  grid: (
    <g {...stroke(3.4)}>
      <path d="M8 8h14v14H8zM25 8h14v14H25zM42 8h14v14H42zM8 25h14v14H8zM42 25h14v14H42zM8 42h14v14H8zM25 42h14v14H25zM42 42h14v14H42z" />
      <path d="M25 25h14v14H25z" fill="currentColor" />
    </g>
  ),
  rps: (
    <g {...stroke(3.4)}>
      <circle cx="20" cy="22" r="10" />
      <path d="M38 12h16v20H38z" />
      <path d="M24 40l20 16M24 56l20-16" />
      <circle cx="21" cy="40" r="4" />
      <circle cx="21" cy="56" r="4" />
    </g>
  ),
  cards: (
    <g {...stroke(3.4)}>
      <path d="M12 16l18-6 10 30-18 6z" />
      <path d="M30 12h20v34H30" />
      <path d="M40 22c-4 4-7 6-7 9a3.5 3.5 0 0 0 7 0 3.5 3.5 0 0 0 7 0c0-3-3-5-7-9zM40 34v5" />
      <path d="M8 56h48" />
    </g>
  ),
  tiles: (
    <g {...stroke(3.4)}>
      <path d="M8 18h22v22H8zM34 24h22v22H34z" />
      <path d="M13 34l6-12 6 12M15 30h8M40 30h8l-8 10h8" />
      <circle cx="26" cy="36" r="1.2" fill="currentColor" />
      <path d="M8 50h48" />
    </g>
  ),
  dial: (
    <g {...stroke(3.4)}>
      <path d="M8 46a24 24 0 0 1 48 0" />
      <path d="M32 46l12-16" />
      <circle cx="32" cy="46" r="3" />
    </g>
  ),
  /** Two cards fanned, the front one with a Reverse's arrows (UNO). */
  uno: (
    <g {...stroke(3.4)}>
      <path d="M10 18l16-6 10 28-16 6z" />
      <path d="M30 12h22v34H30z" />
      <path d="M35 27a6 6 0 0 1 10.5-3M47 31a6 6 0 0 1-10.5 3M46 19.5l-.5 4.5-4.4-.9M36 38.5l.5-4.5 4.4.9" />
      <path d="M8 56h48" />
    </g>
  ),
  /** Two war banners crossed (Risk). */
  banners: (
    <g {...stroke(3.4)}>
      <path d="M14 58L46 8M50 58L18 8" />
      <path d="M45 11l14 2-6 5 6 6-21-1M19 11l-14 2 6 5-6 6 21-1" />
      <path d="M8 58h48" />
    </g>
  ),
  /** Three island tiles with a settlement where they meet (Catan). */
  hexes: (
    <g {...stroke(3.4)}>
      <path d="M23.3 14L32 19v10l-8.7 5-8.7-5V19zM40.7 14l8.7 5v10l-8.7 5L32 29V19zM32 29l8.7 5v10L32 49l-8.7-5V34z" />
      <path d="M26 23v-6l6-6 6 6v6z" fill="currentColor" />
      <path d="M8 58h48" />
    </g>
  ),
};

export function Glyph({ id, size }: { id: string; size?: number | string }) {
  const art = GLYPHS[id];
  if (!art) return null;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      {art}
    </svg>
  );
}
