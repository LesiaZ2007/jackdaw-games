import type { ReactNode } from 'react';
import type { DevCard, Resource } from '../types';
import { RESOURCE_NAME, TERRAIN_OF } from './palette';

/** Original line art for the resources, development cards and pieces, on a 24-unit grid. */

const RES: Record<Resource, ReactNode> = {
  lumber: (
    <>
      <g stroke="currentColor" strokeWidth="1.6" fill="currentColor" fillOpacity=".25">
        <circle cx="7" cy="16.5" r="4" />
        <circle cx="17" cy="16.5" r="4" />
        <circle cx="12" cy="8.5" r="4" />
      </g>
      <g fill="none" stroke="currentColor" strokeWidth="1">
        <circle cx="7" cy="16.5" r="1.6" />
        <circle cx="17" cy="16.5" r="1.6" />
        <circle cx="12" cy="8.5" r="1.6" />
      </g>
    </>
  ),
  brick: (
    <g fill="currentColor" fillOpacity=".25" stroke="currentColor" strokeWidth="1.6">
      <rect x="2" y="14" width="9.5" height="5.5" />
      <rect x="12.5" y="14" width="9.5" height="5.5" />
      <rect x="7" y="7.5" width="10" height="5.5" />
    </g>
  ),
  wool: (
    <g stroke="currentColor" strokeWidth="1.6" fill="currentColor" fillOpacity=".25">
      <path d="M5 15c-2.5 0-3-3.5-.6-4.2C4.6 8 8 7.4 9.3 9c1-2 4.6-2 5.4 0 2-.8 4 .8 3.4 3 1.6 1.5.4 4-1.7 3.4-.8 1.4-3.4 1.6-4.4.2-1.1 1.2-3.6 1.2-4.4-.3C7 16 5.6 16 5 15z" />
      <ellipse cx="19.6" cy="9.6" rx="2.2" ry="1.8" fillOpacity="1" />
      <path d="M7 16v3.5M10.5 16.5v3M14 16.5v3M16.5 16v3.5" fill="none" />
    </g>
  ),
  grain: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 21V6M12 21L7 7M12 21l5-14" />
      <path d="M12 6l-1.6-2.4M12 6l1.6-2.4M7 7l-2-2M17 7l2-2" strokeWidth="1.3" />
      <path d="M8.3 16h7.4" strokeWidth="2.4" />
      <g fill="currentColor">
        <ellipse cx="12" cy="9" rx="1.3" ry="2" />
        <ellipse cx="8.3" cy="10.5" rx="1.2" ry="1.9" transform="rotate(-20 8.3 10.5)" />
        <ellipse cx="15.7" cy="10.5" rx="1.2" ry="1.9" transform="rotate(20 15.7 10.5)" />
      </g>
    </g>
  ),
  ore: (
    <g
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      fill="currentColor"
      fillOpacity=".25"
    >
      <path d="M3 19l3-8 5-4 6 2 4 10z" />
      <path d="M6 11l5 3 6-5M11 14l-1 5M11 14l6 1 4 4" fill="none" strokeWidth="1.1" />
    </g>
  ),
};

const DEV: Record<DevCard | 'army' | 'longroad' | 'cards', ReactNode> = {
  knight: (
    <path
      fill="currentColor"
      d="M7 21h11v-2.2c0-1-.6-1.6-1.6-2 .8-2.4.4-5.2-1.4-7.4l1.6-3.6-3.6 1.6C10 5.6 7.8 6.6 6.6 9l-2 3.6 1.6 1.4 2.6-1.4 1.2 1.2c-1.6 1.2-2.6 2.4-2.6 4.4z"
    />
  ),
  roadBuilding: (
    <g fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 20l5-16M20 20l-5-16" />
      <path d="M12 5v2M12 10v3M12 16v4" strokeWidth="2.4" />
    </g>
  ),
  yearOfPlenty: (
    <g fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M4 8c4 0 6 2 8 6s4 6 8 6" />
      <path d="M4 8c0 5 2 8 6 9" />
      <circle cx="17" cy="7" r="2.2" fill="currentColor" />
      <circle cx="20" cy="11" r="1.6" fill="currentColor" />
      <circle cx="14" cy="4.6" r="1.5" fill="currentColor" />
    </g>
  ),
  monopoly: (
    <path
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      d="M12 3v18M7 7h10M5 7l-3 7a3.4 3.4 0 0 0 6 0zM19 7l-3 7a3.4 3.4 0 0 0 6 0zM8 21h8"
    />
  ),
  victoryPoint: <path fill="currentColor" d="M3 20h18v-2H3zM5 17h14l-1-6-3 2-3-6-3 6-3-2z" />,
  army: (
    <g>
      <path
        d="M12 2l7 3v6c0 5-3 8.6-7 11-4-2.4-7-6-7-11V5z"
        fill="currentColor"
        fillOpacity=".3"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M8 14l8-8M16 14L8 6" stroke="currentColor" strokeWidth="2" />
    </g>
  ),
  longroad: (
    <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M3 18l4-4 4 3 5-6 5 1" />
      <circle cx="3" cy="18" r="1.8" fill="currentColor" />
      <circle cx="21" cy="12" r="1.8" fill="currentColor" />
    </g>
  ),
  cards: (
    <g fill="currentColor" fillOpacity=".25" stroke="currentColor" strokeWidth="1.6">
      <rect x="4" y="6" width="10" height="14" transform="rotate(-10 9 13)" />
      <rect x="10" y="4" width="10" height="14" />
    </g>
  ),
};

export function ResourceGlyph({ res, className }: { res: Resource; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {RES[res]}
    </svg>
  );
}

/** The raw glyph, to place inside another SVG. */
export const resourceArt = (res: Resource) => RES[res];

export function DevGlyph({ kind, className }: { kind: keyof typeof DEV; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {DEV[kind]}
    </svg>
  );
}

/** A small printed square in the resource's colour with its glyph: costs, offers, gains. */
export function Pip({ res, n }: { res: Resource; n?: number }) {
  return (
    <span className={`cn-pip cn-fill--${TERRAIN_OF[res]}`} title={RESOURCE_NAME[res]}>
      <ResourceGlyph res={res} />
      {n !== undefined && n > 1 && <b className="cn-pip__n">{n}</b>}
      <span className="cn-sr">
        {n ? `${n} ` : ''}
        {RESOURCE_NAME[res]}
      </span>
    </span>
  );
}

/** Settlement and city outlines, centred on 0,0 on a 36-unit tile. */
export const SETTLEMENT = 'M-7,6 V-2 L0,-9 L7,-2 V6 Z';
export const CITY = 'M-11,7 V-3 L-5.5,-10 L0,-3 V-1 H11 V7 Z';

/** A piece in a seat colour, for costs and labels. */
export function PieceGlyph({
  kind,
  colour,
}: {
  kind: 'road' | 'settlement' | 'city' | 'dev';
  colour: string;
}) {
  return (
    <svg viewBox="-12 -12 24 24" className="cn-piece" aria-hidden="true">
      {kind === 'road' && (
        <>
          <line
            x1="-10"
            y1="6"
            x2="10"
            y2="-6"
            className="cn-ink"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <line
            x1="-10"
            y1="6"
            x2="10"
            y2="-6"
            style={{ stroke: colour }}
            strokeWidth="3.6"
            strokeLinecap="round"
          />
        </>
      )}
      {kind === 'settlement' && (
        <path d={SETTLEMENT} style={{ fill: colour }} className="cn-piece__body" />
      )}
      {kind === 'city' && <path d={CITY} style={{ fill: colour }} className="cn-piece__body" />}
      {kind === 'dev' && <rect x="-6" y="-9" width="12" height="18" className="cn-piece__card" />}
    </svg>
  );
}
