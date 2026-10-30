import type { ReactNode } from 'react';
import type { Role } from '../roles';

/**
 * Mafia's printed art: a mark for every role (drawn on 64×64 like the box-lid emblems, in the
 * current ink), the city's skyline and the village under its moon. Original drawings.
 */

const line = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 3.2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const MARKS: Record<Role, ReactNode> = {
  /** A fedora with a dark band. */
  mafia: (
    <g {...line}>
      <path d="M6 42c8 6 44 6 52 0" />
      <path d="M14 41c-1-10 2-22 8-25 4-2 7 2 10 2s6-4 10-2c6 3 9 15 8 25" />
      <path d="M15 34c10 3 24 3 34 0v6c-10 3-24 3-34 0z" fill="currentColor" />
      <path d="M27 18c2 2 8 2 10 0" />
    </g>
  ),
  /** A halo over two spread wings. */
  angel: (
    <g {...line}>
      <ellipse cx="32" cy="14" rx="12" ry="4" />
      <path d="M30 30c-8-6-18-6-24 0 4 2 6 6 6 10 6-6 12-6 18-4z" />
      <path d="M34 30c8-6 18-6 24 0-4 2-6 6-6 10-6-6-12-6-18-4z" />
      <path d="M32 26v28M26 54h12" />
    </g>
  ),
  /** A six-point star badge. */
  sheriff: (
    <g {...line}>
      <path d="M32 6l6 12 13-2-7 11 7 11-13-2-6 12-6-12-13 2 7-11-7-11 13 2z" />
      <circle cx="32" cy="29" r="7" fill="currentColor" />
      <path d="M32 50v8" />
    </g>
  ),
  /** A folded evening paper. */
  civilian: (
    <g {...line}>
      <path d="M10 14h36v36H14a4 4 0 0 1-4-4z" />
      <path d="M46 22h8v24a4 4 0 0 1-8 0" />
      <path d="M16 22h24M16 30h10M16 37h10M16 44h10" />
      <path d="M31 30h9v14h-9z" fill="currentColor" />
    </g>
  ),
  /** A fool's cap with three bells. */
  jester: (
    <g {...line}>
      <path d="M14 46c4-12 2-24-6-30 10 0 18 8 20 18 2-12 8-20 14-24 0 10 0 20 4 24 2-8 8-12 14-12-6 8-8 16-6 24z" />
      <path d="M12 46h42v8H12z" fill="currentColor" />
      <circle cx="8" cy="14" r="3" />
      <circle cx="42" cy="8" r="3" />
      <circle cx="58" cy="22" r="3" />
    </g>
  ),
  /** A tall hat with a sash. */
  mayor: (
    <g {...line}>
      <path d="M8 46c8 5 40 5 48 0" />
      <path d="M18 45V12c6-3 22-3 28 0v33" />
      <path d="M18 36c8 2 20 2 28 0v6c-8 2-20 2-28 0z" fill="currentColor" />
      <path d="M26 54l6-6 6 6" />
    </g>
  ),
  /** A dagger, point down. */
  killer: (
    <g {...line}>
      <path d="M32 6v10M24 16h16" />
      <path d="M28 16v6h8v-6" fill="currentColor" />
      <path d="M28 22l4 34 4-34z" />
      <path d="M32 26v22" />
    </g>
  ),
  /** A wolf's head in profile, howling. */
  wolf: (
    <g {...line}>
      <path d="M14 56c0-10 2-16 6-22l-6-20 12 8c4-2 6-2 8-2l14-12-4 14 8 6-6 4c2 8 0 16-4 24" />
      <path d="M34 22l12-14" />
      <circle cx="31" cy="27" r="2" fill="currentColor" />
      <path d="M44 32c-4 2-8 2-10 0" />
    </g>
  ),
  /** An eye in a crystal ball on its stand. */
  seer: (
    <g {...line}>
      <circle cx="32" cy="28" r="20" />
      <path d="M18 28c8-9 20-9 28 0-8 9-20 9-28 0z" />
      <circle cx="32" cy="28" r="4.5" fill="currentColor" />
      <path d="M20 50l-4 8h32l-4-8" />
    </g>
  ),
  /** A stoppered potion flask. */
  witch: (
    <g {...line}>
      <path d="M26 6h12M28 6v14L14 44a8 8 0 0 0 7 12h22a8 8 0 0 0 7-12L36 20V6" />
      <path d="M18 40h28l4 6a6 6 0 0 1-5 8H19a6 6 0 0 1-5-8z" fill="currentColor" />
      <circle cx="30" cy="30" r="2" />
      <circle cx="36" cy="25" r="1.5" />
    </g>
  ),
  /** A sight's crosshairs. */
  hunter: (
    <g {...line}>
      <circle cx="32" cy="32" r="20" />
      <circle cx="32" cy="32" r="8" />
      <path d="M32 4v14M32 46v14M4 32h14M46 32h14" />
      <circle cx="32" cy="32" r="2.5" fill="currentColor" />
    </g>
  ),
  /** A heart pierced by an arrow. */
  cupid: (
    <g {...line}>
      <path
        d="M32 54C14 42 8 32 8 23a11 11 0 0 1 24-5 11 11 0 0 1 24 5c0 9-6 19-24 31z"
        fill="currentColor"
        fillOpacity="0.18"
      />
      <path d="M6 50L58 12M50 12h8v8M6 50l2-8M6 50l8-2" />
    </g>
  ),
  /** A pitchfork. */
  villager: (
    <g {...line}>
      <path d="M32 26v32" />
      <path d="M20 8v12a6 6 0 0 0 6 6h12a6 6 0 0 0 6-6V8M32 8v18" />
    </g>
  ),
};

export function RoleMark({ role, size = 48 }: { role: Role; size?: number | string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" className="mf-mark">
      {MARKS[role]}
    </svg>
  );
}

/** The city's rooftops, water towers and a few lit windows (lit at night). */
export function Skyline({ className }: { className?: string }) {
  const windows = [
    [22, 70],
    [30, 70],
    [22, 80],
    [72, 58],
    [80, 58],
    [80, 68],
    [126, 76],
    [134, 76],
    [176, 50],
    [184, 50],
    [176, 62],
    [232, 72],
    [240, 82],
    [292, 60],
    [300, 60],
    [300, 72],
    [348, 80],
    [396, 54],
    [404, 66],
    [452, 74],
    [460, 74],
    [512, 62],
    [520, 74],
    [566, 70],
    [574, 80],
  ];
  return (
    <svg
      className={className}
      viewBox="0 0 600 100"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
    >
      <path
        className="mf-sky__town"
        d="M0 100V64h14V52h28v48h6V44h18l8-10 8 10h10v56h10V66h34v34h8V36h12V24h8v12h12v64h10V58h30l6-8 6 8v42h10V48h12V40h22v60h10V64h26v36h12V52l12-8 12 8v48h8V70h30v30h10V42h16V30h6v12h12v58h10V60h28v40h14V54h12l6-12 6 12h8v46h10V64h24v36h10V56h20v44z"
      />
      {/* water towers */}
      <path
        className="mf-sky__town"
        d="M150 24h20l-2-8h-16zM154 24l-3 12M166 24l3 12M444 30h18l-2-7h-14zM448 30l-3 12M458 30l3 12"
      />
      {windows.map(([x, y]) => (
        <rect key={`${x}-${y}`} className="mf-sky__win" x={x} y={y} width="5" height="6" />
      ))}
    </svg>
  );
}

/** Thiercelieux: a treeline, cottages and the church, cut like a woodblock. */
export function Village({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 600 100"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
    >
      <path
        className="mf-sky__trees"
        d="M0 100V70l10-20 8 14 10-26 10 22 8-14 10 20 12-28 12 26 8-12 10 18V100zM470 100V66l10-18 8 12 12-30 12 26 10-16 10 22 12-26 12 22 10-14 14 22 10-10V100z"
      />
      <path
        className="mf-sky__town"
        d="M108 100V74l18-16 18 16v26zM150 100V80l14-12 14 12v20zM196 100V56l-6 2 18-30 18 30-6-2v44zM236 100V76l20-18 20 18v24zM290 100V82l14-12 14 12v18zM330 100V72l18-16 18 16v28zM378 100V80l16-14 16 14v20zM420 100V78l14-12 14 12v22z"
      />
      <path
        className="mf-sky__town"
        d="M207 28v-10M203 22h8"
        stroke="currentColor"
        strokeWidth="2"
      />
      {[
        [122, 82],
        [160, 86],
        [205, 70],
        [250, 82],
        [300, 88],
        [344, 80],
        [390, 86],
        [430, 86],
      ].map(([x, y]) => (
        <rect key={`${x}-${y}`} className="mf-sky__win" x={x} y={y} width="6" height="7" />
      ))}
    </svg>
  );
}

/**
 * The moon, waxing night by night (a sliver on the first, full by the fifth), drawn as a disc
 * with the shadow cut from it.
 */
export function Moon({ night, className }: { night: number; className?: string }) {
  const phase = Math.min(1, Math.max(0.15, night / 5));
  const shift = 40 * phase;
  const id = `mf-moon-${night}`;
  return (
    <svg className={className} viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <mask id={id}>
          <rect width="40" height="40" fill="white" />
          {phase < 1 && <circle cx={20 - shift} cy="17" r="17" fill="black" />}
        </mask>
      </defs>
      <circle className="mf-moon" cx="20" cy="20" r="17" mask={`url(#${id})`} />
    </svg>
  );
}
