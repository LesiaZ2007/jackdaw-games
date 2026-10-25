'use client';

import type { Reaction } from '@jackdaw/engine';
import {
  PlayerReaction,
  Tally,
  Token,
  useMoment,
  VerdictMoment,
  type GameUi,
  type ScreenPlayer,
} from '@jackdaw/ui';
import { MIDDLE, TEAM_NAME, type Team, type WavelengthTableView } from '../rules';
import { Dial } from './dial';
import { Clock } from './player';
import { cardOf, pointsLine, roundLine, roundMoment, statusLine } from './words';
import './wavelength.css';

/**
 * Wavelength on the TV, read from the sofa: the clue huge across the top, the dial board filling
 * the middle with its needle gliding as the team drags it, the two teams down either side with
 * who's locked in and who called which way, and the reveal: the shutter swings open on the target
 * and the points stamp across it.
 */
export const TvScreen: GameUi['TvScreen'] = ({ tableView, reactions, now, ...props }) => {
  const t = tableView as WavelengthTableView;
  const players = props.players as ScreenPlayer[];
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  const [fresh, dismiss] = useMoment(t.history.length);
  const moment = fresh !== null ? roundMoment(t, null, name) : null;
  const r = t.round;
  const shown = t.phase === 'reveal' || t.phase === 'over';
  const last = t.history[t.history.length - 1];
  const marks =
    shown && last?.dials
      ? Object.entries(last.dials).map(([id, value]) => ({
          id,
          value,
          tint: `var(--tint-${byId.get(id)?.avatar.tint ?? 'slate'})`,
        }))
      : undefined;

  const panel = (team: Team) => (
    <TeamPanel key={team} t={t} team={team} players={players} reactions={reactions} name={name} />
  );

  return (
    <div className={`wl wl-tv wl-tv--${t.mode}`}>
      <header className="wl-tv__head">
        <p className="wl-tv__line">
          <span>{roundLine(t)}</span>
          {r.clue && t.phase !== 'clue' && <span>{name(r.psychic)}’s clue</span>}
          <Clock at={t.actBy} now={now} />
        </p>
        {r.clue && t.phase !== 'clue' ? (
          <h2 className="wl__clue wl-tv__clue">{r.clue}</h2>
        ) : (
          <h2 className="jd-display wl-tv__status">{statusLine(t, name)}</h2>
        )}
        {t.phase !== 'clue' && t.phase !== 'reveal' && t.phase !== 'over' && (
          <p className="wl-tv__sub">{statusLine(t, name)}</p>
        )}
      </header>

      {panel('sun')}

      <div className={t.phase === 'clue' ? 'wl-tv__board has-offer' : 'wl-tv__board'}>
        <Dial
          size="tv"
          spectrum={cardOf(t)}
          value={shown && last ? last.guess : t.guessing === 'shared' ? r.dial : MIDDLE}
          target={shown ? r.target : null}
          open={shown}
          marks={marks}
          team={r.team}
        />
        {t.phase === 'clue' && (
          <ul className="wl-offer wl-tv__offer" aria-label="The cards on offer">
            {r.spectrums.map(([a, b], i) => (
              <li key={i} className="wl-card">
                <span>{a}</span>
                <span className="wl-card__line" aria-hidden="true" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}
        {shown && last && (
          <p className={`wl-stamp wl-stamp--${last.points} wl-tv__stamp`} key={last.n}>
            {pointsLine(last)}
            {last.call && (
              <span className="wl-stamp__call">
                {TEAM_NAME[last.team === 'sun' ? 'moon' : 'sun']} called {last.call}:{' '}
                {last.callPoint ? '+1' : 'wrong'}
              </span>
            )}
          </p>
        )}
      </div>

      {t.mode === 'teams' && panel('moon')}

      {moment && (
        <VerdictMoment
          key={t.history.length}
          size="tv"
          outcome="reveal"
          title={moment.title}
          detail={moment.detail}
          onDone={dismiss}
        />
      )}
    </div>
  );
};

/** One team down the side: its score and players, the psychic marked, locks and calls shown. */
function TeamPanel({
  t,
  team,
  players,
  reactions,
  name,
}: {
  t: WavelengthTableView;
  team: Team;
  players: ScreenPlayer[];
  reactions: Reaction[];
  name: (id: string) => string;
}) {
  const r = t.round;
  const members = t.players.filter((id) => t.teams[id] === team);
  const byId = new Map(players.map((p) => [p.id, p]));
  const turn = r.team === team && t.phase !== 'over';
  return (
    <section
      className={`wl-team wl-team--${team}${turn ? ' is-turn' : ''}`}
      aria-label={t.mode === 'teams' ? `${TEAM_NAME[team]} team` : 'The team'}
    >
      <h3 className="wl-team__head">
        <span>{t.mode === 'teams' ? TEAM_NAME[team] : 'Score'}</span>
        <Tally value={t.scores[team]} className="wl-team__score" />
      </h3>
      <ul className="wl-team__list">
        {members.map((id) => {
          const p = byId.get(id);
          const psychic = r.psychic === id && t.phase !== 'over';
          const locked = t.phase === 'guess' && r.locks.includes(id);
          const call = t.phase === 'call' ? r.calls[id] : undefined;
          const moved = t.phase === 'guess' && t.guessing === 'average' && r.moved.includes(id);
          return (
            <li key={id} className={psychic ? 'wl-team__p is-psychic' : 'wl-team__p'}>
              <span className="wl-team__tok">
                {p && <Token avatar={p.avatar} away={!p.online} size={64} />}
                <PlayerReaction reactions={reactions} playerId={id} name={name(id)} />
              </span>
              <span className="wl-team__name">{name(id)}</span>
              {psychic && <span className="wl-tag wl-tag--psychic">Psychic</span>}
              {locked && <span className="wl-tag wl-tag--lock">Locked</span>}
              {!locked && moved && <span className="wl-tag">Set</span>}
              {call && (
                <span className="wl-tag wl-tag--call">{call === 'left' ? 'Left' : 'Right'}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
