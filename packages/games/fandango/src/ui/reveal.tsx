'use client';

import type { CSSProperties } from 'react';
import { Token, useTheme, type GameUi, type ScreenPlayer } from '@jackdaw/ui';
import type { FandangoReveal } from '../rules';
import { clock } from '../time';
import { Board } from './board';
import { place } from './race';
import './fandango.css';

/** Each player's time on each puzzle; undefined where they didn't solve it. */
function splits(rv: FandangoReveal, id: string): (number | undefined)[] {
  const times = rv.times[id] ?? [];
  return rv.puzzles.map((_, i) =>
    times[i] === undefined ? undefined : times[i]! - (i === 0 ? rv.startedAt : times[i - 1]!),
  );
}

/** Who was fastest on each puzzle, and how fast. */
function fastest(rv: FandangoReveal): ({ id: string; ms: number } | null)[] {
  return rv.puzzles.map((_, i) => {
    let best: { id: string; ms: number } | null = null;
    for (const id of rv.order) {
      const ms = splits(rv, id)[i];
      if (ms !== undefined && (!best || ms < best.ms)) best = { id, ms };
    }
    return best;
  });
}

function Podium({
  rv,
  players,
  me,
}: {
  rv: FandangoReveal;
  players: ScreenPlayer[];
  me?: string | null;
}) {
  const best = fastest(rv);
  return (
    <section className="fd-reveal__part" aria-label="How everyone finished">
      <h3 className="jd-display fd-reveal__h">How everyone finished</h3>
      <ol className="fd-podium">
        {rv.order.map((id, k) => {
          const p = players.find((x) => x.id === id);
          const times = rv.times[id] ?? [];
          const all = times.length === rv.count;
          const mine = splits(rv, id);
          return (
            <li
              key={id}
              className={`fd-podium__row${all ? ' is-all' : ''}${id === me ? ' is-me' : ''}`}
            >
              <span className="fd-podium__place">{place(k)}</span>
              {p ? <Token avatar={p.avatar} size={36} /> : <span className="fd-podium__gone" />}
              <span className="fd-podium__name">
                {p?.name ?? 'Someone'}
                {id === me && <small> (you)</small>}
              </span>
              <span className="fd-podium__total">
                {all ? clock(times.at(-1)! - rv.startedAt) : `${times.length} of ${rv.count}`}
                <small>{all ? (rv.count === 1 ? 'Solved' : `All ${rv.count}`) : 'Solved'}</small>
              </span>
              {rv.count > 1 && (
                <ol className="fd-podium__splits" aria-label="Time on each puzzle">
                  {mine.map((ms, i) => (
                    <li
                      key={i}
                      className={`fd-split${best[i]?.id === id ? ' is-best' : ''}${ms === undefined ? ' is-none' : ''}`}
                    >
                      <span>{i + 1}</span>
                      {ms === undefined ? '–' : clock(ms)}
                    </li>
                  ))}
                </ol>
              )}
            </li>
          );
        })}
      </ol>
      {rv.count > 1 && (
        <p className="fd-reveal__note">
          <span className="fd-split is-best">
            <span>#</span>
          </span>{' '}
          Fastest on that puzzle
        </p>
      )}
    </section>
  );
}

/** One player alone: their total, their fastest puzzle and their average, then each split. */
function Facts({ rv }: { rv: FandangoReveal }) {
  const id = rv.order[0]!;
  const mine = splits(rv, id);
  const done = mine.filter((ms): ms is number => ms !== undefined);
  const times = rv.times[id] ?? [];
  const facts: [string, string][] = [
    [
      done.length === rv.count ? 'Total' : 'Solved',
      done.length === rv.count
        ? clock(times.at(-1)! - rv.startedAt)
        : `${done.length} of ${rv.count}`,
    ],
  ];
  if (done.length > 1) {
    const fast = Math.min(...done);
    facts.push(['Fastest', `${clock(fast)} · No. ${mine.indexOf(fast) + 1}`]);
    facts.push(['Average', clock(done.reduce((a, b) => a + b, 0) / done.length)]);
  }
  return (
    <section className="fd-reveal__part" aria-label="Your times">
      <dl className="fd-facts">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Answers({
  rv,
  players,
  captions = true,
}: {
  rv: FandangoReveal;
  players: ScreenPlayer[];
  captions?: boolean;
}) {
  const race = rv.order.length > 1;
  const best = fastest(rv);
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? 'Someone';
  return (
    <div className="fd-answers">
      {rv.puzzles.map((p, i) => (
        <figure key={i} className="fd-answer">
          <div className="fd-answer__fit">
            <Board puzzle={p} cells={p.answer} label={`Puzzle ${i + 1}, solved`} />
          </div>
          {captions && (
            <figcaption>
              <b>Puzzle {i + 1}</b>
              {best[i] && (
                <span>
                  {race ? `${name(best[i]!.id)} ${clock(best[i]!.ms)}` : clock(best[i]!.ms)}
                </span>
              )}
            </figcaption>
          )}
        </figure>
      ))}
    </div>
  );
}

export const Reveal: NonNullable<GameUi['Reveal']> = ({ result, players, me }) => {
  const rv = result.reveal as FandangoReveal;
  const look = useTheme();
  return (
    <div className="fd fd-reveal" data-look={look}>
      {rv.order.length > 1 ? <Podium rv={rv} players={players} me={me} /> : <Facts rv={rv} />}
      <section className="fd-reveal__part" aria-label="The answers">
        <h3 className="jd-display fd-reveal__h">{rv.count === 1 ? 'The answer' : 'The answers'}</h3>
        <Answers rv={rv} players={players} />
      </section>
    </div>
  );
};

/** As many columns as make the boards biggest in a box about twice as wide as it is tall. */
function fitColumns(n: number, aspect = 2): number {
  let best = 1;
  let size = 0;
  for (let c = 1; c <= n; c++) {
    const s = Math.min(aspect / c, 1 / Math.ceil(n / c));
    if (s > size) [best, size] = [c, s];
  }
  return best;
}

/** On the TV the platform lists the standings; this shows the fastest solve and every answer. */
export const TvReveal: NonNullable<GameUi['TvReveal']> = ({ result, players }) => {
  const rv = result.reveal as FandangoReveal;
  const look = useTheme();
  let quickest: { id: string; ms: number; n: number } | null = null;
  for (const [i, b] of fastest(rv).entries()) {
    if (b && (!quickest || b.ms < quickest.ms)) quickest = { ...b, n: i + 1 };
  }
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? 'Someone';
  const cols = fitColumns(rv.count);
  return (
    <div className="fd fd-tv-end" data-look={look}>
      {quickest && (
        <p className="fd-tv-end__fact">
          <span>Fastest puzzle</span>
          <b>
            {rv.order.length > 1 ? `${name(quickest.id)}, ` : ''}No. {quickest.n} in{' '}
            {clock(quickest.ms)}
          </b>
        </p>
      )}
      <div
        className="fd-tv-end__boards"
        style={{ '--cols': cols, '--rows': Math.ceil(rv.count / cols) } as CSSProperties}
      >
        <Answers rv={rv} players={players} captions={rv.count <= 6} />
      </div>
    </div>
  );
};
