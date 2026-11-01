'use client';

import { useEffect, useState } from 'react';
import { useMoment, useTheme, VerdictMoment, type GameUi } from '@jackdaw/ui';
import { fmtTime, SPRINT_LINES, type FeedItem, type TetraTableView } from '../rules';
import { Well } from './well';
import { clockText, Countdown, ordinal, Pips, roundVerdict } from './parts';
import './tetra.css';

/** Ticks a clock on screens that have no frame loop of their own. */
function useNow(now: () => number, ms = 200): number {
  const [t, setT] = useState(now);
  useEffect(() => {
    const id = setInterval(() => setT(now()), ms);
    return () => clearInterval(id);
  }, [now, ms]);
  return t;
}

function feedLine(f: FeedItem, name: (id: string) => string): string {
  if (f.kind === 'ko' && f.by) return `${name(f.by)} knocked out ${name(f.who)}`;
  if (f.kind === 'out') return `${name(f.who)} topped out`;
  if (f.kind === 'finish' && f.value !== undefined)
    return `${name(f.who)}: forty lines in ${fmtTime(f.value)}`;
  return `${name(f.who)}: ${f.text}${f.value ? `, ${f.value} thrown` : ''}`;
}

/**
 * The TV: every well side by side, biggest when there are few, each with its name plate, round
 * pips (Versus), time or score, and the rubble it's owed as a red bar. The clock and a running feed
 * of knockouts and big clears sit above.
 */
export const TvScreen: GameUi['TvScreen'] = ({ tableView, players, now }) => {
  const v = tableView as TetraTableView;
  const look = useTheme();
  const t = useNow(now);
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? 'Someone';
  const [ended, dismiss] = useMoment(v.rounds.length);
  const last = v.rounds[v.rounds.length - 1];
  const verdict = ended && last ? roundVerdict(v, last, null, name) : null;
  const order = last && v.phase !== 'play' ? last.order : null;

  return (
    <div className="ttr ttr-tv" data-look={look}>
      <header className="ttr-tv__head">
        <span className="ttr-tv__mode">
          {v.mode === 'versus'
            ? `Versus · first to ${v.firstTo}`
            : v.mode === 'sprint'
              ? `Sprint · ${SPRINT_LINES} lines`
              : 'Blitz · two minutes'}
        </span>
        <span className="ttr-tv__clock">
          {v.mode === 'versus' ? `Round ${v.round}` : clockText(v, undefined, t)}
        </span>
        <ol className="ttr-tv__feed" aria-label="What just happened">
          {v.feed.slice(-3).map((f) => (
            <li key={f.seq} className={`ttr-feed--${f.kind}`}>
              {feedLine(f, name)}
            </li>
          ))}
        </ol>
      </header>
      <div className="ttr-tv__grid" data-count={v.boards.length}>
        {v.boards.map((b) => (
          <figure key={b.id} className={`ttr-tv__one${b.done ? ' is-out' : ''}`}>
            <div className="ttr-tv__wellbox">
              <span
                className="ttr-tv__owe"
                style={{ height: `${Math.min(100, (b.owing / 20) * 100)}%` }}
              />
              <Well well={b.well} dim={b.topped} label={`${name(b.id)}'s well`} />
              {b.done && v.phase === 'play' && (
                <span className="ttr-tv__stamp">
                  {b.topped
                    ? b.place
                      ? ordinal(b.place)
                      : 'Out'
                    : b.finishMs !== null
                      ? fmtTime(b.finishMs)
                      : 'Done'}
                </span>
              )}
              {order && <span className="ttr-tv__stamp">{ordinal(order.indexOf(b.id) + 1)}</span>}
            </div>
            <figcaption>
              <b>{name(b.id)}</b>
              {v.mode === 'versus' ? (
                <>
                  <Pips won={v.wins[b.id] ?? 0} of={v.firstTo} />
                  <span>
                    {b.sent} thrown · {b.kos} KO
                  </span>
                </>
              ) : v.mode === 'sprint' ? (
                <span>
                  {b.finishMs !== null
                    ? fmtTime(b.finishMs)
                    : `${Math.min(b.lines, SPRINT_LINES)}/${SPRINT_LINES} lines`}
                </span>
              ) : (
                <span>
                  {b.score.toLocaleString('en-GB')} · {b.lines} lines
                </span>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
      <Countdown v={v} now={t} tv />
      {verdict && (
        <VerdictMoment
          key={`round-${last!.round}`}
          outcome="reveal"
          title={verdict.title}
          detail={verdict.detail}
          size="tv"
          onDone={dismiss}
        />
      )}
    </div>
  );
};
