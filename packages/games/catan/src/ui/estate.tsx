'use client';

import { Sheet } from '@jackdaw/ui';
import type { CSSProperties, ReactNode } from 'react';
import { piecesLeft } from '../build';
import { TRACKS, TRACK_GOOD, TRACK_NAME, type Track } from '../ck';
import type { CatanTableView, CatanView } from '../rules';
import { ISLAND_BONUS } from '../sea';
import { CITY, DevGlyph, PieceGlyph } from './glyphs';
import './estate.css';

/* Everything about your own position, always on screen (2026-11-09: "victory pt dashboard",
   "I should be able to see everything I need at any time", "I can't see where the barbarian
   ship is"): your points and where they come from, and with Cities & Knights your three tracks,
   your progress cards by colour, your knights and the barbarian ship's voyage. */

interface PointRow {
  key: string;
  label: string;
  icon: ReactNode;
  /** How many you have (pieces, cards, awards). */
  count: number;
  points: number;
  /** Only you can see it (victory point cards). */
  secret?: boolean;
}

/** A city gate, the mark of Cities & Knights' tracks and metropolises. */
export function Gate({ className }: { className?: string }) {
  return (
    <svg viewBox="-12 -12 24 24" className={className} aria-hidden="true">
      <path d="M-9 10V-3l3-3 3 3V-6l3-4 3 4v3l3-3 3 3v13H3V3A3 3 0 0 0-3 3v7z" />
    </svg>
  );
}

/** Your points, row by row, from public facts and your own hidden cards. */
export function pointRows(t: CatanTableView, v: CatanView, me: string, colour: string): PointRow[] {
  const mine = Object.values(t.buildings).filter((b) => b.owner === me);
  const settlements = mine.filter((b) => !b.city).length;
  const cities = mine.filter((b) => b.city).length;
  const ck = t.ck;
  const rows: PointRow[] = [
    {
      key: 'settlements',
      label: 'Settlements',
      icon: <PieceGlyph kind="settlement" colour={colour} />,
      count: settlements,
      points: settlements,
    },
    {
      key: 'cities',
      label: 'Cities',
      icon: <PieceGlyph kind="city" colour={colour} />,
      count: cities,
      points: cities * 2,
    },
  ];
  if (ck) {
    const metros = TRACKS.filter((tr) => {
      const at = ck.metros[tr];
      return at && t.buildings[at]?.owner === me;
    }).length;
    rows.push({
      key: 'metros',
      label: 'Metropolises',
      icon: <Gate className="ctn-ico-gate" />,
      count: metros,
      points: metros * 2,
    });
  }
  const road = t.longest.holder === me;
  rows.push({
    key: 'road',
    label: 'Longest Road',
    icon: <DevGlyph kind="longroad" />,
    count: road ? 1 : 0,
    points: road ? 2 : 0,
  });
  if (!ck) {
    const army = t.army === me;
    rows.push({
      key: 'army',
      label: 'Largest Army',
      icon: <DevGlyph kind="army" />,
      count: army ? 1 : 0,
      points: army ? 2 : 0,
    });
    const vp = v.dev.filter((d) => d.card === 'victoryPoint').length;
    rows.push({
      key: 'vp',
      label: 'Victory point cards',
      icon: <DevGlyph kind="victoryPoint" />,
      count: vp,
      points: vp,
      secret: true,
    });
  } else {
    const defender = ck.defenders[me] ?? 0;
    rows.push({
      key: 'defender',
      label: 'Defender of Catan',
      icon: <DevGlyph kind="knight" />,
      count: defender,
      points: defender,
    });
    const shown = (ck.shown[me]?.length ?? 0) + (ck.merchant?.owner === me ? 1 : 0);
    rows.push({
      key: 'progress',
      label: 'Printer, Constitution and Merchant',
      icon: <DevGlyph kind="victoryPoint" />,
      count: shown,
      points: shown,
    });
  }
  if (t.sea) {
    const isles = t.sea.bonus[me]?.length ?? 0;
    rows.push({
      key: 'islands',
      label: 'New islands',
      icon: <PieceGlyph kind="ship" colour={colour} />,
      count: isles,
      points: isles * ISLAND_BONUS,
    });
  }
  return rows;
}

/** Active knight strength against the island's cities, the numbers that decide a landing. */
export function defence(t: CatanTableView) {
  const ck = t.ck!;
  const knights = Object.values(ck.knights)
    .filter((k) => k.active)
    .reduce((n, k) => n + k.level, 0);
  const cities = Object.values(t.buildings).filter((b) => b.city).length;
  return { knights, cities };
}

/**
 * The barbarian ship's voyage: seven steps of sea from its harbour to Catan's coast, the ship on
 * the step it has reached, and the island's active knights against its cities.
 */
export function BarbarianTrack({
  t,
  size = 'phone',
}: {
  t: CatanTableView;
  size?: 'phone' | 'tv';
}) {
  const ck = t.ck!;
  const { knights, cities } = defence(t);
  const left = 7 - ck.ship;
  const x = (i: number) => 22 + i * 34;
  const near = left <= 2;
  return (
    <div
      className={`ctn-voyage ctn-voyage--${size}${near ? ' is-near' : ''}`}
      role="img"
      aria-label={`The barbarian ship is ${left} ${left === 1 ? 'step' : 'steps'} from Catan. Active knights ${knights} against ${cities} ${cities === 1 ? 'city' : 'cities'}.`}
    >
      <span className="ctn-voyage__label" aria-hidden="true">
        <b>Barbarians</b>
        <small>{left === 1 ? 'land next ship' : `${left} steps away`}</small>
        <em>{left === 1 ? 'Next!' : `${left} steps`}</em>
      </span>
      <svg viewBox="0 0 300 40" className="ctn-voyage__sea" aria-hidden="true">
        <rect x="0" y="0" width="300" height="40" rx="8" className="ctn-voyage__water" />
        <path
          d="M8 31q8-4 16 0t16 0 16 0 16 0 16 0 16 0 16 0 16 0 16 0 16 0 16 0 16 0 16 0 16 0 16 0"
          className="ctn-voyage__wave"
        />
        <line x1={x(0)} y1="20" x2={x(7)} y2="20" className="ctn-voyage__route" />
        {Array.from({ length: 7 }, (_, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy="20"
            r="4"
            className={i < ck.ship ? 'ctn-voyage__step is-past' : 'ctn-voyage__step'}
          />
        ))}
        {/* Catan's coast, and a city waiting */}
        <path d="M262 40V14q10-10 22-6t16 8V40z" className="ctn-voyage__coast" />
        <g transform="translate(278 22) scale(.9)">
          <path d={CITY} className="ctn-voyage__city" />
        </g>
        <g
          className="ctn-voyage__ship"
          style={{ transform: `translate(${x(ck.ship)}px, 19px)` } as CSSProperties}
        >
          <path d="M-13 1H13L9 9H-9z" className="ctn-voyage__hull" />
          <path d="M-.6 1V-15" className="ctn-voyage__mast" />
          <path d="M.6-14 11-2H.6z" className="ctn-voyage__sail" />
          <path d="M-.6-14-9-4h8.4z" className="ctn-voyage__sail" />
          <path d="M-.6-15-6-17-.6-19z" className="ctn-voyage__flag" />
        </g>
      </svg>
      <span
        className={knights >= cities ? 'ctn-voyage__odds is-safe' : 'ctn-voyage__odds'}
        title="Active knights against cities"
      >
        <span className="ctn-voyage__side">
          <DevGlyph kind="knight" />
          <b>{knights}</b>
        </span>
        <small>vs</small>
        <span className="ctn-voyage__side">
          <svg viewBox="-12 -12 24 24" aria-hidden="true">
            <path d={CITY} className="ctn-voyage__cityico" />
          </svg>
          <b>{cities}</b>
        </span>
      </span>
    </div>
  );
}

/** Your points on a medallion, the ring filling towards the target; a tap shows where they come from. */
export function PointsMedal({
  t,
  v,
  onPoints,
}: {
  t: CatanTableView;
  v: CatanView;
  onPoints: () => void;
}) {
  const total = v.points;
  return (
    <button
      type="button"
      className="ctn-vp"
      style={{ '--share': Math.min(1, total / t.target) } as CSSProperties}
      onClick={onPoints}
      aria-label={`${total} of ${t.target} victory points. See where they come from`}
    >
      <span className="ctn-vp__ring" aria-hidden="true" />
      <b>{total}</b>
      <small>of {t.target}</small>
    </button>
  );
}

/** Cities & Knights: your knights' active strength; a tap picks one to command. */
export function KnightsChip({
  t,
  me,
  onKnights,
  canCommand,
}: {
  t: CatanTableView;
  me: string;
  onKnights: () => void;
  /** Your knights can be given orders now (your turn, building). */
  canCommand: boolean;
}) {
  const mineK = Object.values(t.ck!.knights).filter((k) => k.owner === me);
  const ready = mineK.filter((k) => k.active).reduce((n, k) => n + k.level, 0);
  const all = mineK.reduce((n, k) => n + k.level, 0);
  const asleep = mineK.filter((k) => !k.active).length;
  return (
    <button
      type="button"
      className={asleep ? 'ctn-kchip has-asleep' : 'ctn-kchip'}
      onClick={onKnights}
      disabled={!canCommand || !mineK.length}
      aria-label={
        mineK.length
          ? `Your knights: strength ${ready} active of ${all}${asleep ? `, ${asleep} not activated` : ''}. Command a knight`
          : 'No knights yet'
      }
    >
      <DevGlyph kind="knight" />
      <span aria-hidden="true">
        <b>{ready}</b>
        <small>/{all}</small>
      </span>
      {asleep > 0 && (
        <i className="ctn-kchip__asleep" aria-hidden="true">
          {asleep} off
        </i>
      )}
    </button>
  );
}

/**
 * Your estate on a laptop, beside the island: your points medallion, where the points come from
 * and (Cities & Knights) your knights. On a phone the medallion and knights sit on the tray, so
 * the island keeps the room.
 */
export function Ledger({
  t,
  v,
  me,
  colour,
  onPoints,
  onKnights,
  canCommand,
}: {
  t: CatanTableView;
  v: CatanView;
  me: string;
  colour: string;
  onPoints: () => void;
  onKnights: () => void;
  canCommand: boolean;
}) {
  const rows = pointRows(t, v, me, colour).filter((r) => r.count > 0);
  const total = v.points;
  return (
    <section className={t.ck ? 'ctn-ledger ctn-ledger--ck' : 'ctn-ledger'} aria-label="Your estate">
      <PointsMedal t={t} v={v} onPoints={onPoints} />
      <ul className="ctn-ledger__pts" aria-label="Where your points come from">
        {rows.map((r) => (
          <li key={r.key} title={`${r.label}: ${r.points} ${r.points === 1 ? 'point' : 'points'}`}>
            <span className={r.secret ? 'ctn-chip is-secret' : 'ctn-chip'}>
              {r.icon}
              {r.count > 1 && <i>{r.count}</i>}
            </span>
            <b>+{r.points}</b>
            <span className="ctn-sr">
              {r.label} {r.count}, {r.points} points
            </span>
          </li>
        ))}
        <li className="ctn-ledger__togo" aria-label={`${Math.max(0, t.target - total)} to win`}>
          <b>{Math.max(0, t.target - total)}</b>
          <small>to win</small>
        </li>
      </ul>
      {t.ck && <KnightsChip t={t} me={me} onKnights={onKnights} canCommand={canCommand} />}
    </section>
  );
}

/**
 * Cities & Knights: one of your tracks as a tower of five numbered steps in its colour, a gate on
 * top (ringed for a metropolis you hold). It stands beside the commodity that climbs it, as on
 * the improvement chart. A tap opens your city improvements.
 */
export function TrackTower({
  t,
  v,
  me,
  track,
  live,
  onCity,
}: {
  t: CatanTableView;
  v: CatanView;
  me: string;
  track: Track;
  /** You could build now (your turn, building). */
  live: boolean;
  onCity: () => void;
}) {
  const ck = t.ck!;
  const lvl = ck.levels[me]![track];
  const metro = ck.metros[track];
  const mine = !!metro && t.buildings[metro]?.owner === me;
  const good = TRACK_GOOD[track];
  // As the city sheet works it out: one more than the level reached, one less with the crane.
  const cost = lvl >= 5 ? null : Math.max(0, lvl + 1 - (ck.crane ? 1 : 0));
  const hasCity = Object.values(t.buildings).some((b) => b.owner === me && b.city);
  const ready = live && hasCity && cost !== null && (v.hand[good] ?? 0) >= cost;
  return (
    <button
      type="button"
      className={['ctn-tower', `ctn-tower--${track}`, mine && 'has-metro', ready && 'can-raise']
        .filter(Boolean)
        .join(' ')}
      onClick={onCity}
      title={cost === null ? TRACK_NAME[track] : `${TRACK_NAME[track]}: next costs ${cost} ${good}`}
      aria-label={`${TRACK_NAME[track]} ${lvl} of 5${mine ? ', your metropolis' : ''}${
        cost === null
          ? ', at the top'
          : `, next costs ${cost} ${good}${ready ? ', you can raise it now' : ''}`
      }. Open your city improvements`}
    >
      <span className="ctn-tower__gate" aria-hidden="true">
        <Gate />
        {cost !== null && <b className="ctn-tower__cost">{cost}</b>}
      </span>
      <span className="ctn-tower__steps" aria-hidden="true">
        {[5, 4, 3, 2, 1].map((n) => (
          <i
            key={n}
            className={
              n < lvl ? 'is-on' : n === lvl ? 'is-on is-top' : n === lvl + 1 ? 'is-next' : ''
            }
          >
            {n}
          </i>
        ))}
      </span>
    </button>
  );
}

/** Where your points come from, in words, and the pieces you have left. */
export function PointsSheet({
  open,
  onClose,
  t,
  v,
  me,
  colour,
}: {
  open: boolean;
  onClose: () => void;
  t: CatanTableView;
  v: CatanView;
  me: string;
  colour: string;
}) {
  const rows = pointRows(t, v, me, colour);
  const left = piecesLeft(t.buildings, t.roads, me);
  return (
    <Sheet open={open} onClose={onClose} title="Your points" className="ctn ctn-sheet">
      <p className="ctn-ptsheet__total">
        <b>{v.points}</b> of {t.target} · {Math.max(0, t.target - v.points)} to win
      </p>
      <ul className="ctn-ptsheet">
        {rows.map((r) => (
          <li key={r.key} className={r.count ? '' : 'is-none'}>
            <span className="ctn-chip">{r.icon}</span>
            <span>
              {r.label}
              {r.secret && <small> · hidden from the others</small>}
            </span>
            <span className="ctn-ptsheet__n">{r.count}</span>
            <b>{r.points}</b>
          </li>
        ))}
      </ul>
      <p className="ctn-trade__why">
        Pieces left: {left.road} roads, {left.settlement} settlements, {left.city} cities.
      </p>
    </Sheet>
  );
}
