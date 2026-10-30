'use client';

import type { CSSProperties } from 'react';
import { PlayerReaction, Token, type GameUi, type ScreenPlayer } from '@jackdaw/ui';
import type { SolitaireTableView } from '../rules';
import { Middle, StockWaste, Tableau, tintOf } from './pieces';
import { PullBanner, Rivals, statusLine } from './player';
import './solitaire.css';

/**
 * Solitaire on the TV: the shared middle across the top, the latest card landing on it, and
 * everyone's layout below with their cards to go. When everyone is stuck, the pull is called
 * out large.
 */
export const TvScreen: GameUi['TvScreen'] = ({ tableView, reactions, ...props }) => {
  const t = tableView as SolitaireTableView;
  const players = props.players as ScreenPlayer[];
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? 'Someone';
  const leader = Math.min(...t.players.map((id) => t.seats[id]!.left));
  return (
    <div
      className="sol sol--tv"
      style={{ '--boards': Math.min(t.players.length, 3) } as CSSProperties}
    >
      <header className="sol__head">
        <h2 className="jd-display">{statusLine(t, null, name)}</h2>
        <p>
          {t.draw === 1 ? 'Draw one' : 'Draw three'}
          {t.pulls > 0 && ` · everyone has pulled ${t.pulls}×`}
        </p>
      </header>
      <Middle foundations={t.foundations} players={players} landed={t.last} />
      <div className="sol-boards">
        {t.players.map((id) => {
          const p = players.find((x) => x.id === id);
          const s = t.seats[id]!;
          return (
            <section
              key={id}
              className={[
                'sol-board',
                s.stuck && 'sol-board--stuck',
                s.left === leader && t.players.length > 1 && 'sol-board--lead',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <header>
                <span className="sol-rival__token">
                  {p && <Token avatar={p.avatar} away={!p.online} size={56} />}
                  <PlayerReaction reactions={reactions} playerId={id} />
                </span>
                <b>{p?.name ?? 'Someone'}</b>
                <span>
                  {s.left} {s.stuck ? 'stuck' : 'to go'}
                </span>
              </header>
              <div className="sol-board__body">
                <StockWaste seat={s} back={tintOf(players, id)} />
                <div className="sol-stage">
                  <Tableau seat={s} back={tintOf(players, id)} />
                </div>
              </div>
            </section>
          );
        })}
      </div>
      <PullBanner t={t} me={null} name={name} big />
    </div>
  );
};

/** Someone watching on a phone: the middle and how everyone's getting on. */
export const WatchScreen: NonNullable<GameUi['WatchScreen']> = ({
  tableView,
  reactions,
  ...props
}) => {
  const t = tableView as SolitaireTableView;
  const players = props.players as ScreenPlayer[];
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? 'Someone';
  return (
    <div className="sol sol--phone sol--watch">
      <header className="sol__head">
        <h2 className="jd-display">{statusLine(t, null, name)}</h2>
      </header>
      <Middle foundations={t.foundations} players={players} landed={t.last} />
      <Rivals t={t} players={players} ids={t.players} reactions={reactions} />
      <PullBanner t={t} me={null} name={name} />
    </div>
  );
};
