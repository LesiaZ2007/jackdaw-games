'use client';

import type { ReactNode } from 'react';

/*
 * The board's drawings: flat spot colours with an ink outline, like a printed board. They're
 * drawn on a 48 box and take their size from the space they sit in.
 */

const Pic = ({ children, label }: { children: ReactNode; label?: string }) => (
  <svg
    viewBox="0 0 48 48"
    className="mnp-art"
    role={label ? 'img' : undefined}
    aria-label={label}
    aria-hidden={label ? undefined : true}
    stroke="var(--mnp-ink)"
    strokeWidth="2"
    strokeLinejoin="round"
    strokeLinecap="round"
  >
    {children}
  </svg>
);

export const ArtChest = () => (
  <Pic>
    <path d="M7 22h34v18H7z" fill="var(--mnp-wood)" />
    <path d="M7 22c0-8 7-12 17-12s17 4 17 12z" fill="var(--mnp-wood-2)" />
    <path d="M7 27h34M13 12v28M35 12v28" stroke="var(--mnp-ink)" fill="none" />
    <path d="M12 11.6v28.4h2V11.4zM34 11.4V40h2V11.6z" fill="var(--mnp-gold)" stroke="none" />
    <path d="M7 26h34v2.5H7z" fill="var(--mnp-gold)" stroke="none" />
    <path d="M21 24h6v8h-6z" fill="var(--mnp-gold-2)" />
    <circle cx="24" cy="28" r="1.2" fill="var(--mnp-ink)" stroke="none" />
  </Pic>
);

export const ArtTrain = () => (
  <Pic>
    <path d="M6 33h30V21H22v-7h-8v7H6z" fill="var(--mnp-iron)" />
    <path d="M36 33h5l-3-8h-2z" fill="var(--mnp-iron)" />
    <path d="M26 14h6v7h-6z" fill="var(--mnp-red)" />
    <path d="M27 9h4l1 5h-6z" fill="var(--mnp-iron)" />
    <path d="M16 16h4v4h-4z" fill="var(--mnp-lamp)" />
    <circle cx="13" cy="36" r="5" fill="var(--mnp-red)" />
    <circle cx="27" cy="36" r="5" fill="var(--mnp-red)" />
    <circle cx="13" cy="36" r="1.5" fill="var(--mnp-ink)" stroke="none" />
    <circle cx="27" cy="36" r="1.5" fill="var(--mnp-ink)" stroke="none" />
    <path d="M4 42h40" />
    <path d="M30 6c2-2 6-2 8 0" fill="none" stroke="var(--mnp-steam)" />
  </Pic>
);

export const ArtBulb = () => (
  <Pic>
    <path
      d="M24 5a13 13 0 0 0-8 23c2 2 3 4 3 7h10c0-3 1-5 3-7a13 13 0 0 0-8-23z"
      fill="var(--mnp-bulb)"
    />
    <path d="M19 35h10v4H19zM20 39h8v4h-8z" fill="var(--mnp-steel)" />
    <path d="M20 22c2 2 6 2 8 0M24 24v9" fill="none" />
    <path d="M6 14l4 2M42 14l-4 2M24 1v2M9 30l3-2M39 30l-3-2" stroke="var(--mnp-brass)" />
  </Pic>
);

export const ArtTap = () => (
  <Pic>
    <path d="M6 16h18a8 8 0 0 1 8 8v4h-7v-3a2 2 0 0 0-2-2H6z" fill="var(--mnp-steel)" />
    <path d="M13 10h6v6h-6z" fill="var(--mnp-steel-2)" />
    <path d="M10 8h12" stroke="var(--mnp-ink)" strokeWidth="3" />
    <path d="M28.5 33c-3 4-4 6-4 8a4 4 0 0 0 8 0c0-2-1-4-4-8z" fill="var(--mnp-water)" />
    <path d="M4 14v12" strokeWidth="3" />
  </Pic>
);

export const ArtBag = () => (
  <Pic>
    <path d="M17 13c-2-3-1-6 2-6h10c3 0 4 3 2 6z" fill="var(--mnp-bag-2)" />
    <path
      d="M17 13h14c8 6 11 14 9 21-1 5-6 8-16 8S9 39 8 34c-2-7 1-15 9-21z"
      fill="var(--mnp-bag)"
    />
    <path d="M17 13h14" />
    <text
      x="24"
      y="35"
      textAnchor="middle"
      fontSize="17"
      fontWeight="800"
      fill="var(--mnp-cream)"
      stroke="none"
      fontFamily="var(--font-plaque)"
    >
      $
    </text>
  </Pic>
);

export const ArtRing = () => (
  <Pic>
    <circle cx="24" cy="31" r="11" fill="none" stroke="var(--mnp-brass)" strokeWidth="5" />
    <circle cx="24" cy="31" r="11" fill="none" strokeWidth="1.2" />
    <path d="M17 13l7-7 7 7-7 9z" fill="var(--mnp-gem)" />
    <path d="M17 13h14M24 6l-3 7 3 9 3-9z" fill="none" strokeWidth="1.2" />
  </Pic>
);

export const ArtCar = () => (
  <Pic>
    <path d="M5 32v-6l5-2 5-8h15l7 8 6 2v6z" fill="var(--mnp-car)" />
    <path d="M17 18h6v6h-9zM26 18h3l5 6h-8z" fill="var(--mnp-glass)" />
    <circle cx="14" cy="33" r="5" fill="var(--mnp-iron)" />
    <circle cx="35" cy="33" r="5" fill="var(--mnp-iron)" />
    <circle cx="14" cy="33" r="1.8" fill="var(--mnp-hub)" stroke="none" />
    <circle cx="35" cy="33" r="1.8" fill="var(--mnp-hub)" stroke="none" />
    <path d="M42 26h2" stroke="var(--mnp-lamp)" strokeWidth="3" />
  </Pic>
);

export const ArtCop = () => (
  <Pic>
    <path d="M12 22c0-10 5-15 12-15s12 5 12 15z" fill="var(--mnp-cop)" />
    <path d="M8 22h32v4H8z" fill="var(--mnp-cop-2)" />
    <path d="M24 10l2 3h3l-2 3 1 3-4-2-4 2 1-3-2-3h3z" fill="var(--mnp-badge)" />
    <path d="M14 26c0 8 4 13 10 13s10-5 10-13z" fill="var(--mnp-skin)" />
    <path d="M20 31h.01M28 31h.01" strokeWidth="3" />
    <path d="M21 35c2 1 4 1 6 0" fill="none" />
    <path d="M36 32l7-4" stroke="var(--mnp-red)" strokeWidth="3" />
  </Pic>
);

export const ArtBars = () => (
  <Pic>
    <path d="M6 6h36v36H6z" fill="var(--mnp-cell)" />
    <path d="M14 6v36M21 6v36M28 6v36M35 6v36" strokeWidth="2.6" />
    <path d="M6 6h36v36H6z" fill="none" strokeWidth="3" />
  </Pic>
);

export const ArtArrow = () => (
  <Pic>
    <path d="M44 20H18v-9L3 24l15 13v-9h26z" fill="var(--mnp-car)" />
  </Pic>
);

/** A little green house: walls, a pitched roof, a door. */
export const ArtHouse = () => (
  <svg
    viewBox="0 0 24 24"
    className="mnp-art mnp-art--house"
    aria-hidden="true"
    stroke="var(--mnp-ink)"
    strokeWidth="1.6"
    strokeLinejoin="round"
  >
    <path d="M4 11h16v11H4z" fill="var(--mnp-house)" />
    <path d="M2 12 12 3l10 9z" fill="var(--mnp-house-roof)" />
    <path d="M10 15h4v7h-4z" fill="var(--mnp-cream)" />
  </svg>
);

/** A red hotel: wider, a flat-topped roof, rows of windows. */
export const ArtHotel = () => (
  <svg
    viewBox="0 0 40 24"
    className="mnp-art mnp-art--hotel"
    aria-hidden="true"
    stroke="var(--mnp-ink)"
    strokeWidth="1.6"
    strokeLinejoin="round"
  >
    <path d="M3 9h34v14H3z" fill="var(--mnp-hotel)" />
    <path d="M1 10 8 2h24l7 8z" fill="var(--mnp-hotel-roof)" />
    <path
      d="M7 12h4v3H7zM14 12h4v3h-4zM22 12h4v3h-4zM29 12h4v3h-4z"
      fill="var(--mnp-lamp)"
      strokeWidth="1"
    />
    <path d="M17 17h6v6h-6z" fill="var(--mnp-cream)" />
  </svg>
);

/** Two arrows passing each other: a trade. */
export const ArtSwap = () => (
  <Pic>
    <path d="M6 16h28v-6l10 10-10 10v-6H6z" fill="var(--mnp-green)" />
    <path d="M42 32H14v-6L4 36l10 10v-6h28z" fill="var(--mnp-orange)" transform="translate(0 -6)" />
  </Pic>
);

/** A bank front: columns under a pediment. */
export const ArtBank = () => (
  <Pic>
    <path d="M4 18 24 6l20 12z" fill="var(--mnp-steel)" />
    <path d="M8 20h6v16H8zM21 20h6v16h-6zM34 20h6v16h-6z" fill="var(--mnp-cream)" />
    <path d="M4 36h40v6H4z" fill="var(--mnp-steel-2)" />
  </Pic>
);

/** The three Chance spaces each print the question mark in their own colour, as on the board. */
export function ChanceMark({ space }: { space: number }) {
  const tone = space === 7 ? 'pink' : space === 22 ? 'navy' : 'orange';
  return <span className={`mnp-q mnp-q--${tone}`}>?</span>;
}

/** A deck face down: a few cards stacked, its colour, its emblem. */
export function Pile({ deck, count = 3 }: { deck: 'chance' | 'chest'; count?: number }) {
  return (
    <span
      className={`mnp-pile mnp-pile--${deck}`}
      aria-label={deck === 'chance' ? 'Chance' : 'Community Chest'}
    >
      {Array.from({ length: count }, (_, k) => (
        <span key={k} className="mnp-pile__card" style={{ translate: `${k * 3}% ${-k * 3}%` }} />
      ))}
      <span className="mnp-pile__face">
        <span className="mnp-pile__art">
          {deck === 'chance' ? <span className="mnp-q mnp-q--cream">?</span> : <ArtChest />}
        </span>
        <span className="mnp-pile__name">{deck === 'chance' ? 'Chance' : 'Community Chest'}</span>
      </span>
    </span>
  );
}
