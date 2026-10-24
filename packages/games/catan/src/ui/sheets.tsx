'use client';

import { Sheet, type ScreenPlayer } from '@jackdaw/ui';
import { useState, type ReactNode } from 'react';
import { COSTS, bankRatio, canAfford, harboursOf, missing } from '../build';
import { layout } from '../geometry';
import {
  cardsText,
  type CatanAction,
  type CatanTableView,
  type CatanView,
  type Offer,
} from '../rules';
import { validTrade } from '../trade';
import { RESOURCES, countCards, type Cards, type DevCard, type Resource } from '../types';
import { DEV_NAME, DEV_TEXT, SeatToken, namer } from './common';
import { DevGlyph, PieceGlyph, Pip, ResourceGlyph } from './glyphs';
import { RESOURCE_NAME, TERRAIN_OF } from './palette';

type Send = (a: CatanAction) => Promise<boolean>;
type Kind = 'road' | 'settlement' | 'city';

const none = (): Partial<Cards> => ({});
const sum = (c: Partial<Cards>) => countCards(c);
const covers = (hand: Cards, c: Partial<Cards>) => RESOURCES.every((r) => hand[r] >= (c[r] ?? 0));

/** Cards as a row of pips: "[wool]2 [ore]". */
export function CardRow({ cards }: { cards: Partial<Cards> }) {
  return (
    <span className="cn-cardrow">
      {RESOURCES.filter((r) => cards[r]).map((r) => (
        <Pip key={r} res={r} n={cards[r]} />
      ))}
    </span>
  );
}

/** Five resource counters: tap a card to add one, the minus to take one away. */
function Picker({
  label,
  value,
  onChange,
  max,
}: {
  label: string;
  value: Partial<Cards>;
  onChange: (c: Partial<Cards>) => void;
  max?: Partial<Cards>;
}) {
  return (
    <fieldset className="cn-picker">
      <legend className="cn-label">{label}</legend>
      {RESOURCES.map((r) => {
        const n = value[r] ?? 0;
        const cap = max ? (max[r] ?? 0) : 19;
        return (
          <span key={r} className={n ? 'cn-picker__cell is-set' : 'cn-picker__cell'}>
            <button
              type="button"
              className="cn-picker__add"
              disabled={n >= cap}
              onClick={() => onChange({ ...value, [r]: n + 1 })}
              aria-label={`Add ${RESOURCE_NAME[r]} (${n})`}
            >
              <span className={`cn-picker__art cn-fill--${TERRAIN_OF[r]}`}>
                <ResourceGlyph res={r} />
              </span>
              <b>{n || '·'}</b>
            </button>
            <button
              type="button"
              className="cn-picker__less"
              disabled={!n}
              onClick={() => onChange({ ...value, [r]: n - 1 })}
              aria-label={`One less ${RESOURCE_NAME[r]}`}
            >
              −
            </button>
          </span>
        );
      })}
    </fieldset>
  );
}

/** One resource chosen from the five. */
function OnePick({
  value,
  onChange,
  label,
  disabled,
  note,
}: {
  value: Resource | null;
  onChange: (r: Resource) => void;
  label: string;
  disabled?: (r: Resource) => boolean;
  note?: (r: Resource) => string;
}) {
  return (
    <fieldset className="cn-onepick">
      <legend className="cn-label">{label}</legend>
      {RESOURCES.map((r) => (
        <button
          key={r}
          type="button"
          className={value === r ? 'cn-onepick__opt is-on' : 'cn-onepick__opt'}
          aria-pressed={value === r}
          disabled={disabled?.(r)}
          onClick={() => onChange(r)}
        >
          <Pip res={r} />
          <span>{note ? note(r) : RESOURCE_NAME[r]}</span>
        </button>
      ))}
    </fieldset>
  );
}

/* ---------- Build ---------- */

export interface BuildOption {
  kind: Kind | 'dev';
  /** Why it can't be built now, or null. */
  why: string | null;
}

export function BuildSheet({
  open,
  onClose,
  options,
  seatColourOfMe,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  options: BuildOption[];
  seatColourOfMe: string;
  onPick: (kind: Kind | 'dev') => void;
}) {
  const label: Record<BuildOption['kind'], string> = {
    road: 'Road',
    settlement: 'Settlement',
    city: 'City',
    dev: 'Development card',
  };
  const worth: Record<BuildOption['kind'], string> = {
    road: 'Joins your network. Five in a row can win Longest Road.',
    settlement: '1 point. Takes cards from the tiles it touches.',
    city: '2 points. Takes two cards instead of one.',
    dev: 'A knight, a progress card or a hidden point.',
  };
  return (
    <Sheet open={open} onClose={onClose} title="Build" className="cn cn-sheet">
      <ul className="cn-buildlist">
        {options.map((o) => (
          <li key={o.kind}>
            <button
              type="button"
              className="cn-buildrow"
              disabled={!!o.why}
              onClick={() => onPick(o.kind)}
            >
              <PieceGlyph kind={o.kind} colour={seatColourOfMe} />
              <span className="cn-buildrow__text">
                <b>{label[o.kind]}</b>
                <small>{o.why ?? worth[o.kind]}</small>
              </span>
              <CardRow cards={COSTS[o.kind]} />
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

/** Why each piece can or can't be built, from what you hold and what's on the board. */
export function buildOptions(
  hand: Cards,
  spots: Record<Kind, number>,
  left: Record<Kind, number>,
  deckLeft: number,
): BuildOption[] {
  const why = (kind: Kind | 'dev'): string | null => {
    if (kind === 'dev' && !deckLeft) return 'None left in the deck.';
    if (kind !== 'dev' && left[kind] <= 0)
      return `You have no ${kind === 'city' ? 'cities' : `${kind}s`} left.`;
    if (!canAfford(hand, COSTS[kind]))
      return `You need ${cardsText(missing(hand, COSTS[kind]))} more.`;
    if (kind !== 'dev' && !spots[kind])
      return kind === 'city'
        ? 'Build a settlement to upgrade first.'
        : 'There’s nowhere to build one yet.';
    return null;
  };
  return (['road', 'settlement', 'city', 'dev'] as const).map((kind) => ({ kind, why: why(kind) }));
}

/* ---------- Trade ---------- */

function Replies({
  offer,
  t,
  players,
}: {
  offer: Offer;
  t: CatanTableView;
  players: ScreenPlayer[];
}) {
  const name = namer(players);
  const asked = offer.to ? [offer.to] : t.seats.filter((p) => p !== offer.from);
  return (
    <ul className="cn-replies">
      {asked.map((p) => {
        const r = offer.replies[p];
        return (
          <li key={p}>
            <SeatToken p={players.find((x) => x.id === p)} seats={t.seats} size={24} />
            <span>{name(p)}</span>
            <span className={`cn-ans cn-ans--${r ?? 'wait'}`}>
              {r === 'accept' ? 'Yes' : r === 'decline' ? 'No' : 'Thinking'}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function TradeSheet({
  open,
  onClose,
  t,
  v,
  me,
  players,
  send,
  busy,
  start,
}: {
  open: boolean;
  onClose: () => void;
  t: CatanTableView;
  v: CatanView;
  me: string;
  players: ScreenPlayer[];
  send: Send;
  busy: boolean;
  /** A counter-offer starts from the offer turned round. */
  start?: { give: Partial<Cards>; want: Partial<Cards>; counter: number } | null;
}) {
  const name = namer(players);
  const mine = t.turn === me && !t.paired;
  const paired = t.paired === me;
  const [give, setGive] = useState<Partial<Cards>>(start?.give ?? none());
  const [want, setWant] = useState<Partial<Cards>>(start?.want ?? none());
  const [to, setTo] = useState<string | null>(null);
  const [bankGive, setBankGive] = useState<Resource | null>(null);
  const [bankGet, setBankGet] = useState<Resource | null>(null);
  const bad = validTrade(give, want);
  const short = !covers(v.hand, give);
  const L = layout(t.size);
  const ratio = (r: Resource) => bankRatio(harboursOf(L, t.board, t.buildings, me), r);

  const reset = () => {
    setGive(none());
    setWant(none());
  };
  const offer = async () => {
    const ok = start
      ? await send({ type: 'counter', offer: start.counter, give, want })
      : mine
        ? await send({ type: 'offer', give, want, to })
        : await send({ type: 'propose', give, want });
    if (ok) {
      reset();
      if (start || !mine) onClose();
    }
  };

  const myOffers = t.offers.filter((o) => o.from === me);
  const toMe = mine ? t.offers.filter((o) => o.to === me) : [];
  const canPlayers = t.phase === 'main' && !t.paired;
  const canBank = (mine || paired) && t.phase === 'main';

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={start ? 'Counter-offer' : mine || paired ? 'Trade' : `Trade with ${name(t.turn)}`}
      className="cn cn-sheet cn-trade"
    >
      {canPlayers && (mine || t.turn !== me) && (
        <section className="cn-trade__make">
          <Picker label="You give" value={give} onChange={setGive} max={v.hand} />
          <Picker label="You want" value={want} onChange={setWant} />
          {mine && !start && (
            <fieldset className="cn-to">
              <legend className="cn-label">Offer to</legend>
              <button
                type="button"
                aria-pressed={to === null}
                className={to === null ? 'is-on' : ''}
                onClick={() => setTo(null)}
              >
                Everyone
              </button>
              {t.seats
                .filter((p) => p !== me)
                .map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={to === p}
                    className={to === p ? 'is-on' : ''}
                    onClick={() => setTo(p)}
                  >
                    {name(p)}
                  </button>
                ))}
            </fieldset>
          )}
          <p className="cn-trade__why" aria-live="polite">
            {sum(give) + sum(want) === 0
              ? 'Tap the cards you’d give and the ones you want.'
              : short
                ? 'You don’t have those cards.'
                : (bad ?? `${cardsText(give)} for ${cardsText(want)}.`)}
          </p>
          <button
            type="button"
            className="jd-plaque jd-plaque--go cn-wide"
            disabled={busy || !!bad || short}
            onClick={offer}
          >
            {start
              ? `Counter to ${name(t.turn)}`
              : mine
                ? 'Make the offer'
                : `Propose to ${name(t.turn)}`}
          </button>
        </section>
      )}

      {myOffers.length > 0 && (
        <section className="cn-trade__list">
          <h3 className="cn-label">{mine ? 'Your offers' : 'Your proposals'}</h3>
          {myOffers.map((o) => (
            <article key={o.id} className="cn-offer">
              <p className="cn-offer__line">
                You give <CardRow cards={o.give} /> for <CardRow cards={o.want} />
              </p>
              {mine && <Replies offer={o} t={t} players={players} />}
              <div className="cn-offer__btns">
                {mine &&
                  Object.entries(o.replies)
                    .filter(([, r]) => r === 'accept')
                    .map(([p]) => (
                      <button
                        key={p}
                        type="button"
                        className="jd-plaque jd-plaque--go jd-plaque--small"
                        disabled={busy}
                        onClick={() => send({ type: 'accept', offer: o.id, with: p })}
                      >
                        Trade with {name(p)}
                      </button>
                    ))}
                <button
                  type="button"
                  className="jd-plaque jd-plaque--small"
                  disabled={busy}
                  onClick={() => send({ type: 'withdraw', offer: o.id })}
                >
                  Take back
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      {toMe.length > 0 && (
        <section className="cn-trade__list">
          <h3 className="cn-label">Offers to you</h3>
          {toMe.map((o) => (
            <article key={o.id} className="cn-offer">
              <p className="cn-offer__line">
                <b>{name(o.from)}</b> gives <CardRow cards={o.give} /> for{' '}
                <CardRow cards={o.want} />
                {o.counter !== null && <small> (a counter-offer)</small>}
              </p>
              <div className="cn-offer__btns">
                <button
                  type="button"
                  className="jd-plaque jd-plaque--go jd-plaque--small"
                  disabled={busy || !covers(v.hand, o.want)}
                  onClick={() => send({ type: 'accept', offer: o.id, with: o.from })}
                >
                  {covers(v.hand, o.want) ? 'Accept' : 'You don’t have those'}
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      {canBank && (
        <section className="cn-trade__bank">
          <h3 className="cn-label">Trade with the bank</h3>
          <OnePick
            label="Give"
            value={bankGive}
            onChange={setBankGive}
            disabled={(r) => v.hand[r] < ratio(r)}
            note={(r) => `${ratio(r)} for 1`}
          />
          <OnePick
            label="Get"
            value={bankGet}
            onChange={setBankGet}
            disabled={(r) => r === bankGive || t.bank[r] < 1}
          />
          <button
            type="button"
            className="jd-plaque cn-wide"
            disabled={
              busy ||
              !bankGive ||
              !bankGet ||
              bankGive === bankGet ||
              v.hand[bankGive] < ratio(bankGive)
            }
            onClick={async () => {
              if (
                bankGive &&
                bankGet &&
                (await send({ type: 'bank', give: bankGive, get: bankGet, n: 1 }))
              )
                setBankGet(null);
            }}
          >
            {bankGive && bankGet
              ? `Trade ${ratio(bankGive)} ${bankGive} for 1 ${bankGet}`
              : 'Pick what to give and get'}
          </button>
        </section>
      )}
      {!canPlayers && !canBank && <p className="cn-trade__why">There’s no trading right now.</p>}
    </Sheet>
  );
}

/** An offer to you from the player whose turn it is, laid over the board. */
export function OfferCard({
  t,
  v,
  me,
  players,
  send,
  busy,
  onCounter,
}: {
  t: CatanTableView;
  v: CatanView;
  me: string;
  players: ScreenPlayer[];
  send: Send;
  busy: boolean;
  onCounter: (o: Offer) => void;
}) {
  const name = namer(players);
  if (t.phase !== 'main' || t.paired || t.turn === me) return null;
  const open = t.offers.filter((o) => o.from === t.turn && (o.to === null || o.to === me));
  const o = open.find((x) => !x.replies[me]) ?? open.find((x) => x.replies[me] === 'accept');
  if (!o) return null;
  const said = o.replies[me];
  const can = covers(v.hand, o.want);
  return (
    <aside className="cn-offercard" aria-label={`Offer from ${name(o.from)}`}>
      <p className="cn-offer__line">
        <SeatToken p={players.find((p) => p.id === o.from)} seats={t.seats} size={26} />
        <b>{name(o.from)}</b> offers <CardRow cards={o.give} /> for your <CardRow cards={o.want} />
      </p>
      {said === 'accept' ? (
        <p className="cn-offercard__wait">You said yes. Waiting for {name(o.from)} to choose.</p>
      ) : (
        <div className="cn-offercard__btns">
          <button
            type="button"
            className="jd-plaque"
            disabled={busy}
            onClick={() => send({ type: 'answer', offer: o.id, reply: 'decline' })}
          >
            No
          </button>
          <button type="button" className="jd-plaque" disabled={busy} onClick={() => onCounter(o)}>
            Counter
          </button>
          <button
            type="button"
            className="jd-plaque jd-plaque--go"
            disabled={busy || !can}
            onClick={() => send({ type: 'answer', offer: o.id, reply: 'accept' })}
          >
            {can ? 'Yes' : 'Can’t'}
          </button>
        </div>
      )}
      {open.length > 1 && (
        <small className="cn-offercard__more">{open.length - 1} more in Trade</small>
      )}
    </aside>
  );
}

/* ---------- Development cards ---------- */

export function CardsSheet({
  open,
  onClose,
  v,
  send,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  v: CatanView;
  send: Send;
  busy: boolean;
}) {
  const [choosing, setChoosing] = useState<'yearOfPlenty' | 'monopoly' | null>(null);
  const [take, setTake] = useState<Resource[]>([]);
  const [res, setRes] = useState<Resource | null>(null);
  const groups = (
    ['knight', 'roadBuilding', 'yearOfPlenty', 'monopoly', 'victoryPoint'] as DevCard[]
  )
    .map((card) => ({
      card,
      n: v.dev.filter((d) => d.card === card).length,
      playable: v.dev.some((d) => d.card === card && d.playable),
    }))
    .filter((g) => g.n > 0);
  const play = async (a: CatanAction) => {
    if (await send(a)) {
      setChoosing(null);
      setTake([]);
      setRes(null);
      onClose();
    }
  };
  let picker: ReactNode = null;
  if (choosing === 'yearOfPlenty')
    picker = (
      <div className="cn-cardpick">
        <p>Pick two cards to take from the bank (the same one twice is fine).</p>
        <div className="cn-cardpick__row">
          {RESOURCES.map((r) => (
            <button
              key={r}
              type="button"
              className="cn-cardpick__opt"
              disabled={take.length >= 2}
              onClick={() => setTake([...take, r])}
            >
              <Pip res={r} />
              {RESOURCE_NAME[r]}
            </button>
          ))}
        </div>
        <p className="cn-cardpick__chosen">
          {take.length ? take.map((r, i) => <Pip key={i} res={r} />) : 'Nothing yet'}
          {take.length > 0 && (
            <button type="button" className="cn-link" onClick={() => setTake([])}>
              Clear
            </button>
          )}
        </p>
        <button
          type="button"
          className="jd-plaque jd-plaque--go cn-wide"
          disabled={busy || take.length !== 2}
          onClick={() => play({ type: 'play', card: 'yearOfPlenty', take: [take[0]!, take[1]!] })}
        >
          Take them
        </button>
      </div>
    );
  if (choosing === 'monopoly')
    picker = (
      <div className="cn-cardpick">
        <OnePick label="Everyone gives you all their" value={res} onChange={setRes} />
        <button
          type="button"
          className="jd-plaque jd-plaque--go cn-wide"
          disabled={busy || !res}
          onClick={() => res && play({ type: 'play', card: 'monopoly', resource: res })}
        >
          {res ? `Take everyone’s ${res}` : 'Pick a resource'}
        </button>
      </div>
    );
  return (
    <Sheet open={open} onClose={onClose} title="Development cards" className="cn cn-sheet">
      {!groups.length && <p className="cn-trade__why">You have none yet. Buy them from Build.</p>}
      <ul className="cn-devlist">
        {groups.map((g) => (
          <li key={g.card} className="cn-dev">
            <span className={`cn-dev__art cn-dev__art--${g.card}`}>
              <DevGlyph kind={g.card} />
            </span>
            <span className="cn-dev__text">
              <b>
                {DEV_NAME[g.card]}
                {g.n > 1 && ` ×${g.n}`}
              </b>
              <small>{DEV_TEXT[g.card]}</small>
            </span>
            {g.card !== 'victoryPoint' && (
              <button
                type="button"
                className="jd-plaque jd-plaque--small"
                disabled={busy || !g.playable}
                title={
                  g.playable ? undefined : 'One card a turn, and never on the turn you bought it.'
                }
                onClick={() =>
                  g.card === 'yearOfPlenty' || g.card === 'monopoly'
                    ? setChoosing(g.card)
                    : play({ type: 'play', card: g.card as 'knight' | 'roadBuilding' })
                }
              >
                Play
              </button>
            )}
          </li>
        ))}
      </ul>
      {picker}
      <p className="cn-trade__note">
        One card a turn, never on the turn you buy it. A knight can go before you roll.
      </p>
    </Sheet>
  );
}

/* ---------- Discard ---------- */

export function DiscardSheet({
  open,
  onClose,
  hand,
  owe,
  send,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  hand: Cards;
  owe: number;
  send: Send;
  busy: boolean;
}) {
  const [cards, setCards] = useState<Partial<Cards>>(none());
  const n = sum(cards);
  return (
    <Sheet open={open} onClose={onClose} title={`Discard ${owe}`} className="cn cn-sheet">
      <p className="cn-trade__why">
        A 7 was rolled and you hold {countCards(hand)} cards: give back half to the bank.
      </p>
      <Picker label={`Chosen ${n} of ${owe}`} value={cards} onChange={setCards} max={hand} />
      <button
        type="button"
        className="jd-plaque jd-plaque--go cn-wide"
        disabled={busy || n !== owe}
        onClick={async () => {
          if (await send({ type: 'discard', cards })) onClose();
        }}
      >
        {n === owe ? `Discard ${cardsText(cards)}` : `Pick ${owe - n} more`}
      </button>
    </Sheet>
  );
}
