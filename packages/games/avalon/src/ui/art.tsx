import type { ReactNode } from 'react';
import type { Role } from '../lineup';

/** Avalon's hand-drawn role emblems and seat badges, ported from the app's components/art.js. */

const line = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const EMBLEMS: Record<Role, ReactNode> = {
  merlin: (
    <>
      <path d="M17 50 C24 38 27 22 35 8 C37 16 41 34 47 50 Z" fill="currentColor" opacity="0.18" />
      <path d="M17 50 C24 38 27 22 35 8 C37 16 41 34 47 50" {...line} />
      <ellipse cx="32" cy="51" rx="21" ry="4.5" {...line} />
      <path
        d="M27 34 l1.6 3.4 3.4 1.6 -3.4 1.6 -1.6 3.4 -1.6 -3.4 -3.4 -1.6 3.4 -1.6z"
        fill="var(--brass)"
      />
      <path
        d="M37 23 l1.1 2.4 2.4 1.1 -2.4 1.1 -1.1 2.4 -1.1 -2.4 -2.4 -1.1 2.4 -1.1z"
        fill="var(--brass)"
      />
      <circle cx="50" cy="14" r="1.6" fill="var(--brass)" />
      <circle cx="14" cy="22" r="1.2" fill="var(--brass)" />
    </>
  ),
  percival: (
    <>
      <path
        d="M32 7 L51 13 V29 C51 42 43 51 32 57 C21 51 13 42 13 29 V13 Z"
        fill="currentColor"
        opacity="0.18"
      />
      <path d="M32 7 L51 13 V29 C51 42 43 51 32 57 C21 51 13 42 13 29 V13 Z" {...line} />
      <path d="M32 16 V48 M20 28 H44" {...line} stroke="var(--brass)" strokeWidth="4" />
    </>
  ),
  servant: (
    <>
      <path d="M32 6 L36 12 V40 H28 V12 Z" fill="currentColor" opacity="0.18" />
      <path d="M32 6 L36 12 V40 H28 V12 Z" {...line} />
      <path d="M32 14 V38" {...line} strokeWidth="1.2" opacity="0.6" />
      <path d="M19 41 H45" {...line} stroke="var(--brass)" strokeWidth="4" />
      <path d="M32 43 V51" {...line} strokeWidth="4" />
      <circle cx="32" cy="55" r="3.5" fill="var(--brass)" />
    </>
  ),
  assassin: (
    <>
      <path d="M46 10 L50 14 L27 37 L23 33 Z" fill="currentColor" opacity="0.18" />
      <path d="M46 10 L50 14 L27 37 L23 33 Z" {...line} />
      <path d="M19 30 L30 41" {...line} strokeWidth="4" />
      <path d="M22 40 L15 47" {...line} strokeWidth="4" />
      <circle cx="13" cy="49" r="3" fill="currentColor" />
      <path
        d="M44 42 C44 46 47 48 47 51 A3 3 0 0 1 41 51 C41 48 44 46 44 42 Z"
        fill="var(--evil)"
      />
    </>
  ),
  morgana: (
    <>
      <path d="M40 8 A24 24 0 1 0 40 56 A19 19 0 1 1 40 8 Z" fill="currentColor" opacity="0.18" />
      <path d="M40 8 A24 24 0 1 0 40 56 A19 19 0 1 1 40 8 Z" {...line} />
      <path d="M44 24 l1.4 3 3 1.4 -3 1.4 -1.4 3 -1.4 -3 -3 -1.4 3 -1.4z" fill="var(--evil)" />
      <circle cx="50" cy="40" r="1.6" fill="var(--evil)" />
    </>
  ),
  mordred: (
    <>
      <path
        d="M12 44 L14 18 L23 30 L32 12 L41 30 L50 18 L52 44 Z"
        fill="currentColor"
        opacity="0.18"
      />
      <path d="M12 44 L14 18 L23 30 L32 12 L41 30 L50 18 L52 44 Z" {...line} />
      <path d="M12 50 H52" {...line} strokeWidth="4" />
      <path d="M32 33 l3 4 -3 4 -3 -4z" fill="var(--evil)" />
    </>
  ),
  oberon: (
    <>
      <path
        d="M8 32 C16 20 24 16 32 16 C40 16 48 20 56 32 C48 44 40 48 32 48 C24 48 16 44 8 32 Z"
        fill="currentColor"
        opacity="0.18"
      />
      <path
        d="M8 32 C16 20 24 16 32 16 C40 16 48 20 56 32 C48 44 40 48 32 48 C24 48 16 44 8 32 Z"
        {...line}
      />
      <circle cx="32" cy="32" r="7" fill="var(--evil)" />
      <path d="M12 52 L52 12" {...line} strokeWidth="3" />
    </>
  ),
  minion: (
    <>
      <path
        d="M32 8 C18 8 14 24 14 36 C14 46 10 52 8 56 H56 C54 52 50 46 50 36 C50 24 46 8 32 8 Z"
        fill="currentColor"
        opacity="0.18"
      />
      <path
        d="M32 8 C18 8 14 24 14 36 C14 46 10 52 8 56 H56 C54 52 50 46 50 36 C50 24 46 8 32 8 Z"
        {...line}
      />
      <path d="M22 40 C22 28 26 22 32 22 C38 22 42 28 42 40 Z" fill="var(--bg)" />
      <circle cx="28" cy="33" r="1.8" fill="var(--evil)" />
      <circle cx="36" cy="33" r="1.8" fill="var(--evil)" />
    </>
  ),
};

export function RoleEmblem({ role, size = 96 }: { role: Role; size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      {EMBLEMS[role] ?? EMBLEMS.servant}
    </svg>
  );
}

export function Crown({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M1 4.5l3.5 3L8 2l3.5 5.5L15 4.5l-1.5 8.5h-11z" />
    </svg>
  );
}

export function ShieldMark({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M8 1l6 2v4.5C14 11 11.5 13.6 8 15 4.5 13.6 2 11 2 7.5V3z" />
    </svg>
  );
}

// Avalon's own reaction drawings (components/reactionIcons.js): line art in the text colour with
// a brass accent, rather than the Jackdaw kit's heraldic colours.
const reactLine = { ...line, strokeWidth: 4.5 };
const reactFill = { fill: 'currentColor', opacity: 0.18 };
const reactAccent = 'var(--brass-hi)';
const thumb = (
  <>
    <path
      d="M21 30 L29 12 C31 8 37 9 37 14 V24 H48 C52 24 54 28 53 31 L49 48 C48 51 45 52 42 52 H21 Z"
      {...reactFill}
    />
    <path
      d="M21 30 L29 12 C31 8 37 9 37 14 V24 H48 C52 24 54 28 53 31 L49 48 C48 51 45 52 42 52 H21 Z"
      {...reactLine}
    />
    <path d="M11 30 H21 V52 H11 Z" {...reactLine} stroke={reactAccent} />
  </>
);
const REACTION_ART: Record<string, ReactNode> = {
  up: thumb,
  down: <g transform="matrix(1 0 0 -1 0 64)">{thumb}</g>,
  hmm: (
    <>
      <path d="M22 22 C22 12 42 10 42 22 C42 31 32 31 32 41" {...reactLine} strokeWidth="5" />
      <circle cx="32" cy="52" r="3.6" fill={reactAccent} />
    </>
  ),
  sus: (
    <>
      <circle cx="32" cy="32" r="22" {...reactFill} />
      <circle cx="32" cy="32" r="22" {...reactLine} />
      <path d="M19 29 H28" {...reactLine} strokeWidth="4" />
      <path d="M36 21 L47 17" {...reactLine} strokeWidth="4" />
      <circle cx="41" cy="29" r="3" fill="currentColor" />
      <path d="M24 43 L40 39" {...reactLine} stroke={reactAccent} strokeWidth="4.5" />
    </>
  ),
  wow: (
    <>
      <circle cx="32" cy="32" r="22" {...reactFill} />
      <circle cx="32" cy="32" r="22" {...reactLine} />
      <path d="M20 20 L27 23 M44 20 L37 23" {...reactLine} strokeWidth="4" />
      <circle cx="25" cy="29" r="2.6" fill="currentColor" />
      <circle cx="39" cy="29" r="2.6" fill="currentColor" />
      <circle cx="32" cy="42" r="6" fill={reactAccent} />
    </>
  ),
  haha: (
    <>
      <circle cx="32" cy="32" r="22" {...reactFill} />
      <circle cx="32" cy="32" r="22" {...reactLine} />
      <path d="M20 28 Q24 22 28 28 M36 28 Q40 22 44 28" {...reactLine} strokeWidth="4" />
      <path d="M20 36 H44 C44 45 39 49 32 49 C25 49 20 45 20 36 Z" fill={reactAccent} />
    </>
  ),
};

export function AvalonReactionIcon({ kind }: { kind: string }) {
  const art = REACTION_ART[kind];
  return art ? (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      {art}
    </svg>
  ) : null;
}
