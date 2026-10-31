'use client';

import { useTheme, VerdictMoment, type GameUi, type ScreenPlayer } from '@jackdaw/ui';
import type { BackgammonTableView } from '../rules';
import { Tables } from './table';
import {
  boardDice,
  Clock,
  endLine,
  lastLine,
  Log,
  MatchLine,
  Plate,
  tableStatus,
  useFlights,
  useGameEnd,
  type Name,
} from './parts';
import './backgammon.css';

function cubeSide(t: BackgammonTableView) {
  return t.cubeOwner === null ? null : t.cubeOwner === t.players[0] ? 0 : 1;
}

/**
 * Backgammon on the TV, from Ivory's side of the table: the tables large with the points
 * numbered, Ebony's plate above Ivory's beside it, the match score and the last moves.
 */
export const TvScreen: GameUi['TvScreen'] = ({ tableView, reactions, now, ...props }) => {
  const t = tableView as BackgammonTableView;
  const look = useTheme();
  const players = props.players as ScreenPlayer[];
  const byId = new Map(players.map((p) => [p.id, p]));
  const name: Name = (id) => byId.get(id)?.name ?? 'Someone';
  const flights = useFlights(t);
  const [ended, dismiss] = useGameEnd(t);
  const { dice, side } = boardDice(t);

  return (
    <div className="bgm bgm-tv" data-look={look}>
      <header className="bgm-tv__head">
        <p className="bgm-tv__line">{tableStatus(t, name)}</p>
        <Clock at={t.actBy} now={now} />
      </header>
      <div className="bgm-tv__body">
        <aside className="bgm-tv__side">
          <MatchLine t={t} />
          <Plate
            t={t}
            side={1}
            player={byId.get(t.players[1])}
            reactions={reactions}
            name={name}
            size="tv"
          />
          <Plate
            t={t}
            side={0}
            player={byId.get(t.players[0])}
            reactions={reactions}
            name={name}
            size="tv"
          />
          <Log t={t} name={name} rows={6} />
        </aside>
        <div className="bgm-board">
          <Tables
            pos={t.pos}
            viewer={0}
            dice={dice}
            diceSide={side}
            rollKey={t.last?.seq}
            cube={t.cube}
            cubeOwner={cubeSide(t)}
            showCube={t.cubeOn && !t.crawford}
            flights={flights.flights}
            flightKey={flights.key}
            numbers
            label={`The board. ${lastLine(t.last, name)}`}
          />
        </div>
      </div>
      {ended && (
        <VerdictMoment
          key={`end-${ended.game}`}
          size="tv"
          outcome="reveal"
          title={
            t.winner
              ? `${name(ended.winner)} wins the match`
              : `${name(ended.winner)} wins game ${ended.game}`
          }
          detail={endLine(ended)}
          ms={3200}
          onDone={dismiss}
        />
      )}
    </div>
  );
};

/** Someone watching on a phone: the board from Ivory's side, the plates and the last move. */
export const WatchScreen: NonNullable<GameUi['WatchScreen']> = ({
  tableView,
  reactions,
  now,
  ...props
}) => {
  const t = tableView as BackgammonTableView;
  const look = useTheme();
  const players = props.players as ScreenPlayer[];
  const byId = new Map(players.map((p) => [p.id, p]));
  const name: Name = (id) => byId.get(id)?.name ?? 'Someone';
  const flights = useFlights(t);
  const [ended, dismiss] = useGameEnd(t);
  const { dice, side } = boardDice(t);

  return (
    <div className="bgm bgm--phone bgm--watch" data-look={look}>
      <header className="bgm-head">
        <h2 className="bgm-status">{tableStatus(t, name)}</h2>
        <Clock at={t.actBy} now={now} />
      </header>
      <div className="bgm-main">
        <div className="bgm-side">
          <MatchLine t={t} />
          <Plate t={t} side={1} player={byId.get(t.players[1])} reactions={reactions} name={name} />
          <Plate t={t} side={0} player={byId.get(t.players[0])} reactions={reactions} name={name} />
          <Log t={t} name={name} />
        </div>
        <div className="bgm-board">
          <Tables
            pos={t.pos}
            viewer={0}
            dice={dice}
            diceSide={side}
            rollKey={t.last?.seq}
            cube={t.cube}
            cubeOwner={cubeSide(t)}
            showCube={t.cubeOn && !t.crawford}
            flights={flights.flights}
            flightKey={flights.key}
            label="The board"
          />
        </div>
        <div className="bgm-below">
          <Log t={t} name={name} rows={3} />
        </div>
      </div>
      <footer className="bgm-dock">
        <p className="bgm-dock__line" role="status">
          {lastLine(t.last, name)}
        </p>
      </footer>
      {ended && (
        <VerdictMoment
          key={`end-${ended.game}`}
          outcome="reveal"
          title={`${name(ended.winner)} wins game ${ended.game}`}
          detail={endLine(ended)}
          ms={2000}
          onDone={dismiss}
        />
      )}
    </div>
  );
};
