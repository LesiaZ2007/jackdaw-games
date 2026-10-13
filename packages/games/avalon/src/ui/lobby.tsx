'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import { REACTIONS, REACTION_NAMES, type Reaction, type ReactionKind } from '@jackdaw/engine';
import {
  CREST_CHOICES,
  Crest,
  reactionOf,
  seatTransition,
  useTheme,
  type GameLobbyProps,
  type ScreenPlayer,
} from '@jackdaw/ui';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  MODES,
  OFFICIAL_MAX,
  OPTIONAL_ROLES,
  QUEST_SIZES,
  ROLE_NEEDS,
  ROLES,
  TIMER_CHOICES,
  formatSeconds,
  lineup,
  type Mode,
  type OptionalRole,
  type Role,
} from '../lineup';
import { defaultOptions, lineupSettings, optionsSchema, type AvalonOptions } from '../rules';
import { AvalonReactionIcon, Crown, RoleEmblem } from './art';
import './avalon-copied.css';
import './avalon-lobby.css';

/**
 * Avalon's lobby, as the live app draws it (components/Lobby.js, RoundTable.js, Fan.js): the
 * round table with everyone's shield, and the hand with the deal and the settings. It sits in
 * Jackdaw's frame; Start ("Deal the roles") opens the real Avalon room with the roles dealt.
 * Parchment by day, Night in the dark look.
 */

const vars = (v: Record<string, string | number>) => v as CSSProperties;

const TIMERS = {
  talk: {
    key: 'talkTimer',
    label: 'Talk timer',
    hint: 'How long the leader has to pick a team, and evil has to name Merlin.',
  },
  vote: { key: 'voteTimer', label: 'Vote timer', hint: 'How long everyone has to vote on a team.' },
} as const;

const ROLE_HINTS: Record<OptionalRole, string> = {
  merlin: 'Adds the Assassin to evil.',
  percival: 'Sees who might be Merlin. Needs Merlin.',
  morgana: 'Looks like Merlin to Percival. Needs Percival.',
  mordred: 'Hidden from Merlin. Needs Merlin.',
  oberon: 'Evil, but unknown to the other evil players.',
};

const initials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

/** A player's crest on their colour: a disc at night, a shield on parchment. */
function Avatar({ player, children }: { player: ScreenPlayer; children?: ReactNode }) {
  return (
    <span
      className="avatar has-icon"
      style={vars({
        '--tint': `var(--tint-${player.avatar.tint})`,
        // Flies here from (and back to) the player's token on Jackdaw's seat track.
        viewTransitionName: seatTransition(player.id).token,
      })}
    >
      {(CREST_CHOICES as readonly string[]).includes(player.avatar.crest) ? (
        <span className="avatar-icon">
          <Crest id={player.avatar.crest} />
        </span>
      ) : (
        initials(player.name)
      )}
      {children}
    </span>
  );
}

/** Players seated clockwise around the round table, starting at the top. */
function RoundTable({
  players,
  me,
  hostId,
  center,
  canInspect,
  inspectLabel,
  onInspect,
  reactions,
}: {
  players: ScreenPlayer[];
  me: string | null;
  hostId: string;
  center: ReactNode;
  canInspect: (id: string) => boolean;
  inspectLabel: (p: ScreenPlayer) => string;
  onInspect: (id: string) => void;
  reactions: Reaction[];
}) {
  const n = players.length;
  const radius = n <= 6 ? 37 : n <= 10 ? 39.5 : 41;
  // Bigger tables get smaller seats so 15 players still fit around the rim.
  const sizing =
    n > 12
      ? vars({ '--seat-w': '15cqw', '--avatar-w': '8.6cqw', '--avatar-min': '34px' })
      : n > 10
        ? vars({ '--seat-w': '16.5cqw', '--avatar-w': '9.4cqw', '--avatar-min': '38px' })
        : undefined;
  return (
    <div className="table-wrap" data-count={n} style={sizing}>
      <div className="table-top">
        <div className="table-center">{center}</div>
      </div>
      {players.map((p, i) => {
        const angle = (i / Math.max(n, 1)) * Math.PI * 2;
        const x = 50 + radius * Math.sin(angle);
        const y = 50 - radius * Math.cos(angle);
        const clickable = canInspect(p.id);
        const you = p.id === me;
        const reaction = reactionOf(reactions, p.id);
        return (
          <button
            key={p.id}
            type="button"
            disabled={!clickable}
            className={['seat-node', !p.online && 'is-away', you && 'is-you']
              .filter(Boolean)
              .join(' ')}
            style={vars({ left: `${x}%`, top: `${y}%`, '--i': i })}
            onClick={clickable ? () => onInspect(p.id) : undefined}
            aria-label={clickable ? inspectLabel(p) : p.name}
          >
            <Avatar player={p}>
              {p.id === hostId && (
                <span className="badge-icon badge-leader" title="Host">
                  <Crown size={20} />
                </span>
              )}
            </Avatar>
            {reaction && (
              <span
                key={reaction.id}
                className="bubble"
                role="img"
                aria-label={`${p.name}: ${REACTION_NAMES[reaction.kind as ReactionKind] ?? 'reacted'}`}
              >
                <AvalonReactionIcon kind={reaction.kind} />
              </span>
            )}
            <span className="seat-name" style={{ viewTransitionName: seatTransition(p.id).name }}>
              {p.name}
              {you && <span className="seat-you"> (you)</span>}
            </span>
            {!p.online && <span className="seat-tag tag-plain">away</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Avalon's band of six reactions under the table, with its short cool-down. */
function ReactionBar({ onReact }: { onReact: (kind: ReactionKind) => void }) {
  const [cooling, setCooling] = useState(false);
  function send(kind: ReactionKind) {
    if (cooling) return;
    setCooling(true);
    onReact(kind);
    setTimeout(() => setCooling(false), 900);
  }
  return (
    <div className="reaction-bar" role="group" aria-label="React to the table">
      {REACTIONS.map((kind) => (
        <button
          key={kind}
          type="button"
          className="reaction"
          onClick={() => send(kind)}
          disabled={cooling}
          aria-label={REACTION_NAMES[kind]}
          title={REACTION_NAMES[kind]}
        >
          <AvalonReactionIcon kind={kind} />
        </button>
      ))}
    </div>
  );
}

const shortName = (role: Role) =>
  ROLES[role].name.replace(' of Arthur', '').replace(' of Mordred', '');

/** Role cards fanned out like a hand. */
function Fan({ roles, label }: { roles: Role[]; label: string }) {
  const n = roles.length;
  // Keep the whole arc within ~44 degrees and a 14px dip, however many cards are in the hand.
  const spread = Math.min(9, 44 / Math.max(n - 1, 1));
  const half = Math.max((n - 1) / 2, 1);
  return (
    <div className="fan fan-md" role="list" aria-label={label} style={vars({ '--n': n })}>
      {roles.map((role, i) => {
        const offset = i - (n - 1) / 2;
        return (
          <div
            key={`${role}-${i}`}
            role="listitem"
            tabIndex={0}
            className={`fan-card is-${ROLES[role].team}`}
            style={vars({
              '--r': `${offset * spread}deg`,
              '--y': `${(offset / half) ** 2 * 14}px`,
              '--i': i,
            })}
          >
            <span className="fan-art">
              <RoleEmblem role={role} size={40} />
            </span>
            <span className="fan-name">{shortName(role)}</span>
          </div>
        );
      })}
    </div>
  );
}

function Setting({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="setting" title={hint}>
      <span className="setting-label">{label}</span>
      {children}
    </div>
  );
}

export function AvalonLobby({
  code,
  players,
  me,
  hostId,
  isHost,
  options: raw,
  setOptions,
  blocker,
  start,
  onSeat,
  changeGame,
  reactions,
  react,
}: GameLobbyProps) {
  const look = useTheme();
  const parsed = optionsSchema.safeParse({ ...defaultOptions(), ...raw });
  const s: AvalonOptions = parsed.success ? parsed.data : defaultOptions();
  const count = players.length;
  const needed = Math.max(0, MIN_PLAYERS - count);
  const deal = lineup(lineupSettings(s), count);
  const [busy, setBusy] = useState(false);

  const update = (patch: Partial<AvalonOptions>) => setOptions({ ...s, ...patch });
  const toggleRole = (role: OptionalRole, on: boolean) => {
    const next: Partial<AvalonOptions> = { [role]: on };
    // Turning a role off also turns off anything that depends on it.
    if (!on) {
      for (const r of OPTIONAL_ROLES) if (ROLE_NEEDS[r] === role) next[r] = false;
      if (role === 'merlin') next.morgana = false;
    }
    update(next);
  };

  async function deal_() {
    setBusy(true);
    try {
      await start();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="avalon" data-printed={look === 'light' ? '' : undefined}>
      {/* Parchment's printed ground: a faint lozenge lattice and scattered fleurs-de-lis. */}
      <div className="av-ground" aria-hidden="true">
        <span className="print-layer print-far" />
        <span className="print-layer print-near" />
      </div>
      <div className="av-stage">
        <div className="table-zone">
          <RoundTable
            players={players}
            me={me}
            hostId={hostId}
            canInspect={(id) => id === me || isHost}
            inspectLabel={(p) =>
              p.id === me
                ? `${p.name} (you): change your name, crest or colour`
                : `${p.name}: remove or make host`
            }
            onInspect={onSeat}
            center={
              <>
                <span className="center-kicker">Room</span>
                <span className="center-code">{code}</span>
                <span className="center-line">
                  {count} of {MAX_PLAYERS} seated · {needed ? `${needed} more needed` : 'ready'}
                </span>
              </>
            }
            reactions={reactions}
          />
          {me && <ReactionBar onReact={react} />}
        </div>

        <section className="hand" aria-label="Avalon lobby">
          <div className="hand-inner">
            <p className="eyebrow">Gathering at the Round Table</p>
            <h2 className="hand-title">
              {needed
                ? `Waiting for ${needed} more ${needed === 1 ? 'knight' : 'knights'}`
                : isHost
                  ? 'Ready when you are'
                  : 'Waiting for the host'}
            </h2>
            <p className="hand-text">
              {needed
                ? `Share lobby code ${code}, or show the QR code from the menu.`
                : isHost
                  ? 'Roles are dealt the moment you start, and everyone goes straight to their seat in Avalon.'
                  : 'The host will start once everyone is seated.'}
            </p>

            <Fan
              roles={[...deal.good, ...deal.evil]}
              label={`Roles dealt for ${Math.max(count, MIN_PLAYERS)} players`}
            />
            <p className="hand-text small">
              {count >= MIN_PLAYERS ? `The deal for ${count}:` : `Preview for ${MIN_PLAYERS}:`}{' '}
              <span className="good-text">{deal.good.length} loyal</span> against{' '}
              <span className="evil-text">{deal.evil.length} evil</span>.
              {deal.dropped.length > 0 &&
                ` Not enough evil seats for ${deal.dropped.map((r) => ROLES[r].name).join(' and ')} yet.`}
            </p>
            {count > OFFICIAL_MAX && (
              <p className="house-note">
                More than {OFFICIAL_MAX} players uses house rules, since the box stops at{' '}
                {OFFICIAL_MAX}: {deal.evil.length} evil, and quest teams of{' '}
                {QUEST_SIZES[count]!.join(', ')}.
              </p>
            )}

            <div className="settings" role="group" aria-label="Game settings">
              <Setting label="Roles" hint={MODES[s.mode].hint}>
                {isHost ? (
                  <select
                    className="setting-select"
                    value={s.mode}
                    onChange={(e) => update({ mode: e.target.value as Mode })}
                    aria-label="Roles"
                  >
                    {Object.entries(MODES).map(([key, m]) => (
                      <option key={key} value={key}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="setting-value">{MODES[s.mode].label}</span>
                )}
              </Setting>

              {s.mode === 'custom' && (
                <div className="setting-checks" role="group" aria-label="Roles in play">
                  {OPTIONAL_ROLES.map((role) => {
                    const needs = ROLE_NEEDS[role];
                    const blocked = Boolean(needs && !s[needs]);
                    const on = !blocked && s[role];
                    return (
                      <label
                        key={role}
                        className={`setting-check ${blocked ? 'is-blocked' : ''}`}
                        title={ROLE_HINTS[role]}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={!isHost || blocked}
                          onChange={() => toggleRole(role, !on)}
                        />
                        {role === 'merlin' ? 'Merlin & Assassin' : ROLES[role].name}
                      </label>
                    );
                  })}
                </div>
              )}

              <Setting
                label="Lady of the Lake"
                hint="After quests 2, 3 and 4, the holder secretly learns one player's loyalty. Best with 7+ players."
              >
                {isHost ? (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={s.lady}
                    aria-label="Lady of the Lake"
                    className="setting-switch"
                    onClick={() => update({ lady: !s.lady })}
                  >
                    <span className="setting-switch-knob" aria-hidden="true" />
                    {s.lady ? 'On' : 'Off'}
                  </button>
                ) : (
                  <span className="setting-value">{s.lady ? 'On' : 'Off'}</span>
                )}
              </Setting>

              {(['talk', 'vote'] as const).map((which) => {
                const t = TIMERS[which];
                const value = s[t.key];
                return (
                  <Setting key={which} label={t.label} hint={t.hint}>
                    {isHost ? (
                      <select
                        className="setting-select"
                        value={value}
                        onChange={(e) => update({ [t.key]: Number(e.target.value) })}
                        aria-label={t.label}
                      >
                        {TIMER_CHOICES[which].map((secs) => (
                          <option key={secs} value={secs}>
                            {secs ? formatSeconds(secs) : 'Off'}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="setting-value">{value ? formatSeconds(value) : 'Off'}</span>
                    )}
                  </Setting>
                );
              })}

              <Setting
                label="Look"
                hint="Avalon follows Jackdaw's day and dark looks: Parchment by day, Night in the dark."
              >
                <span className="setting-value">{look === 'dark' ? 'Night' : 'Parchment'}</span>
              </Setting>
            </div>
            {(s.talkTimer > 0 || s.voteTimer > 0) && (
              <p className="hand-text small">
                When a timer runs out, the table sees it and the players being waited on get a buzz.
                Nothing is played for them.
              </p>
            )}
            {!isHost && <p className="hand-text small">The host chooses these.</p>}

            {isHost && (
              <div className="row">
                <button
                  type="button"
                  className="btn btn-primary btn-lg"
                  disabled={busy || Boolean(blocker)}
                  onClick={deal_}
                  aria-label="Deal the roles: start Avalon"
                >
                  {busy ? 'Dealing roles…' : 'Deal the roles'}
                </button>
              </div>
            )}
            {isHost && blocker && count >= MIN_PLAYERS && (
              <p className="av-blocker" role="status">
                {blocker}
              </p>
            )}

            <p className="hand-text small">
              {isHost && count > 1
                ? 'Tap a player’s seat to remove them, or your own to change your name and crest.'
                : 'Tap your seat to change your name and crest.'}
            </p>
            {changeGame && (
              <button type="button" className="av-link" onClick={changeGame}>
                Play a different game
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
