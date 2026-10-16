'use client';

import type { Reaction } from '@jackdaw/engine';
import { PlayerReaction, Token, useTheme, type ScreenPlayer } from '@jackdaw/ui';
import type { ReactNode } from 'react';
import { HITLER_ZONE, VETO_AT, type Policy, type Role } from '../lineup';
import { POWER_LABEL, lastVoted } from '../moments';
import { roleName, type ShTableView } from '../rules';
import { BALLOT, PolicyEmblem, PowerIcon, RoleEmblem } from './art';
import './sh.css';
import './status.css';

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');

/** Secret Hitler's own surface: day is the printed card stock, dark is its noir look. */
export function ShFrame({ children, className }: { children: ReactNode; className?: string }) {
  const look = useTheme();
  return (
    <div className={cx('sh', className)} data-noir={look === 'dark' ? '' : undefined}>
      {children}
    </div>
  );
}

export const nameFrom = (players: ScreenPlayer[]) => {
  const names = new Map(players.map((p) => [p.id, p.name]));
  return (id: string) => names.get(id) ?? 'Someone';
};

/** A policy tile: a small printed card with the side's emblem. */
export function PolicyCard({
  policy,
  size = 'md',
  className,
}: {
  policy: Policy;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  return (
    <span className={cx('sh-policy', `sh-policy--${policy}`, `sh-policy--${size}`, className)}>
      <PolicyEmblem policy={policy} size={size === 'lg' ? 52 : size === 'md' ? 32 : 20} />
      <span className="sh-policy__name">{policy === 'liberal' ? 'Liberal' : 'Fascist'}</span>
    </span>
  );
}

/** Both policy tracks and the election tracker. */
export function Tracks({ t, tv = false }: { t: ShTableView; tv?: boolean }) {
  return (
    <section className={cx('sh-tracks', tv && 'sh-tracks--tv')} aria-label="Policy tracks">
      <div className="sh-track sh-track--liberal">
        <h3 className="sh-track__title">
          Liberal <span>{t.liberal} of 5</span>
        </h3>
        <ol className="sh-track__slots">
          {Array.from({ length: 5 }, (_, i) => (
            <li key={i} className={cx('sh-slot', i < t.liberal && 'is-filled')}>
              {i < t.liberal ? (
                <PolicyCard policy="liberal" size={tv ? 'lg' : 'sm'} />
              ) : i === 4 ? (
                <span className="sh-slot__mark">
                  <PowerIcon power="win" size={tv ? 34 : 20} />
                  <small>Liberals win</small>
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
      <div className="sh-track sh-track--fascist">
        <h3 className="sh-track__title">
          Fascist <span>{t.fascist} of 6</span>
        </h3>
        <ol className="sh-track__slots">
          {Array.from({ length: 6 }, (_, i) => {
            const power = t.board[i];
            return (
              <li
                key={i}
                className={cx(
                  'sh-slot',
                  i < t.fascist && 'is-filled',
                  i >= HITLER_ZONE && 'is-danger',
                )}
              >
                {i < t.fascist ? (
                  <PolicyCard policy="fascist" size={tv ? 'lg' : 'sm'} />
                ) : i === 5 ? (
                  <span className="sh-slot__mark">
                    <PowerIcon power="win" size={tv ? 34 : 20} />
                    <small>Fascists win</small>
                  </span>
                ) : power ? (
                  <span className="sh-slot__mark" title={POWER_LABEL[power]}>
                    <PowerIcon power={power} size={tv ? 34 : 20} />
                    <small>{POWER_LABEL[power]}</small>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
        <p className="sh-track__note">
          {t.fascist >= HITLER_ZONE
            ? 'Hitler zone: electing Hitler chancellor wins for the Fascists.'
            : 'From the third Fascist policy, electing Hitler chancellor wins for the Fascists.'}
          {t.fascist >= VETO_AT ? ' Veto is unlocked.' : ''}
        </p>
      </div>
      <div className="sh-tracker" aria-label={`Election tracker: ${t.tracker} of 3`}>
        <span className="sh-tracker__label">Failed elections</span>
        <ol>
          {[0, 1, 2].map((i) => (
            <li key={i} className={i < t.tracker ? 'is-on' : undefined} />
          ))}
        </ol>
      </div>
    </section>
  );
}

/** A pile of face-down policies with its count: the draw deck or the discards. */
function Pile({ label, count, tv }: { label: string; count: number; tv: boolean }) {
  return (
    <div className={cx('sh-pile', tv && 'sh-pile--tv')} aria-label={`${label}: ${count}`}>
      <span className="sh-pile__stack" aria-hidden="true">
        <span />
        <span />
        <span className="sh-pile__count">{count}</span>
      </span>
      <span className="sh-pile__label">{label}</span>
    </div>
  );
}

/** The board as on the printed game: draw pile, the two tracks and the tracker, discard pile. */
export function Board({ t, tv = false }: { t: ShTableView; tv?: boolean }) {
  return (
    <section className={cx('sh-board', tv && 'sh-board--tv')} aria-label="The board">
      <Pile label="Draw" count={t.deckCount} tv={tv} />
      <Tracks t={t} tv={tv} />
      <Pile label="Discard" count={t.discardCount} tv={tv} />
    </section>
  );
}

/** A small turning hourglass: the game is waiting on this player. */
export function Hourglass({ size = 18 }: { size?: number }) {
  return (
    <svg className="sh-hourglass" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d="M6 3h12M6 21h12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path
        d="M7.5 3.5c0 4.5 4.5 6 4.5 8.5s-4.5 4-4.5 8.5h9c0-4.5-4.5-6-4.5-8.5s4.5-4 4.5-8.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M9.5 18.5h5L12 15.5z" fill="currentColor" />
    </svg>
  );
}

/**
 * Everyone in one strip, as at the top of secret-hitler.online: portrait and name, an office
 * placard for the president and chancellor, an hourglass on exactly the players the game is
 * waiting on, their Ja or Nein once a vote is counted, roles you know, and executed players
 * greyed out. When it's your pick (nominate, investigate...), the cards you can choose are buttons.
 */
export function PlayerStrip({
  t,
  players,
  me,
  reactions,
  busy,
  known = {},
  pickable,
  selected,
  onPick,
  tv = false,
}: {
  t: ShTableView;
  players: ScreenPlayer[];
  me?: string | null;
  reactions?: Reaction[];
  busy: string[];
  /** Roles this viewer knows (their own, their team's, or everyone's once the game is over). */
  known?: Record<string, Role>;
  pickable?: string[];
  selected?: string | null;
  onPick?: (id: string) => void;
  tv?: boolean;
}) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const shown = t.phase !== 'vote' ? lastVoted(t) : undefined;
  const fresh = shown && t.governments[t.governments.length - 1]?.n === shown.n ? shown : undefined;
  const size = tv ? 76 : 40;
  return (
    <ol className={cx('sh-strip', tv && 'sh-strip--tv')} aria-label="The table">
      {t.players.map((id) => {
        const p = byId.get(id);
        const dead = t.dead.includes(id);
        const president = id === t.president && t.phase !== 'over';
        const chancellor =
          id === t.nominee && t.phase !== 'nominate' && t.phase !== 'over' && !president;
        const waiting = busy.includes(id);
        const ballot = fresh?.votes[id];
        const canPick = Boolean(onPick && pickable?.includes(id));
        const role = known[id];
        const body = (
          <>
            <span className="sh-pcard__tok">
              {p && <Token avatar={p.avatar} size={size} away={!p.online} />}
              <PlayerReaction reactions={reactions} playerId={id} name={p?.name} size={size} />
              {waiting && (
                <span className="sh-pcard__busy" title="Waiting on this player">
                  <Hourglass size={tv ? 30 : 16} />
                </span>
              )}
              {role && (
                <span className={cx('sh-pcard__role', `is-${role}`)} title={roleName(role)}>
                  <RoleEmblem role={role} size={tv ? 34 : 19} />
                </span>
              )}
            </span>
            <span className="sh-pcard__name">{id === me ? 'You' : (p?.name ?? 'Someone')}</span>
            {president && <span className="sh-office is-president">President</span>}
            {chancellor && (
              <span className="sh-office is-chancellor">
                {t.phase === 'vote' ? 'Nominee' : 'Chancellor'}
              </span>
            )}
            {!president &&
              !chancellor &&
              !dead &&
              (id === t.lastPresident || id === t.lastChancellor) && (
                <span className="sh-office is-limited">Term-limited</span>
              )}
            {ballot !== undefined && (
              <span className={cx('sh-ballot-chip', ballot ? 'is-ja' : 'is-nein')}>
                {ballot ? BALLOT.ja : BALLOT.nein}
              </span>
            )}
            {t.notHitler.includes(id) && !dead && <span className="sh-cleared">Not Hitler</span>}
            {dead && <span className="sh-dead">Executed</span>}
          </>
        );
        const label = `${p?.name ?? 'Someone'}${id === me ? ' (you)' : ''}${president ? ', president' : ''}${chancellor ? ', chancellor' : ''}${waiting ? ', the game is waiting on them' : ''}${dead ? ', executed' : ''}`;
        return (
          <li
            key={id}
            className={cx(
              'sh-pcard',
              dead && 'is-dead',
              id === me && 'is-me',
              waiting && 'is-busy',
              president && 'is-president',
              chancellor && 'is-chancellor',
              canPick && 'is-pickable',
              selected === id && 'is-selected',
            )}
          >
            {canPick ? (
              <button
                type="button"
                className="sh-pcard__body"
                aria-pressed={selected === id}
                aria-label={label}
                onClick={() => onPick!(id)}
              >
                {body}
              </button>
            ) : (
              <div className="sh-pcard__body" aria-label={label}>
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
