'use client';

import type { Reaction } from '@jackdaw/engine';
import { PlayerReaction, Token, useTheme, type ScreenPlayer } from '@jackdaw/ui';
import type { ReactNode } from 'react';
import { HITLER_ZONE, VETO_AT, type Policy } from '../lineup';
import { POWER_LABEL, lastVoted } from '../moments';
import type { ShTableView } from '../rules';
import { BALLOT, PolicyEmblem, PowerIcon } from './art';
import './sh.css';

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
                <PolicyCard policy="liberal" size={tv ? 'md' : 'sm'} />
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
                  <PolicyCard policy="fascist" size={tv ? 'md' : 'sm'} />
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
        <span className="sh-tracker__piles">
          <span>Deck {t.deckCount}</span>
          <span>Discard {t.discardCount}</span>
        </span>
      </div>
    </section>
  );
}

/**
 * The players as name placards around the table: who is president and chancellor, who has voted
 * (not how) during a vote, and everyone's Ja or Nein once the vote is counted.
 */
export function Placards({
  t,
  players,
  me,
  reactions,
  onPick,
  pickable,
  tv = false,
}: {
  t: ShTableView;
  players: ScreenPlayer[];
  me?: string | null;
  reactions?: Reaction[];
  /** Tap a placard to choose that player (nominate, investigate, execute...). */
  onPick?: (id: string) => void;
  pickable?: string[];
  tv?: boolean;
}) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const shown = t.phase !== 'vote' ? lastVoted(t) : undefined;
  // Only the vote that just happened shows its ballots, until the next one starts.
  const fresh = shown && t.governments[t.governments.length - 1]?.n === shown.n ? shown : undefined;
  return (
    <ol className={cx('sh-placards', tv && 'sh-placards--tv')} aria-label="The table">
      {t.players.map((id) => {
        const p = byId.get(id);
        const dead = t.dead.includes(id);
        const president = id === t.president && t.phase !== 'over';
        const chancellor = id === t.nominee && t.phase !== 'nominate' && t.phase !== 'over';
        const ballot = fresh?.votes[id];
        const canPick = Boolean(onPick && pickable?.includes(id));
        const body = (
          <>
            <span className="sh-placard__tok">
              {p && <Token avatar={p.avatar} size={tv ? 64 : 38} away={!p.online} />}
              <PlayerReaction
                reactions={reactions}
                playerId={id}
                name={p?.name}
                size={tv ? 64 : 38}
              />
            </span>
            <span className="sh-placard__name">
              {p?.name ?? 'Someone'}
              {id === me && <small> (you)</small>}
            </span>
            {(president || chancellor) && (
              <span className={cx('sh-office', president ? 'is-president' : 'is-chancellor')}>
                {president ? 'President' : t.phase === 'vote' ? 'Nominee' : 'Chancellor'}
              </span>
            )}
            {!president && !chancellor && (id === t.lastPresident || id === t.lastChancellor) && (
              <span className="sh-office is-limited">Term-limited</span>
            )}
            {t.phase === 'vote' && !dead && (
              <span className={cx('sh-voted', t.voted.includes(id) && 'is-in')}>
                {t.voted.includes(id) ? 'Voted' : 'Thinking'}
              </span>
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
        return (
          <li
            key={id}
            className={cx(
              'sh-placard',
              dead && 'is-dead',
              id === me && 'is-me',
              president && 'is-president',
              chancellor && 'is-chancellor',
            )}
          >
            {canPick ? (
              <button type="button" className="sh-placard__pick" onClick={() => onPick!(id)}>
                {body}
              </button>
            ) : (
              <div className="sh-placard__body">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
