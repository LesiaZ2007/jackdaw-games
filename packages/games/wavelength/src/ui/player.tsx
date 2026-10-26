'use client';

import { useCallback, useState } from 'react';
import {
  Plaque,
  Tally,
  useCountdown,
  useMoment,
  VerdictMoment,
  type GameUi,
  type ScreenPlayer,
} from '@jackdaw/ui';
import {
  CLUE_MAX,
  MIDDLE,
  other,
  TEAM_NAME,
  type Side,
  type WavelengthAction,
  type WavelengthPlayerView,
  type WavelengthTableView,
} from '../rules';
import { Dial, useDialSync } from './dial';
import { cardOf, pointsLine, roundLine, roundMoment, statusLine, teamWord } from './words';
import './wavelength.css';

/**
 * Wavelength on a phone: the score, the clue (or what's happening), the dial filling the middle,
 * and a dock for whatever this player does now. The psychic picks a card and writes the clue with
 * the target showing on their dial; guessers drag the needle and lock in; the other team calls
 * left or right; everyone sees the shutter open on the reveal.
 */
export const PlayerScreen: GameUi['PlayerScreen'] = ({ view, sendAction, now, ...props }) => {
  const v = view as WavelengthPlayerView;
  const players = props.players as ScreenPlayer[];
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  const [fresh, dismiss] = useMoment(v.history.length);
  const moment = fresh !== null ? roundMoment(v, v.me, name) : null;
  const [pick, setPick] = useState<0 | 1>(0);
  const [busy, setBusy] = useState(false);

  const r = v.round;
  const psychic = r.psychic === v.me;
  const guessing = v.phase === 'guess' && v.guessers.includes(v.me);
  const shown = v.phase === 'reveal' || v.phase === 'over';

  const send = async (a: WavelengthAction) => {
    setBusy(true);
    try {
      return await sendAction(a);
    } finally {
      setBusy(false);
    }
  };
  const sendDial = useCallback((at: number) => sendAction({ type: 'dial', at }), [sendAction]);
  const server = v.guessing === 'shared' ? r.dial : (v.myDial ?? MIDDLE);
  const dial = useDialSync(server, sendDial);
  // Lock in where this needle shows, once any move still on its way has landed.
  const lockIn = async (on: boolean) => {
    const at = dial.value;
    setBusy(true);
    try {
      if (on) await dial.flush();
      return await sendAction(on ? { type: 'lock', on, at } : { type: 'lock', on });
    } finally {
      setBusy(false);
    }
  };

  const spectrum = v.phase === 'clue' && psychic ? r.spectrums[pick] : cardOf(v);
  const last = v.history[v.history.length - 1];
  const marks =
    shown && last?.dials
      ? Object.entries(last.dials).map(([id, value]) => ({
          id,
          value,
          tint: `var(--tint-${byId.get(id)?.avatar.tint ?? 'slate'})`,
        }))
      : undefined;

  return (
    <div className="wl wl--phone">
      <Scores t={v} me={v.me} />

      <header className="wl__head">
        {r.clue && v.phase !== 'clue' ? (
          <>
            <p className="wl__by">{name(r.psychic)}’s clue</p>
            <h2 className="wl__clue">{r.clue}</h2>
          </>
        ) : (
          <h2 className="jd-display wl__status">
            {psychic && v.phase === 'clue' ? 'You’re the psychic' : statusLine(v, name)}
          </h2>
        )}
      </header>

      <div className="wl-stage">
        <Dial
          spectrum={spectrum}
          value={guessing ? dial.value : shown && last ? last.guess : server}
          live={guessing && dial.live}
          target={v.target}
          open={shown || psychic}
          onTurn={guessing && !busy ? dial.turn : undefined}
          marks={marks}
          team={r.team}
          label={guessing ? `Turn the dial toward the clue` : undefined}
        />
      </div>

      <Dock
        v={v}
        pick={pick}
        setPick={setPick}
        send={send}
        lockIn={lockIn}
        busy={busy}
        now={now}
        name={name}
      />

      {moment && (
        <VerdictMoment
          key={v.history.length}
          outcome={moment.outcome}
          title={moment.title}
          detail={moment.detail}
          onDone={dismiss}
        />
      )}
    </div>
  );
};

/** The score: both teams (yours marked), or the team's total in Together. */
export function Scores({ t, me }: { t: WavelengthTableView; me: string | null }) {
  const mine = me ? t.teams[me] : undefined;
  if (t.mode === 'together') {
    return (
      <div className="wl-scores">
        <span className="wl-score wl-score--sun">
          <span className="wl-score__name">Score</span>
          <Tally value={t.scores.sun} className="wl-score__n" />
        </span>
        <span className="wl-scores__round">{roundLine(t)}</span>
      </div>
    );
  }
  return (
    <div className="wl-scores">
      {(['sun', 'moon'] as const).map((team) => (
        <span
          key={team}
          className={`wl-score wl-score--${team}${t.round.team === team && t.phase !== 'over' ? ' is-turn' : ''}`}
        >
          <span className="wl-score__name">
            {TEAM_NAME[team]}
            {mine === team && <span className="wl-score__you"> (you)</span>}
          </span>
          <Tally value={t.scores[team]} className="wl-score__n" />
        </span>
      ))}
      <span className="wl-scores__round">{roundLine(t)}</span>
    </div>
  );
}

/** Counts down the dial timer, if there is one. */
export function Clock({ at, now }: { at: number | null; now: () => number }) {
  const left = useCountdown(at, now);
  if (left === null) return null;
  const m = Math.floor(left / 60);
  const s = String(left % 60).padStart(2, '0');
  return (
    <span className={left <= 10 ? 'wl-clock is-low' : 'wl-clock'} role="timer">
      {m}:{s}
    </span>
  );
}

function Dock({
  v,
  pick,
  setPick,
  send,
  lockIn,
  busy,
  now,
  name,
}: {
  v: WavelengthPlayerView;
  pick: 0 | 1;
  setPick: (p: 0 | 1) => void;
  send: (a: WavelengthAction) => Promise<boolean>;
  lockIn: (on: boolean) => Promise<boolean>;
  busy: boolean;
  now: () => number;
  name: (id: string) => string;
}) {
  const r = v.round;
  const psychic = r.psychic === v.me;

  if (v.phase === 'clue') {
    if (psychic) return <ClueForm v={v} pick={pick} setPick={setPick} send={send} busy={busy} />;
    return (
      <section className="wl-dock" aria-label="Waiting">
        <p className="wl-dock__say">
          {name(r.psychic)} can see the target and is thinking of a clue.
        </p>
        <Offer v={v} />
      </section>
    );
  }

  if (v.phase === 'guess') {
    const guessers = v.guessers;
    const { locked, tally } = lockTally(v);
    const shared = v.guessing === 'shared';
    if (guessers.includes(v.me)) {
      const mine = r.locks.includes(v.me);
      return (
        <section className="wl-dock" aria-label="Your guess">
          <p className="wl-dock__say" role="status">
            <span>
              {shared ? 'Drag the needle together.' : 'Set your own dial.'} {tally}.
            </span>
            <Clock at={v.actBy} now={now} />
          </p>
          <Plaque go={!mine} disabled={busy} aria-pressed={mine} onClick={() => void lockIn(!mine)}>
            {mine ? 'Locked in. Tap to undo' : 'Lock in'}
          </Plaque>
        </section>
      );
    }
    return (
      <section className="wl-dock" aria-label="Waiting">
        <p className="wl-dock__say" role="status">
          <span>
            {psychic
              ? 'Your team is guessing. No hints!'
              : `${teamWord(v, r.team)} is guessing. ${tally}.`}
          </span>
          <Clock at={v.actBy} now={now} />
        </p>
        {psychic && locked > 0 && (
          <Plaque small disabled={busy} onClick={() => void send({ type: 'hurry' })}>
            Lock it in now
          </Plaque>
        )}
      </section>
    );
  }

  if (v.phase === 'call') {
    const callers = v.callers;
    const votes = (side: Side) => callers.filter((id) => r.calls[id] === side).length;
    if (callers.includes(v.me)) {
      const mine = r.calls[v.me];
      return (
        <section className="wl-dock" aria-label="Your call">
          <p className="wl-dock__say" role="status">
            <span>Is the target left or right of the needle? Most of your team decides.</span>
            <Clock at={v.actBy} now={now} />
          </p>
          <div className="wl-dock__row">
            {(['left', 'right'] as const).map((side) => (
              <Plaque
                key={side}
                go={mine === side}
                aria-pressed={mine === side}
                disabled={busy}
                onClick={() => void send({ type: 'call', side })}
              >
                {side === 'left' ? 'Left' : 'Right'} ({votes(side)})
              </Plaque>
            ))}
          </div>
        </section>
      );
    }
    return (
      <section className="wl-dock" aria-label="Waiting">
        <p className="wl-dock__say" role="status">
          <span>
            {TEAM_NAME[other(r.team)]} is calling left or right: {votes('left')} left,{' '}
            {votes('right')} right.
          </span>
          <Clock at={v.actBy} now={now} />
        </p>
        {psychic && votes('left') + votes('right') > 0 && (
          <Plaque small disabled={busy} onClick={() => void send({ type: 'hurry' })}>
            Go with that
          </Plaque>
        )}
      </section>
    );
  }

  return <NextRound v={v} send={send} now={now} />;
}

/** How many guessers have locked in, and how many the dial needs: "2 of 3 locked in". */
export function lockTally(t: WavelengthTableView): { locked: number; tally: string } {
  const locked = t.round.locks.filter((id) => t.guessers.includes(id)).length;
  const need = t.guessing === 'shared' ? Math.floor(t.guessers.length / 2) + 1 : t.guessers.length;
  return { locked, tally: `${locked} of ${need} locked in` };
}

/** The two cards on offer, for everyone waiting on the psychic. */
export function Offer({ v }: { v: WavelengthTableView }) {
  return (
    <ul className="wl-offer" aria-label="The cards on offer">
      {v.round.spectrums.map(([l, r], i) => (
        <li key={i} className="wl-card">
          <span>{l}</span>
          <span className="wl-card__line" aria-hidden="true" />
          <span>{r}</span>
        </li>
      ))}
    </ul>
  );
}

/** The psychic: choose a card (the dial shows it with the target) and write the clue. */
function ClueForm({
  v,
  pick,
  setPick,
  send,
  busy,
}: {
  v: WavelengthPlayerView;
  pick: 0 | 1;
  setPick: (p: 0 | 1) => void;
  send: (a: WavelengthAction) => Promise<boolean>;
  busy: boolean;
}) {
  const [text, setText] = useState('');
  const clean = text.replace(/\s+/g, ' ').trim();
  return (
    <form
      className="wl-dock"
      aria-label="Your clue"
      onSubmit={(e) => {
        e.preventDefault();
        if (clean) void send({ type: 'clue', card: pick, text: clean });
      }}
    >
      <div className="wl-offer" role="radiogroup" aria-label="Choose a card">
        {v.round.spectrums.map(([l, r], i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={pick === i}
            className="wl-card"
            onClick={() => setPick(i as 0 | 1)}
          >
            <span>{l}</span>
            <span className="wl-card__line" aria-hidden="true" />
            <span>{r}</span>
          </button>
        ))}
      </div>
      <label className="wl-clue-in">
        <span className="jd-label">Your clue</span>
        <input
          value={text}
          maxLength={CLUE_MAX}
          onChange={(e) => setText(e.target.value)}
          placeholder="Something that sits at the target"
          autoComplete="off"
          enterKeyHint="send"
        />
      </label>
      <Plaque go type="submit" disabled={busy || !clean}>
        Give the clue
      </Plaque>
    </form>
  );
}

/** After the reveal: the points, then the next round (or the results). */
function NextRound({
  v,
  send,
  now,
}: {
  v: WavelengthTableView;
  send: (a: WavelengthAction) => Promise<boolean>;
  now: () => number;
}) {
  const left = useCountdown(v.nextAt, now);
  const last = v.history[v.history.length - 1];
  if (!last || v.phase === 'over') return null;
  return (
    <section className="wl-dock" aria-label="Next round">
      <p className={`wl-stamp wl-stamp--${last.points}`} key={last.n}>
        {pointsLine(last)}
        {last.call && (
          <span className="wl-stamp__call">
            {TEAM_NAME[other(last.team)]} called {last.call}: {last.callPoint ? '+1' : 'wrong'}
          </span>
        )}
      </p>
      <div className="wl-dock__row wl-dock__row--next">
        {left !== null && (
          <span className="wl-dock__count" role="status">
            {last.final ? 'Results' : 'Next round'} in {left}
          </span>
        )}
        <Plaque small onClick={() => void send({ type: 'next', after: last.n })}>
          {last.final ? 'See who won' : 'Next round'}
        </Plaque>
      </div>
    </section>
  );
}
