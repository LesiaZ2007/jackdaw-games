import type { ReactNode, SVGProps } from 'react';

/**
 * Player crests: heraldic charges ported unchanged from Avalon (components/crests.js), so a
 * player's crest looks the same in Jackdaw and in Avalon. Lines take the current colour;
 * accents use a pale brass.
 */
const line: SVGProps<SVGPathElement> = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 3.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};
const fill = { fill: 'currentColor', opacity: 0.18 };
const accent = 'var(--crest-accent, #ecd29b)';
const ring = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: 32 + r * Math.sin(a), y: 32 - r * Math.cos(a) };
};

export const CRESTS: Record<string, ReactNode> = {
  helm: (
    <>
      <path d="M18 54 V27 C18 15 24 9 32 9 C40 9 46 15 46 27 V54 Z" {...fill} />
      <path d="M18 54 V27 C18 15 24 9 32 9 C40 9 46 15 46 27 V54 Z" {...line} />
      <path d="M21 30 H43" {...line} stroke={accent} strokeWidth="4" />
      <path d="M32 30 V50" {...line} />
      <circle cx="25" cy="43" r="1.8" fill="currentColor" />
      <circle cx="39" cy="43" r="1.8" fill="currentColor" />
    </>
  ),
  crown: (
    <>
      <path d="M11 46 L13 20 L23 32 L32 13 L41 32 L51 20 L53 46 Z" {...fill} />
      <path d="M11 46 L13 20 L23 32 L32 13 L41 32 L51 20 L53 46 Z" {...line} />
      <path d="M11 53 H53" {...line} />
      <circle cx="13" cy="19" r="3" fill={accent} />
      <circle cx="32" cy="12" r="3" fill={accent} />
      <circle cx="51" cy="19" r="3" fill={accent} />
    </>
  ),
  swords: (
    <>
      <path d="M14 12 L42 40 M50 12 L22 40" {...line} />
      <path d="M38 46 L48 36 M16 36 L26 46" {...line} stroke={accent} strokeWidth="4" />
      <path d="M43 41 L51 49 M21 41 L13 49" {...line} strokeWidth="4.5" />
      <circle cx="53" cy="51" r="2.6" fill={accent} />
      <circle cx="11" cy="51" r="2.6" fill={accent} />
    </>
  ),
  shield: (
    <>
      <path d="M32 8 L50 14 V30 C50 42 42 50 32 56 C22 50 14 42 14 30 V14 Z" {...fill} />
      <path d="M32 8 L50 14 V30 C50 42 42 50 32 56 C22 50 14 42 14 30 V14 Z" {...line} />
      <path d="M19 36 L32 25 L45 36" {...line} stroke={accent} strokeWidth="4.5" />
    </>
  ),
  tower: (
    <>
      <path d="M20 56 V22 H44 V56 Z" {...fill} />
      <path d="M17 22 V11 H23 V16 H29 V11 H35 V16 H41 V11 H47 V22 Z M20 22 V56 H44 V22" {...line} />
      <path d="M27 56 V46 A5 5 0 0 1 37 46 V56" {...line} />
      <rect x="29.5" y="28" width="5" height="8" rx="2.5" fill={accent} />
    </>
  ),
  key: (
    <>
      <circle cx="22" cy="22" r="10" {...fill} />
      <circle cx="22" cy="22" r="10" {...(line as SVGProps<SVGCircleElement>)} />
      <circle cx="22" cy="22" r="3.2" fill={accent} />
      <path d="M29 29 L52 52 M43 43 L48 38 M48 48 L53 43" {...line} />
    </>
  ),
  rose: (
    <>
      {[0, 72, 144, 216, 288].map((deg) => (
        <circle key={deg} cx={ring(deg, 11).x} cy={ring(deg, 11).y} r="9" {...fill} />
      ))}
      {[0, 72, 144, 216, 288].map((deg) => (
        <circle
          key={`l${deg}`}
          cx={ring(deg, 11).x}
          cy={ring(deg, 11).y}
          r="9"
          {...(line as SVGProps<SVGCircleElement>)}
          strokeWidth="3"
        />
      ))}
      <circle cx="32" cy="32" r="6" fill={accent} />
    </>
  ),
  sun: (
    <>
      <circle cx="32" cy="32" r="11" {...fill} />
      <circle cx="32" cy="32" r="11" {...(line as SVGProps<SVGCircleElement>)} />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
        const a = ring(deg, 17);
        const b = ring(deg, 25);
        return (
          <path
            key={deg}
            d={`M${a.x} ${a.y} L${b.x} ${b.y}`}
            {...line}
            stroke={deg % 90 === 0 ? accent : 'currentColor'}
          />
        );
      })}
    </>
  ),
  moon: (
    <>
      <path d="M38 9 A23 23 0 1 0 38 55 A18 18 0 1 1 38 9 Z" {...fill} />
      <path d="M38 9 A23 23 0 1 0 38 55 A18 18 0 1 1 38 9 Z" {...line} />
      <path
        d="M46 22 l1.6 3.4 3.4 1.6 -3.4 1.6 -1.6 3.4 -1.6 -3.4 -3.4 -1.6 3.4 -1.6 z"
        fill={accent}
      />
    </>
  ),
  fleur: (
    <>
      <path d="M32 7 C24 17 24 29 32 40 C40 29 40 17 32 7 Z" {...fill} />
      <path d="M32 7 C24 17 24 29 32 40 C40 29 40 17 32 7 Z" {...line} />
      <path d="M29 37 C21 40 11 35 11 25 C11 19 18 17 22 21 C18 25 20 31 28 33" {...line} />
      <path d="M35 37 C43 40 53 35 53 25 C53 19 46 17 42 21 C46 25 44 31 36 33" {...line} />
      <path d="M21 41 H43" {...line} stroke={accent} strokeWidth="4.5" />
      <path d="M32 44 V55 M27 44 L23 54 M37 44 L41 54" {...line} />
    </>
  ),
  oak: (
    <>
      <path
        d="M32 48 C24 46 20 42 22 38 C16 38 14 32 18 28 C14 24 16 18 22 18 C22 12 28 8 32 8 C36 8 42 12 42 18 C48 18 50 24 46 28 C50 32 48 38 42 38 C44 42 40 46 32 48 Z"
        {...fill}
      />
      <path
        d="M32 48 C24 46 20 42 22 38 C16 38 14 32 18 28 C14 24 16 18 22 18 C22 12 28 8 32 8 C36 8 42 12 42 18 C48 18 50 24 46 28 C50 32 48 38 42 38 C44 42 40 46 32 48 Z"
        {...line}
      />
      <path d="M32 14 V56" {...line} stroke={accent} />
      <path
        d="M32 26 L25 22 M32 26 L39 22 M32 35 L24 32 M32 35 L40 32"
        {...line}
        strokeWidth="2.5"
      />
    </>
  ),
  owl: (
    <>
      <path
        d="M18 52 C13 40 13 23 19 14 L26 20 C30 18 34 18 38 20 L45 14 C51 23 51 40 46 52 Z"
        {...fill}
      />
      <path
        d="M18 52 C13 40 13 23 19 14 L26 20 C30 18 34 18 38 20 L45 14 C51 23 51 40 46 52 Z"
        {...line}
      />
      <circle cx="26" cy="31" r="5.5" {...(line as SVGProps<SVGCircleElement>)} strokeWidth="3" />
      <circle cx="38" cy="31" r="5.5" {...(line as SVGProps<SVGCircleElement>)} strokeWidth="3" />
      <circle cx="26" cy="31" r="2.2" fill={accent} />
      <circle cx="38" cy="31" r="2.2" fill={accent} />
      <path d="M30 38 L32 42 L34 38 Z" fill={accent} />
      <path d="M26 52 V56 M38 52 V56" {...line} />
    </>
  ),
  wolf: (
    <>
      <path d="M15 10 L25 23 H39 L49 10 L48 31 L41 45 L32 55 L23 45 L16 31 Z" {...fill} />
      <path d="M15 10 L25 23 H39 L49 10 L48 31 L41 45 L32 55 L23 45 L16 31 Z" {...line} />
      <path d="M23 32 L28 35 M41 32 L36 35" {...line} stroke={accent} />
      <path d="M32 40 V48" {...line} strokeWidth="2.5" />
      <circle cx="32" cy="49" r="2.6" fill="currentColor" />
    </>
  ),
  fox: (
    <>
      <path d="M9 13 L24 25 H40 L55 13 L51 30 L32 53 L13 30 Z" {...fill} />
      <path d="M9 13 L24 25 H40 L55 13 L51 30 L32 53 L13 30 Z" {...line} />
      <path d="M13 30 L25 35 L32 53 L39 35 L51 30" {...line} strokeWidth="2.5" />
      <circle cx="25" cy="31" r="2.2" fill={accent} />
      <circle cx="39" cy="31" r="2.2" fill={accent} />
      <circle cx="32" cy="50" r="2.4" fill="currentColor" />
    </>
  ),
  stag: (
    <>
      <path d="M25 34 C25 28 39 28 39 34 L37 47 C35 53 29 53 27 47 Z" {...fill} />
      <path d="M25 34 C25 28 39 28 39 34 L37 47 C35 53 29 53 27 47 Z" {...line} />
      <path d="M27 30 C23 22 17 18 10 16 M19 20 L15 9 M23 25 L21 14" {...line} stroke={accent} />
      <path d="M37 30 C41 22 47 18 54 16 M45 20 L49 9 M41 25 L43 14" {...line} stroke={accent} />
      <path d="M25 33 L17 31 M39 33 L47 31" {...line} />
      <circle cx="32" cy="48" r="2.2" fill="currentColor" />
    </>
  ),
  raven: (
    <>
      <path
        d="M11 36 C17 26 29 21 40 23 L54 19 L46 28 C48 34 44 42 36 44 L30 55 L28 44 C20 44 13 40 11 36 Z"
        {...fill}
      />
      <path
        d="M11 36 C17 26 29 21 40 23 L54 19 L46 28 C48 34 44 42 36 44 L30 55 L28 44 C20 44 13 40 11 36 Z"
        {...line}
      />
      <path d="M21 36 C27 32 33 32 40 34" {...line} strokeWidth="2.5" />
      <circle cx="42" cy="26.5" r="2.2" fill={accent} />
    </>
  ),
};

export function Crest({ id, size }: { id: string; size?: number | string }) {
  const art = CRESTS[id];
  if (!art) return null;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" className="jd-crest">
      {art}
    </svg>
  );
}
