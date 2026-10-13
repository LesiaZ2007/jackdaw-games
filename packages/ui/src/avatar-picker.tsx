'use client';

import type { CSSProperties } from 'react';
import type { Avatar } from '@jackdaw/engine';
import { CREST_CHOICES, TINT_CHOICES } from './avatars';
import { Crest } from './crests';
import { Icon } from './icons';
import { Token } from './pieces';

const vars = (v: Record<string, string>) => v as CSSProperties;
const nice = (id: string) => id[0]!.toUpperCase() + id.slice(1);

/**
 * Choosing a crest and a colour. Crests show on the chosen colour so the pick reads as the token
 * it will become. Anything in `taken` (by another player) can't be chosen and says who has it.
 */
export function AvatarPicker({
  value,
  onChange,
  takenBy = {},
}: {
  value: Avatar;
  onChange: (avatar: Avatar) => void;
  /** Who already holds a crest or tint id, e.g. `{ raven: 'Bran', slate: 'Bran' }`. */
  takenBy?: Record<string, string>;
}) {
  return (
    <div className="jd-picker">
      <fieldset>
        <legend className="jd-label">Crest</legend>
        <div className="jd-picker__crests">
          {CREST_CHOICES.map((c) => {
            const who = c === value.crest ? undefined : takenBy[c];
            return (
              <button
                key={c}
                type="button"
                className="jd-picker__crest"
                aria-pressed={value.crest === c}
                disabled={Boolean(who)}
                aria-label={`${nice(c)}${who ? `, taken by ${who}` : ''}`}
                title={who ? `${nice(c)} (${who})` : nice(c)}
                onClick={() => onChange({ ...value, crest: c })}
                style={vars({ '--c': `var(--tint-${value.tint})` })}
              >
                <Crest id={c} />
              </button>
            );
          })}
        </div>
      </fieldset>
      <fieldset>
        <legend className="jd-label">Colour</legend>
        <div className="jd-picker__tints">
          {TINT_CHOICES.map((t) => {
            const who = t === value.tint ? undefined : takenBy[t];
            return (
              <button
                key={t}
                type="button"
                className="jd-picker__tint"
                aria-pressed={value.tint === t}
                disabled={Boolean(who)}
                aria-label={`${nice(t)}${who ? `, taken by ${who}` : ''}`}
                title={who ? `${nice(t)} (${who})` : nice(t)}
                onClick={() => onChange({ ...value, tint: t })}
                style={vars({ '--c': `var(--tint-${t})` })}
              />
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

/** A player's token that opens the avatar picker: the token with a small pencil badge. */
export function AvatarButton({
  avatar,
  size = 56,
  onClick,
  label = 'Change your crest and colour',
}: {
  avatar: Avatar;
  size?: number;
  onClick: () => void;
  label?: string;
}) {
  return (
    <button type="button" className="jd-avatar-btn" onClick={onClick} aria-label={label}>
      <Token avatar={avatar} size={size} />
      <span className="jd-avatar-btn__edit" aria-hidden="true">
        <Icon.edit />
      </span>
    </button>
  );
}

/** Who holds each crest and tint, from everyone except `me`. */
export function takenAvatars(
  players: { id: string; name: string; avatar: Avatar }[],
  me?: string | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of players) {
    if (p.id === me) continue;
    out[p.avatar.crest] = p.name;
    out[p.avatar.tint] = p.name;
  }
  return out;
}
