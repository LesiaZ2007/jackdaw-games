import type { Policy, Power, Role } from '../lineup';

/**
 * Secret Hitler's own drawings. Original art, not copied from the published game.
 *
 * The three emblems are filled, bold silhouettes in one colour (currentColor), so they read at
 * 24px and hold up at 200px: a dove in flight with an olive sprig in a round seal for the
 * Liberals, an art-deco skull in an angular badge for the Fascists, and for Hitler the same badge
 * printed solid with the skull and a crown knocked out of it. The power marks keep the house
 * line style (rounded strokes).
 */

const line = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 3.2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/** The dove's body, flying up and to the right, with a fanned tail and an eye (even-odd). */
const DOVE_BODY =
  'M13 46L17 41.5L12 40.5L18 38.5L13.5 35.5L20 36.5C26 34.5 31 33.4 36 33' +
  'C39 30 42.2 28 46 28C48.5 28 50.3 29.3 50.8 31L55.5 32.3L50.6 33.8' +
  'C49 38.5 43 42 35 42.5C28 43 21 44 13 46Z' +
  'M46.4 30.6a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0Z';
/** The near wing, swept up and back, with feathered tips. */
const DOVE_WING =
  'M34.5 33C34 26 31 17.5 25 10.5L19.5 13L22 15.6L15.6 17.4L19.2 20.2L13.2 22.8L18.4 25.2' +
  'L13.8 29L21 30C23.5 32.4 25.5 34.6 27 35.6C29.5 34.4 32 33.5 34.5 33Z';
/** The far wing, peeking up behind. */
const DOVE_FAR =
  'M36.5 31.5C36 25.5 37.5 19.5 41.5 14.5L41.8 18.6L44.6 16.8L44.2 21.2L47 20.4' +
  'C45.2 25 42.8 28.4 39.8 30.8Z';
/** The olive sprig from the beak: a stem and three leaves. */
const SPRIG_STEM = 'M53.6 33.6C54.6 37 54.1 40.6 52.2 44.4';
const SPRIG_LEAVES =
  'M54.1 37C56.7 35 59.3 35.2 60.1 36C58.9 38.4 56.3 39.2 54.1 37Z' +
  'M53.3 40.6C50.7 39.2 48.3 39.8 47.5 40.8C48.9 42.8 51.5 43 53.3 40.6Z' +
  'M52.6 44.2C55 43.2 57.2 44 57.6 45.2C55.6 46.6 53.6 46.2 52.6 44.2Z';

/** The art-deco skull: a domed cranium, stepped cheekbones and jaw, angular eyes and teeth. */
function skull(dy = 0) {
  const y = (v: number) => v + dy;
  return (
    `M32 ${y(13)}C41 ${y(13)} 47 ${y(19)} 47 ${y(28)}L47 ${y(34)}L43 ${y(38)}L43 ${y(44)}` +
    `L39 ${y(48)}L25 ${y(48)}L21 ${y(44)}L21 ${y(38)}L17 ${y(34)}L17 ${y(28)}` +
    `C17 ${y(19)} 23 ${y(13)} 32 ${y(13)}Z` +
    // eyes, nose and three teeth gaps are holes (even-odd)
    `M20.5 ${y(27.5)}L29.5 ${y(26.5)}L29.5 ${y(33)}L23 ${y(34)}Z` +
    `M43.5 ${y(27.5)}L34.5 ${y(26.5)}L34.5 ${y(33)}L41 ${y(34)}Z` +
    `M32 ${y(35)}L34.8 ${y(40.5)}L29.2 ${y(40.5)}Z` +
    `M26.6 ${y(43)}h1.8v5h-1.8zM31.1 ${y(43)}h1.8v5h-1.8zM35.6 ${y(43)}h1.8v5h-1.8z`
  );
}

/** The angular badge: a chamfered top and a shield point. */
const BADGE = 'M14 3H50L57 10V34L32 61L7 34V10Z';
const CROWN = 'M21.5 14L20.5 6.5L26.5 10L32 4.8L37.5 10L43.5 6.5L42.5 14Z';

/** Liberal: a dove in flight with an olive sprig, in a round seal. */
export function LiberalSeal({ size = 48 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" className="sh-emblem">
      <circle cx="32" cy="32" r="29" fill="none" stroke="currentColor" strokeWidth="3.4" />
      <circle cx="32" cy="32" r="24.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
      {/* The dove and sprig, scaled into the seal (they're drawn on a 12–60 by 12–47 box). */}
      <g transform="translate(32 32.5) scale(0.86) translate(-36 -29.5)">
        <path d={DOVE_FAR} fill="currentColor" />
        <path d={DOVE_BODY} fill="currentColor" fillRule="evenodd" />
        <path d={DOVE_WING} fill="currentColor" />
        <path
          d={SPRIG_STEM}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path d={SPRIG_LEAVES} fill="currentColor" />
      </g>
    </svg>
  );
}

/** Fascist: an art-deco skull in an angular badge. Hitler: the badge printed solid, crowned. */
export function FascistBadge({ size = 48, hitler = false }: { size?: number; hitler?: boolean }) {
  if (hitler)
    return (
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" className="sh-emblem">
        <path d={`${BADGE}${CROWN}${skull(3)}`} fill="currentColor" fillRule="evenodd" />
      </svg>
    );
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" className="sh-emblem">
      <path d={BADGE} fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinejoin="round" />
      <path d={skull(1)} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

export function RoleEmblem({ role, size = 48 }: { role: Role; size?: number }) {
  if (role === 'liberal') return <LiberalSeal size={size} />;
  return <FascistBadge size={size} hitler={role === 'hitler'} />;
}

export function PolicyEmblem({ policy, size = 32 }: { policy: Policy; size?: number }) {
  return policy === 'liberal' ? <LiberalSeal size={size} /> : <FascistBadge size={size} />;
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
