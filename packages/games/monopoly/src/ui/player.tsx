'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import type { Reaction } from '@jackdaw/engine';
import {
  Plaque,
  PlayerReaction,
  Sheet,
  Token,
  useCountdown,
  useMoment,
  useTheme,
  VerdictMoment,
  type GameUi,
  type Outcome,
  type ScreenPlayer,
} from '@jackdaw/ui';
import { BAIL, deedAt, spaceName } from '../board';
import type { LogEntry, MonopolyAction, MonopolyPlayerView, MonopolyTableView } from '../rules';
import { Board, Dice, DrawnCard, money, tintOf } from './board';
import { Pile } from './art';
import { DeedCard, Estate, OfferSlip, TradeDesk } from './panels';
import { Popups } from './popups';
import { DeedCards, Wallet } from './wallet';
import './monopoly.css';

type Sheet = { kind: 'deed'; space: number } | { kind: 'estate' } | { kind: 'trade' } | null;

/**
 * Monopoly on a phone: the board on top (tap a space for its deed), everyone's cash beneath,
 * and the dock with this moment's move. On a laptop the board fills the height and the players,
 * dock and the story so far sit beside it.
 */
export const PlayerScreen: GameUi['PlayerScreen'] = ({
  view,
  sendAction,
  now,
  reactions,
  ...props
}) => {
  const v = view as MonopolyPlayerView;
  const look = useTheme();
  const players = props.players as ScreenPlayer[];
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => (id === v.me ? 'You' : (byId.get(id)?.name ?? 'Someone'));
  const wide = useWide();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [busy, setBusy] = useState(false);

  const send = async (action: MonopolyAction) => {
    setBusy(true);
    const ok = await sendAction(action);
    setBusy(false);
    return ok;
  };

  const felt = feltFor(v, v.me, name);
  const [moment, dismiss] = useMoment(felt?.seq ?? 0);
  const incoming = v.offers.filter((o) => o.to === v.me);
  const focus = v.phase === 'auction' ? (v.auction?.space ?? null) : v.pendingBuy;

  const offers = (
    <>
      {incoming.slice(0, 1).map((o) => (
        <OfferSlip key={o.id} o={o} players={players} send={send} names={v.names} />
      ))}
    </>
  );
  const dock = (
    <footer className="mnp-dock">
      <Moves
        v={v}
        busy={busy}
        send={send}
        name={name}
        openEstate={() => setSheet({ kind: 'estate' })}
      />
      <div className="mnp-dock__more">
        <button type="button" onClick={() => setSheet({ kind: 'estate' })}>
          Your deeds
        </button>
        <button type="button" onClick={() => setSheet({ kind: 'trade' })}>
          Trade{v.offers.some((o) => o.from === v.me) ? ' · 1 open' : ''}
        </button>
      </div>
    </footer>
  );

  return (
    <div className={`mnp mnp--phone${wide ? ' mnp--wide' : ''}`} data-look={look}>
      <header className="mnp-bar">
        <h2 className="mnp-bar__status">{statusLine(v, name)}</h2>
        <Clock at={v.phase === 'auction' ? (v.auction?.until ?? null) : v.actBy} now={now} />
      </header>

      <div className="mnp-main">
        <div className="mnp-stage">
          <div className="mnp-fit">
            <Board
              t={v}
              players={players}
              size={wide ? 'wide' : 'phone'}
              focus={focus}
              onSpace={(space) => setSheet({ kind: 'deed', space })}
            >
              <Centre t={v} size={wide ? 'wide' : 'phone'} name={name} me={v.me} />
            </Board>
          </div>
        </div>

        <aside className="mnp-side-col">
          <People t={v} players={players} me={v.me} reactions={reactions} />
          {wide && <Story t={v} name={name} count={6} />}
          <section className="mnp-purse" aria-label="Your money and deeds">
            <Wallet cash={v.seats[v.me]!.cash} />
            <DeedCards
              t={v}
              owner={v.me}
              names={v.names}
              onDeed={(space) => setSheet({ kind: 'deed', space })}
            />
          </section>
          {wide && offers}
          {wide && dock}
        </aside>
      </div>

      {!wide && offers}
      {!wide && dock}

      <Sheet
        open={sheet?.kind === 'deed'}
        onClose={() => setSheet(null)}
        title="Deed"
        className="mnp-sheet"
      >
        {sheet?.kind === 'deed' && <DeedCard t={v} space={sheet.space} players={players} />}
      </Sheet>
      <Sheet
        open={sheet?.kind === 'estate'}
        onClose={() => setSheet(null)}
        title="Your deeds"
        className="mnp-sheet"
      >
        <div className="mnp" data-look={look}>
          <Estate t={v} me={v.me} send={send} />
        </div>
      </Sheet>
      <Sheet
        open={sheet?.kind === 'trade'}
        onClose={() => setSheet(null)}
        title="Trade"
        className="mnp-sheet"
      >
        <div className="mnp" data-look={look}>
          <TradeDesk t={v} me={v.me} players={players} send={send} onSent={() => setSheet(null)} />
        </div>
      </Sheet>

      <Popups t={v} me={v.me} players={players} />

      {moment !== null && felt && (
        <VerdictMoment
          key={felt.seq}
          outcome={felt.outcome}
          title={felt.title}
          detail={felt.detail}
          ms={2600}
          onDone={dismiss}
        />
      )}
    </div>
  );
};

function useWide(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const q = window.matchMedia('(min-width: 1024px) and (min-height: 600px)');
    const on = () => setWide(q.matches);
    on();
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);
  return wide;
}

/** The move buttons for this moment, or what everyone is waiting for. */
function Moves({
  v,
  busy,
  send,
  name,
  openEstate,
}: {
  v: MonopolyPlayerView;
  busy: boolean;
  send: (a: MonopolyAction) => Promise<boolean>;
  name: (id: string) => string;
  openEstate: () => void;
}) {
  const me = v.seats[v.me]!;
  if (me.out) return <p className="mnp-dock__line">You're out. Watch the town change hands.</p>;
  if (v.phase === 'show' || v.phase === 'over')
    return <p className="mnp-dock__line">The game is over.</p>;

  const head = v.debts[0];
  if (v.phase === 'debt' && head) {
    if (head.from !== v.me) {
      return (
        <p className="mnp-dock__line">
          {name(head.from)} must raise {money(head.amount)}.
        </p>
      );
    }
    return (
      <div className="mnp-dock__row">
        <p className="mnp-dock__line">
          You owe {money(head.amount)} {head.to ? `to ${name(head.to)}` : 'to the bank'}. Raise{' '}
          {money(head.amount - me.cash)}.
        </p>
        <button
          type="button"
          className="mnp-quiet is-danger"
          disabled={busy}
          onClick={() => void send({ type: 'bankrupt' })}
        >
          Go bankrupt
        </button>
        <Plaque go disabled={busy} onClick={openEstate}>
          Raise money
        </Plaque>
      </div>
    );
  }

  const au = v.auction;
  if (v.phase === 'auction' && au) {
    const deed = deedAt(au.space)!;
    const line = au.by
      ? `${name(au.by)} ${au.by === v.me ? 'lead' : 'leads'} at ${money(au.high)}`
      : 'No bids yet';
    if (au.out.includes(v.me)) {
      return (
        <p className="mnp-dock__line">
          {spaceName(au.space, v.names)}: {line}. You've dropped out.
        </p>
      );
    }
    const steps =
      au.high === 0
        ? [10, Math.round(deed.price / 20) * 10, deed.price]
        : [au.high + 10, au.high + 50, au.high + 100];
    return (
      <div className="mnp-dock__row">
        <p className="mnp-dock__line">
          Auction for <b>{spaceName(au.space, v.names)}</b> ({money(deed.price)}): {line}.
        </p>
        {au.by !== v.me && (
          <button
            type="button"
            className="mnp-quiet"
            disabled={busy}
            onClick={() => void send({ type: 'pass' })}
          >
            Drop out
          </button>
        )}
        <span className="mnp-bids">
          {steps.map((n) => (
            <button
              key={n}
              type="button"
              className="mnp-bid"
              disabled={busy || n > me.cash || n <= au.high}
              onClick={() => void send({ type: 'bid', amount: n })}
            >
              {money(n)}
            </button>
          ))}
        </span>
      </div>
    );
  }

  if (v.turn !== v.me) {
    return <p className="mnp-dock__line">{waitingLine(v, name)}</p>;
  }

  if (v.phase === 'roll') {
    if (me.jailed) {
      return (
        <div className="mnp-dock__row">
          <p className="mnp-dock__line">
            You're in Jail
            {me.tries ? `, ${3 - me.tries} ${3 - me.tries === 1 ? 'try' : 'tries'} left` : ''}.
          </p>
          {me.cards > 0 && (
            <button
              type="button"
              className="mnp-quiet"
              disabled={busy}
              onClick={() => void send({ type: 'useCard' })}
            >
              Use your card
            </button>
          )}
          <button
            type="button"
            className="mnp-quiet"
            disabled={busy || me.cash < BAIL}
            onClick={() => void send({ type: 'bail' })}
          >
            Pay {money(BAIL)}
          </button>
          <Plaque go disabled={busy} onClick={() => void send({ type: 'roll' })}>
            Roll for doubles
          </Plaque>
        </div>
      );
    }
    return (
      <div className="mnp-dock__row">
        {v.doubles > 0 && <p className="mnp-dock__line">Doubles! Roll again.</p>}
        <Plaque go disabled={busy} onClick={() => void send({ type: 'roll' })}>
          Roll the dice
        </Plaque>
      </div>
    );
  }

  if (v.phase === 'buy' && v.pendingBuy !== null) {
    const deed = deedAt(v.pendingBuy)!;
    return (
      <div className="mnp-dock__row">
        <button
          type="button"
          className="mnp-quiet"
          disabled={busy}
          onClick={() => void send({ type: 'decline' })}
        >
          {v.auctions ? 'Auction it' : 'Leave it'}
        </button>
        <Plaque
          go
          disabled={busy || me.cash < deed.price}
          onClick={() => void send({ type: 'buy' })}
        >
          Buy {spaceName(v.pendingBuy, v.names)} · {money(deed.price)}
        </Plaque>
      </div>
    );
  }

  return (
    <div className="mnp-dock__row">
      <p className="mnp-dock__line">Build, mortgage or trade, then end your turn.</p>
      <Plaque go disabled={busy} onClick={() => void send({ type: 'end' })}>
        End turn
      </Plaque>
    </div>
  );
}

/**
 * The middle of the board, laid out like the printed one: the Community Chest pile top left and
 * Chance bottom right on the diagonal, the name across the middle, the dice below it. A drawn
 * card flies out of its pile and lies face up over the middle until the turn ends.
 */
export function Centre({
  t,
  size,
  name,
  me,
}: {
  t: MonopolyTableView;
  size: 'phone' | 'wide' | 'tv';
  name: (id: string) => string;
  /** Whose money pops up over the board when it changes. */
  me?: string;
}) {
  const [freshCard] = useMoment(t.card?.seq ?? 0);
  const die = size === 'tv' ? 76 : size === 'wide' ? 46 : 26;
  return (
    <>
      <span className="mnp-centre__pile mnp-centre__pile--chest">
        <Pile deck="chest" />
      </span>
      <span className="mnp-centre__pile mnp-centre__pile--chance">
        <Pile deck="chance" />
      </span>
      <span className="mnp-centre__mark">Monopoly</span>
      {t.parkingPot && (
        <span className="mnp-centre__pot">
          <Wallet cash={t.pot} size="pot" />
          <span className="mnp-centre__potname">Free Parking</span>
        </span>
      )}
      <span className="mnp-centre__dice">
        <Dice dice={t.dice} rolls={t.rolls} size={die} />
      </span>
      <span className="mnp-centre__foot">
        {t.maxRounds ? `Round ${t.round} of ${t.maxRounds}` : `Round ${t.round}`}
      </span>
      {me && t.seats[me] && <MoneyBurst cash={t.seats[me]!.cash} quiet={announced(t, me)} />}
      {t.card && (
        <span className="mnp-centre__drawn">
          <DrawnCard card={t.card} fresh={freshCard !== null} by={name(t.card.by)} />
        </span>
      )}
    </>
  );
}

/** True when the last thing that happened is a popup about your money (rent, tax, a card). */
function announced(t: MonopolyTableView, me: string): boolean {
  const last = t.log.at(-1);
  if (!last) return false;
  const mine = last.by === me || last.to === me || last.text.includes(`{${me}}`);
  return mine && (last.kind === 'rent' || last.kind === 'tax' || last.kind === 'card');
}

/**
 * Your money changing, stamped big over the board: green and rising when you're paid, smaller
 * and red when you pay out.
 */
function MoneyBurst({ cash, quiet }: { cash: number; quiet: boolean }) {
  const [seen, setSeen] = useState(cash);
  const [burst, setBurst] = useState<{ by: number; n: number } | null>(null);
  if (cash !== seen) {
    setSeen(cash);
    if (!quiet) setBurst((b) => ({ by: cash - seen, n: (b?.n ?? 0) + 1 }));
  }
  if (!burst) return null;
  return (
    <span
      key={burst.n}
      className={`mnp-burst ${burst.by > 0 ? 'is-up' : 'is-down'}`}
      aria-hidden="true"
      onAnimationEnd={() => setBurst(null)}
    >
      {burst.by > 0 ? '+' : '\u2212'}
      {money(Math.abs(burst.by))}
    </span>
  );
}

/** Everyone in turn order: token, name, cash, and a chip that pops when the cash moves. */
export function People({
  t,
  players,
  me,
  reactions,
  tv = false,
}: {
  t: MonopolyTableView;
  players: ScreenPlayer[];
  me: string | null;
  reactions: Reaction[];
  tv?: boolean;
}) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const cash = Object.fromEntries(t.order.map((id) => [id, t.seats[id]!.cash]));
  const cashKey = t.order.map((id) => cash[id]).join(',');
  const [seen, setSeen] = useState({ key: cashKey, cash });
  const [delta, setDelta] = useState<Record<string, { by: number; at: number }>>({});
  if (seen.key !== cashKey) {
    const next: Record<string, { by: number; at: number }> = {};
    for (const id of t.order) {
      const was = seen.cash[id];
      if (was !== undefined && was !== cash[id]) next[id] = { by: cash[id]! - was, at: t.seq };
    }
    setSeen({ key: cashKey, cash });
    setDelta((d) => ({ ...d, ...next }));
  }

  return (
    <ol className={`mnp-people${tv ? ' mnp-people--tv' : ''}`}>
      {t.order.map((id) => {
        const p = byId.get(id);
        const s = t.seats[id]!;
        const d = delta[id];
        const deeds = Object.values(t.deeds).filter((h) => h.owner === id).length;
        return (
          <li
            key={id}
            className={`mnp-person${t.turn === id && !s.out ? ' is-turn' : ''}${s.out ? ' is-out' : ''}${id === me ? ' is-me' : ''}`}
            style={{ '--tint': tintOf(p) } as CSSProperties}
          >
            <span className="mnp-person__tok">
              {p && <Token avatar={p.avatar} size={tv ? 64 : 34} />}
              <PlayerReaction reactions={reactions} playerId={id} />
            </span>
            <span className="mnp-person__text">
              <b>{id === me ? 'You' : (p?.name ?? 'Someone')}</b>
              <span>
                {s.out
                  ? 'Bankrupt'
                  : s.jailed
                    ? 'In Jail'
                    : `${deeds} ${deeds === 1 ? 'deed' : 'deeds'}`}
              </span>
            </span>
            <span className="mnp-person__cash">{s.out ? '–' : money(s.cash)}</span>
            {tv && !s.out && (
              <span className="mnp-person__deeds">
                <DeedCards t={t} owner={id} names={t.names} size="tv" />
              </span>
            )}
            {d && (
              <span
                key={d.at}
                className={`mnp-delta ${d.by > 0 ? 'is-up' : 'is-down'}`}
                aria-hidden="true"
              >
                {d.by > 0 ? '+' : '−'}
                {money(Math.abs(d.by))}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** The story so far, newest first. */
export function Story({
  t,
  name,
  count = 14,
}: {
  t: MonopolyTableView;
  name: (id: string) => string;
  count?: number;
}) {
  const lines = t.log
    .filter((e) => e.kind !== 'roll')
    .slice(-count)
    .reverse();
  return (
    <ol className="mnp-story" aria-label="What happened">
      {lines.map((e) => (
        <li key={e.seq} className={`mnp-story__line is-${e.kind}`}>
          {say(e.text, name)}
        </li>
      ))}
    </ol>
  );
}

/** Swap `{id}` for names. */
export function say(text: string, name: (id: string) => string): string {
  return text.replace(/\{([^}]+)\}/g, (_, id: string) => name(id));
}

export function waitingLine(v: MonopolyTableView, name: (id: string) => string): string {
  const who = name(v.turn);
  if (v.phase === 'roll') return v.seats[v.turn]?.jailed ? `${who} is in Jail.` : `${who} to roll.`;
  if (v.phase === 'buy' && v.pendingBuy !== null)
    return `${who} is deciding on ${spaceName(v.pendingBuy, v.names)}.`;
  return `${who} is finishing their turn.`;
}

export function statusLine(t: MonopolyTableView, name: (id: string) => string): string {
  if (t.phase === 'show' || t.phase === 'over') {
    return t.winners.length === 1
      ? `${name(t.winners[0]!)} ${name(t.winners[0]!) === 'You' ? 'own' : 'owns'} the town`
      : 'A shared fortune';
  }
  const last = t.log.at(-1);
  if (last && last.kind !== 'roll') return say(last.text, name);
  if (t.dice) return `${name(t.turn)} rolled ${t.dice[0] + t.dice[1]}`;
  return `${name(t.turn)} ${name(t.turn) === 'You' ? 'go' : 'goes'} first`;
}

/**
 * The result this phone should feel: your own bankruptcy, someone else's, an auction you won, a
 * trade you were in. Worked out from the public log only.
 */
function feltFor(
  t: MonopolyTableView,
  me: string,
  name: (id: string) => string,
): { seq: number; outcome: Outcome; title: string; detail?: string } | null {
  for (let k = t.log.length - 1; k >= 0; k--) {
    const e: LogEntry = t.log[k]!;
    if (e.kind === 'out') {
      return e.by === me
        ? { seq: e.seq, outcome: 'loss', title: "You're bankrupt" }
        : { seq: e.seq, outcome: 'reveal', title: `${name(e.by!)} is bankrupt` };
    }
    if (e.kind === 'trade' && e.text.includes('took') && e.text.includes(`{${me}}`)) {
      return { seq: e.seq, outcome: 'reveal', title: 'Trade done', detail: say(e.text, name) };
    }
  }
  return null;
}

export function Clock({ at, now }: { at: number | null; now: () => number }) {
  const left = useCountdown(at, now);
  if (left === null) return null;
  const m = Math.floor(left / 60);
  const s = String(left % 60).padStart(2, '0');
  return (
    <span className={left <= 10 ? 'mnp-clock is-low' : 'mnp-clock'} role="timer">
      {m}:{s}
    </span>
  );
}
