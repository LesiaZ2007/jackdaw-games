'use client';

import { Sheet, type ScreenPlayer } from '@jackdaw/ui';
import { useState, type ReactNode } from 'react';
import { COSTS, canAfford, missing } from '../build';
import { CK_COSTS } from '../ck';
import { SHIP_COST } from '../sea';
import {
  cardsText,
  rateFor,
  type CatanAction,
  type CatanTableView,
  type CatanView,
  type Offer,
} from '../rules';
import { validTrade, waitingForYou } from '../trade';
import {
  CARDS,
  RESOURCES,
  countCards,
  type Card,
  type Cards,
  type DevCard,
  type Resource,
} from '../types';
import { DEV_NAME, DEV_TEXT, SeatToken, namer } from './common';
import { DevGlyph, PieceGlyph, Pip, ResourceGlyph } from './glyphs';
import { RESOURCE_NAME, TERRAIN_OF } from './palette';

type Send = (a: CatanAction) => Promise<boolean>;
export type Kind = 'road' | 'settlement' | 'city' | 'ship' | 'knight' | 'wall';

/** What each thing in the Build sheet costs. */
export const BUILD_COSTS: Record<Kind | 'dev', Partial<Cards>> = {
  ...COSTS,
  ship: SHIP_COST,
  knight: CK_COSTS.knight,
  wall: CK_COSTS.wall,
};

const none = (): Partial<Cards> => ({});
const sum = (c: Partial<Cards>) => countCards(c);
const covers = (hand: Cards, c: Partial<Cards>) =>
  CARDS.every((r) => (hand[r] ?? 0) >= (c[r] ?? 0));

/** The card kinds in play: the five resources, and (Cities & Knights) the commodities. */
export const kindsOf = (t: Pick<CatanTableView, 'ck'>): readonly Card[] =>
  t.ck ? CARDS : RESOURCES;

/** Cards as a row of pips: "[wool]2 [ore]". */
export function CardRow({ cards }: { cards: Partial<Cards> }) {
  return (
    <span className="ctn-cardrow">
      {CARDS.filter((r) => cards[r]).map((r) => (
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
  kinds = RESOURCES,
}: {
  label: string;
  value: Partial<Cards>;
  onChange: (c: Partial<Cards>) => void;
  max?: Partial<Cards>;
  kinds?: readonly Card[];
}) {
  return (
    <fieldset className={kinds.length > 5 ? 'ctn-picker ctn-picker--goods' : 'ctn-picker'}>
      <legend className="ctn-label">{label}</legend>
      {kinds.map((r) => {
        const n = value[r] ?? 0;
        const cap = max ? (max[r] ?? 0) : 19;
        return (
          <span key={r} className={n ? 'ctn-picker__cell is-set' : 'ctn-picker__cell'}>
            <button
              type="button"
              className="ctn-picker__add"
              disabled={n >= cap}
              onClick={() => onChange({ ...value, [r]: n + 1 })}
              aria-label={`Add ${RESOURCE_NAME[r]} (${n})`}
            >
              <span className={`ctn-picker__art ctn-fill--${TERRAIN_OF[r]}`}>
                <ResourceGlyph res={r} />
              </span>
              <b>{n || '·'}</b>
            </button>
            <button
              type="button"
              className="ctn-picker__less"
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

/** One card kind chosen (the five resources unless `kinds` says otherwise). */
export function OnePick<C extends Card = Resource>({
  value,
  onChange,
  label,
  disabled,
  note,
  kinds = RESOURCES as readonly C[],
}: {
  value: C | null;
  onChange: (r: C) => void;
  label: string;
  disabled?: (r: C) => boolean;
  note?: (r: C) => string;
  kinds?: readonly C[];
}) {
  return (
    <fieldset className={kinds.length > 5 ? 'ctn-onepick ctn-onepick--goods' : 'ctn-onepick'}>
      <legend className="ctn-label">{label}</legend>
      {kinds.map((r) => (
        <button
          key={r}
          type="button"
          className={value === r ? 'ctn-onepick__opt is-on' : 'ctn-onepick__opt'}
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
  extra,
}: {
  open: boolean;
  onClose: () => void;
  options: BuildOption[];
  seatColourOfMe: string;
  onPick: (kind: Kind | 'dev') => void;
  /** More below the list (Seafarers: sail a ship). */
  extra?: ReactNode;
}) {
  const label: Record<BuildOption['kind'], string> = {
    road: 'Road',
    settlement: 'Settlement',
    city: 'City',
    dev: 'Development card',
    ship: 'Ship',
    knight: 'Knight',
    wall: 'City wall',
  };
  const worth: Record<BuildOption['kind'], string> = {
    road: 'Joins your network. Five in a row can win Longest Road.',
    settlement: '1 point. Takes cards from the tiles it touches.',
    city: '2 points. Takes two cards instead of one.',
    dev: 'A knight, a progress card or a hidden point.',
    ship: 'Sails along the sea from your coast, toward new islands.',
    knight: 'Defends against the barbarians once activated (1 grain).',
    wall: 'Hold 2 more cards on a 7.',
  };
  return (
    <Sheet open={open} onClose={onClose} title="Build" className="ctn ctn-sheet">
      <ul className="ctn-buildlist">
        {options.map((o) => (
          <li key={o.kind}>
            <button
              type="button"
              className="ctn-buildrow"
              disabled={!!o.why}
              onClick={() => onPick(o.kind)}
            >
              <PieceGlyph kind={o.kind} colour={seatColourOfMe} />
              <span className="ctn-buildrow__text">
                <b>{label[o.kind]}</b>
                <small>{o.why ?? worth[o.kind]}</small>
              </span>
              <CardRow cards={BUILD_COSTS[o.kind]} />
            </button>
          </li>
        ))}
      </ul>
      {extra}
    </Sheet>
  );
}

/** Why each piece can or can't be built, from what you hold and what's on the board. */
export function buildOptions(
  hand: Cards,
  spots: Partial<Record<Kind, number>>,
  left: Partial<Record<Kind, number>>,
  deckLeft: number,
  kinds: readonly (Kind | 'dev')[] = ['road', 'settlement', 'city', 'dev'],
): BuildOption[] {
  const plural: Record<Kind, string> = {
    road: 'roads',
    settlement: 'settlements',
    city: 'cities',
    ship: 'ships',
    knight: 'basic knights',
    wall: 'walls',
  };
  const why = (kind: Kind | 'dev'): string | null => {
    if (kind === 'dev' && !deckLeft) return 'None left in the deck.';
    if (kind !== 'dev' && (left[kind] ?? 0) <= 0) return `You have no ${plural[kind]} left.`;
    if (!canAfford(hand, BUILD_COSTS[kind]))
      return `You need ${cardsText(missing(hand, BUILD_COSTS[kind]))} more.`;
    if (kind !== 'dev' && !spots[kind])
      return kind === 'city'
        ? 'Build a settlement to upgrade first.'
        : kind === 'wall'
          ? 'Walls go round cities without one.'
          : 'There’s nowhere to build one yet.';
    return null;
  };
  return kinds.map((kind) => ({ kind, why: why(kind) }));
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
    <ul className="ctn-replies">
      {asked.map((p) => {
        const r = offer.replies[p];
        return (
          <li key={p}>
            <SeatToken p={players.find((x) => x.id === p)} seats={t.seats} size={24} />
            <span>{name(p)}</span>
            <span className={`ctn-ans ctn-ans--${r ?? 'wait'}`}>
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
  const [bankGive, setBankGive] = useState<Card | null>(null);
  const [bankGet, setBankGet] = useState<Card | null>(null);
  const bad = validTrade(give, want);
  const short = !covers(v.hand, give);
  const kinds = kindsOf(t);
  const ratio = (r: Card) => rateFor(t, me, r);

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
      className="ctn ctn-sheet ctn-trade"
    >
      {canPlayers && (mine || t.turn !== me) && (
        <section className="ctn-trade__make">
          <Picker label="You give" value={give} onChange={setGive} max={v.hand} kinds={kinds} />
          <Picker label="You want" value={want} onChange={setWant} kinds={kinds} />
          {mine && !start && (
            <fieldset className="ctn-to">
              <legend className="ctn-label">Offer to</legend>
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
          <p className="ctn-trade__why" aria-live="polite">
            {sum(give) + sum(want) === 0
              ? 'Tap the cards you’d give and the ones you want.'
              : short
                ? 'You don’t have those cards.'
                : (bad ?? `${cardsText(give)} for ${cardsText(want)}.`)}
          </p>
          <button
            type="button"
            className="jd-plaque jd-plaque--go ctn-wide"
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
        <section className="ctn-trade__list">
          <h3 className="ctn-label">{mine ? 'Your offers' : 'Your proposals'}</h3>
          {myOffers.map((o) => (
            <article key={o.id} className="ctn-offer">
              <p className="ctn-offer__line">
                You give <CardRow cards={o.give} /> for <CardRow cards={o.want} />
              </p>
              {mine && <Replies offer={o} t={t} players={players} />}
              <div className="ctn-offer__btns">
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
        <section className="ctn-trade__list">
          <h3 className="ctn-label">Offers to you</h3>
          {toMe.map((o) => (
            <article key={o.id} className="ctn-offer">
              <p className="ctn-offer__line">
                <b>{name(o.from)}</b> gives <CardRow cards={o.give} /> for{' '}
                <CardRow cards={o.want} />
                {o.counter !== null && <small> (a counter-offer)</small>}
              </p>
              <div className="ctn-offer__btns">
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
        <section className="ctn-trade__bank">
          <h3 className="ctn-label">Trade with the bank</h3>
          <OnePick<Card>
            label="Give"
            kinds={kinds}
            value={bankGive}
            onChange={setBankGive}
            disabled={(r) => v.hand[r] < ratio(r)}
            note={(r) => `${ratio(r)} for 1`}
          />
          <OnePick<Card>
            label="Get"
            kinds={kinds}
            value={bankGet}
            onChange={setBankGet}
            disabled={(r) => r === bankGive || t.bank[r] < 1}
          />
          <button
            type="button"
            className="jd-plaque ctn-wide"
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
      {!canPlayers && !canBank && <p className="ctn-trade__why">There’s no trading right now.</p>}
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
    <aside className="ctn-offercard" aria-label={`Offer from ${name(o.from)}`}>
      <p className="ctn-offer__line">
        <SeatToken p={players.find((p) => p.id === o.from)} seats={t.seats} size={26} />
        <b>{name(o.from)}</b> offers <CardRow cards={o.give} /> for your <CardRow cards={o.want} />
      </p>
      {said === 'accept' ? (
        <p className="ctn-offercard__wait">You said yes. Waiting for {name(o.from)} to choose.</p>
      ) : (
        <div className="ctn-offercard__btns">
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
        <small className="ctn-offercard__more">{open.length - 1} more in Trade</small>
      )}
    </aside>
  );
}

/**
 * For the player on their turn: the newest trade waiting on them (a counter, a proposal, or
 * someone saying yes to their offer), laid over the board so it can't be missed.
 */
export function TurnOfferCard({
  t,
  v,
  me,
  players,
  send,
  busy,
  onOpen,
}: {
  t: CatanTableView;
  v: CatanView;
  me: string;
  players: ScreenPlayer[];
  send: Send;
  busy: boolean;
  onOpen: () => void;
}) {
  const name = namer(players);
  if (t.phase !== 'main' || t.paired || t.turn !== me) return null;
  const pending = waitingForYou(t.offers, me);
  const o = pending[pending.length - 1];
  if (!o) return null;
  const mine = o.from === me;
  const yes = mine ? Object.keys(o.replies).filter((p) => o.replies[p] === 'accept') : [];
  const can = covers(v.hand, mine ? o.give : o.want);
  return (
    <aside className="ctn-offercard" aria-label="A trade waiting for you">
      <p className="ctn-offer__line">
        {mine ? (
          <>
            <b>{yes.map(name).join(' and ')}</b> said yes: you give <CardRow cards={o.give} /> for{' '}
            <CardRow cards={o.want} />
          </>
        ) : (
          <>
            <SeatToken p={players.find((p) => p.id === o.from)} seats={t.seats} size={26} />
            <b>{name(o.from)}</b> offers <CardRow cards={o.give} /> for your{' '}
            <CardRow cards={o.want} />
          </>
        )}
      </p>
      <div className="ctn-offercard__btns ctn-offercard__btns--2">
        <button type="button" className="jd-plaque" onClick={onOpen}>
          Open Trade
        </button>
        <button
          type="button"
          className="jd-plaque jd-plaque--go"
          disabled={busy || !can}
          onClick={() => send({ type: 'accept', offer: o.id, with: mine ? yes[0]! : o.from })}
        >
          {!can ? 'You don’t have those' : mine ? `Trade with ${name(yes[0])}` : 'Accept'}
        </button>
      </div>
      {pending.length > 1 && (
        <small className="ctn-offercard__more">{pending.length - 1} more in Trade</small>
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
      <div className="ctn-cardpick">
        <p>Pick two cards to take from the bank (the same one twice is fine).</p>
        <div className="ctn-cardpick__row">
          {RESOURCES.map((r) => (
            <button
              key={r}
              type="button"
              className="ctn-cardpick__opt"
              disabled={take.length >= 2}
              onClick={() => setTake([...take, r])}
            >
              <Pip res={r} />
              {RESOURCE_NAME[r]}
            </button>
          ))}
        </div>
        <p className="ctn-cardpick__chosen">
          {take.length ? take.map((r, i) => <Pip key={i} res={r} />) : 'Nothing yet'}
          {take.length > 0 && (
            <button type="button" className="ctn-link" onClick={() => setTake([])}>
              Clear
            </button>
          )}
        </p>
        <button
          type="button"
          className="jd-plaque jd-plaque--go ctn-wide"
          disabled={busy || take.length !== 2}
          onClick={() => play({ type: 'play', card: 'yearOfPlenty', take: [take[0]!, take[1]!] })}
        >
          Take them
        </button>
      </div>
    );
  if (choosing === 'monopoly')
    picker = (
      <div className="ctn-cardpick">
        <OnePick label="Everyone gives you all their" value={res} onChange={setRes} />
        <button
          type="button"
          className="jd-plaque jd-plaque--go ctn-wide"
          disabled={busy || !res}
          onClick={() => res && play({ type: 'play', card: 'monopoly', resource: res })}
        >
          {res ? `Take everyone’s ${res}` : 'Pick a resource'}
        </button>
      </div>
    );
  return (
    <Sheet open={open} onClose={onClose} title="Development cards" className="ctn ctn-sheet">
      {!groups.length && <p className="ctn-trade__why">You have none yet. Buy them from Build.</p>}
      <ul className="ctn-devlist">
        {groups.map((g) => (
          <li key={g.card} className="ctn-dev">
            <span className={`ctn-dev__art ctn-dev__art--${g.card}`}>
              <DevGlyph kind={g.card} />
            </span>
            <span className="ctn-dev__text">
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
      <p className="ctn-trade__note">
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
  why = 'A 7 was rolled',
}: {
  open: boolean;
  onClose: () => void;
  hand: Cards;
  owe: number;
  send: Send;
  busy: boolean;
  why?: string;
}) {
  const [cards, setCards] = useState<Partial<Cards>>(none());
  const n = sum(cards);
  return (
    <Sheet open={open} onClose={onClose} title={`Discard ${owe}`} className="ctn ctn-sheet">
      <p className="ctn-trade__why">
        {why} and you hold {countCards(hand)} cards: give back half to the bank.
      </p>
      <Picker
        label={`Chosen ${n} of ${owe}`}
        value={cards}
        onChange={setCards}
        max={hand}
        kinds={CARDS.some((r) => !RESOURCES.includes(r as Resource) && hand[r]) ? CARDS : RESOURCES}
      />
      <button
        type="button"
        className="jd-plaque jd-plaque--go ctn-wide"
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
