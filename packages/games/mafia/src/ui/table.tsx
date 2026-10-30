'use client';

import type { CSSProperties, ReactNode } from 'react';
import type { Reaction } from '@jackdaw/engine';
import { PlayerReaction, Token, useCountdown, type ScreenPlayer } from '@jackdaw/ui';
import { ROLE_INFO, type Mode, type Role } from '../roles';
import type { MafiaTableView, PublicDeath } from '../rules';
import { Moon, RoleMark, Skyline, Village } from './art';
import { edition, isNight, MASTHEAD, MASTHEAD_SHORT } from './words';

const cx = (...n: (string | false | null | undefined)[]) => n.filter(Boolean).join(' ');

/** The page's root classes: the setting, and night when it's night. */
export function rootClass(t: { mode: Mode }, night: boolean, extra: string) {
  return cx('mf', `mf--${t.mode === 'Mafia' ? 'city' : 'village'}`, night && 'is-night', extra);
}

/** Counts down a deadline as m:ss. */
export function Clock({ at, now }: { at: number | null; now: () => number }) {
  const left = useCountdown(at, now);
  if (left === null) return null;
  const m = Math.floor(left / 60);
  const s = String(left % 60).padStart(2, '0');
  return (
    <span className={left <= 10 ? 'mf-clock is-low' : 'mf-clock'} role="timer">
      {m}:{s}
    </span>
  );
}

/** The paper's top: the masthead, the edition and the clock, with room for a button. */
export function Masthead({
  t,
  now,
  short,
  children,
}: {
  t: MafiaTableView;
  now: () => number;
  /** A phone: the short name. */
  short?: boolean;
  children?: ReactNode;
}) {
  return (
    <header className="mf-mast">
      <span className="mf-mast__ed">{edition(t)}</span>
      <h1 className="mf-mast__name">{(short ? MASTHEAD_SHORT : MASTHEAD)[t.mode]}</h1>
      <span className="mf-mast__side">
        <Clock at={t.deadline} now={now} />
        {children}
      </span>
    </header>
  );
}

/** The skyline (or the village and its moon) along the foot of the page. */
export function Scenery({ t, repeat = 1 }: { t: MafiaTableView; repeat?: number }) {
  const Art = t.mode === 'Mafia' ? Skyline : Village;
  return (
    <div className="mf-scene" aria-hidden="true">
      {Array.from({ length: repeat }, (_, i) => (
        <Art key={i} className="mf-scene__sky" />
      ))}
      {t.mode === 'Werewolf' && isNight(t) && <Moon night={t.night} className="mf-scene__moon" />}
    </div>
  );
}

export interface PlacardInfo {
  id: string;
  dead?: PublicDeath | { cause: string; role: Role | null };
  /** A card you know (your pack, a check, everyone's once you're dead). */
  role?: Role | null;
  /** Small printed tags: "Your pick", "Rook's pick", "Voted", "2 votes". */
  tags?: string[];
  picked?: boolean;
  /** Ready: seen their card, ready to vote, or voted. A green seal over the token. */
  ok?: boolean;
  /** The pick of a teammate (the pack sees each other's). */
  marked?: boolean;
  /** Who picked this player (the pack's picks): shown as their small tokens. */
  by?: string[];
  lover?: boolean;
}

/**
 * Everyone at the table as printed placards: a mugshot board in the city, a cottage door in the
 * village. The dead get a stamp. Tappable when `onTap` is given and the player is a target.
 */
export function Placards({
  t,
  players,
  me,
  info,
  targets,
  onTap,
  reactions,
  size = 'phone',
  fresh = [],
}: {
  t: MafiaTableView;
  players: ScreenPlayer[];
  me: string | null;
  info: (id: string) => PlacardInfo;
  targets?: string[];
  onTap?: (id: string) => void;
  reactions?: Reaction[];
  size?: 'phone' | 'tv';
  /** The newly dead: their stamp slams down (or their tombstone rises). */
  fresh?: string[];
}) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const n = t.players.length;
  // Columns for a narrow phone, and for anything wider: rows follow, so the grid fills its box.
  const cols = size === 'tv' ? (n <= 8 ? 4 : 5) : n <= 9 ? 3 : n <= 12 ? 4 : 5;
  const wide = n <= 8 ? 4 : 5;
  const grid = {
    '--cols': cols,
    '--rows': Math.ceil(n / cols),
    '--cols-w': wide,
    '--rows-w': Math.ceil(n / wide),
  } as CSSProperties;
  // On the TV tokens have a set size; on phones and laptops mafia.css sizes them to the screen.
  const tok = size === 'tv' ? (n > 10 ? 76 : 96) : undefined;
  return (
    <ol
      className={cx('mf-cards', size === 'tv' && 'mf-cards--tv', n > 9 && 'mf-cards--many')}
      style={grid}
    >
      {t.players.map((id, i) => {
        const p = byId.get(id);
        const x = info(id);
        const can = !!onTap && !!targets?.includes(id);
        const role = x.dead?.role ?? x.role ?? null;
        const name = p?.name ?? 'Someone';
        const body = (
          <>
            <span className="mf-card__no">{t.mode === 'Mafia' ? `No. ${i + 1}` : i + 1}</span>
            <span className="mf-card__tok">
              {/* No "away" greying in play: phones are put down and locked all night as the game
                  asks, so presence comes and goes and tokens would flicker; the timers keep it moving. */}
              {p && <Token avatar={p.avatar} size={tok} />}
              <PlayerReaction reactions={reactions ?? []} playerId={id} name={name} />
              {x.ok && !x.dead && (
                <span className="mf-card__ok" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                </span>
              )}
            </span>
            <span className="mf-card__name">
              {name}
              {id === me && <span className="mf-card__you"> (you)</span>}
            </span>
            {role && (
              <span className="mf-card__role">
                <RoleMark role={role} size="1.2em" />
                {ROLE_INFO[role].name}
              </span>
            )}
            {x.lover && (
              <span className="mf-card__heart" aria-label="lover">
                ♥
              </span>
            )}
            {x.by && x.by.length > 0 && (
              <span className="mf-card__by">
                {x.by.map((who) => {
                  const q = byId.get(who);
                  return q ? (
                    <Token key={who} avatar={q.avatar} size={size === 'tv' ? 40 : 22} />
                  ) : null;
                })}
              </span>
            )}
            {x.tags && x.tags.length > 0 && (
              <span className="mf-card__tags">
                {x.tags.map((tag) => (
                  <span key={tag} className="mf-tag">
                    {tag}
                  </span>
                ))}
              </span>
            )}
            {x.dead && (
              <span className="mf-card__stamp" aria-hidden="true">
                {t.mode === 'Mafia' ? 'Dead' : 'R.I.P.'}
              </span>
            )}
          </>
        );
        const cls = cx(
          'mf-card',
          x.dead && 'is-dead',
          fresh.includes(id) && 'is-fresh',
          x.picked && 'is-picked',
          x.ok && !x.dead && 'is-ok',
          x.marked && 'is-marked',
          id === me && 'is-me',
          can && 'is-target',
        );
        const label = `${name}${id === me ? ' (you)' : ''}${x.dead ? ', dead' : ''}${role ? `, ${ROLE_INFO[role].name}` : ''}${x.ok && !x.dead ? ', ready' : ''}${x.by?.length ? `, picked by ${x.by.map((who) => byId.get(who)?.name ?? 'someone').join(' and ')}` : ''}${x.tags?.length ? `, ${x.tags.join(', ')}` : ''}`;
        return (
          <li key={id} className={cls}>
            {can ? (
              <button
                type="button"
                className="mf-card__in"
                aria-pressed={x.picked}
                aria-label={label}
                onClick={() => onTap!(id)}
              >
                {body}
              </button>
            ) : (
              <div className="mf-card__in" aria-label={label}>
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * How many are done, as a row of printed pips that fill in: seen their card, ready to vote,
 * voted, or (at night) chosen, never saying who. A notch marks how many the day needs.
 */
export function Pips({
  done,
  total,
  need,
  label,
}: {
  done: number;
  total: number;
  need?: number;
  label: string;
}) {
  return (
    <span className="mf-pips" role="img" aria-label={`${done} of ${total} ${label}`}>
      {Array.from({ length: total }, (_, i) => (
        <i
          key={i}
          className={cx(
            'mf-pip',
            i < done && 'is-on',
            need !== undefined && i === need - 1 && 'is-need',
            need !== undefined && i >= need && 'is-extra',
          )}
        />
      ))}
      <b className="mf-pips__n">
        {done}/{need ?? total}
      </b>
    </span>
  );
}

/** What the progress row counts at this step, if anything. */
export function progressOf(
  t: MafiaTableView,
): { done: number; total: number; need?: number; label: string } | null {
  switch (t.phase) {
    case 'deal':
      return { done: t.ready.length, total: t.players.length, label: 'have seen their card' };
    case 'night':
      return { done: t.nightDone, total: t.alive.length, label: 'have chosen' };
    case 'day':
      return {
        done: t.ready.length,
        total: t.alive.length,
        need: t.readyNeed,
        label: 'ready to vote',
      };
    case 'vote':
      return { done: t.voted.length, total: t.alive.length, label: 'have voted' };
    default:
      return null;
  }
}

/** The deck, as counts: everyone knows what's in it, never who has what. */
export function CastList({ cast, className }: { cast: [Role, number][]; className?: string }) {
  return (
    <ul className={cx('mf-castlist', className)} aria-label="In the deck">
      {cast.map(([role, n]) => (
        <li key={role} className={`mf-castlist__r mf-team-${ROLE_INFO[role].team}`}>
          <RoleMark role={role} size="1.4em" />
          <span>{n > 1 ? `${n} ${ROLE_INFO[role].plural}` : ROLE_INFO[role].name}</span>
        </li>
      ))}
    </ul>
  );
}

/** A role card, face up: its mark, its name and what it does. */
export function RoleCard({
  role,
  children,
  className,
}: {
  role: Role;
  children?: ReactNode;
  className?: string;
}) {
  const info = ROLE_INFO[role];
  return (
    <div className={cx('mf-role', `mf-team-${info.team}`, className)}>
      <span className="mf-role__kicker">{info.mode === 'Mafia' ? 'Your part' : 'Your card'}</span>
      <span className="mf-role__art">
        <RoleMark role={role} size="100%" />
      </span>
      <h2 className="mf-role__name">{info.name}</h2>
      <p className="mf-role__power">{info.power}</p>
      {children}
    </div>
  );
}
