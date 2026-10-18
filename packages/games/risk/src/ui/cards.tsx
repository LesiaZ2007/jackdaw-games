'use client';

import { Plaque, Sheet } from '@jackdaw/ui';
import { useState } from 'react';
import { allSets, isSet, setValue, type Card, type CardSets, type CardSymbol } from '../cards';
import type { MapDef } from '../maps';
import { missionText, type Mission } from '../missions';
import { territoryName } from './common';

/** The three troop symbols, drawn small (and the wild, which stands in for any). */
export function SymbolMark({ symbol }: { symbol: CardSymbol }) {
  const art: Record<CardSymbol, string> = {
    // A pikeman's shield, a horseshoe, a cannon on its wheel, a star.
    infantry: 'M12 4h16v10c0 7-4 11-8 13-4-2-8-6-8-13z',
    cavalry: 'M11 30V16a9 9 0 0 1 18 0v14M7 30h8M25 30h8',
    artillery: 'M6 22l20-10 3 6-20 10zM14 28a5 5 0 1 0 0.1 0M26 12l6-3',
    wild: 'M20 5l4.5 9.5 10.5 1.5-7.5 7.5 2 10.5-9.5-5-9.5 5 2-10.5-7.5-7.5 10.5-1.5z',
  };
  return (
    <svg viewBox="0 0 40 36" className="rk-symbol" aria-hidden="true">
      <path d={art[symbol]} />
    </svg>
  );
}

const SYMBOL_NAME: Record<CardSymbol, string> = {
  infantry: 'Infantry',
  cavalry: 'Cavalry',
  artillery: 'Artillery',
  wild: 'Wild',
};

/** Your cards: pick three that make a set and trade them in (before you place armies). */
export function CardsSheet({
  open,
  onClose,
  hand,
  map,
  mode,
  setsTraded,
  canTrade,
  onTrade,
}: {
  open: boolean;
  onClose: () => void;
  hand: Card[];
  map: MapDef;
  mode: CardSets;
  setsTraded: number;
  canTrade: boolean;
  onTrade: (ids: [string, string, string]) => Promise<boolean>;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const chosen = hand.filter((c) => picked.includes(c.id));
  const valid = chosen.length === 3 && isSet(chosen);
  const inSomeSet = new Set(
    allSets(hand)
      .flat()
      .map((c) => c.id),
  );
  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 3 ? [...p, id] : p));
  const trade = async () => {
    setBusy(true);
    try {
      if (await onTrade(picked as [string, string, string])) {
        setPicked([]);
        onClose();
      }
    } finally {
      setBusy(false);
    }
  };
  const worth =
    mode === 'rising'
      ? `The next set is worth ${setValue('rising', setsTraded, [])} armies.`
      : 'Three infantry 4, three cavalry 6, three artillery 8, one of each 10.';
  return (
    <Sheet open={open} onClose={onClose} title="Your cards" className="rk-sheet">
      <p className="rk-sheet__note">
        {worth} A traded card for a territory you hold puts 2 more armies there.
      </p>
      {hand.length === 0 ? (
        <p className="rk-sheet__note">No cards yet. Take a territory on your turn to earn one.</p>
      ) : (
        <ul className="rk-hand">
          {hand.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={`rk-card ${picked.includes(c.id) ? 'is-picked' : ''} ${inSomeSet.has(c.id) ? 'is-useful' : ''}`}
                aria-pressed={picked.includes(c.id)}
                onClick={() => toggle(c.id)}
              >
                <SymbolMark symbol={c.symbol} />
                <span className="rk-card__name">
                  {c.territory ? territoryName(map, c.territory) : 'Wild'}
                </span>
                <span className="rk-card__kind">{SYMBOL_NAME[c.symbol]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="rk-sheet__actions">
        <Plaque go disabled={!valid || !canTrade || busy} onClick={trade}>
          {valid ? `Trade for ${setValue(mode, setsTraded, chosen)}` : 'Pick a set of three'}
        </Plaque>
      </div>
      {!canTrade && hand.length >= 3 && (
        <p className="rk-sheet__note">You can trade at the start of your turn.</p>
      )}
    </Sheet>
  );
}

/** Your secret mission, on a sealed card. */
export function MissionSheet({
  open,
  onClose,
  mission,
  map,
  nameOf,
}: {
  open: boolean;
  onClose: () => void;
  mission: Mission;
  map: MapDef;
  nameOf: (pid: string) => string;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Your mission" className="rk-sheet">
      <div className="rk-mission">
        <p className="rk-mission__text">{missionText(mission, map, nameOf)}</p>
        <p className="rk-sheet__note">
          Keep it to yourself. Complete it on your turn and you win at once.
        </p>
      </div>
    </Sheet>
  );
}
