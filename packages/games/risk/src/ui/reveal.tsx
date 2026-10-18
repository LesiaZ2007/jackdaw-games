'use client';

import { OutcomeChip, Token, type GameUi, type ScreenPlayer } from '@jackdaw/ui';
import { getMap } from '../maps';
import { missionText } from '../missions';
import type { RiskReveal } from '../rules';
import { namer } from './common';
import { RiskMap } from './map';
import './risk.css';

function Missions({ r, players }: { r: RiskReveal; players: ScreenPlayer[] }) {
  const map = getMap(r.map);
  const name = namer(players);
  if (!r.missions) return null;
  return (
    <ul className="rk-missions">
      {players.map((p) => {
        const m = r.missions![p.id];
        if (!m) return null;
        return (
          <li key={p.id} className="rk-missions__row">
            <Token avatar={p.avatar} size={28} />
            <span className="rk-missions__who">{p.name}</span>
            <span className="rk-missions__what">{missionText(m, map, name)}</span>
            {p.id === r.winner && <OutcomeChip outcome="win">Done</OutcomeChip>}
          </li>
        );
      })}
    </ul>
  );
}

/** Under the verdict: everyone's secret mission, and the map as it ended. */
export const Reveal: NonNullable<GameUi['Reveal']> = ({ result, players }) => {
  const r = result.reveal as RiskReveal;
  return (
    <div className="rk rk-reveal">
      <Missions r={r} players={players} />
      <div className="rk-reveal__map">
        <RiskMap map={getMap(r.map)} owner={r.owner} armies={r.armies} players={players} zoomable />
      </div>
    </div>
  );
};

/** The TV's results: the final map, with the missions beside it. */
export const TvReveal: NonNullable<GameUi['TvReveal']> = ({ result, players }) => {
  const r = result.reveal as RiskReveal;
  return (
    <div className="rk rk-reveal rk-reveal--tv">
      <div className="rk-reveal__map">
        <RiskMap
          map={getMap(r.map)}
          owner={r.owner}
          armies={r.armies}
          players={players}
          names
          scale={1.6}
        />
      </div>
      <Missions r={r} players={players} />
    </div>
  );
};
