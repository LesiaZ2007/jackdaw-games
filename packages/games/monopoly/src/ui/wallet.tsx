'use client';

import type { CSSProperties } from 'react';
import { DEEDS, deedAt, setOf, spaceName, streetAt, type Names } from '../board';
import type { MonopolyTableView } from '../rules';
import { ArtBulb, ArtTap, ArtTrain } from './art';
import { GROUP_INK, faceName, money } from './board';

/** The bank's notes, in their classic colours. */
export const NOTES = [500, 100, 50, 20, 10, 5, 1] as const;

/**
 * How a sum would sit in a player's hand: a little change in small notes, the rest in the
 * biggest that fit. So $1,500 shows 500s, 100s and 50s rather than three orange notes alone.
 */
export function notesFor(amount: number): { note: number; count: number }[] {
  const change = amount < 200 ? amount : 150 + (amount % 50);
  const counts = new Map<number, number>();
  const take = (sum: number, from: readonly number[]) => {
    let left = sum;
    for (const note of from) {
      const n = Math.floor(left / note);
      if (n) counts.set(note, (counts.get(note) ?? 0) + n);
      left -= n * note;
    }
  };
  take(amount - change, [500, 100, 50]);
  take(change, [50, 20, 10, 5, 1]);
  return NOTES.filter((note) => counts.get(note)).map((note) => ({
    note,
    count: counts.get(note)!,
  }));
}

/** A player's money as piles of notes, with the total beside them. */
export function Wallet({ cash, size = 'phone' }: { cash: number; size?: 'phone' | 'tv' | 'pot' }) {
  const piles = notesFor(cash);
  return (
    <div className={`mnp-wallet mnp-wallet--${size}`} aria-label={`${money(cash)} in hand`}>
      <span className="mnp-wallet__piles" aria-hidden="true">
        {piles.length === 0 && <span className="mnp-wallet__empty">Empty</span>}
        {piles.map(({ note, count }) => (
          <span key={note} className={`mnp-pilenote mnp-note--${note}`}>
            {Array.from({ length: Math.min(count, 4) }, (_, k) => (
              <span key={k} className="mnp-note" style={{ '--k': k } as CSSProperties}>
                <span className="mnp-note__oval">{note}</span>
              </span>
            ))}
            {count > 1 && <span className="mnp-pilenote__n">×{count}</span>}
          </span>
        ))}
      </span>
      <span className="mnp-wallet__sum">{money(cash)}</span>
    </div>
  );
}

/**
 * Someone's deeds as little title-deed cards: the colour band, the name, the buildings.
 * Cards of one set overlap like a hand. Tap one to read it.
 */
export function DeedCards({
  t,
  owner,
  names,
  onDeed,
  size = 'phone',
}: {
  t: MonopolyTableView;
  owner: string;
  names: Names;
  onDeed?: (space: number) => void;
  size?: 'phone' | 'tv';
}) {
  const mine = DEEDS.filter((d) => t.deeds[String(d)]?.owner === owner);
  if (!mine.length) {
    return size === 'phone' ? (
      <p className="mnp-deeds__none">No deeds yet. Land on one and buy it.</p>
    ) : null;
  }
  // One hand per set, in board order.
  const sets: number[][] = [];
  for (const d of mine) {
    const set = setOf(d);
    const hand = sets.find((h) => setOf(h[0]!).includes(d) && set.includes(h[0]!));
    if (hand) hand.push(d);
    else sets.push([d]);
  }
  return (
    <div className={`mnp-deeds mnp-deeds--${size}`}>
      {sets.map((hand) => (
        <span key={hand[0]} className="mnp-hand">
          {hand.map((d) => {
            const deed = deedAt(d)!;
            const h = t.deeds[String(d)]!;
            const st = streetAt(d);
            const band = st
              ? GROUP_INK[st.group]
              : deed.kind === 'railroad'
                ? 'var(--mnp-steel)'
                : 'var(--mnp-util)';
            const full = setOf(d).every((x) => t.deeds[String(x)]?.owner === owner);
            const Tag = onDeed ? 'button' : 'span';
            return (
              <Tag
                key={d}
                type={onDeed ? 'button' : undefined}
                className={`mnp-mini${h.mortgaged ? ' is-mortgaged' : ''}${full ? ' is-full' : ''}`}
                style={{ '--band': band } as CSSProperties}
                onClick={onDeed ? () => onDeed(d) : undefined}
                aria-label={`${spaceName(d, names)}${h.mortgaged ? ', mortgaged' : ''}`}
              >
                <span className="mnp-mini__band">
                  {deed.kind === 'railroad' && <ArtTrain />}
                  {deed.kind === 'utility' && (d === 12 ? <ArtBulb /> : <ArtTap />)}
                </span>
                {size === 'phone' && (
                  <span className="mnp-mini__name">{faceName(spaceName(d, names))}</span>
                )}
                {h.houses > 0 && (
                  <span className="mnp-mini__built">
                    {h.houses === 5 ? (
                      <span className="mnp-hotel" />
                    ) : (
                      Array.from({ length: h.houses }, (_, k) => (
                        <span key={k} className="mnp-house" />
                      ))
                    )}
                  </span>
                )}
                {h.mortgaged && <span className="mnp-mini__m">M</span>}
              </Tag>
            );
          })}
        </span>
      ))}
    </div>
  );
}
