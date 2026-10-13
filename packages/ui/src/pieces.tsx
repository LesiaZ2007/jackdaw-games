'use client';

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import type { Reaction } from '@jackdaw/engine';
import { Crest } from './crests';
import { Glyph, Icon } from './icons';
import { PlayerReaction } from './reactions';

/** Heraldic fills for chits and box lids, as CSS variable names from tokens.css. */
export type Heraldic = 'gules' | 'azure' | 'vert' | 'sable' | 'purpure' | 'tenne';
/** Field patterns behind a game's emblem (kit.css `.jd-field-*`). */
export type Field = 'wavy' | 'lozengy' | 'checky' | 'semee' | 'fretty' | 'paly' | 'bendy';

/** How a game looks on its box lid. Each game's UI module provides one. */
export interface GameArt {
  band: Heraldic;
  field: Field;
  glyph: string;
}

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');
const vars = (v: Record<string, string | number>) => v as CSSProperties;

/** A printed panel with a double rule and fleuron corners. */
export function Lid({
  children,
  className,
  corners = true,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  corners?: boolean;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cx('jd-lid', className)} {...rest}>
      {corners && (
        <>
          <Icon.fleuron className="jd-corner tl" />
          <Icon.fleuron className="jd-corner tr" />
          <Icon.fleuron className="jd-corner bl" />
          <Icon.fleuron className="jd-corner br" />
        </>
      )}
      {children}
    </section>
  );
}

type PlaqueProps = ButtonHTMLAttributes<HTMLButtonElement> & { go?: boolean; small?: boolean };

/** A button: condensed caps on a double-ruled plate. `go` is the one primary action. */
export function Plaque({ go, small, className, type = 'button', ...rest }: PlaqueProps) {
  return (
    <button
      type={type}
      className={cx('jd-plaque', go && 'jd-plaque--go', small && 'jd-plaque--small', className)}
      {...rest}
    />
  );
}

const CHIT_FILLS: Heraldic[] = ['gules', 'azure', 'vert', 'sable'];

/** A lobby code as printed chits. `size` is the chit width in px. */
export function Chits({
  code,
  size = 44,
  flip,
  label = 'Lobby code',
}: {
  code: string;
  size?: number;
  flip?: boolean;
  label?: string;
}) {
  return (
    <span
      className={cx('jd-chits', flip && 'jd-chits--flip')}
      role="img"
      aria-label={`${label} ${code.split('').join(' ')}`}
      style={vars({ '--t': `${size}px`, '--chit-gap': `${Math.max(3, size * 0.12)}px` })}
    >
      {code.split('').map((ch, i) => (
        <span
          key={i}
          className="jd-chit"
          aria-hidden="true"
          style={vars({ '--t': `${size}px`, '--fill': `var(--${CHIT_FILLS[i % 4]})` })}
        >
          {ch}
        </span>
      ))}
    </span>
  );
}

/**
 * Code entry drawn as blank chits, backed by a real text input laid over them (so keyboards,
 * paste and autofill all work).
 */
export function CodeInput({
  value,
  onChange,
  length = 4,
  size = 50,
  id,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  /** Chit width: px, or any CSS length such as "min(84px, 18vw)". */
  size?: number | string;
  id?: string;
  onEnter?: () => void;
}) {
  const t = typeof size === 'number' ? `${size}px` : size;
  const letters = value.toUpperCase().slice(0, length).split('');
  return (
    <span className="jd-code-entry">
      <input
        id={id}
        value={value}
        onChange={(e) =>
          onChange(
            e.target.value
              .replace(/[^a-z]/gi, '')
              .toUpperCase()
              .slice(0, length),
          )
        }
        onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        inputMode="text"
        aria-label="Lobby code"
        maxLength={length}
      />
      <span className="jd-chits" aria-hidden="true" style={vars({ '--t': t })}>
        {Array.from({ length }, (_, i) => {
          const ch = letters[i];
          return (
            <span
              key={i}
              className={cx(
                'jd-chit',
                ch ? 'jd-chit--blank' : 'jd-chit--slot',
                i === letters.length && 'jd-chit--next',
              )}
              style={vars({ '--t': t })}
            >
              {ch ?? ''}
            </span>
          );
        })}
      </span>
    </span>
  );
}

export interface TokenProps {
  avatar: { crest: string; tint: string };
  /** Diameter in px. Leave it out to let CSS size the token (e.g. on the seat track). */
  size?: number;
  host?: boolean;
  away?: boolean;
  title?: string;
}

/** A player: a punch-out token in their tint with their crest. */
export function Token({ avatar, size, host, away, title }: TokenProps) {
  return (
    <span
      className={cx('jd-token', away && 'jd-token--away')}
      title={title}
      style={vars({
        ...(size ? { '--z': `${size}px` } : {}),
        '--c': `var(--tint-${avatar.tint}, var(--sable))`,
      })}
    >
      <Crest id={avatar.crest} />
      {host && (
        <span className="jd-host" aria-label="Host">
          <Icon.host />
        </span>
      )}
    </span>
  );
}

export interface Seat {
  id: string;
  name: string;
  avatar: { crest: string; tint: string };
  host?: boolean;
  away?: boolean;
  /** This device's own seat: framed and marked "You". */
  me?: boolean;
  /** Animate this token being placed (the newest arrival). */
  landing?: boolean;
  /** What tapping this seat does, e.g. "Remove Bran". With `onSeat`, the seat becomes a button. */
  action?: string;
}

/**
 * The seat track: numbered printed spaces, filled with tokens in seat order. Tokens and names
 * grow with the track's width (it is a size container), unless `tokenSize` fixes them.
 */
export function SeatTrack({
  seats,
  spaces = 15,
  cols = 5,
  tokenSize,
  className,
  onSeat,
  reactions,
}: {
  seats: Seat[];
  spaces?: number;
  cols?: number;
  tokenSize?: number;
  className?: string;
  /** Called with a seat's player id when a seat that has an `action` is tapped. */
  onSeat?: (id: string) => void;
  /** Recent reactions; each pops up over its player's seat. */
  reactions?: Reaction[];
}) {
  return (
    <ol
      className={cx('jd-track', className)}
      style={vars({
        '--cols': cols,
        ...(tokenSize ? { '--seat-z': `${tokenSize}px` } : {}),
        listStyle: 'none',
        margin: 0,
        padding: 0,
      })}
      aria-label={`${seats.length} of ${spaces} seats taken`}
    >
      {Array.from({ length: spaces }, (_, i) => {
        const seat = seats[i];
        if (!seat) {
          return (
            <li
              key={`free-${i}`}
              className="jd-space jd-space--free"
              aria-label={`Seat ${i + 1}, open`}
            >
              <span className="jd-n">{i + 1}</span>
            </li>
          );
        }
        return (
          <li
            key={seat.id}
            className={cx(
              'jd-space',
              seat.landing && 'jd-space--landing',
              seat.me && 'jd-space--me',
              onSeat && seat.action && 'jd-space--tap',
            )}
            aria-label={`Seat ${i + 1}, ${seat.name}${seat.me ? ' (you)' : ''}${seat.host ? ', host' : ''}${seat.away ? ', away' : ''}`}
          >
            <span className="jd-n" aria-hidden="true">
              {i + 1}
            </span>
            {seat.me && (
              <span className="jd-you" aria-hidden="true">
                You
              </span>
            )}
            <Token avatar={seat.avatar} host={seat.host} away={seat.away} />
            <span className="jd-who">{seat.name}</span>
            <PlayerReaction reactions={reactions} playerId={seat.id} name={seat.name} />
            {onSeat && seat.action && (
              <button
                type="button"
                className="jd-space__tap"
                aria-label={seat.action}
                onClick={() => onSeat(seat.id)}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export interface BoxLidProps {
  name: string;
  art: GameArt;
  players: [number, number];
  minutes: [number, number];
  tagline?: string;
  /** Why it can't be played right now, e.g. "Needs 5 to 15 players". Greys the lid. */
  unfit?: string | null;
  selected?: boolean;
  onClick?: () => void;
  artWidth?: number;
}

const range = ([a, b]: [number, number]) => (a === b ? `${a}` : `${a}–${b}`);

/** A game, drawn as a box lid: a heraldic field behind its emblem, then name and box-side facts. */
export function BoxLid({
  name,
  art,
  players,
  minutes,
  tagline,
  unfit,
  selected,
  onClick,
  artWidth,
}: BoxLidProps) {
  return (
    <button
      type="button"
      className={cx('jd-box', unfit && 'jd-box--unfit', selected && 'jd-box--selected')}
      onClick={onClick}
      aria-pressed={selected}
      style={vars({
        ...(artWidth ? { '--art': `${artWidth}px`, '--art-h': `${artWidth + 8}px` } : {}),
      })}
    >
      <span
        className={`jd-box__art jd-field-${art.field}`}
        style={vars({ '--band': `var(--${art.band})` })}
      >
        <span className="jd-box__dev">
          <Glyph id={art.glyph} />
        </span>
      </span>
      <span className="jd-box__body">
        <span className="jd-box__name">{name}</span>
        {unfit ? (
          <span className="jd-box__why">{unfit}</span>
        ) : (
          <>
            <span className="jd-box__side">
              <span>
                <Icon.people />
                {range(players)}
              </span>
              <span>
                <Icon.clock />
                {range(minutes)} min
              </span>
            </span>
            {tagline && <span className="jd-box__tag">{tagline}</span>}
          </>
        )}
      </span>
    </button>
  );
}
