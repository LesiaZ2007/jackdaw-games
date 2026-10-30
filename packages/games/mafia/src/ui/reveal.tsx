'use client';

import { Token, useTheme, type GameUi } from '@jackdaw/ui';
import { ROLE_INFO, TEAM_NAME } from '../roles';
import { teamOf, type MafiaReveal } from '../rules';
import { RoleMark } from './art';
import { MASTHEAD } from './words';
import './mafia.css';

const HOW = {
  night: 'Killed in the night',
  vote: 'Voted out',
  grief: 'Died of a broken heart',
  shot: 'Shot by the Hunter',
} as const;

/** The final edition: every card face up, the winners first, and how each of the dead went. */
export const Reveal: NonNullable<GameUi['Reveal']> = ({ result, players }) => {
  const r = result.reveal as MafiaReveal;
  const look = useTheme();
  const byId = new Map(players.map((p) => [p.id, p]));
  const ids = Object.keys(r.roles).sort(
    (a, b) => Number(result.winners.includes(b)) - Number(result.winners.includes(a)),
  );
  return (
    <div className={`mf mf--${r.mode === 'Mafia' ? 'city' : 'village'} mf-final`} data-look={look}>
      <h2 className="mf-mast__name">{MASTHEAD[r.mode]}</h2>
      <p className="mf-final__line">{r.win.line}</p>
      <ul className="mf-final__cards">
        {ids.map((id) => {
          const p = byId.get(id);
          const role = r.roles[id]!;
          const death = r.deaths.find((d) => d.id === id);
          const won = result.winners.includes(id);
          return (
            <li
              key={id}
              className={`mf-final__c mf-team-${ROLE_INFO[role].team}${won ? ' is-won' : ''}${death ? ' is-dead' : ''}`}
            >
              {p && <Token avatar={p.avatar} size={44} />}
              <span className="mf-final__who">
                <b>{p?.name ?? 'Someone'}</b>
                <span>
                  {ROLE_INFO[role].name}
                  {teamOf(r, id) === 'lovers' && `, ${TEAM_NAME[r.mode].lovers}`}
                </span>
                <small>
                  {death
                    ? `${HOW[death.cause]}${death.cause === 'vote' ? `, day ${death.day}` : ''}`
                    : 'Survived'}
                </small>
              </span>
              <span className="mf-final__mark">
                <RoleMark role={role} size="100%" />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
