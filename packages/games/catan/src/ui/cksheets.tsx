'use client';

import { Sheet } from '@jackdaw/ui';
import { useState, type ReactNode } from 'react';
import {
  PROGRESS_NAME,
  PROGRESS_TEXT,
  PROGRESS_TRACK,
  TRACKS,
  TRACK_GOOD,
  TRACK_NAME,
  type Progress,
  type Track,
} from '../ck';
import type { CatanAction, CatanTableView, CatanView } from '../rules';
import { CARDS, COMMODITIES, RESOURCES, type Card, type Commodity, type Resource } from '../types';
import { Pip } from './glyphs';
import { OnePick } from './sheets';

type Send = (a: CatanAction) => Promise<boolean>;

/** What each track's levels give, beyond the dice (level 3's ability, level 4's metropolis). */
const ABILITY: Record<Track, string> = {
  science: 'Aqueduct at 3: a roll that pays you nothing gives a resource of your choice.',
  trade: 'Trading house at 3: commodities trade 2:1 with the bank.',
  politics: 'Fortress at 3: knights can be promoted to mighty.',
};

/** Cards that need a pick on the board: the screen takes over once they're chosen. */
export const BOARD_CARDS: readonly Progress[] = [
  'inventor',
  'engineer',
  'medicine',
  'merchant',
  'bishop',
  'diplomat',
  'intrigue',
  'deserter',
];

/** Your city improvements, three tracks of five, and the way into your knights. */
export function CitySheet({
  open,
  onClose,
  t,
  v,
  me,
  send,
  busy,
  onKnights,
}: {
  open: boolean;
  onClose: () => void;
  t: CatanTableView;
  v: CatanView;
  me: string;
  send: Send;
  busy: boolean;
  onKnights: () => void;
}) {
  const ck = t.ck!;
  const hasCity = Object.values(t.buildings).some((b) => b.owner === me && b.city);
  const mine = Object.values(ck.knights).filter((k) => k.owner === me);
  const strength = mine.filter((k) => k.active).reduce((n, k) => n + k.level, 0);
  const cities = Object.values(t.buildings).filter((b) => b.city).length;
  return (
    <Sheet open={open} onClose={onClose} title="City and knights" className="ctn ctn-sheet">
      <ul className="ctn-tracks">
        {TRACKS.map((track) => {
          const lvl = ck.levels[me]![track];
          const cost = lvl >= 5 ? null : Math.max(0, lvl + 1 - (ck.crane ? 1 : 0));
          const good = TRACK_GOOD[track];
          const metro = ck.metros[track];
          const holder = metro ? t.buildings[metro]?.owner : null;
          const why = !hasCity
            ? 'You need a city first.'
            : cost === null
              ? 'At the top.'
              : (v.hand[good] ?? 0) < cost
                ? `Takes ${cost} ${good}.`
                : null;
          return (
            <li key={track} className={`ctn-track ctn-track--${track}`}>
              <span className={`ctn-track__flag ctn-fill--${track}`} aria-hidden="true" />
              <span className="ctn-track__text">
                <b>
                  {TRACK_NAME[track]} {lvl}/5
                  {holder === me && ' · your metropolis'}
                  {holder && holder !== me && ' · metropolis taken'}
                </b>
                <span className="ctn-track__steps" aria-hidden="true">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <i key={n} className={n <= lvl ? 'is-on' : ''} />
                  ))}
                </span>
                <small>{ABILITY[track]}</small>
              </span>
              <button
                type="button"
                className="jd-plaque jd-plaque--small"
                disabled={busy || !!why || t.phase !== 'main'}
                title={why ?? undefined}
                onClick={() => send({ type: 'improve', track })}
              >
                {cost === null ? (
                  'Done'
                ) : (
                  <>
                    Raise <Pip res={good} n={cost} />
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {ck.crane && <p className="ctn-trade__note">Crane: your next improvement costs one less.</p>}
      <p className="ctn-trade__why">
        Your knights stand at {strength} against {cities} {cities === 1 ? 'city' : 'cities'}. The
        ship is {7 - ck.ship} {7 - ck.ship === 1 ? 'step' : 'steps'} from landing.
      </p>
      <button
        type="button"
        className="jd-plaque jd-plaque--go ctn-wide"
        disabled={!mine.length || t.phase !== 'main'}
        onClick={() => {
          onClose();
          onKnights();
        }}
      >
        {mine.length ? 'Command a knight' : 'No knights yet: build one'}
      </button>
    </Sheet>
  );
}

/** Your progress cards; playing one asks for whatever it needs. */
export function ProgressSheet({
  open,
  onClose,
  t,
  v,
  me,
  name,
  send,
  busy,
  onBoard,
}: {
  open: boolean;
  onClose: () => void;
  t: CatanTableView;
  v: CatanView;
  me: string;
  name: (id: string | null | undefined) => string;
  send: Send;
  busy: boolean;
  /** A card that needs a pick on the board, with its rival if it has one. */
  onBoard: (card: Progress, victim?: string) => void;
}) {
  const [card, setCard] = useState<Progress | null>(null);
  const [res, setRes] = useState<Card | null>(null);
  const [victim, setVictim] = useState<string | null>(null);
  const [dice, setDice] = useState<[number, number]>([3, 4]);
  const ck = t.ck!;
  const shown = ck.shown[me] ?? [];
  const rivals = t.seats.filter((p) => p !== me);
  const play = async (a: CatanAction) => {
    if (await send(a)) {
      setCard(null);
      setRes(null);
      setVictim(null);
      onClose();
    }
  };
  const start = (c: Progress) => {
    setRes(null);
    setVictim(null);
    if (BOARD_CARDS.includes(c) && c !== 'deserter') {
      onClose();
      onBoard(c);
      return;
    }
    if (
      [
        'crane',
        'irrigation',
        'mining',
        'roadBuilding',
        'smith',
        'saboteur',
        'warlord',
        'wedding',
      ].includes(c)
    ) {
      void play({ type: 'progress', card: c });
      return;
    }
    setCard(c);
  };

  let picker: ReactNode = null;
  if (card === 'alchemist')
    picker = (
      <div className="ctn-cardpick">
        <p>Choose what the red and yellow dice show. The event die still rolls.</p>
        {[0, 1].map((k) => (
          <div
            key={k}
            className="ctn-dicepick"
            role="radiogroup"
            aria-label={k ? 'Yellow die' : 'Red die'}
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={dice[k] === n}
                className={`ctn-die ${k ? 'ctn-die--yellow' : 'ctn-die--red'} ${dice[k] === n ? 'is-on' : ''}`}
                onClick={() => setDice(k ? [dice[0], n] : [n, dice[1]])}
              >
                {n}
              </button>
            ))}
          </div>
        ))}
        <button
          type="button"
          className="jd-plaque jd-plaque--go ctn-wide"
          disabled={busy}
          onClick={() => play({ type: 'progress', card: 'alchemist', dice })}
        >
          Roll {dice[0] + dice[1]}
        </button>
      </div>
    );
  if (card === 'commercialHarbor' || card === 'resourceMonopoly')
    picker = (
      <div className="ctn-cardpick">
        <OnePick<Resource>
          label={card === 'commercialHarbor' ? 'Give each rival one' : 'Each rival gives you two'}
          value={res as Resource | null}
          onChange={setRes}
        />
        <button
          type="button"
          className="jd-plaque jd-plaque--go ctn-wide"
          disabled={busy || !res}
          onClick={() => res && play({ type: 'progress', card, resource: res })}
        >
          {PROGRESS_NAME[card]}
        </button>
      </div>
    );
  if (card === 'tradeMonopoly')
    picker = (
      <div className="ctn-cardpick">
        <OnePick<Commodity>
          label="Each rival gives you one"
          kinds={COMMODITIES}
          value={res as Commodity | null}
          onChange={setRes}
        />
        <button
          type="button"
          className="jd-plaque jd-plaque--go ctn-wide"
          disabled={busy || !res}
          onClick={() => res && play({ type: 'progress', card, resource: res })}
        >
          Trade Monopoly
        </button>
      </div>
    );
  if (card === 'merchantFleet')
    picker = (
      <div className="ctn-cardpick">
        <OnePick<Card> label="Trade 2:1 this turn" kinds={CARDS} value={res} onChange={setRes} />
        <button
          type="button"
          className="jd-plaque jd-plaque--go ctn-wide"
          disabled={busy || !res}
          onClick={() => res && play({ type: 'progress', card, resource: res })}
        >
          Merchant Fleet
        </button>
      </div>
    );
  if (card === 'masterMerchant' || card === 'spy' || card === 'deserter') {
    const ok = (p: string) =>
      card === 'masterMerchant'
        ? (t.points[p] ?? 0) > (t.points[me] ?? 0)
        : card === 'spy'
          ? (ck.progressCounts[p] ?? 0) > 0
          : Object.values(ck.knights).some((k) => k.owner === p);
    picker = (
      <div className="ctn-cardpick">
        <fieldset className="ctn-to">
          <legend className="ctn-label">From</legend>
          {rivals.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={victim === p}
              className={victim === p ? 'is-on' : ''}
              disabled={!ok(p)}
              onClick={() => setVictim(p)}
            >
              {name(p)}
            </button>
          ))}
        </fieldset>
        <button
          type="button"
          className="jd-plaque jd-plaque--go ctn-wide"
          disabled={busy || !victim}
          onClick={() => {
            if (!victim) return;
            if (card === 'deserter') {
              onClose();
              onBoard('deserter', victim);
            } else void play({ type: 'progress', card, victim });
          }}
        >
          {card === 'deserter' ? 'Next: where your knight stands' : PROGRESS_NAME[card]}
        </button>
      </div>
    );
  }

  const groups = [...new Set(v.progress.map((p) => p.card))].map((c) => ({
    card: c,
    n: v.progress.filter((p) => p.card === c).length,
    playable: v.progress.some((p) => p.card === c && p.playable),
  }));
  return (
    <Sheet open={open} onClose={onClose} title="Progress cards" className="ctn ctn-sheet">
      {!groups.length && (
        <p className="ctn-trade__why">
          None yet. A city gate on the event die deals them to anyone whose improvements in that
          colour are high enough.
        </p>
      )}
      <ul className="ctn-devlist">
        {groups.map((g) => (
          <li key={g.card} className="ctn-dev">
            <span className={`ctn-dev__art ctn-fill--${PROGRESS_TRACK[g.card]}`} aria-hidden="true">
              {PROGRESS_NAME[g.card][0]}
            </span>
            <span className="ctn-dev__text">
              <b>
                {PROGRESS_NAME[g.card]}
                {g.n > 1 && ` ×${g.n}`}
              </b>
              <small>{PROGRESS_TEXT[g.card]}</small>
            </span>
            <button
              type="button"
              className="jd-plaque jd-plaque--small"
              disabled={busy || !g.playable}
              onClick={() => start(g.card)}
            >
              Play
            </button>
          </li>
        ))}
      </ul>
      {picker}
      {shown.length > 0 && (
        <p className="ctn-trade__note">
          Face up: {shown.map((c) => PROGRESS_NAME[c]).join(', ')} (a point each).
        </p>
      )}
      <p className="ctn-trade__note">
        Play any number after you roll; the Alchemist goes before. You hold up to four.
      </p>
    </Sheet>
  );
}

/** What you owe a choice for: a resource (aqueduct, gold field) or a progress deck. */
export function PickSheet({
  open,
  onClose,
  t,
  me,
  send,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  t: CatanTableView;
  me: string;
  send: Send;
  busy: boolean;
}) {
  const owed = t.owed[me] ?? [];
  const first = owed[0];
  const [res, setRes] = useState<Resource | null>(null);
  if (!first) return null;
  const golds = owed.filter((o) => o === 'gold').length;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={first === 'progress' ? 'Defender’s reward' : first === 'gold' ? 'Gold!' : 'Aqueduct'}
      className="ctn ctn-sheet"
    >
      {first === 'progress' ? (
        <>
          <p className="ctn-trade__why">
            You tied for the best defence. Draw a progress card from the deck you like.
          </p>
          <div className="ctn-decks">
            {TRACKS.map((track) => (
              <button
                key={track}
                type="button"
                className={`ctn-deck ctn-fill--${track}`}
                disabled={busy || !t.ck!.deckLeft[track]}
                onClick={() => send({ type: 'pick', track })}
              >
                {TRACK_NAME[track]}
                <small>{t.ck!.deckLeft[track]} left</small>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="ctn-trade__why">
            {first === 'gold'
              ? `The gold field pays you ${golds === 1 ? 'a resource' : `${golds} resources`} of your choice.`
              : 'Your roll paid nothing, so the aqueduct gives you a resource of your choice.'}
          </p>
          <OnePick
            label="Take"
            value={res}
            onChange={setRes}
            disabled={(r) => t.bank[r] < 1}
            kinds={RESOURCES}
          />
          <button
            type="button"
            className="jd-plaque jd-plaque--go ctn-wide"
            disabled={busy || !res}
            onClick={async () => {
              if (res && (await send({ type: 'pick', resource: res })) && owed.length <= 1)
                onClose();
            }}
          >
            {res ? `Take ${res}` : 'Pick one'}
          </button>
        </>
      )}
    </Sheet>
  );
}
