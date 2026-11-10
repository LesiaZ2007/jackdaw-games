'use client';

import { useRef, useState } from 'react';
import { Plaque, Sheet, useMoment, type GameUi, type ScreenPlayer } from '@jackdaw/ui';
import type { WordhoardTableView } from '../rules';
import { MeaningPopup } from './define';
import { Ledger, Pouch, useWide } from './hoard';
import { BoardFrame, BoardGrid, Legend } from './pieces';
import { Scores, TurnClock, moveText, sideName } from './player';
import { DROP_GAP } from './tv';
import './wordhoard.css';

/**
 * Letterhoard for someone watching on a phone: the phone's own heading, scores and board, with the
 * latest plays where the rack would be (the ledger, on a laptop). A word that lands drops in tile
 * by tile, as on the TV, and then says what it means.
 */
export const WatchScreen: NonNullable<GameUi['WatchScreen']> = ({
  tableView,
  reactions,
  now,
  ...props
}) => {
  const t = tableView as WordhoardTableView;
  const players = props.players as ScreenPlayer[];
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  const last = t.moves[t.moves.length - 1];
  const [fresh, dismiss] = useMoment(t.moves.length);
  const landing = fresh !== null && last?.kind === 'play' ? last : null;
  const root = useRef<HTMLDivElement>(null);
  const wide = useWide(root);
  const [ledgerOpen, setLedgerOpen] = useState(false);

  return (
    <div className="wh wh--phone wh--watch" ref={root}>
      <header className="wh__head">
        <h2 className="jd-display">
          {t.over ? 'Final scores' : `${sideName(t, t.turn, name)}’s turn`}
          {!t.over && <TurnClock at={t.turnBy} now={now} />}
        </h2>
        {!wide && (
          <Plaque small className="wh-ledgerbtn" onClick={() => setLedgerOpen(true)}>
            Ledger
          </Plaque>
        )}
        <div className="wh__bag">
          <Pouch count={t.bagCount} />
        </div>
      </header>
      <Scores
        t={t}
        players={players}
        reactions={reactions}
        gain={
          landing
            ? {
                player: landing.player,
                n: landing.score,
                key: t.moves.length,
                delay: (landing.cells?.length ?? 1) * DROP_GAP + 700,
              }
            : undefined
        }
      />
      <div className="wh-stage">
        <BoardFrame>
          <BoardGrid
            board={t.board}
            recent={last?.cells}
            scored={landing?.score}
            dropIn={landing ? DROP_GAP : undefined}
          />
        </BoardFrame>
        <Legend />
      </div>
      {wide ? (
        <div className="wh-ledger-slot">
          <Ledger moves={t.moves} players={players} />
        </div>
      ) : (
        <ol className="wh-watch__moves" aria-label="Latest plays">
          {t.moves.length === 0 ? (
            <li>No words yet. The first has to cover the star.</li>
          ) : (
            t.moves
              .slice(-3)
              .reverse()
              .map((m, i) => <li key={t.moves.length - i}>{moveText(m, name)}</li>)
          )}
        </ol>
      )}
      <Sheet open={ledgerOpen && !wide} onClose={() => setLedgerOpen(false)} title="Ledger">
        <Ledger moves={t.moves} players={players} flat />
      </Sheet>
      {landing && (
        <MeaningPopup
          key={`meaning-${t.moves.length}`}
          move={landing}
          who={name(landing.player)}
          onDone={dismiss}
        />
      )}
    </div>
  );
};
