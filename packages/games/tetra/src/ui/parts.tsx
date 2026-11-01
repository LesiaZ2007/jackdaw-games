'use client';

import type { Outcome } from '@jackdaw/ui';
import {
  BLITZ_MS,
  fmtTime,
  SPRINT_LINES,
  type PublicBoard,
  type RoundEnd,
  type TetraTableView,
} from '../rules';

/** Three, two, one over the well before stones fall. */
export function Countdown({ v, now, tv }: { v: TetraTableView; now: number; tv?: boolean }) {
  if (v.phase !== 'play' || now >= v.startAt) return null;
  const n = Math.ceil((v.startAt - now) / 1000);
  return (
    <div className={`ttr-count${tv ? ' ttr-count--tv' : ''}`} aria-live="assertive">
      <span key={n}>{n}</span>
      <small>
        {v.mode === 'versus'
          ? `Round ${v.round}`
          : v.mode === 'sprint'
            ? `${SPRINT_LINES} lines`
            : 'Two minutes'}
      </small>
    </div>
  );
}

/** Round wins as filled and open lozenges. */
export function Pips({ won, of }: { won: number; of: number }) {
  return (
    <span className="ttr-pips" aria-label={`${won} of ${of} rounds`}>
      {Array.from({ length: of }, (_, i) => (
        <i key={i} className={i < won ? 'is-won' : ''} />
      ))}
    </span>
  );
}

/** The clock for this mode: Sprint counts up, Blitz counts down, Versus shows the round. */
export function clockText(v: TetraTableView, b: PublicBoard | undefined, now: number): string {
  if (v.phase !== 'play' || now < v.startAt)
    return v.mode === 'blitz' ? fmtTime(BLITZ_MS) : '0.00s';
  if (v.mode === 'blitz' && v.endsAt) return fmtTime(Math.max(0, v.endsAt - now));
  if (b?.finishMs != null) return fmtTime(b.finishMs);
  return fmtTime(Math.max(0, now - v.startAt));
}

/** A player's numbers under their hold, by mode. */
export function Statline({ v, b, now }: { v: TetraTableView; b: PublicBoard; now: number }) {
  const rows: [string, string][] =
    v.mode === 'sprint'
      ? [
          ['Time', clockText(v, b, now)],
          ['Lines', `${Math.min(b.lines, SPRINT_LINES)}/${SPRINT_LINES}`],
        ]
      : v.mode === 'blitz'
        ? [
            ['Left', clockText(v, b, now)],
            ['Score', b.score.toLocaleString('en-GB')],
            ['Lines', String(b.lines)],
          ]
        : [
            ['Round', `${v.round}`],
            ['Thrown', String(b.sent)],
            ['KOs', String(b.kos)],
          ];
  return (
    <dl className="ttr-stats">
      {rows.map(([k, val]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{val}</dd>
        </div>
      ))}
    </dl>
  );
}

/** What a phone (or the TV, with `me` null) says when a round ends. */
export function roundVerdict(
  v: TetraTableView,
  r: RoundEnd,
  me: string | null,
  name: (id: string) => string,
): { outcome: Outcome; title: string; detail: string } {
  const playing = me !== null && v.boards.some((b) => b.id === me);
  const won = r.winner !== null && r.winner === me;
  const outcome: Outcome = !playing ? 'reveal' : won ? 'win' : 'loss';
  const who = r.winner ? name(r.winner) : 'No one';
  const matchOver = v.phase === 'show' || v.phase === 'over';
  if (v.mode === 'versus') {
    const tally = v.boards.map((b) => `${name(b.id)} ${v.wins[b.id] ?? 0}`).join(' · ');
    const title = won
      ? matchOver
        ? 'You win the match'
        : `You take round ${r.round}`
      : matchOver
        ? `${who} wins the match`
        : `${who} takes round ${r.round}`;
    return { outcome, title, detail: tally };
  }
  const place = me ? r.order.indexOf(me) + 1 : 0;
  const best = v.boards.find((b) => b.id === r.order[0]);
  const feat = !best
    ? ''
    : v.mode === 'sprint'
      ? best.finishMs !== null
        ? `Forty lines in ${fmtTime(best.finishMs)}`
        : `${best.lines} lines`
      : `${best.score.toLocaleString('en-GB')} points`;
  if (v.boards.length === 1) {
    const done = v.mode === 'blitz' || best?.finishMs != null;
    return { outcome: playing ? (done ? 'win' : 'loss') : 'reveal', title: feat, detail: '' };
  }
  const title = won ? 'You win' : `${who} wins`;
  const detail = [
    feat,
    playing && place > 0 ? `You came ${ordinal(place)} of ${r.order.length}.` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return { outcome, title, detail };
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const m = n % 100;
  return n + (s[(m - 20) % 10] ?? s[m] ?? s[0])!;
}
