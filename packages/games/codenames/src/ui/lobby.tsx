'use client';

import { useState } from 'react';
import { createRng } from '@jackdaw/engine';
import {
  LobbyChatPanel,
  PlayerReaction,
  ReactionBar,
  seatTransition,
  Token,
  useTheme,
  type GameLobbyProps,
  type ScreenPlayer,
} from '@jackdaw/ui';
import { defaultOptions, optionsSchema, type CodenamesOptions } from '../rules';
import { other, TEAM_NAME, TEAMS, type Team } from '../teams';
import { CardMark, Lens } from './art';
import './codenames.css';

/** Only the arrangement of players who are still here, with spymasters kept on their team. */
export function arrangementFor(options: CodenamesOptions, players: ScreenPlayer[]) {
  const here = new Set(players.map((p) => p.id));
  const teams = Object.fromEntries(
    Object.entries(options.teams).filter(([id]) => here.has(id)),
  ) as Record<string, Team>;
  const spymasters: Partial<Record<Team, string>> = {};
  for (const t of TEAMS) {
    const id = options.spymasters[t];
    if (id && teams[id] === t) spymasters[t] = id;
  }
  return { teams, spymasters };
}

/** A fresh random split: alternate down a shuffled table, the first of each side spymaster. */
function shuffled(players: ScreenPlayer[]) {
  const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
  const rng = createRng(seed);
  const order = rng.shuffle(players.map((p) => p.id));
  const first = rng.pick(TEAMS);
  const teams: Record<string, Team> = {};
  order.forEach((id, i) => (teams[id] = i % 2 === 0 ? first : other(first)));
  const spymasters: Partial<Record<Team, string>> = {};
  for (const id of order) if (!spymasters[teams[id]!]) spymasters[teams[id]!] = id;
  return { teams, spymasters };
}

/**
 * Codenames' own lobby: the table splits into two case files, red and blue. Each file has its
 * spymaster pinned at the top and its operatives below; anyone not yet placed waits in the tray
 * and joins the smaller team at the start. The host taps a player, then where they go.
 */
export function CodenamesLobby({
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
}: GameLobbyProps) {
  const look = useTheme();
  const parsed = optionsSchema.safeParse({ ...defaultOptions(), ...raw });
  const opts = parsed.success ? parsed.data : defaultOptions();
  const { teams, spymasters } = arrangementFor(opts, players);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pickedPlayer = players.find((p) => p.id === picked) ?? null;

  const save = (next: Partial<CodenamesOptions>) =>
    setOptions({ ...opts, teams, spymasters, ...next });
  const moveTo = (id: string, team: Team | null, spy = false) => {
    const nextTeams = { ...teams };
    const nextSpies = { ...spymasters };
    for (const t of TEAMS) if (nextSpies[t] === id) delete nextSpies[t];
    if (team) nextTeams[id] = team;
    else delete nextTeams[id];
    if (team && spy) nextSpies[team] = id;
    save({ teams: nextTeams, spymasters: nextSpies });
    setPicked(null);
  };

  const tap = (id: string) => {
    if (isHost) setPicked(picked === id ? null : id);
    else if (id === me) onSeat(id);
  };

  const unplaced = players.filter((p) => !teams[p.id]);
  const count = (t: Team) => players.filter((p) => teams[p.id] === t).length;

  const person = (p: ScreenPlayer, spy = false) => {
    const tappable = isHost || p.id === me;
    const t = seatTransition(p.id);
    return (
      <button
        key={p.id}
        type="button"
        className={[
          'cn-agent',
          spy && 'cn-agent--spy',
          picked === p.id && 'is-picked',
          p.id === me && 'is-me',
          !p.online && 'is-away',
        ]
          .filter(Boolean)
          .join(' ')}
        disabled={!tappable}
        onClick={() => tap(p.id)}
        aria-pressed={isHost ? picked === p.id : undefined}
        aria-label={
          isHost
            ? `${p.name}${p.id === me ? ' (you)' : ''}: choose where they play`
            : p.id === me
              ? `${p.name} (you): change your name, crest or colour`
              : p.name
        }
      >
        <span className="cn-agent__tok">
          <Token
            avatar={p.avatar}
            size={spy ? 46 : 40}
            away={!p.online}
            host={p.id === hostId}
            transitionName={t.token}
          />
          <PlayerReaction
            reactions={reactions}
            playerId={p.id}
            name={p.name}
            size={spy ? 46 : 40}
          />
        </span>
        <span className="cn-agent__name" style={{ viewTransitionName: t.name }}>
          {p.name}
          {p.id === me && <small> (you)</small>}
        </span>
        {spy && (
          <span className="cn-agent__badge">
            <Lens size={16} /> Spymaster
          </span>
        )}
      </button>
    );
  };

  async function begin() {
    setBusy(true);
    try {
      await start();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cn cn-lobby" data-look={look}>
      <div className="cn-lobby__main">
        <header className="cn-lobby__head">
          <span className="cn-lobby__mark" aria-hidden="true">
            <CardMark card="red" size={44} />
          </span>
          <div>
            <h2 className="cn-lobby__title">Codenames</h2>
            <p className="cn-lobby__sub">
              Case file {code}. {players.length} agent{players.length === 1 ? '' : 's'} at the
              table.
            </p>
          </div>
        </header>

        {unplaced.length > 0 && (
          <section className="cn-tray" aria-label="Not on a team yet">
            <h3 className="cn-tray__title">Not on a team yet</h3>
            <div className="cn-tray__people">{unplaced.map((p) => person(p))}</div>
            <p className="cn-tray__note">
              {isHost
                ? 'Tap someone, then their team. Anyone left here joins the smaller team at the start.'
                : 'The host puts everyone on a team. Anyone left here joins the smaller team at the start.'}
            </p>
          </section>
        )}

        {pickedPlayer && isHost && (
          <div className="cn-move" role="group" aria-label={`Where ${pickedPlayer.name} plays`}>
            <p className="cn-move__who">{pickedPlayer.id === me ? 'You' : pickedPlayer.name}:</p>
            {TEAMS.map((t) => (
              <button
                key={t}
                type="button"
                className={`cn-btn cn-btn--${t}`}
                onClick={() => moveTo(pickedPlayer.id, t)}
              >
                {TEAM_NAME[t]} operative
              </button>
            ))}
            {TEAMS.map((t) => (
              <button
                key={`spy-${t}`}
                type="button"
                className={`cn-btn cn-btn--${t}`}
                onClick={() => moveTo(pickedPlayer.id, t, true)}
              >
                <Lens size={16} /> {TEAM_NAME[t]} spymaster
              </button>
            ))}
            {teams[pickedPlayer.id] && (
              <button
                type="button"
                className="cn-btn"
                onClick={() => moveTo(pickedPlayer.id, null)}
              >
                Take off the team
              </button>
            )}
            <button
              type="button"
              className="cn-btn cn-btn--quiet"
              onClick={() => {
                setPicked(null);
                onSeat(pickedPlayer.id);
              }}
            >
              {pickedPlayer.id === me ? 'Your name and look' : 'Remove or make host'}
            </button>
          </div>
        )}

        <div className="cn-files cn-files--lobby">
          {TEAMS.map((t) => {
            const spy = players.find((p) => p.id === spymasters[t]);
            const ops = players.filter((p) => teams[p.id] === t && p.id !== spymasters[t]);
            return (
              <section
                key={t}
                className={`cn-file cn-file--${t}`}
                aria-label={`${TEAM_NAME[t]} team`}
              >
                <header className="cn-file__tab">
                  <h3>{TEAM_NAME[t]}</h3>
                  <span className="cn-file__left">
                    {count(t)} agent{count(t) === 1 ? '' : 's'}
                  </span>
                </header>
                <div className="cn-file__spyslot">
                  {spy ? (
                    person(spy, true)
                  ) : (
                    <p className="cn-file__empty">
                      <Lens size={18} />{' '}
                      {opts.newSpymasters
                        ? 'Drawn at the start'
                        : 'No spymaster yet: one is drawn at the start'}
                    </p>
                  )}
                </div>
                <div className="cn-file__ops">
                  {ops.length > 0 ? (
                    ops.map((p) => person(p))
                  ) : (
                    <p className="cn-file__empty">No operatives yet</p>
                  )}
                </div>
                {isHost && picked && teams[picked] !== t && (
                  <button
                    type="button"
                    className={`cn-file__drop cn-btn--${t}`}
                    onClick={() => moveTo(picked, t)}
                  >
                    Move here
                  </button>
                )}
              </section>
            );
          })}
        </div>

        {me && <ReactionBar className="cn-react" onReact={react} />}

        <section className="cn-brief" aria-label="Game settings">
          <label className="cn-toggle">
            <input
              type="checkbox"
              checked={opts.balance}
              disabled={!isHost}
              onChange={(e) => save({ balance: e.target.checked })}
            />
            <span>
              <b>Even teams</b>
              <small>Move operatives at the start so the teams differ by one at most.</small>
            </span>
          </label>
          <label className="cn-toggle">
            <input
              type="checkbox"
              checked={opts.newSpymasters}
              disabled={!isHost}
              onChange={(e) => save({ newSpymasters: e.target.checked })}
            />
            <span>
              <b>New spymasters each game</b>
              <small>Draw each team&rsquo;s spymaster at random when the game starts.</small>
            </span>
          </label>
          {isHost && (
            <div className="cn-brief__actions">
              <button type="button" className="cn-btn" onClick={() => save(shuffled(players))}>
                Shuffle teams
              </button>
              <button
                type="button"
                className="cn-btn cn-btn--go cn-btn--big"
                disabled={busy || Boolean(blocker)}
                onClick={begin}
              >
                {busy ? 'Dealing the board…' : 'Start Codenames'}
              </button>
            </div>
          )}
          {blocker && (
            <p className="cn-brief__blocker" role="status">
              {blocker}
            </p>
          )}
          {!isHost && (
            <p className="cn-brief__note">The host sets up the teams and starts the game.</p>
          )}
          {changeGame && (
            <button type="button" className="cn-link" onClick={changeGame}>
              Play a different game
            </button>
          )}
        </section>
      </div>

      <LobbyChatPanel chat={chat} players={players} className="cn-chat" />
    </div>
  );
}
