'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { BOT_LEVELS, BOT_LEVEL_NAMES, type BotLevel, type Reaction } from '@jackdaw/engine';
import {
  AddSeat,
  LobbyChatPanel,
  Plaque,
  PlayerReaction,
  ReactionBar,
  arrangeOptions,
  toggleKey,
  type GameLobbyProps,
  type OptionGroup,
  type ScreenPlayer,
} from '@jackdaw/ui';
import { defaultOptions, optionsSchema, type MazeOptions } from '../options';
import { MAX_CHOMPERS, lookOf, useAttract, type AttractPlayer } from './attract';
import type { Look } from './frame';
import { LOOKS } from './render/core';
import './maze.css';

/** The most players a Maze table seats. */
const MAX_SEATS = MAX_CHOMPERS;

/** A seat's chomper in the look's own color, in seat order (as in the game). */
export function chomperColor(look: Look, seat: number): string {
  const c = LOOKS[look].players;
  return c[((seat % c.length) + c.length) % c.length] ?? '#888888';
}

/** The look's screen colors: its ground, and a text color that reads on it. */
export function screenColors(look: Look): { bg: string; fg: string; gold: string } {
  const st = LOOKS[look];
  const m = /^#([0-9a-f]{6})$/i.exec(st.bg);
  let lum = 0;
  if (m) {
    const n = parseInt(m[1]!, 16);
    lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  }
  return { bg: st.bg, fg: lum > 0.55 ? '#1b1a18' : '#f4f1e6', gold: st.gold };
}

export const attractPlayers = (players: readonly ScreenPlayer[]): AttractPlayer[] =>
  players.slice(0, MAX_CHOMPERS).map((p, i) => ({ id: p.id, name: p.name, colorIndex: i }));

/** The attract maze, drawn in `look` and fitted to the box around it. */
export function AttractStage({
  look,
  players,
  seed,
  className,
}: {
  look: Look;
  players: readonly ScreenPlayer[];
  seed: string;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useAttract(canvas, box, look, attractPlayers(players), seed);
  const s = screenColors(look);
  return (
    <div
      ref={box}
      className={['mz-attract', className].filter(Boolean).join(' ')}
      data-look={look}
      style={{ '--mz-bg': s.bg, '--mz-fg': s.fg, '--mz-gold': s.gold } as CSSProperties}
      aria-hidden="true"
    >
      <canvas ref={canvas} className="mz-attract__canvas" />
    </div>
  );
}

/** A little chomper: a disc with a mouth that opens and closes. */
export function ChomperIcon({ color, size }: { color: string; size?: number }) {
  return (
    <span
      className="mz-chomp"
      aria-hidden="true"
      style={{ '--mz-c': color, ...(size ? { '--mz-z': `${size}px` } : {}) } as CSSProperties}
    />
  );
}

/** A player's name as the lineup shows it: a computer's "Bot " prefix is left to its CPU tag. */
export function shownName(p: { name: string; bot?: boolean }): string {
  return p.bot ? p.name.replace(/^bot\s+/i, '') || p.name : p.name;
}

/** The mode that suits a table: Solo for one player, Shared for more. */
export function modeFor(count: number): 'Solo' | 'Shared' {
  return count <= 1 ? 'Solo' : 'Shared';
}

/**
 * The players, lined up like a high-score table: each is a chomper in their color, in seat order,
 * with their name. Computer players are tagged CPU. A newcomer chomps in from the side.
 */
export function Lineup({
  players,
  me,
  hostId,
  look,
  reactions,
  canTap,
  onSeat,
  onAddBot,
  tv,
}: {
  players: readonly ScreenPlayer[];
  me: string | null;
  hostId: string;
  look: Look;
  reactions?: Reaction[];
  /** Whether tapping this player's row does something (yours, or anyone's for the host). */
  canTap?: (id: string) => boolean;
  onSeat?: (id: string) => void;
  /** Host only: offer a "+" slot after the last player. */
  onAddBot?: () => void;
  tv?: boolean;
}) {
  const s = screenColors(look);
  return (
    <ol
      className={`mz-lineup${tv ? ' mz-lineup--tv' : ''}`}
      aria-label="Players"
      data-look={look}
      style={{ '--mz-bg': s.bg, '--mz-fg': s.fg, '--mz-gold': s.gold } as CSSProperties}
    >
      {players.map((p, i) => {
        const tap = Boolean(onSeat && canTap?.(p.id));
        const inner = (
          <>
            <span className="mz-row__rank">{i + 1}P</span>
            <span className="mz-row__chomp">
              <ChomperIcon color={chomperColor(look, i)} />
              <PlayerReaction reactions={reactions} playerId={p.id} name={p.name} size={28} />
            </span>
            <span className="mz-row__name" title={p.name}>
              {shownName(p)}
            </span>
            {p.bot && <span className="mz-tag">CPU</span>}
            {p.id === hostId && !p.bot && <span className="mz-tag mz-tag--host">Host</span>}
            {p.id === me && <span className="mz-tag mz-tag--you">You</span>}
          </>
        );
        const cls = `mz-row${p.online ? '' : ' is-away'}${p.id === me ? ' is-me' : ''}`;
        const label = `${p.name}${p.id === me ? ' (you)' : ''}${p.bot ? ', computer player' : ''}`;
        return (
          <li
            key={p.id}
            className={cls}
            style={{ '--mz-i': i } as CSSProperties}
            data-bot={p.bot ? 'true' : undefined}
          >
            {tap ? (
              <button
                type="button"
                className="mz-row__btn"
                aria-label={
                  p.id === me ? `${label}: change your name, crest or color` : `${label}: manage`
                }
                onClick={() => onSeat!(p.id)}
              >
                {inner}
              </button>
            ) : (
              <span className="mz-row__btn" aria-label={label}>
                {inner}
              </span>
            )}
          </li>
        );
      })}
      {onAddBot && players.length < MAX_SEATS && (
        <li className="mz-row mz-row--open" style={{ '--mz-i': players.length } as CSSProperties}>
          <span className="mz-row__btn">
            <span className="mz-row__rank">{players.length + 1}P</span>
            <span className="mz-row__chomp mz-row__chomp--open">
              <AddSeat onAdd={onAddBot} className="mz-addseat" />
            </span>
          </span>
        </li>
      )}
    </ol>
  );
}

/** "Bots play: Easy / Normal / Hard": the host can change it, everyone else just reads it. */
export function BotLevelPicker({
  level,
  onChange,
}: {
  level: BotLevel;
  /** Host only. */
  onChange?: (level: BotLevel) => void;
}) {
  return (
    <div className="mz-bots">
      <span className="mz-bots__label">Bots play</span>
      {onChange ? (
        <span className="mz-bots__choices" role="radiogroup" aria-label="Bots play">
          {BOT_LEVELS.map((l) => (
            <Plaque
              key={l}
              small
              role="radio"
              aria-checked={level === l}
              className={level === l ? 'mz-bots__on' : undefined}
              onClick={() => onChange(l)}
            >
              {BOT_LEVEL_NAMES[l]}
            </Plaque>
          ))}
        </span>
      ) : (
        <b className="mz-bots__level">{BOT_LEVEL_NAMES[level]}</b>
      )}
    </div>
  );
}

/** The bot level, but only once a computer player is seated. */
export function BotsRow({
  players,
  level,
  onChange,
}: {
  players: readonly ScreenPlayer[];
  level?: BotLevel;
  onChange?: (level: BotLevel) => void;
}) {
  if (!level || !players.some((p) => p.bot)) return null;
  return <BotLevelPicker level={level} onChange={onChange} />;
}

/** What the lobby's Start area shows: the host's READY? button, or who everyone is waiting for. */
export function LobbyActions({
  isHost,
  hostName,
  busy,
  blocker,
  onStart,
  onSettings,
  settingsOpen,
  changeGame,
}: {
  isHost: boolean;
  hostName: string;
  busy: boolean;
  blocker: string | null;
  onStart: () => void;
  onSettings: () => void;
  settingsOpen: boolean;
  changeGame?: () => void;
}) {
  return (
    <div className="mz-actions">
      {isHost ? (
        <Plaque go className="mz-start" disabled={busy || Boolean(blocker)} onClick={onStart}>
          <span className="mz-ready" aria-hidden={busy ? undefined : 'true'}>
            {busy ? 'GO!' : 'READY?'}
          </span>
          <span>{busy ? 'Starting' : 'Start Maze'}</span>
        </Plaque>
      ) : (
        <p className="mz-waiting" role="status">
          Waiting for {hostName} to start
        </p>
      )}
      <Plaque small onClick={onSettings} aria-expanded={settingsOpen}>
        {isHost ? 'Settings' : 'Rules'}
      </Plaque>
      {blocker && isHost && (
        <p className="mz-blocker" role="status">
          {blocker}
        </p>
      )}
      {isHost && changeGame && (
        <button type="button" className="mz-link" onClick={changeGame}>
          Play a different game
        </button>
      )}
    </div>
  );
}

type Help = Record<string, string | Record<string, string>>;

/** Whether an option shows in the lobby: Minutes only matters with a bell (not in Solo). */
export function optionShown(key: string, o: MazeOptions): boolean {
  if (key === 'minutes') return o.mode !== 'Solo';
  return true;
}

interface Field {
  def: { type: string };
  description?: string;
  options?: readonly string[];
  minValue?: number | null;
  maxValue?: number | null;
}

/** The options, drawn from the schema: choices as a row of buttons, power-ups as one grid. */
export function OptionsSheet({
  options,
  editable,
  onChange,
  help,
  groups,
}: {
  options: MazeOptions;
  editable: boolean;
  onChange: (next: Record<string, unknown>) => void;
  help?: Help;
  groups?: OptionGroup[];
}) {
  const shape = optionsSchema.shape as unknown as Record<string, Field>;
  const keys = Object.keys(shape).filter((k) => optionShown(k, options));
  const booleans = new Set(keys.filter((k) => shape[k]!.def.type === 'boolean'));
  const items = arrangeOptions(keys, booleans, groups);
  const rec = options as unknown as Record<string, unknown>;
  const note = (key: string) => {
    const h = help?.[key];
    return typeof h === 'string' ? h : h?.[String(rec[key])];
  };
  return (
    <dl className="mz-opts">
      {items.map((item) => {
        if (item.type === 'group') {
          const g = item.group;
          if (g.hidden?.(rec)) return null;
          return (
            <div key={g.label} className="mz-opt">
              <dt>{g.label}</dt>
              <dd className="mz-opt__grid" role="group" aria-label={g.label}>
                {item.keys.map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="switch"
                    aria-checked={Boolean(rec[k])}
                    className="mz-chip-opt"
                    disabled={!editable || (g.disabled?.(k, rec) ?? false)}
                    onClick={() => onChange(toggleKey(rec, k))}
                  >
                    {g.dots?.[k] && (
                      <i className="mz-chip-opt__dot" style={{ background: g.dots[k] }} />
                    )}
                    {g.short?.[k] ?? shape[k]?.description ?? k}
                  </button>
                ))}
              </dd>
            </div>
          );
        }
        const key = item.key;
        const f = shape[key]!;
        const type = f.def.type;
        const choices: (string | number)[] =
          type === 'enum'
            ? [...(f.options ?? [])]
            : type === 'number' && f.minValue != null && f.maxValue != null
              ? Array.from({ length: f.maxValue - f.minValue + 1 }, (_, i) => f.minValue! + i)
              : [];
        if (choices.length === 0) return null;
        const n = note(key);
        return (
          <div key={key} className="mz-opt">
            <dt>{f.description ?? key}</dt>
            <dd className="mz-opt__choices" role="radiogroup" aria-label={f.description ?? key}>
              {choices.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={rec[key] === c}
                  disabled={!editable}
                  onClick={() => onChange({ ...rec, [key]: c })}
                >
                  {c}
                </button>
              ))}
            </dd>
            {n && <dd className="mz-opt__help">{n}</dd>}
          </div>
        );
      })}
    </dl>
  );
}

/**
 * Maze's own lobby: an attract-mode maze (ghosts chasing chompers, in the look the host picked)
 * with the players lined up beneath it as chompers. Jackdaw's bar and chat button stay above.
 */
export function MazeLobby({
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
  chat,
  onAddBot,
  botLevel,
  setBotLevel,
  help,
  groups,
}: GameLobbyProps & { help?: Help; groups?: OptionGroup[] }) {
  const parsed = optionsSchema.safeParse({ ...defaultOptions(players.length), ...raw });
  const opts = parsed.success ? parsed.data : defaultOptions(players.length);
  const look = lookOf(opts as unknown as Record<string, unknown>);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(false);
  const host = players.find((p) => p.id === hostId);

  // The mode follows the head count until the host picks one (Solo for one, Shared for more), so
  // a table that grew past the host alone is not stuck on Solo. Only the host's client does it.
  const chosen = useRef(false);
  const want = modeFor(players.length);
  const mode = opts.mode;
  useEffect(() => {
    if (!isHost || chosen.current) return;
    if ((mode === 'Solo' && want === 'Shared') || (mode === 'Shared' && want === 'Solo')) {
      setOptions({ ...raw, mode: want });
    }
  }, [isHost, mode, want, setOptions, raw]);

  async function begin() {
    setBusy(true);
    try {
      await start();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mz-lobby" data-look={look}>
      <div className="mz-lobby__main">
        <header className="mz-lobby__head">
          <h2 className="mz-lobby__title">Maze</h2>
          <p className="mz-lobby__sub">
            {players.length} chomper{players.length === 1 ? '' : 's'} in lobby {code}
          </p>
        </header>
        <div className="mz-lobby__body">
          <div className="mz-lobby__screen" data-look={look}>
            <AttractStage look={look} players={players} seed={code} />
            {sheet && (
              <div className="mz-sheet" role="dialog" aria-label={isHost ? 'Settings' : 'Rules'}>
                <OptionsSheet
                  options={opts}
                  editable={isHost}
                  onChange={(next) => {
                    if (next.mode !== opts.mode) chosen.current = true;
                    setOptions(next);
                  }}
                  help={help}
                  groups={groups}
                />
                <Plaque small onClick={() => setSheet(false)}>
                  Done
                </Plaque>
              </div>
            )}
          </div>
          <div className="mz-lobby__side">
            <Lineup
              players={players}
              me={me}
              hostId={hostId}
              look={look}
              reactions={reactions}
              canTap={(id) => id === me || isHost}
              onSeat={onSeat}
              onAddBot={isHost ? onAddBot : undefined}
            />
            <BotsRow
              players={players}
              level={botLevel}
              onChange={isHost ? setBotLevel : undefined}
            />
            {me && <ReactionBar className="mz-react" onReact={react} />}
            <LobbyActions
              isHost={isHost}
              hostName={host?.name ?? 'the host'}
              busy={busy}
              blocker={blocker}
              onStart={begin}
              onSettings={() => setSheet((s) => !s)}
              settingsOpen={sheet}
              changeGame={changeGame}
            />
          </div>
        </div>
      </div>
      <LobbyChatPanel chat={chat} players={players} className="mz-chat" />
    </div>
  );
}
