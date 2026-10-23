'use client';

import type { GameUi } from '@jackdaw/ui';
import { TEAM_NAME, other, rating, type WavelengthReveal } from '../rules';
import { Dial } from './dial';

/** Under the verdict: every round, its card, clue and psychic, and where the dial landed. */
export const Reveal: NonNullable<GameUi['Reveal']> = ({ result, players }) => {
  const rv = result.reveal as WavelengthReveal;
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? 'Someone';
  return (
    <section className="wl wl-reveal" aria-label="Every round">
      <p className="wl-reveal__total">
        {rv.mode === 'teams'
          ? `Sun ${rv.scores.sun}, Moon ${rv.scores.moon}`
          : `${rv.scores.sun} points: ${rating(rv.scores.sun, rv.history.length)}`}
      </p>
      <ol className="wl-reveal__list">
        {rv.history.map((h) => (
          <li key={h.n} className={`wl-reveal__round wl-reveal__round--${h.team}`}>
            <div className="wl-reveal__dial">
              <Dial spectrum={h.spectrum} value={h.guess} target={h.target} open />
            </div>
            <div className="wl-reveal__text">
              <p className="wl-reveal__clue">“{h.clue}”</p>
              <p>
                {name(h.psychic)}
                {rv.mode === 'teams' && ` for ${TEAM_NAME[h.team]}`}:{' '}
                {h.points ? `+${h.points}` : 'no points'}
                {h.call &&
                  `. ${TEAM_NAME[other(h.team)]} called ${h.call}${h.callPoint ? ', +1' : ''}`}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
};
