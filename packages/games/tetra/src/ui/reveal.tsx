'use client';

import { useTheme, type GameUi, type ScreenPlayer } from '@jackdaw/ui';
import type { Mode, RoundEnd } from '../rules';
import { ordinal } from './parts';
import './tetra.css';

interface TetraReveal {
  order: string[];
  mode: Mode;
  rounds: RoundEnd[];
  wins: Record<string, number>;
}

/** The match as a list of rounds: who placed where in each. */
function Rounds({ rv, players, tv }: { rv: TetraReveal; players: ScreenPlayer[]; tv?: boolean }) {
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? 'Someone';
  return (
    <div className={`ttr ttr-reveal${tv ? ' ttr-reveal--tv' : ''}`}>
      <ol className="ttr-reveal__rounds">
        {rv.rounds.map((r) => (
          <li key={r.round}>
            <span className="ttr-reveal__n">
              {rv.mode === 'versus' ? `Round ${r.round}` : 'Final order'}
            </span>
            <span className="ttr-reveal__order">
              {r.order.map((id, i) => (
                <span key={id} className={i === 0 ? 'is-first' : ''}>
                  {ordinal(i + 1)} {name(id)}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export const Reveal: NonNullable<GameUi['Reveal']> = ({ result, players }) => {
  const look = useTheme();
  return (
    <div data-look={look}>
      <Rounds rv={result.reveal as TetraReveal} players={players} />
    </div>
  );
};

export const TvReveal: NonNullable<GameUi['TvReveal']> = ({ result, players }) => {
  const look = useTheme();
  return (
    <div data-look={look}>
      <Rounds rv={result.reveal as TetraReveal} players={players} tv />
    </div>
  );
};
