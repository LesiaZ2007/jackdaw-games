import type { Policy, Power, Role } from '../lineup';

/**
 * Secret Hitler's own drawings, in the house line style (3 to 3.5px rounded strokes in
 * currentColor). Original art: a dove for the Liberals, a serpent for the Fascists, a crowned
 * serpent for Hitler, and plain marks for the powers. Nothing is copied from the published game.
 */

const line = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 3.2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function Dove({ size = 48 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <g {...line}>
        <path d="M8 34c8-1 14-6 18-13 3 7 9 11 17 11l12-6-4 9c-4 9-13 15-25 14-9-1-15-7-18-15z" />
        <path d="M26 21c-1-6 2-11 7-13 0 6-2 10-7 13zM43 32c-6 4-13 6-20 5" strokeWidth="2.4" />
        <circle cx="49" cy="29" r="1.6" fill="currentColor" stroke="none" />
        <path d="M54 26l6-1" />
      </g>
    </svg>
  );
}

export function Serpent({ size = 48, crown = false }: { size?: number; crown?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <g {...line}>
        <path d="M44 22c6 1 9 6 7 11-3 6-12 6-19 3s-15-3-18 3c-3 5 1 11 8 12 9 1 21-1 27 3" />
        <path d="M44 22c-3-4-9-4-11 0-1 3 2 5 5 5" />
        <path d="M33 22l-5-2M33 23l-4 3" strokeWidth="2.2" />
        <circle cx="40" cy="21" r="1.5" fill="currentColor" stroke="none" />
        {crown && <path d="M30 13l3-7 4 5 4-6 3 6 4-5 2 8z" strokeWidth="2.6" />}
      </g>
    </svg>
  );
}

export function RoleEmblem({ role, size = 48 }: { role: Role; size?: number }) {
  if (role === 'liberal') return <Dove size={size} />;
  return <Serpent size={size} crown={role === 'hitler'} />;
}

export function PolicyEmblem({ policy, size = 32 }: { policy: Policy; size?: number }) {
  return policy === 'liberal' ? <Dove size={size} /> : <Serpent size={size} />;
}

export function PowerIcon({ power, size = 28 }: { power: Power | 'veto' | 'win'; size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <g {...line} strokeWidth={2.4}>
        {power === 'peek' && (
          <>
            <path d="M3 16c4-7 9-10 13-10s9 3 13 10c-4 7-9 10-13 10S7 23 3 16z" />
            <circle cx="16" cy="16" r="4" />
          </>
        )}
        {power === 'investigate' && (
          <>
            <circle cx="13" cy="13" r="8" />
            <path d="M19 19l9 9" />
          </>
        )}
        {power === 'special' && (
          <>
            <path d="M6 13h20v14H6zM11 13V8h10v5" />
            <path d="M12 20l3 3 6-6" />
          </>
        )}
        {power === 'execute' && (
          <>
            <circle cx="16" cy="16" r="10" />
            <path d="M16 3v8M16 21v8M3 16h8M21 16h8" />
          </>
        )}
        {power === 'veto' && (
          <>
            <rect x="5" y="5" width="22" height="22" rx="2" />
            <path d="M10 10l12 12M22 10L10 22" />
          </>
        )}
        {power === 'win' && <path d="M5 24l3-14 6 6 2-10 2 10 6-6 3 14z" />}
      </g>
    </svg>
  );
}

/** Ballot face: blackletter, like the printed game's ballots. */
export const BALLOT = { ja: 'Ja!', nein: 'Nein' };
