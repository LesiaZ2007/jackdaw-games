'use client';

import type { ReactNode } from 'react';
import type { MapDef, MapId } from '../maps';

/*
 * The engraver's work on each board: a title cartouche, a compass rose, ships and a sea serpent,
 * mountains, forests and castles, and each continent's name lettered in the sea. All of it is
 * drawn in map units under the territories' roundels, and none of it can be tapped.
 */

type Pt = [number, number];

/** A compass rose: eight points, half of each inked, inside a double ring. */
function Compass({ at: [x, y], r }: { at: Pt; r: number }) {
  const points = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    const long = i % 2 === 0 ? r : r * 0.55;
    const w = i % 2 === 0 ? r * 0.16 : r * 0.12;
    const tip: Pt = [x + long * Math.sin(a), y - long * Math.cos(a)];
    const left: Pt = [x + w * Math.sin(a - Math.PI / 2), y - w * Math.cos(a - Math.PI / 2)];
    const right: Pt = [x + w * Math.sin(a + Math.PI / 2), y - w * Math.cos(a + Math.PI / 2)];
    return { tip, left, right, i };
  });
  const f = (p: Pt) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  return (
    <g className="rk-orn">
      <circle cx={x} cy={y} r={r * 0.78} className="rk-orn__ring" />
      <circle cx={x} cy={y} r={r * 0.7} className="rk-orn__ring" />
      {[...points]
        .sort((a, b) => (b.i % 2) - (a.i % 2))
        .map(({ tip, left, right, i }) => (
          <g key={i}>
            <path d={`M${f(tip)}L${f(left)}L${x} ${y}Z`} className="rk-orn__paper" />
            <path d={`M${f(tip)}L${f(right)}L${x} ${y}Z`} className="rk-orn__ink" />
          </g>
        ))}
      <text x={x} y={y - r - r * 0.12} className="rk-orn__letter" fontSize={r * 0.36}>
        N
      </text>
    </g>
  );
}

/** A galleon under sail on a line of waves. */
function Ship({ at: [x, y], s, flip }: { at: Pt; s: number; flip?: boolean }) {
  return (
    <g
      className="rk-orn"
      transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s}) translate(-20 -20)`}
    >
      <path d="M0 22H40L35 30Q20 33 6 30Z" className="rk-orn__paper" />
      <path d="M4 25H36" />
      <path d="M13 22V3M26 22V1M33 22L39 12" />
      <path d="M7 7Q13 10 19 7V18Q13 20 7 18Z" className="rk-orn__paper" />
      <path d="M20 5Q26 8 32 5V19Q26 21 20 19Z" className="rk-orn__paper" />
      <path d="M26 1L32 3L26 5" className="rk-orn__flag" />
      <path d="M-4 34q4-3 8 0t8 0t8 0t8 0t8 0t8 0" />
    </g>
  );
}

/** A sea serpent: a head and three coils breaking the water. */
function Serpent({ at: [x, y], s, flip }: { at: Pt; s: number; flip?: boolean }) {
  return (
    <g
      className="rk-orn"
      transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s}) translate(-35 -14)`}
    >
      <path
        d="M4 20C2 10 6 2 13 1C17 0 20 3 18 6L12 6C10 9 11 14 12 20"
        className="rk-orn__beast"
      />
      <circle cx="13.5" cy="3.4" r="0.9" className="rk-orn__ink" />
      <path d="M22 20C24 8 34 8 36 20" className="rk-orn__beast" />
      <path d="M44 20C46 11 54 11 56 20" className="rk-orn__beast" />
      <path d="M62 20C63 15 68 13 70 9L72 12L68 13" className="rk-orn__beast" />
      <path d="M-2 21q4-3 8 0t8 0t8 0t8 0t8 0t8 0t8 0t8 0t8 0" />
    </g>
  );
}

/** A row of peaks, each shaded down its eastern side. */
function Peaks({ at, s }: { at: Pt[]; s: number }) {
  return (
    <g className="rk-orn rk-orn--land">
      {at.map(([x, y], i) => (
        <g key={i}>
          <path
            d={`M${x - s} ${y}L${x} ${y - 1.5 * s}L${x + s} ${y}`}
            className="rk-orn__paper-open"
          />
          <path
            d={`M${x} ${y - 1.5 * s}L${x + 0.25 * s} ${y - 0.5 * s}M${x + 0.2 * s} ${y - 1.2 * s}L${x + 0.55 * s} ${y - 0.35 * s}`}
          />
        </g>
      ))}
    </g>
  );
}

/** A stand of pines. */
function Trees({ at, s }: { at: Pt[]; s: number }) {
  return (
    <g className="rk-orn rk-orn--land">
      {at.map(([x, y], i) => (
        <g key={i}>
          <path d={`M${x} ${y}v${0.5 * s}`} />
          <path
            d={`M${x} ${y - 1.7 * s}L${x - 0.7 * s} ${y}H${x + 0.7 * s}Z`}
            className="rk-orn__tree"
          />
        </g>
      ))}
    </g>
  );
}

/** A castle: two towers, a keep and a flag. */
function Castle({ at: [x, y], s }: { at: Pt; s: number }) {
  return (
    <g
      className="rk-orn rk-orn--land"
      transform={`translate(${x} ${y}) scale(${s}) translate(-11 -20)`}
    >
      <path
        d="M0 20V6H1.5V4H3V6H4.5V4H6V20ZM6 20V10H8V8.5H10V10H12V8.5H14V10H16V20ZM16 20V6H17.5V4H19V6H20.5V4H22V20Z"
        className="rk-orn__paper"
      />
      <path d="M9 20V16.5A2 2 0 0 1 13 16.5V20" />
      <path d="M11 8.5V1L15 2.5L11 4" className="rk-orn__flag" />
    </g>
  );
}

/** A lighthouse throwing its beam. */
function Lighthouse({ at: [x, y], s }: { at: Pt; s: number }) {
  return (
    <g className="rk-orn rk-orn--land" transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M2.5-16.5L9-20M2.5-16.5L9-13" className="rk-orn__beam" />
      <path d="M-3 0L-2-15H2L3 0Z" className="rk-orn__paper" />
      <path d="M-2.4-10H2.2M-2.7-5H2.6" />
      <path d="M-2.5-15V-18H2.5V-15Z" className="rk-orn__lamp" />
      <path d="M-3-18L0-21L3-18Z" className="rk-orn__ink" />
    </g>
  );
}

/** A wyvern, wings up, coiled tail. */
function Dragon({ at: [x, y], s }: { at: Pt; s: number }) {
  return (
    <g
      className="rk-orn rk-orn--land"
      transform={`translate(${x} ${y}) scale(${s}) translate(-20 -16)`}
    >
      <path d="M14 19L9 2L15 7L19 0L21 9L26 5L24 16" className="rk-orn__wing" />
      <path
        d="M3 24C10 28 18 26 22 19C25 14 30 14 33 10L38 7L36 12L33 13C30 16 27 22 21 26C14 30 6 29 3 24Z"
        className="rk-orn__beast"
      />
      <path d="M3 24C-1 22-1 18 2 17L0 15L4 15.5" />
    </g>
  );
}

/** Reeds and bulrushes. */
function Reeds({ at, s }: { at: Pt[]; s: number }) {
  return (
    <g className="rk-orn rk-orn--land">
      {at.map(([x, y], i) => (
        <g key={i}>
          <path
            d={`M${x} ${y}q${-0.2 * s} ${-0.7 * s} ${-0.6 * s} ${-1.1 * s}M${x + 0.3 * s} ${y}v${-1.4 * s}M${x + 0.6 * s} ${y}q${0.2 * s} ${-0.6 * s} ${0.6 * s} ${-1 * s}`}
          />
          <rect
            x={x + 0.18 * s}
            y={y - 1.75 * s}
            width={0.24 * s}
            height={0.55 * s}
            rx={0.12 * s}
            className="rk-orn__ink"
          />
        </g>
      ))}
    </g>
  );
}

/** The title panel: a double-ruled plate with rolled ends. */
function Cartouche({
  at: [x, y],
  w,
  title,
  sub,
}: {
  at: Pt;
  w: number;
  title: string;
  sub: string;
}) {
  const h = w * 0.34;
  const [l, t] = [x - w / 2, y - h / 2];
  const [r, a, b] = [l + w, t + h * 0.28, t + h * 0.72];
  const tail = h * 0.42;
  return (
    <g className="rk-orn">
      {/* ribbon ends behind the plate, cut to a swallowtail */}
      <path
        d={`M${l + 4} ${a}H${l - tail}L${l - tail * 0.6} ${y}L${l - tail} ${b}H${l + 4}ZM${r - 4} ${a}H${r + tail}L${r + tail * 0.6} ${y}L${r + tail} ${b}H${r - 4}Z`}
        className="rk-orn__paper"
      />
      <rect x={l} y={t} width={w} height={h} className="rk-orn__plate" />
      <rect x={l + 3} y={t + 3} width={w - 6} height={h - 6} />
      <text x={x} y={y + h * 0.04} className="rk-orn__title" fontSize={h * 0.42}>
        {title}
      </text>
      <text x={x} y={y + h * 0.33} className="rk-orn__sub" fontSize={h * 0.14}>
        {sub}
      </text>
    </g>
  );
}

interface Decor {
  /** Where each continent's name is lettered (in the sea where there's room). */
  names: Record<string, Pt>;
  /** Drawn in the sea, under the land. */
  sea: ReactNode;
  /** Drawn on the land, under the roundels. */
  land: ReactNode;
}

const DECOR: Record<MapId, Decor> = {
  world: {
    names: {
      'north-america': [86, 300],
      'south-america': [168, 420],
      europe: [384, 158],
      africa: [436, 418],
      asia: [905, 258],
      australia: [940, 545],
    },
    sea: (
      <>
        <Cartouche at={[118, 535]} w={176} title="The World" sub="Drawn for Jackdaw" />
        <Compass at={[440, 540]} r={40} />
        <Ship at={[96, 352]} s={1.5} />
        <Ship at={[328, 246]} s={1.3} flip />
        <Ship at={[640, 585]} s={1.2} flip />
        <Serpent at={[700, 470]} s={1.6} />
      </>
    ),
    land: (
      <>
        <Peaks
          at={[
            [126, 120],
            [134, 140],
            [143, 160],
            [150, 182],
          ]}
          s={8}
        />
        <Peaks
          at={[
            [258, 400],
            [262, 422],
            [266, 446],
            [270, 470],
          ]}
          s={7}
        />
        <Peaks
          at={[
            [642, 212],
            [658, 207],
            [674, 204],
            [690, 205],
          ]}
          s={8}
        />
        <Peaks
          at={[
            [512, 152],
            [524, 150],
          ]}
          s={6}
        />
        <Trees
          at={[
            [742, 92],
            [752, 96],
            [762, 90],
            [600, 70],
            [610, 66],
          ]}
          s={6}
        />
      </>
    ),
  },
  realm: {
    names: {
      northmarch: [188, 13],
      crownlands: [470, 100],
      wolds: [830, 13],
      saltmarsh: [560, 610],
      fells: [168, 608],
      isles: [836, 606],
    },
    sea: (
      <>
        <Cartouche at={[472, 52]} w={150} title="The Realm" sub="Drawn for Jackdaw" />
        <Compass at={[896, 506]} r={22} />
        <Ship at={[20, 352]} s={0.9} />
        <Ship at={[760, 470]} s={0.8} flip />
        <Serpent at={[334, 486]} s={0.8} />
      </>
    ),
    land: (
      <>
        <Castle at={[525, 150]} s={1.4} />
        <Castle at={[340, 62]} s={1.1} />
        <Dragon at={[905, 128]} s={1.2} />
        <Trees
          at={[
            [588, 136],
            [598, 132],
            [594, 146],
            [672, 194],
            [682, 190],
          ]}
          s={7}
        />
        <Peaks
          at={[
            [158, 452],
            [172, 446],
            [186, 452],
            [262, 456],
            [276, 462],
            [160, 560],
          ]}
          s={9}
        />
        <Reeds
          at={[
            [520, 566],
            [530, 570],
            [600, 496],
            [610, 492],
            [470, 486],
          ]}
          s={9}
        />
        <Lighthouse at={[968, 558]} s={1.15} />
      </>
    ),
  },
  skerries: {
    names: {
      'great-skerry': [600, 172],
      northholm: [104, 300],
      saltreach: [176, 596],
      gannets: [870, 24],
      teeth: [474, 522],
      wyvern: [905, 612],
    },
    sea: (
      <>
        <Cartouche at={[368, 300]} w={140} title="The Skerries" sub="Drawn for Jackdaw" />
        <Compass at={[772, 498]} r={22} />
        <Ship at={[590, 112]} s={0.85} />
        <Ship at={[40, 560]} s={0.8} flip />
        <Serpent at={[380, 452]} s={0.8} />
      </>
    ),
    land: (
      <>
        <Lighthouse at={[612, 256]} s={1} />
        <Castle at={[622, 336]} s={1.1} />
        <Peaks
          at={[
            [58, 206],
            [72, 200],
            [86, 206],
          ]}
          s={8}
        />
        <Trees
          at={[
            [100, 432],
            [110, 428],
            [106, 442],
          ]}
          s={7}
        />
        <Reeds
          at={[
            [96, 508],
            [106, 512],
          ]}
          s={8}
        />
      </>
    ),
  },
  twin: {
    names: {
      westmark: [235, 68],
      eastreach: [622, 70],
      ashfall: [462, 305],
      lowhollow: [230, 568],
      sunmarch: [925, 548],
      stones: [500, 545],
    },
    sea: (
      <>
        <Cartouche at={[520, 55]} w={150} title="Twin Crowns" sub="Drawn for Jackdaw" />
        <Compass at={[52, 572]} r={22} />
        <Ship at={[945, 72]} s={0.85} flip />
        <Ship at={[560, 592]} s={0.8} />
        <Serpent at={[432, 586]} s={0.7} />
      </>
    ),
    land: (
      <>
        <Castle at={[300, 132]} s={1.3} />
        <Castle at={[782, 212]} s={1.3} />
        <Peaks
          at={[
            [110, 330],
            [124, 324],
            [138, 330],
          ]}
          s={8}
        />
        <Trees
          at={[
            [120, 482],
            [130, 478],
            [126, 492],
            [300, 482],
          ]}
          s={7}
        />
        <Reeds
          at={[
            [730, 442],
            [740, 446],
          ]}
          s={8}
        />
      </>
    ),
  },
};

/** The sea's ornaments and the continents' names (under the land). */
export function SeaDecor({ map }: { map: MapDef }) {
  const d = DECOR[map.id];
  return (
    <g className="rk-decor" aria-hidden="true">
      {d.sea}
      {map.continents.map((c) => {
        const at = d.names[c.id];
        if (!at) return null;
        return (
          <text
            key={c.id}
            x={at[0]}
            y={at[1]}
            className="rk-continent-name"
            fontSize={map.id === 'world' ? 14 : 11}
          >
            {c.name.replace(/^The /, '')}
            <tspan className="rk-continent-name__bonus"> +{c.bonus}</tspan>
          </text>
        );
      })}
    </g>
  );
}

/** Mountains, forests and castles (over the land, under the roundels). */
export function LandDecor({ map }: { map: MapDef }) {
  return (
    <g className="rk-decor" aria-hidden="true">
      {DECOR[map.id].land}
    </g>
  );
}
