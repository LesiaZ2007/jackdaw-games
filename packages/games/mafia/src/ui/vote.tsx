'use client';

import type { CSSProperties } from 'react';
import { Token, type ScreenPlayer } from '@jackdaw/ui';
import type { MafiaTableView } from '../rules';

const vars = (v: Record<string, string | number>) => v as CSSProperties;

/**
 * Who voted for whom, straight after the count (the dusk). One row per player who got votes,
 * most first, each voter's token dropping into the row in turn; the skips; anyone who didn't
 * vote. The one voted out is stamped OUT. Votes are public once counted.
 */
export function VoteBoard({
  t,
  players,
  size = 'phone',
}: {
  t: MafiaTableView;
  players: ScreenPlayer[];
  size?: 'phone' | 'tv';
}) {
  const v = t.lastVote;
  if (!v) return null;
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  // Who could vote: everyone alive now, plus whoever this vote (and its grief) took.
  const tookNow = t.deaths.filter(
    (d) => d.day === v.day && (d.cause === 'vote' || d.cause === 'grief'),
  );
  const could = [...t.alive, ...tookNow.map((d) => d.id)];
  const missing = t.players.filter((id) => could.includes(id) && !v.votes[id]);
  const rows = Object.entries(v.counts)
    .sort(([a, x], [b, y]) => y - x || Number(a === 'skip') - Number(b === 'skip'))
    .map(([target, count]) => ({
      target,
      count,
      voters: t.players.filter((id) => v.votes[id] === target),
    }));
  const tok = size === 'tv' ? 44 : 30;
  // A busy vote goes in two columns, voters by token alone, so every row fits.
  const many = rows.length > 3;
  let order = 0;

  return (
    <section
      className={`mf-ballot mf-ballot--${size}${many ? ' mf-ballot--many' : ''}`}
      aria-label={`Day ${v.day}: who voted for whom`}
    >
      <h3 className="mf-ballot__head">
        {t.mode === 'Mafia' ? 'How the town voted' : 'How the village voted'}
      </h3>
      <ol className="mf-ballot__rows">
        {rows.map((r) => {
          const out = r.target === v.out;
          const target = r.target === 'skip' ? null : byId.get(r.target);
          return (
            <li key={r.target} className={out ? 'mf-ballot__row is-out' : 'mf-ballot__row'}>
              <span className="mf-ballot__who">
                {target ? (
                  <Token avatar={target.avatar} size={tok} />
                ) : (
                  <span className="mf-ballot__skip" aria-hidden="true">
                    –
                  </span>
                )}
                <span className="mf-ballot__name">
                  {r.target === 'skip' ? 'Skip' : name(r.target)}
                </span>
                {out && <span className="mf-ballot__out">Out</span>}
              </span>
              <span className="mf-ballot__count">{r.count}</span>
              <ul
                className="mf-ballot__voters"
                aria-label={`Voted for by ${r.voters.map(name).join(', ')}`}
              >
                {r.voters.map((id) => {
                  const p = byId.get(id);
                  const twice = v.double.includes(id);
                  return (
                    <li
                      key={id}
                      className="mf-ballot__voter"
                      style={vars({ '--k': order++ })}
                      title={`${name(id)}${twice ? ' (counts twice)' : ''}`}
                    >
                      {p && <Token avatar={p.avatar} size={tok} />}
                      <span className="mf-ballot__vname">
                        {name(id)}
                        {twice && <b> ×2</b>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>
      {!v.out && (
        <p className="mf-ballot__note">
          {rows.length === 0 ? 'Nobody voted.' : 'No verdict: a tie, or as many skipped.'}
        </p>
      )}
      {missing.length > 0 && (
        <p className="mf-ballot__note">Didn’t vote: {missing.map(name).join(', ')}</p>
      )}
    </section>
  );
}
