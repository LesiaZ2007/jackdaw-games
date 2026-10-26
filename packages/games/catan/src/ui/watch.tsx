'use client';

import { VerdictMoment, useMoment, type GameUi, type ScreenPlayer } from '@jackdaw/ui';
import { awardMoment, robberyMoment } from '../moments';
import type { CatanTableView } from '../rules';
import { RESOURCES } from '../types';
import { CatanBoard } from './board';
import { logLine, namer } from './common';
import { Pip } from './glyphs';
import { RollMoment } from './roll';
import { CardRow } from './sheets';
import { Opponents, TurnStrip } from './strip';
import { revealWords } from './tv';
import './catan.css';
import './phone.css';

/**
 * Catan for someone watching on a phone: the phone's own turn strip and dice, everyone's cards and
 * points, and the island, with what the last roll paid, any open offers and the latest move where
 * the hand and dock would be. Public facts only, as on the TV.
 */
export const WatchScreen: NonNullable<GameUi['WatchScreen']> = ({
  tableView,
  players: shellPlayers,
  now,
  reactions,
}) => {
  const t = tableView as CatanTableView;
  const players = shellPlayers as ScreenPlayer[];
  const name = namer(players);
  const [rolling, rolled] = useMoment(t.rollSeq);
  const [freshRob, dropRob] = useMoment(t.robbery?.seq ?? 0);
  const [freshAward, dropAward] = useMoment(t.award?.seq ?? 0);
  const rob = freshRob ? robberyMoment(t, null) : null;
  const award = !rob && freshAward ? awardMoment(t, null) : null;
  const total = t.dice ? t.dice[0] + t.dice[1] : null;
  const paid = Object.entries(t.produced).filter(([, c]) => RESOURCES.some((r) => c[r]));
  const offers = t.phase === 'main' ? t.offers.slice(-1) : [];
  const last = t.log[t.log.length - 1];

  return (
    <div className="ctn ctn--phone ctn--watch">
      <TurnStrip
        t={t}
        me={null}
        players={players}
        now={now}
        myPoints={null}
        diceWaiting={rolling !== null}
      />
      {rolling !== null && t.dice && (
        <RollMoment
          key={rolling}
          dice={t.dice}
          seq={t.rollSeq}
          target=".ctn-strip .ctn-dice"
          onDone={rolled}
        />
      )}
      <Opponents t={t} me={null} players={players} reactions={reactions} />
      <div className="ctn-stage">
        <CatanBoard
          board={t.board}
          buildings={t.buildings}
          roads={t.roads}
          robber={t.robber}
          seats={t.seats}
          roll={total ? { total, seq: t.rollSeq } : null}
          label="The island"
          pad={0.95}
        />
      </div>
      <section className="ctn-watch" aria-live="polite">
        {total !== null && t.phase !== 'setup' && (
          <p className="ctn-watch__roll">
            <b>Rolled {total}</b>
            {total === 7 ? (
              <span>The robber moves</span>
            ) : paid.length ? (
              paid.map(([id, c]) => (
                <span key={id} className="ctn-watch__gain">
                  {name(id)}
                  {RESOURCES.filter((r) => c[r]).map((r) => (
                    <Pip key={r} res={r} n={c[r]} />
                  ))}
                </span>
              ))
            ) : (
              <span>Nobody takes anything</span>
            )}
          </p>
        )}
        {offers.map((o) => (
          <p key={o.id} className="ctn-watch__offer">
            <b>{name(o.from)}</b> offers <CardRow cards={o.give} /> for <CardRow cards={o.want} />
            {o.to && <span> to {name(o.to)}</span>}
          </p>
        ))}
        {last && <p className="ctn-watch__log">{logLine(last, name)}</p>}
      </section>
      {(rob || award) && (
        <VerdictMoment
          key={rob ? `r${rob.key}` : `a${award!.key}`}
          outcome="reveal"
          {...revealWords((rob ?? award)!, name)}
          onDone={rob ? dropRob : dropAward}
        />
      )}
    </div>
  );
};
