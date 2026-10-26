'use client';

import { useState, type CSSProperties } from 'react';
import { Plaque, Token, type ScreenPlayer } from '@jackdaw/ui';
import {
  BOARD,
  DEEDS,
  GROUPS,
  RAILROADS,
  deedAt,
  mortgageValue,
  setOf,
  spaceName,
  kindWord,
  type Names,
  streetAt,
  unmortgageCost,
} from '../board';
import {
  buildBlock,
  describeSide,
  mortgageBlock,
  rentFor,
  sellBlock,
  type MonopolyAction,
  type MonopolyPlayerView,
  type MonopolyState,
  type MonopolyTableView,
  type Offer,
  type TradeSide,
} from '../rules';
import { GROUP_INK, money, printName, tintOf } from './board';

/** The rules' checks read only deeds, cash and the bank's buildings, which a view carries too. */
const asState = (t: MonopolyTableView) => t as unknown as MonopolyState;

type Send = (action: MonopolyAction) => Promise<boolean>;

/** A title deed, as printed: the colour band, the rents, the costs. */
export function DeedCard({
  t,
  space,
  players,
}: {
  t: MonopolyTableView;
  space: number;
  players: ScreenPlayer[];
}) {
  const sp = BOARD[space]!;
  const deed = deedAt(space);
  const h = t.deeds[String(space)];
  const owner = h ? players.find((p) => p.id === h.owner) : undefined;
  if (!deed) {
    return (
      <div className="mnp-deed mnp-deed--plain">
        <h3 className="mnp-deed__name">{sp.name}</h3>
        <p className="mnp-deed__note">{SPECIAL[sp.kind] ?? ''}</p>
      </div>
    );
  }
  const band = deed.kind === 'street' ? GROUP_INK[deed.group] : 'var(--mnp-ink)';
  return (
    <div className="mnp-deed" style={{ '--band': band } as CSSProperties}>
      <header className="mnp-deed__head">
        <span className="mnp-deed__kind">
          {deed.kind === 'street'
            ? 'Title deed'
            : t.names === 'town'
              ? deed.kind === 'railroad'
                ? 'Coaching inn'
                : 'Guild'
              : deed.kind === 'railroad'
                ? 'Railroad'
                : 'Utility'}
        </span>
        <h3 className="mnp-deed__name">{spaceName(space, t.names)}</h3>
      </header>
      <table className="mnp-deed__rents">
        <tbody>
          {deed.kind === 'street' &&
            [
              'Rent',
              'With 1 house',
              'With 2 houses',
              'With 3 houses',
              'With 4 houses',
              'With a hotel',
            ].map((label, k) => (
              <tr key={label} className={h && !h.mortgaged && h.houses === k ? 'is-now' : ''}>
                <th>{label}</th>
                <td>{money(deed.rent[k]!)}</td>
              </tr>
            ))}
          {deed.kind === 'railroad' &&
            [1, 2, 3, 4].map((n) => (
              <tr key={n}>
                <th>
                  {n === 1
                    ? `One ${kindWord('railroad', t.names)}`
                    : `${['', '', 'Two', 'Three', 'Four'][n]} ${kindWord('railroad', t.names)}s`}
                </th>
                <td>{money(25 * 2 ** (n - 1))}</td>
              </tr>
            ))}
          {deed.kind === 'utility' && (
            <>
              <tr>
                <th>One {kindWord('utility', t.names)}</th>
                <td>4 × dice</td>
              </tr>
              <tr>
                <th>Both {t.names === 'town' ? 'guilds' : 'utilities'}</th>
                <td>10 × dice</td>
              </tr>
            </>
          )}
        </tbody>
      </table>
      {deed.kind === 'street' && (
        <p className="mnp-deed__note">
          Rent is doubled on bare streets when one player owns the whole group.
        </p>
      )}
      <dl className="mnp-deed__costs">
        <div>
          <dt>Price</dt>
          <dd>{money(deed.price)}</dd>
        </div>
        {deed.kind === 'street' && (
          <div>
            <dt>Each house</dt>
            <dd>{money(deed.house)}</dd>
          </div>
        )}
        <div>
          <dt>Mortgage</dt>
          <dd>{money(mortgageValue(space))}</dd>
        </div>
      </dl>
      <p className="mnp-deed__owner">
        {owner ? (
          <>
            <Token avatar={owner.avatar} size={28} /> {owner.name}
            {h!.mortgaged ? ' · mortgaged' : ''}
          </>
        ) : (
          'Still with the bank'
        )}
      </p>
    </div>
  );
}

const SPECIAL: Record<string, string> = {
  go: 'Collect $200 each time you pass or land on GO.',
  jail: 'Just visiting, unless you were sent here. Leave by rolling doubles, paying $50 or using a card. After three failed rolls you pay and go.',
  parking: 'A free rest.',
  gotojail: 'Go straight to Jail. Do not pass GO, do not collect $200.',
  chance: 'Draw a Chance card and do what it says.',
  chest: 'Draw a Community Chest card and do what it says.',
  tax: 'Pay the bank.',
};

/** Your deeds, a colour group at a time, with what you can build, sell or mortgage. */
export function Estate({ t, me, send }: { t: MonopolyPlayerView; me: string; send: Send }) {
  const [busy, setBusy] = useState(false);
  const state = asState(t);
  const mine = DEEDS.filter((d) => t.deeds[String(d)]?.owner === me);
  if (!mine.length)
    return <p className="mnp-empty">You don't own anything yet. Land on a deed and buy it.</p>;
  const sets = [
    ...GROUPS.map((g) => setOf(DEEDS.find((d) => streetAt(d)?.group === g)!)),
    RAILROADS,
    setOf(12),
  ];
  const go = async (action: MonopolyAction) => {
    setBusy(true);
    await send(action);
    setBusy(false);
  };
  const dice = (t.dice?.[0] ?? 0) + (t.dice?.[1] ?? 0) || 7;
  return (
    <div className="mnp-estate">
      {sets.map((set) => {
        const held = set.filter((d) => mine.includes(d));
        if (!held.length) return null;
        return (
          <section key={set[0]} className="mnp-estate__set">
            {held.map((d) => {
              const h = t.deeds[String(d)]!;
              const st = streetAt(d);
              const canBuild = st && buildBlock(state, me, d) === null;
              const canSell = st && sellBlock(state, me, d) === null;
              const canLoan = !h.mortgaged && mortgageBlock(state, me, d) === null;
              const band = st ? GROUP_INK[st.group] : 'var(--mnp-ink)';
              return (
                <div
                  key={d}
                  className={`mnp-row${h.mortgaged ? ' is-mortgaged' : ''}`}
                  style={{ '--band': band } as CSSProperties}
                >
                  <span className="mnp-row__name">
                    <b>{spaceName(d, t.names)}</b>
                    <span>
                      {h.mortgaged
                        ? 'Mortgaged'
                        : `Rent ${money(rentFor(t, d, dice))}${deedAt(d)!.kind === 'utility' ? ` on a ${dice}` : ''}`}
                      {h.houses
                        ? ` · ${h.houses === 5 ? 'hotel' : `${h.houses} ${h.houses === 1 ? 'house' : 'houses'}`}`
                        : ''}
                    </span>
                  </span>
                  <span className="mnp-row__acts">
                    {st && !h.mortgaged && (
                      <button
                        type="button"
                        disabled={busy || !canBuild}
                        onClick={() => void go({ type: 'build', space: d })}
                        title={buildBlock(state, me, d) ?? undefined}
                      >
                        Build {money(st.house)}
                      </button>
                    )}
                    {canSell && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void go({ type: 'sell', space: d })}
                      >
                        Sell +{money(st!.house / 2)}
                      </button>
                    )}
                    {h.mortgaged ? (
                      <button
                        type="button"
                        disabled={busy || t.seats[me]!.cash < unmortgageCost(d)}
                        onClick={() => void go({ type: 'unmortgage', space: d })}
                      >
                        Lift {money(unmortgageCost(d))}
                      </button>
                    ) : (
                      !h.houses && (
                        <button
                          type="button"
                          disabled={busy || !canLoan}
                          onClick={() => void go({ type: 'mortgage', space: d })}
                          title={mortgageBlock(state, me, d) ?? undefined}
                        >
                          Mortgage +{money(mortgageValue(d))}
                        </button>
                      )
                    )}
                  </span>
                </div>
              );
            })}
          </section>
        );
      })}
      <p className="mnp-estate__bank">
        The bank has {t.bankHouses} houses and {t.bankHotels} hotels left.
      </p>
    </div>
  );
}

const EMPTY: TradeSide = { cash: 0, deeds: [], cards: 0 };

/** Put a trade together: who with, what you give and what you want back. */
export function TradeDesk({
  t,
  me,
  players,
  send,
  onSent,
}: {
  t: MonopolyPlayerView;
  me: string;
  players: ScreenPlayer[];
  send: Send;
  onSent: () => void;
}) {
  const others = t.order.filter((id) => id !== me && !t.seats[id]!.out);
  const [to, setTo] = useState<string | null>(others[0] ?? null);
  const [give, setGive] = useState<TradeSide>(EMPTY);
  const [get, setGet] = useState<TradeSide>(EMPTY);
  const [busy, setBusy] = useState(false);
  const byId = new Map(players.map((p) => [p.id, p]));
  const mine = t.offers.filter((o) => o.from === me);

  const tradeable = (id: string) =>
    DEEDS.filter(
      (d) =>
        t.deeds[String(d)]?.owner === id &&
        !setOf(d).some((x) => (t.deeds[String(x)]?.houses ?? 0) > 0),
    );

  const offer = async () => {
    if (!to) return;
    setBusy(true);
    const ok = await send({ type: 'offer', to, give, get });
    setBusy(false);
    if (ok) {
      setGive(EMPTY);
      setGet(EMPTY);
      onSent();
    }
  };

  if (!others.length) return <p className="mnp-empty">There's nobody left to trade with.</p>;
  const empty =
    give.cash + give.cards + give.deeds.length + get.cash + get.cards + get.deeds.length === 0;

  return (
    <div className="mnp-trade">
      <div className="mnp-trade__who" role="radiogroup" aria-label="Trade with">
        {others.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={to === id}
            className="mnp-trade__pick"
            style={{ '--tint': tintOf(byId.get(id)) } as CSSProperties}
            onClick={() => {
              setTo(id);
              setGet(EMPTY);
            }}
          >
            {byId.get(id) && <Token avatar={byId.get(id)!.avatar} size={32} />}
            <span>{byId.get(id)?.name ?? 'Someone'}</span>
          </button>
        ))}
      </div>
      {to && (
        <div className="mnp-trade__sides">
          <Side
            title="You give"
            deeds={tradeable(me)}
            side={give}
            set={setGive}
            cash={t.seats[me]!.cash}
            cards={t.seats[me]!.cards}
            names={t.names}
          />
          <Side
            title={`${byId.get(to)?.name ?? 'They'} gives`}
            deeds={tradeable(to)}
            side={get}
            set={setGet}
            cash={t.seats[to]!.cash}
            cards={t.seats[to]!.cards}
            names={t.names}
          />
        </div>
      )}
      <Plaque go disabled={busy || empty || !to} onClick={() => void offer()}>
        Send the offer
      </Plaque>
      {mine.map((o) => (
        <p key={o.id} className="mnp-trade__open">
          <span>
            Waiting on {byId.get(o.to)?.name ?? 'them'}: {describeSide(o.give, t.names)} for{' '}
            {describeSide(o.get, t.names)}.
          </span>
          <button type="button" onClick={() => void send({ type: 'cancel', id: o.id })}>
            Withdraw
          </button>
        </p>
      ))}
    </div>
  );
}

function Side({
  title,
  deeds,
  side,
  set,
  cash,
  cards,
  names,
}: {
  title: string;
  deeds: number[];
  side: TradeSide;
  set: (s: TradeSide) => void;
  cash: number;
  cards: number;
  names: Names;
}) {
  const toggle = (d: number) =>
    set({
      ...side,
      deeds: side.deeds.includes(d) ? side.deeds.filter((x) => x !== d) : [...side.deeds, d],
    });
  return (
    <fieldset className="mnp-side">
      <legend>{title}</legend>
      {deeds.length === 0 && <p className="mnp-empty">No deeds to trade.</p>}
      <div className="mnp-side__deeds">
        {deeds.map((d) => {
          const st = streetAt(d);
          return (
            <label
              key={d}
              className="mnp-chip"
              style={{ '--band': st ? GROUP_INK[st.group] : 'var(--mnp-ink)' } as CSSProperties}
            >
              <input type="checkbox" checked={side.deeds.includes(d)} onChange={() => toggle(d)} />
              <span>{printName(spaceName(d, names))}</span>
            </label>
          );
        })}
      </div>
      <label className="mnp-side__cash">
        <span>Cash</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={cash}
          step={10}
          value={side.cash || ''}
          placeholder="$0"
          onChange={(e) =>
            set({
              ...side,
              cash: Math.max(0, Math.min(cash, Math.floor(Number(e.target.value) || 0))),
            })
          }
        />
      </label>
      {cards > 0 && (
        <label className="mnp-side__cash">
          <span>Jail cards</span>
          <input
            type="number"
            min={0}
            max={cards}
            value={side.cards}
            onChange={(e) =>
              set({
                ...side,
                cards: Math.max(0, Math.min(cards, Math.floor(Number(e.target.value) || 0))),
              })
            }
          />
        </label>
      )}
    </fieldset>
  );
}

/** An offer made to you, with the answer buttons. */
export function OfferSlip({
  o,
  players,
  send,
  names,
}: {
  o: Offer;
  players: ScreenPlayer[];
  send: Send;
  names: Names;
}) {
  const [busy, setBusy] = useState(false);
  const from = players.find((p) => p.id === o.from);
  const answer = async (type: 'accept' | 'reject') => {
    setBusy(true);
    await send({ type, id: o.id });
    setBusy(false);
  };
  return (
    <div className="mnp-offer" role="alert" style={{ '--tint': tintOf(from) } as CSSProperties}>
      <p>
        <b>{from?.name ?? 'Someone'}</b> offers {describeSide(o.give, names)} for{' '}
        {describeSide(o.get, names)}.
      </p>
      <span className="mnp-offer__acts">
        <button type="button" disabled={busy} onClick={() => void answer('reject')}>
          Decline
        </button>
        <Plaque go small disabled={busy} onClick={() => void answer('accept')}>
          Accept
        </Plaque>
      </span>
    </div>
  );
}
