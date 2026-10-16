import type { Card } from '../rules';

/** Codenames' own marks, in the house line style (rounded 3–3.5px strokes in currentColor). */
const line = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 3.2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/** An agent: a brimmed hat over a turned-up collar. */
function Agent() {
  return (
    <g {...line}>
      <path d="M14 27h36" />
      <path d="M20 27c0-8 4-13 12-13s12 5 12 13" />
      <path d="M22 22h20" strokeWidth="2.4" />
      <path d="M24 33c2 5 5 7 8 7s6-2 8-7" />
      <path d="M12 56c1-8 6-13 14-14l6 7 6-7c8 1 13 6 14 14" />
      <path d="M26 42l-3 7M38 42l3 7" strokeWidth="2.4" />
    </g>
  );
}

/** A bystander: a plain figure under an umbrella. */
function Bystander() {
  return (
    <g {...line}>
      <path d="M12 26c3-9 11-14 20-14s17 5 20 14c-3-2-6-2-9 0-3-2-7-2-11 0-4-2-8-2-11 0-3-2-6-2-9 0z" />
      <path d="M32 26v20c0 3-2 5-5 5" />
      <circle cx="24" cy="38" r="4" strokeWidth="2.6" />
      <path d="M17 56c1-5 4-8 7-8s6 3 7 8" strokeWidth="2.6" />
    </g>
  );
}

/** The assassin: crosshairs. */
function Assassin() {
  return (
    <g {...line}>
      <circle cx="32" cy="32" r="17" />
      <circle cx="32" cy="32" r="6" strokeWidth="2.6" />
      <path d="M32 7v12M32 45v12M7 32h12M45 32h12" />
    </g>
  );
}

/** The mark stamped on a revealed card (or drawn small on a spymaster's key). */
export function CardMark({ card, size = 40 }: { card: Card; size?: number | string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      {card === 'assassin' ? <Assassin /> : card === 'bystander' ? <Bystander /> : <Agent />}
    </svg>
  );
}

/** A spymaster's magnifying glass, for their slot in the lobby and their badge in play. */
export function Lens({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="M14.5 14.5L20 20" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}
