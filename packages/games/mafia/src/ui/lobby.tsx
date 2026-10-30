'use client';

import {
  AddSeat,
  PlayerReaction,
  Token,
  seatTransition,
  useTheme,
  type GameTvLobbyProps,
  type GameUi,
  type Seat,
} from '@jackdaw/ui';
import type { Reaction } from '@jackdaw/engine';
import { castCounts, castFor, MODES, ROLE_INFO, SETTING, type Mode, type Role } from '../roles';
import { killersFor, type MafiaOptions } from '../rules';
import { Moon, RoleMark, Skyline, Village } from './art';
import { Jackdaw } from './motion';
import { MASTHEAD } from './words';
import './mafia.css';

const cx = (...n: (string | false | null | undefined)[]) => n.filter(Boolean).join(' ');

const modeOf = (o: Record<string, unknown>): Mode => (o.mode === 'Werewolf' ? 'Werewolf' : 'Mafia');
const optionsOf = (o: Record<string, unknown>): MafiaOptions => ({
  mode: modeOf(o),
  killers: (o.killers as MafiaOptions['killers']) ?? 'Auto',
  extras: Array.isArray(o.extras) ? (o.extras as Role[]) : [],
  talk: (o.talk as MafiaOptions['talk']) ?? '3 minutes',
  reveal: (o.reveal as MafiaOptions['reveal']) ?? 'Shown',
});

/** The places, each a placard on the line-up wall (the city) or a cottage (the village). */
function Places({
  seats,
  max,
  mode,
  onSeat,
  reactions,
  onAddBot,
  tv,
}: {
  seats: Seat[];
  max: number;
  mode: Mode;
  onSeat?: (id: string) => void;
  reactions?: Reaction[];
  onAddBot?: () => void;
  tv?: boolean;
}) {
  return (
    <ol className="mf-places" aria-label={`${seats.length} of ${max} places taken`}>
      {Array.from({ length: max }, (_, i) => {
        const seat = seats[i];
        if (!seat)
          return (
            <li key={`open-${i}`} className="mf-place is-open" aria-label={`Place ${i + 1}, open`}>
              <span className="mf-place__frame">
                <span className="mf-place__ghost" aria-hidden="true" />
                {onAddBot && <AddSeat onAdd={onAddBot} className="mf-place__add" />}
              </span>
              <span className="mf-place__plate">{mode === 'Mafia' ? `No. ${i + 1}` : i + 1}</span>
            </li>
          );
        const t = seatTransition(seat.id);
        const name = seat.bot ? seat.name.replace(/^Bot /, '') : seat.name;
        return (
          <li
            key={seat.id}
            className={cx('mf-place', seat.me && 'is-me', seat.landing && 'is-landing')}
            aria-label={`${seat.name}${seat.me ? ' (you)' : ''}${seat.bot ? ', computer player' : ''}${seat.host ? ', host' : ''}${seat.away ? ', away' : ''}`}
          >
            <span className="mf-place__frame">
              <Token
                avatar={seat.avatar}
                host={seat.host}
                away={seat.away}
                size={tv ? 92 : 52}
                transitionName={t.token}
              />
              <PlayerReaction reactions={reactions ?? []} playerId={seat.id} name={seat.name} />
              {onSeat && seat.action && (
                <button
                  type="button"
                  className="mf-place__tap"
                  aria-label={seat.action}
                  onClick={() => onSeat(seat.id)}
                />
              )}
            </span>
            <span className="mf-place__plate" style={{ viewTransitionName: t.name }}>
              {mode === 'Mafia' && <span className="mf-place__no">No. {i + 1}</span>}
              <span className="mf-place__name">{name}</span>
              {(seat.me || seat.bot) && (
                <span className="mf-place__you">{seat.me ? 'You' : 'Bot'}</span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The deal for this many players, as the cast printed in a programme. The host taps the extras
 * to put them in or take them out.
 */
function Cast({
  options,
  players,
  setOptions,
}: {
  options: Record<string, unknown>;
  players: number;
  setOptions?: (o: Record<string, unknown>) => void;
}) {
  const o = optionsOf(options);
  const n = Math.max(players, 5);
  const s = SETTING[o.mode];
  const cards = castFor(o.mode, n, killersFor(o, n), o.extras);
  const toggle = (r: Role) =>
    setOptions?.({
      ...options,
      extras: o.extras.includes(r) ? o.extras.filter((x) => x !== r) : [...o.extras, r],
    });
  return (
    <section className="mf-bill" aria-label="The cast">
      <h3 className="mf-bill__head">
        {o.mode === 'Mafia' ? 'The cast' : 'The cards'}
        <span>for {n} players</span>
      </h3>
      <ul className="mf-bill__list">
        {castCounts(cards).map(([r, k]) => (
          <li key={r} className={`mf-bill__r mf-team-${ROLE_INFO[r].team}`}>
            <RoleMark role={r} size="1.5em" />
            <span className="mf-bill__name">
              {k > 1 ? `${k} ${ROLE_INFO[r].plural}` : ROLE_INFO[r].name}
            </span>
          </li>
        ))}
      </ul>
      <div className="mf-bill__extras" role="group" aria-label="Extra roles">
        {s.extras.map((r) => {
          const on = o.extras.includes(r);
          const dealt = cards.includes(r);
          return setOptions ? (
            <button
              key={r}
              type="button"
              className={cx('mf-extra-role', on && 'is-on')}
              aria-pressed={on}
              onClick={() => toggle(r)}
              title={ROLE_INFO[r].power}
            >
              <RoleMark role={r} size="1.3em" />
              {on ? ROLE_INFO[r].name : `Add the ${ROLE_INFO[r].name}`}
              {on && !dealt && <small> (no room)</small>}
            </button>
          ) : null;
        })}
      </div>
      <p className="mf-bill__note">
        {setOptions ? 'Tap an extra role to add it. ' : ''}
        Everyone sees the cast. Nobody sees who got what.
      </p>
    </section>
  );
}

/** The host flips the setting here as well as in the options. */
function SettingSwitch({
  options,
  setOptions,
}: {
  options: Record<string, unknown>;
  setOptions?: (o: Record<string, unknown>) => void;
}) {
  const mode = modeOf(options);
  if (!setOptions) return null;
  return (
    <div className="mf-switch" role="radiogroup" aria-label="Setting">
      {MODES.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          className={cx('mf-switch__o', mode === m && 'is-on')}
          onClick={() => mode !== m && setOptions({ ...options, mode: m, extras: [] })}
        >
          {m === 'Mafia' ? 'Mafia: the city' : 'Werewolf: the village'}
        </button>
      ))}
    </div>
  );
}

/**
 * Mafia's seats in Jackdaw's lobby. The city: a police line-up, everyone on a placard against the
 * height chart. The village: a row of cottages under the moon, a player at each door.
 */
export const LobbySeats: NonNullable<GameUi['LobbySeats']> = ({
  seats,
  max,
  options,
  onSeat,
  reactions,
  setOptions,
  onAddBot,
}) => {
  const look = useTheme();
  const mode = modeOf(options);
  return (
    <div
      className={cx('mf', mode === 'Mafia' ? 'mf--city' : 'mf--village', 'mf-lobby')}
      data-look={look}
    >
      <header className="mf-lobby__mast">
        <h2 className="mf-mast__name">{MASTHEAD[mode]}</h2>
        <p className="mf-lobby__strap">
          {mode === 'Mafia'
            ? 'Wanted for questioning: everyone in this room.'
            : 'The wolves are among you. The village sleeps uneasily.'}
        </p>
      </header>
      <SettingSwitch options={options} setOptions={setOptions} />
      <div className="mf-lobby__wall">
        {mode === 'Werewolf' ? <Moon night={5} className="mf-lobby__moon" /> : <Jackdaw />}
        <Places
          seats={seats}
          max={max}
          mode={mode}
          onSeat={onSeat}
          reactions={reactions}
          onAddBot={onAddBot}
        />
        {mode === 'Mafia' ? (
          <Skyline className="mf-lobby__sky" />
        ) : (
          <Village className="mf-lobby__sky" />
        )}
      </div>
      <Cast options={options} players={seats.length} setOptions={setOptions} />
    </div>
  );
};

/** The TV's lobby: the line-up (or the village) large, beside the join panel and the cast. */
export function MafiaTvLobby({
  players,
  hostId,
  options,
  reactions,
  join,
  status,
}: GameTvLobbyProps) {
  const look = useTheme();
  const mode = modeOf(options);
  const seats: Seat[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    host: p.id === hostId,
    away: !p.online,
    bot: p.bot,
  }));
  return (
    <div
      className={cx('mf', mode === 'Mafia' ? 'mf--city' : 'mf--village', 'mf-lobby', 'mf-tvlobby')}
      data-look={look}
    >
      <div className="mf-tvlobby__main">
        <header className="mf-lobby__mast">
          <h2 className="mf-mast__name">{MASTHEAD[mode]}</h2>
          <p className="mf-lobby__strap">
            {mode === 'Mafia'
              ? 'Wanted for questioning: everyone in this room.'
              : 'The wolves are among you. The village sleeps uneasily.'}
          </p>
        </header>
        <div className="mf-lobby__wall">
          {mode === 'Werewolf' ? <Moon night={5} className="mf-lobby__moon" /> : <Jackdaw />}
          <Places seats={seats} max={15} mode={mode} reactions={reactions} tv />
          {mode === 'Mafia' ? (
            <Skyline className="mf-lobby__sky" />
          ) : (
            <Village className="mf-lobby__sky" />
          )}
        </div>
      </div>
      <aside className="mf-tvlobby__side">
        {join}
        <p className="mf-tvlobby__status">{status}</p>
        <Cast options={options} players={players.length} />
      </aside>
    </div>
  );
}
