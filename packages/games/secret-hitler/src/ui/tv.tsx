'use client';

import { VerdictMoment, type GameUi, type ScreenPlayer } from '@jackdaw/ui';
import { POWER_LABEL, lastVoted, tally } from '../moments';
import type { ShTableView } from '../rules';
import { PowerIcon } from './art';
import { nameFrom, Placards, PolicyCard, ShFrame, Tracks } from './board';
import { statusLine, useShMoment } from './player';

/**
 * Secret Hitler on the TV: the two tracks as the centrepiece, the government in office beside
 * them, and the table along the bottom with everyone's ballot once a vote is counted. Public
 * information only: it never receives anything else.
 */
export const TvScreen: GameUi['TvScreen'] = ({ tableView, players, reactions }) => {
  const t = tableView as ShTableView;
  const ps = players as ScreenPlayer[];
  const name = nameFrom(ps);
  const m = useShMoment(t, null, name);
  const voted = lastVoted(t);
  const counts = voted ? tally(voted) : null;
  const living = t.players.length - t.dead.length;

  return (
    <ShFrame className="sh-tv">
      <header className="sh-tv__head">
        <p className="sh-tv__status">{statusLine(t, name)}</p>
        {t.phase === 'vote' && (
          <p className="sh-tv__count">
            {t.voted.length} of {living} have voted
          </p>
        )}
      </header>

      <div className="sh-tv__main">
        <Tracks t={t} tv />
        <aside className="sh-tv__gov" aria-label="The government">
          <div className="sh-tv__office">
            <span className="sh-tv__label">President</span>
            <b>{name(t.president)}</b>
          </div>
          <div className="sh-tv__office">
            <span className="sh-tv__label">{t.phase === 'vote' ? 'Nominee' : 'Chancellor'}</span>
            <b>{t.phase === 'nominate' ? 'Being chosen' : name(t.nominee ?? '')}</b>
          </div>
          {t.pending && t.phase === 'power' && (
            <div className="sh-tv__power">
              <PowerIcon power={t.pending} size={56} />
              <span>{POWER_LABEL[t.pending]}</span>
            </div>
          )}
          {voted && counts && t.phase !== 'vote' && (
            <div className="sh-tv__lastvote">
              <span className="sh-tv__label">Last vote</span>
              <b>
                Ja {counts.ja}, Nein {counts.nein}
              </b>
              <span>{voted.passed ? 'Elected' : 'Voted down'}</span>
            </div>
          )}
          {t.event?.kind === 'enacted' && (
            <div className="sh-tv__enacted">
              <span className="sh-tv__label">Last enacted</span>
              <PolicyCard policy={t.event.policy} size="md" />
            </div>
          )}
        </aside>
      </div>

      <Placards t={t} players={ps} reactions={reactions} tv />

      {m && (
        <VerdictMoment
          key={m.key}
          size="tv"
          outcome={
            m.moment.outcome === 'win' || m.moment.outcome === 'loss' ? m.moment.outcome : 'reveal'
          }
          title={m.moment.title}
          detail={m.moment.detail}
          emblem={
            m.key.startsWith('p') && t.event?.kind === 'enacted' ? (
              <PolicyCard policy={t.event.policy} size="md" />
            ) : undefined
          }
          onDone={m.done}
        />
      )}
    </ShFrame>
  );
};
