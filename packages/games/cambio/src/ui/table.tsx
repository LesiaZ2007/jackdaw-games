'use client';

import { useContext, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { Reaction } from '@jackdaw/engine';
import {
  Plaque,
  PlayerReaction,
  Sheet,
  Tally,
  Token,
  useCountdown,
  useMoment,
  type ScreenPlayer,
} from '@jackdaw/ui';
import { cardName, houseValue, type House } from '../cards';
import type { CambioTableView, Move } from '../rules';
import { GameCard, HouseContext } from './pieces';
import { SLOT_NAME, STAMP, around, delta, eyesOf, houseRules, moveLine, num } from './logic';

/** What to draw for one slot of one grid. */
export interface SlotShow {
  id: number | null;
  up: boolean;
  note: number | null;
}
export type SlotFn = (owner: string, slot: number) => SlotShow;
export const HIDDEN: SlotShow = { id: null, up: false, note: null };

/** Everything the table needs to be played from (a phone) as well as looked at. */
export interface Ctl {
  legal: (owner: string, slot: number) => boolean;
  picked: (owner: string, slot: number) => boolean;
  pick: (owner: string, slot: number) => void;
  /** The opponent whose four cards are open to choose from. */
  zoom: string | null;
  setZoom: (id: string | null) => void;
  onDraw?: () => void;
  onTake?: () => void;
  /** The card you hold, face up to you. */
  held?: number | null;
  discard?: { label: string; onClick: () => void } | null;
  /** A King's look: the two cards, yours and theirs. */
  look?: { mine: number | null; theirs: number | null; who: string } | null;
}

/** Where opponents sit on a phone, when you are at the bottom: x in percent, y 0 (top) to 1. */
const RECT: Record<number, [number, number][]> = {
  1: [[50, 0]],
  2: [
    [27, 0],
    [73, 0],
  ],
  3: [
    [12, 0.55],
    [50, 0],
    [88, 0.55],
  ],
  4: [
    [12, 0.7],
    [36, 0],
    [64, 0],
    [88, 0.7],
  ],
  5: [
    [11, 0.75],
    [26, 0],
    [50, 0],
    [74, 0],
    [89, 0.75],
  ],
  6: [
    [10, 1],
    [10, 0.35],
    [36, 0],
    [64, 0],
    [90, 0.35],
    [90, 1],
  ],
  7: [
    [10, 1],
    [10, 0.4],
    [30, 0],
    [50, 0],
    [70, 0],
    [90, 0.4],
    [90, 1],
  ],
};

/** Everyone in turn order round an oval, the first at the bottom, the next to their left. */
function ovalPos(k: number, n: number): CSSProperties {
  const a = (k / n) * Math.PI * 2;
  return { '--cx': (-Math.sin(a)).toFixed(3), '--sy': Math.cos(a).toFixed(3) } as CSSProperties;
}

export function TurnClock({ t, now }: { t: CambioTableView; now: () => number }) {
  const left = useCountdown(t.actBy, now);
  if (left === null || t.phase !== 'play') return null;
  return (
    <span
      className={left <= 5 ? 'cmb-clock is-low' : 'cmb-clock'}
      aria-label={`${left} seconds left`}
    >
      {left}s
    </span>
  );
}

/** The last few public moves, newest first. */
export function PlayByPlay({
  moves,
  name,
  me,
  limit,
  className,
}: {
  moves: Move[];
  name: (id: string) => string;
  me?: string | null;
  limit: number;
  className?: string;
}) {
  const shown = moves.slice(-limit).reverse();
  return (
    <ol className={`cmb-pbp ${className ?? ''}`} aria-label="What just happened" aria-live="polite">
      {shown.length === 0 && <li className="is-quiet">Nothing played yet.</li>}
      {shown.map((m, i) => (
        <li key={m.seq} className={i === 0 ? 'is-new' : undefined}>
          {moveLine(m, name, me)}
        </li>
      ))}
    </ol>
  );
}

/** A printed band that sweeps across when Cambio is called. */
export function CambioBand({ t, name }: { t: CambioTableView; name: (id: string) => string }) {
  const [fresh, dismiss] = useMoment(`${t.round}:${t.caller ?? ''}`);
  const on = fresh !== null && !!t.caller && t.phase === 'play';
  useEffect(() => {
    if (!on) return;
    const id = window.setTimeout(dismiss, 2600);
    return () => window.clearTimeout(id);
  }, [on, dismiss]);
  if (!on || !t.caller) return null;
  return (
    <div className="cmb-band" role="status" key={fresh}>
      <span className="cmb-band__word">Cambio!</span>
      <span className="cmb-band__who">{name(t.caller)}</span>
    </div>
  );
}

/**
 * The house rules that differ from the traditional game, so nobody is surprised mid-game. On a
 * phone it is a small plaque that opens a sheet; on a laptop and the TV it is a short list. Nothing
 * is drawn when the game is played the standard way.
 */
export function HouseRules({
  house,
  mode,
}: {
  house: House;
  /** `plaque`: the small button and its sheet (phones). `list`: the rules written out. */
  mode: 'plaque' | 'list' | 'tv';
}) {
  const [open, setOpen] = useState(false);
  const rules = houseRules(house);
  if (rules.length === 0) return null;
  const list = (
    <ul className="cmb-house__list">
      {rules.map((r) => (
        <li key={r}>{r}</li>
      ))}
    </ul>
  );
  if (mode === 'plaque') {
    return (
      <span className="cmb-house cmb-house--plaque">
        <Plaque small className="cmb-house__btn" onClick={() => setOpen(true)}>
          House rules
        </Plaque>
        <Sheet open={open} onClose={() => setOpen(false)} title="House rules">
          {list}
        </Sheet>
      </span>
    );
  }
  return (
    <section className={`cmb-house cmb-house--${mode}`} aria-label="House rules">
      <h3 className="jd-label">House rules</h3>
      {list}
    </section>
  );
}

/** The ranked running scores, lowest first (lowest wins). */
export function Scores({
  t,
  players,
  me,
  tv,
}: {
  t: CambioTableView;
  players: ScreenPlayer[];
  me?: string | null;
  tv?: boolean;
}) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const ranked = [...t.players].sort((a, b) => (t.scores[a] ?? 0) - (t.scores[b] ?? 0));
  const gained = t.phase === 'scoring' ? t.last?.scored : undefined;
  return (
    <section
      className={`cmb-scores${tv ? ' cmb-scores--tv' : ''}`}
      aria-label="Scores, lowest wins"
    >
      <h3 className="jd-label">Scores · lowest wins</h3>
      <ol>
        {ranked.map((id, i) => {
          const p = byId.get(id);
          return (
            <li key={id} className={id === me ? 'is-me' : undefined}>
              <span className="cmb-scores__rank">{i + 1}</span>
              {p && <Token avatar={p.avatar} away={!p.online} />}
              <span className="cmb-scores__name" title={p?.name}>
                {id === me ? 'You' : (p?.name ?? 'Someone')}
              </span>
              {gained && (
                <span className="cmb-scores__gain">
                  {t.last?.dropped?.includes(id) ? 'to 50' : delta(gained[id] ?? 0)}
                </span>
              )}
              <span className="cmb-scores__n">
                <Tally value={t.scores[id] ?? 0} />
              </span>
            </li>
          );
        })}
      </ol>
      {t.target > 0 && <p className="cmb-scores__goal">The game ends at {t.target}.</p>}
    </section>
  );
}

/**
 * Every hand, face up, with its total on a card-shaped chit. Scoring turns the cards over in a
 * quick stagger (`flip`); the results screens show them already up.
 */
export function HandsList({
  order,
  hands,
  players,
  me,
  caller,
  flip,
  size,
}: {
  order: string[];
  hands: Record<string, number[]>;
  players: ScreenPlayer[];
  me?: string | null;
  caller?: string | null;
  flip?: boolean;
  size: 'phone' | 'tv' | 'reveal';
}) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const house = useContext(HouseContext);
  const total = order.length * 4;
  return (
    <ol className={`cmb-hands cmb-hands--${size}`} data-count={order.length}>
      {order.map((id, row) => {
        const p = byId.get(id);
        const hand = hands[id] ?? [];
        const sum = hand.reduce((a, c) => a + houseValue(c, house), 0);
        const nm = id === me ? 'You' : (p?.name ?? 'Someone');
        return (
          <li
            key={id}
            className={['cmb-hand', id === me && 'is-me', id === caller && 'is-caller']
              .filter(Boolean)
              .join(' ')}
          >
            {p && <Token avatar={p.avatar} away={!p.online} />}
            <span className="cmb-hand__name" title={p?.name}>
              {nm}
              {id === caller && <small>Called</small>}
            </span>
            <span className="cmb-hand__cards">
              {hand.map((c, slot) => (
                <GameCard
                  key={slot}
                  id={c}
                  up
                  value
                  flipAfter={flip ? Math.round(((row * 4 + slot) / total) * 520) : undefined}
                  label={`${nm}, ${SLOT_NAME[slot]}: ${cardName(c)}, worth ${num(houseValue(c, house))}`}
                />
              ))}
            </span>
            <span className="cmb-chit" aria-label={`${nm} total ${sum}`}>
              {sum}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

interface TableProps {
  t: CambioTableView;
  players: ScreenPlayer[];
  /** Whose seat is at the bottom, off the felt (their grid is drawn apart). */
  me?: string;
  slots: SlotFn;
  ctl?: Ctl;
  reactions?: Reaction[];
  /** Everyone round an oval (the TV, a watcher) instead of opponents across the top. */
  oval?: boolean;
  tv?: boolean;
  children?: ReactNode;
}

/**
 * The back room: a purpure felt card table with a sable rail and a gold double rule. The other
 * players sit round it with their four cards in front of them, the stock and the discard pile
 * (and any card held) in the middle, and a rubber stamp across it while a power is used.
 */
export function CambioTable({
  t,
  players,
  me,
  slots,
  ctl,
  reactions,
  oval,
  tv,
  children,
}: TableProps) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  const seats = oval ? around(t.players) : around(t.players, me).filter((id) => id !== me);
  const k = seats.length;
  const eyes = eyesOf(t);
  const holder = t.holding ? t.toAct : null;
  const heldFace = holder === me ? (ctl?.held ?? null) : (t.holding?.card ?? null);
  const kind = t.phase === 'play' ? t.power?.kind : undefined;
  const zoomed = ctl?.zoom && seats.includes(ctl.zoom) ? ctl.zoom : null;

  return (
    <div
      className={`cmb-felt${oval ? ' cmb-felt--oval' : ''}${tv ? ' cmb-felt--tv' : ''}`}
      data-count={k <= 3 ? 3 : k <= 5 ? 5 : 7}
      data-n={oval ? 8 : k}
    >
      <div className="cmb-ring">
        {seats.map((id, i) => {
          const pos = oval
            ? ovalPos(i, k)
            : ({
                '--x': `${RECT[Math.min(Math.max(k, 1), 7)]![i]![0]}%`,
                '--y': RECT[Math.min(Math.max(k, 1), 7)]![i]![1],
              } as CSSProperties);
          const p = byId.get(id);
          const called = t.caller === id;
          const turn = t.phase === 'play' && t.toAct === id;
          const lastTurn = !!t.caller && !called && t.turnsLeft.includes(id);
          const nm = name(id);
          const open = ctl && [0, 1, 2, 3].some((s) => ctl.legal(id, s));
          const grid = (
            <span className="cmb-seat__grid">
              {[0, 1, 2, 3].map((slot) => {
                const s = slots(id, slot);
                const eye = eyes.get(`${id}:${slot}`);
                return (
                  <GameCard
                    key={slot}
                    id={s.id}
                    up={s.up}
                    note={s.note}
                    lock={called}
                    eye={eye ? `${name(eye)} looked at this card` : undefined}
                    picked={ctl?.picked(id, slot)}
                    slotKey={`${id}:${slot}`}
                  />
                );
              })}
              {called && <span className="cmb-ribbon">Cambio</span>}
            </span>
          );
          return (
            <div
              key={id}
              role="group"
              aria-label={`${nm}${called ? ', called Cambio' : ''}${lastTurn ? ', last turn' : ''}${turn ? ', to play' : ''}`}
              className={['cmb-seat', turn && 'is-turn', called && 'is-called', open && 'is-target']
                .filter(Boolean)
                .join(' ')}
              style={pos}
            >
              {open ? (
                <button
                  type="button"
                  className="cmb-seat__open"
                  aria-label={`Choose one of ${nm}’s cards`}
                  onClick={() => ctl.setZoom(id)}
                >
                  {grid}
                </button>
              ) : (
                grid
              )}
              <span className="cmb-seat__plate">
                {p && <Token avatar={p.avatar} away={!p.online} />}
                <span className="cmb-seat__name" title={nm}>
                  {nm}
                </span>
              </span>
              {lastTurn && <span className="cmb-chip cmb-chip--last">Last turn</span>}
              {t.phase === 'peek' && (
                <span className={`cmb-chip${t.ready.includes(id) ? ' cmb-chip--ok' : ''}`}>
                  {t.ready.includes(id) ? 'Ready' : 'Looking'}
                </span>
              )}
              <PlayerReaction reactions={reactions} playerId={id} name={nm} />
            </div>
          );
        })}
      </div>

      <div className="cmb-mid">
        <div className="cmb-piles">
          {(() => {
            const n = t.stockCount;
            const canDraw = !!ctl?.onDraw;
            const stack = (
              <>
                <GameCard className="cmb-pile__under cmb-pile__under--2" />
                <GameCard className="cmb-pile__under cmb-pile__under--1" />
                <GameCard />
                <span className="cmb-chit cmb-chit--stock" aria-hidden="true">
                  {n}
                </span>
              </>
            );
            return (
              <div className="cmb-pile cmb-pile--stock">
                {canDraw ? (
                  <button
                    type="button"
                    className="cmb-pile__btn is-live"
                    onClick={ctl.onDraw}
                    aria-label="Draw from the stock"
                  >
                    {stack}
                  </button>
                ) : (
                  <span className="cmb-pile__btn" role="img" aria-label={`The stock, ${n} cards`}>
                    {stack}
                  </span>
                )}
                <span className="cmb-pile__cap">{canDraw ? 'Draw' : 'Stock'}</span>
              </div>
            );
          })()}

          {ctl?.look ? (
            <div className="cmb-look" role="group" aria-label="The two cards you looked at">
              <span>
                <GameCard
                  id={ctl.look.mine}
                  up
                  label={`Yours: ${ctl.look.mine !== null ? cardName(ctl.look.mine) : 'unknown'}`}
                />
                <small>Yours</small>
              </span>
              <span>
                <GameCard
                  id={ctl.look.theirs}
                  up
                  label={`${ctl.look.who}’s: ${ctl.look.theirs !== null ? cardName(ctl.look.theirs) : 'unknown'}`}
                />
                <small>{ctl.look.who}</small>
              </span>
            </div>
          ) : (
            t.holding && (
              <div className="cmb-held">
                <GameCard
                  id={heldFace}
                  up={heldFace !== null}
                  className="cmb-held__card"
                  label={
                    heldFace !== null
                      ? `${holder === me ? 'You hold' : `${name(holder ?? '')} holds`} the ${cardName(heldFace)}`
                      : `${name(holder ?? '')} holds a face-down card`
                  }
                />
                {ctl?.discard && (
                  <Plaque go className="cmb-held__discard" onClick={ctl.discard.onClick}>
                    {ctl.discard.label}
                  </Plaque>
                )}
              </div>
            )
          )}

          <div className="cmb-pile cmb-pile--discard">
            {(() => {
              const top = t.top;
              if (top === null)
                return (
                  <span
                    className="cmb-pile__btn cmb-pile__empty"
                    aria-label="Discard pile, empty"
                    role="img"
                  />
                );
              const face = <GameCard id={top} up className="cmb-pile__top" />;
              return ctl?.onTake ? (
                <button
                  type="button"
                  className="cmb-pile__btn is-live"
                  onClick={ctl.onTake}
                  aria-label={`Take the ${cardName(top)}`}
                >
                  {face}
                </button>
              ) : (
                <span
                  className="cmb-pile__btn"
                  role="img"
                  aria-label={`On the discard pile: the ${cardName(top)}`}
                >
                  {face}
                </span>
              );
            })()}
            <span className="cmb-pile__cap">{ctl?.onTake ? 'Take' : 'Discard'}</span>
          </div>
        </div>
        {kind && (
          <span className="cmb-stamp" key={`${t.turns}-${kind}`} aria-hidden="true">
            {STAMP[kind]}
          </span>
        )}
        {children}
      </div>

      {zoomed && ctl && (
        <div className="cmb-zoom" role="dialog" aria-label={`${name(zoomed)}’s cards`}>
          <p>{name(zoomed)}’s cards</p>
          <span className="cmb-zoom__grid">
            {[0, 1, 2, 3].map((slot) => {
              const s = slots(zoomed, slot);
              const ok = ctl.legal(zoomed, slot);
              const label = `${name(zoomed)}’s card, ${SLOT_NAME[slot]}: ${s.id !== null && s.up ? cardName(s.id) : 'face down'}`;
              return (
                <GameCard
                  key={slot}
                  id={s.id}
                  up={s.up}
                  note={s.note}
                  can={ok}
                  picked={ctl.picked(zoomed, slot)}
                  disabled={!ok}
                  onClick={() => {
                    ctl.pick(zoomed, slot);
                    ctl.setZoom(null);
                  }}
                  label={label}
                />
              );
            })}
          </span>
          <Plaque small onClick={() => ctl.setZoom(null)}>
            Close
          </Plaque>
        </div>
      )}
    </div>
  );
}
