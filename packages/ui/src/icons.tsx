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
      <path d="M26 30V9h15v21M30 14.5l7 7M37 14.5l-7 7" />
      <path d="M10 30h44v26H10zM22 30h20M10 37h44" />
    </g>
  ),
  agent: (
    <>
      <g {...stroke(3.4)}>
        <path d="M18 25c1-9 5-15 10-15 2 0 3 2 4 2s2-2 4-2c5 0 9 6 10 15" />
        <path d="M8 27c7 2.6 15 4 24 4s17-1.4 24-4M14 58l6-14 12 7 12-7 6 14" />
      </g>
      <path
        fill="currentColor"
        d="M18.5 20.5c4 1.4 8.6 2 13.5 2s9.5-.6 13.5-2l.6 3.4c-4.2 1.4-9 2.1-14.1 2.1s-9.9-.7-14.1-2.1zM17 35.5h12.5c0 4-2.4 6-6.2 6S17 39.5 17 35.5zM34.5 35.5H47c0 4-2.4 6-6.2 6s-6.3-2-6.3-6z"
      />
      <path d="M29 36.5h6" {...stroke(2.4)} />
    </>
  ),
  wolf: (
    <>
      <g {...stroke(3.4)}>
        <path d="M32 56l-9-10-9-4-2-15-2-19 12 10h20l12-10-2 19-2 15-9 4z" />
        <path d="M15 15l3 6M49 15l-3 6M27 47l5 4 5-4M14 42l5-1M50 42l-5-1" />
      </g>
      <path
        fill="currentColor"
        d="M18 29l9 3-2 3.5c-3.4-.5-5.8-2.8-7-6.5zM46 29l-9 3 2 3.5c3.4-.5 5.8-2.8 7-6.5z"
      />
    </>
  ),
  spy: (
    <>
      <g {...stroke(3.4)}>
        <path d="M32 58S14 40 14 26a18 18 0 0 1 36 0c0 14-18 32-18 32z" />
        <path d="M26.5 22.5a5.5 5.5 0 1 1 7.5 5.2c-1.3.6-2 1.5-2 3v1.8" />
      </g>
      <circle cx="32" cy="38.6" r="2.2" fill="currentColor" />
    </>
  ),
  rps: (
    <g {...stroke(3.4)}>
      <path d="M8 30l1.5-9.5 7-7L26 12l6 5.5.5 9L27 31z" fill="currentColor" />
      <path d="M37 8h12l7 7v18H37zM49 8v7h7" />
      <circle cx="25" cy="52" r="5" />
      <circle cx="39" cy="52" r="5" />
      <path d="M28.5 48L40 34M35.5 48L24 34" />
    </g>
  ),
  cards: (
    <>
      <g {...stroke(3.4)}>
        <rect x="9" y="12" width="26" height="38" rx="3.5" transform="rotate(-14 22 31)" />
        <rect x="27" y="10" width="26" height="38" rx="3.5" transform="rotate(10 40 29)" />
        <path d="M14 57h36" />
      </g>
      <path
        fill="currentColor"
        transform="rotate(10 40 29)"
        d="M40 17c-5 5.6-9 8.6-9 12.6a4.4 4.4 0 0 0 7.6 3.1L37 39h6l-1.6-6.3a4.4 4.4 0 0 0 7.6-3.1c0-4-4-7-9-12.6z"
      />
    </>
  ),
  tiles: (
    <>
      <g {...stroke(3.4)}>
        <g transform="rotate(-10 21 23)">
          <rect x="8" y="10" width="26" height="26" rx="3.5" />
          <path d="M17 15v15h9" />
        </g>
        <rect x="28" y="22" width="28" height="28" rx="3.5" />
        <path d="M33 44l6.5-16 6.5 16M35.4 38h8.2M6 57h52" />
      </g>
      <path d="M51 41v6" {...stroke(2.4)} />
    </>
  ),
  dial: (
    <g {...stroke(3.4)}>
      <path d="M8 46a24 24 0 0 1 48 0" />
      <path d="M32 46l12-16" />
      <circle cx="32" cy="46" r="3" />
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
