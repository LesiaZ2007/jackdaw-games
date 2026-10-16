'use client';

import { VerdictMoment, type GameUi, type ScreenPlayer } from '@jackdaw/ui';
import type { ShTableView } from '../rules';
import { busyPlayers } from '../status';
import { PhaseBanner } from './banner';
import { Board, nameFrom, PlayerStrip, PolicyCard, ShFrame } from './board';
import { StatusBar, useShMoment } from './player';

/**
 * Secret Hitler on the TV, in secret-hitler.online's order: everyone across the top with the
 * office placards and an hourglass on whoever the game is waiting on, the status line big under
 * them, then the board (draw pile, both tracks and the tracker, discard pile). The phase banner
 * sweeps across at each new phase. Public information only.
 */
export const TvScreen: GameUi['TvScreen'] = ({ tableView, players, reactions }) => {
  const t = tableView as ShTableView;
  const ps = players as ScreenPlayer[];
  const name = nameFrom(ps);
  const m = useShMoment(t, null, name);

  return (
    <ShFrame className="sh-tv">
      <PlayerStrip
        t={t}
        players={ps}
        reactions={reactions}
        busy={busyPlayers(t)}
        known={t.roles ?? {}}
        tv
      />
      <StatusBar t={t} name={name} me={null} tv />
      <Board t={t} tv />
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
      <PhaseBanner t={t} waiting={Boolean(m)} tv />
    </ShFrame>
  );
};
