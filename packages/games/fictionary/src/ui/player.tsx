'use client';

import { useState, type ReactNode } from 'react';
import {
  Plaque,
  useCountdown,
  useMoment,
  VerdictMoment,
  type GameUi,
  type ScreenPlayer,
} from '@jackdaw/ui';
import { LIE_MAX } from '../constants';
import type { FictionaryAction, FictionaryPlayerView } from '../rules';
import {
  BeatTrack,
  Card,
  cx,
  Head,
  RevealStage,
  Roll,
  ScoreIndex,
  Scriptorium,
  TabChoice,
  useBeat,
  useBookClass,
} from './book';
import { myMoment, stageLine, stageName, statusLine } from './words';
import './fictionary.css';

/**
 * Fictionary on a phone, one page of the book that fits under the bar: the entry at the top
 * (with your lie pencilled into the blank as you write it), then whatever you do now: choose a
 * tab, write a lie, pick the truth from the list, or watch the slips get stamped FIB or FACT.
 */
export const PlayerScreen: GameUi['PlayerScreen'] = ({ view, sendAction, now, ...props }) => {
  const v = view as FictionaryPlayerView;
  const players = props.players as ScreenPlayer[];
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => (id === v.me ? 'you' : (byId.get(id)?.name ?? 'Someone'));
  const [busy, setBusy] = useState(false);
  const send = async (a: FictionaryAction) => {
    setBusy(true);
    try {
      return await sendAction(a);
    } finally {
      setBusy(false);
    }
  };
  const beat = useBeat(v, now);
  const scored = beat?.kind === 'scores';
  const [fresh, dismiss] = useMoment(`${v.history.length}:${scored ? 1 : 0}`);
  const card = v.reveal;
  const moment = fresh !== null && scored && card ? myMoment(card, v.me, name) : null;
  const [draft, setDraft] = useState(v.myLie ?? '');
  // A new card clears the draft.
  const [draftFor, setDraftFor] = useState(v.play.n);
  if (draftFor !== v.play.n) {
    setDraftFor(v.play.n);
    setDraft('');
  }

  const p = v.play;
  const cls = useBookClass('fic--phone');
  // Laptops only: the left page's margin keeps the round and the standings in view.
  const margin = (
    <aside className="fic-margin" aria-label="Standings">
      <p className="fic-margin__stage">
        <span className="fic-kicker">{stageName(p.stage)}</span>
        <span className="fic-sub">{stageLine(p.stage)}</span>
      </p>
      <ScoreIndex players={byId} me={v.me} scores={v.scores} reactions={props.reactions} />
    </aside>
  );
  // The blank: your draft in pencil while writing; each lie struck through in red as it's
  // revealed; the truth inked in green.
  const [fill, tone] =
    card && beat
      ? beat.kind === 'lie'
        ? [beat.entry.text, 'fib' as const]
        : [card.answer, 'truth' as const]
      : v.phase === 'write' && (draft || v.myLie)
        ? [draft || v.myLie, 'mine' as const]
        : [null, undefined];

  return (
    <div className={cls}>
      <Head t={v} now={now} name={name} />
      <section className={cx('fic-page', `fic-page--${v.phase}`, `fic-tab--${p.cat ?? 'blank'}`)}>
        {v.phase === 'choose' ? (
          <Choose v={v} name={name} send={send} busy={busy} margin={margin} />
        ) : (
          <>
            <div className="fic-side fic-side--l">
              {(card?.q ?? p.q) && (
                <Card n={p.n} cat={p.cat} q={card?.q ?? p.q!} fill={fill} tone={tone} />
              )}
              {!scored && margin}
            </div>
            <div className="fic-side fic-side--r">
              {v.phase === 'write' && (
                <Write
                  v={v}
                  draft={draft}
                  setDraft={setDraft}
                  send={send}
                  busy={busy}
                  byId={byId}
                  now={now}
                />
              )}
              {v.phase === 'pick' && <Pick v={v} send={send} busy={busy} byId={byId} now={now} />}
              {v.phase === 'reveal' && card && beat && (
                <div className="fic-show">
                  <BeatTrack card={card} beat={beat} />
                  <RevealStage
                    card={card}
                    beat={beat}
                    players={byId}
                    name={name}
                    me={v.me}
                    scores={v.scores}
                    likeSlot={
                      beat.kind === 'lie' && !beat.entry.by.includes(v.me) ? (
                        <Like
                          on={v.myLike === beat.entry.id}
                          onClick={() => void send({ type: 'like', id: beat.entry.id })}
                          disabled={busy}
                        />
                      ) : null
                    }
                  />
                  {scored && <Next v={v} now={now} send={send} busy={busy} />}
                </div>
              )}
            </div>
          </>
        )}
      </section>
      {moment && (
        <VerdictMoment
          key={fresh}
          outcome={moment.outcome}
          title={moment.title}
          detail={moment.detail}
          avatar={byId.get(v.me)?.avatar}
          onDone={dismiss}
        />
      )}
    </div>
  );
};

type Send = (a: FictionaryAction) => Promise<boolean>;

function Choose({
  v,
  name,
  send,
  busy,
  margin,
}: {
  v: FictionaryPlayerView;
  name: (id: string) => string;
  send: Send;
  busy: boolean;
  margin: ReactNode;
}) {
  const mine = v.play.chooser === v.me;
  return (
    <div className="fic-choose">
      <p className="fic-kicker">{stageName(v.play.stage)}</p>
      <h2 className="fic-title">{mine ? 'Choose a tab' : statusLine(v, name)}</h2>
      <p className="fic-sub">{stageLine(v.play.stage)}</p>
      {margin}
      <TabChoice
        offer={v.play.offer}
        disabled={busy}
        onChoose={mine ? (tab) => void send({ type: 'choose', tab }) : undefined}
      />
    </div>
  );
}

function Write({
  v,
  draft,
  setDraft,
  send,
  busy,
  byId,
  now,
}: {
  now: () => number;
  v: FictionaryPlayerView;
  draft: string;
  setDraft: (s: string) => void;
  send: Send;
  busy: boolean;
  byId: Map<string, ScreenPlayer>;
}) {
  const [editing, setEditing] = useState(!v.myLie);
  const [seen, setSeen] = useState(`${v.play.n}:${v.myLie ?? ''}`);
  const key = `${v.play.n}:${v.myLie ?? ''}`;
  if (seen !== key) {
    setSeen(key);
    setEditing(!v.myLie);
  }
  const text = draft.trim();
  const submit = async () => {
    if (!text || busy) return;
    if (await send({ type: 'write', text })) setEditing(false);
  };
  if (v.myLie && !editing)
    return (
      <div className="fic-dock">
        <p className="fic-done">
          <span className="fic-label">Your lie is in</span>“{v.myLie}”
        </p>
        <Scriptorium
          ids={v.players}
          done={v.play.written}
          players={byId}
          me={v.me}
          busyWord="Writing"
        />
        <div className="fic-row">
          <Plaque small disabled={busy} onClick={() => setEditing(true)}>
            Change it
          </Plaque>
          <Nudge v={v} send={send} busy={busy} now={now} />
        </div>
      </div>
    );
  return (
    <form
      className="fic-dock"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Scriptorium
        ids={v.players}
        done={v.play.written}
        players={byId}
        me={v.me}
        busyWord="Writing"
      />
      <label className="fic-field">
        <span className="fic-label">Write a lie that sounds true</span>
        <input
          className="fic-input"
          value={draft}
          maxLength={LIE_MAX}
          autoComplete="off"
          autoCapitalize="off"
          enterKeyHint="done"
          placeholder="Your lie"
          onChange={(e) => setDraft(e.target.value)}
        />
      </label>
      {v.suggestions.length > 0 && (
        <ul className="fic-ideas" aria-label="Lies from the house">
          {v.suggestions.map((s) => (
            <li key={s}>
              <button type="button" className="fic-idea" onClick={() => setDraft(s)}>
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="fic-row">
        {v.suggestions.length === 0 && (
          <Plaque small disabled={busy} onClick={() => void send({ type: 'help' })}>
            Help me lie
          </Plaque>
        )}
        <Plaque go type="submit" disabled={busy || !text}>
          {v.myLie ? 'Change my lie' : 'Write it in'}
        </Plaque>
      </div>
    </form>
  );
}

function Pick({
  v,
  send,
  busy,
  byId,
  now,
}: {
  v: FictionaryPlayerView;
  send: Send;
  busy: boolean;
  byId: Map<string, ScreenPlayer>;
  now: () => number;
}) {
  const list = v.play.entries;
  return (
    <div className="fic-dock fic-dock--pick">
      <p className="fic-label">
        {v.myPick ? 'Picked. You can change it until everyone has' : 'Which one is true?'}
      </p>
      <ol className={cx('fic-answers', list.length > 7 && 'fic-answers--tight')}>
        {list.map((e) => {
          const mine = v.mine.includes(e.id);
          const picked = v.myPick === e.id;
          return (
            <li
              key={e.id}
              className={cx(
                'fic-answer',
                mine && 'fic-answer--mine',
                picked && 'fic-answer--picked',
              )}
            >
              <button
                type="button"
                className="fic-answer__pick"
                disabled={busy || mine}
                aria-pressed={picked}
                onClick={() => void send({ type: 'pick', id: e.id })}
              >
                <span className="fic-answer__id">{e.id}</span>
                <span className="fic-answer__text">{e.text}</span>
                {mine && <span className="fic-answer__tag">Your lie</span>}
              </button>
              {!mine && (
                <Like
                  on={v.myLike === e.id}
                  disabled={busy}
                  onClick={() => void send({ type: 'like', id: e.id })}
                />
              )}
            </li>
          );
        })}
      </ol>
      {/* Laptops only: everyone's desk under the answers, stamped In as they pick. */}
      <div className="fic-pickers">
        <Scriptorium
          ids={v.players}
          done={v.play.picked}
          players={byId}
          me={v.me}
          busyWord="Picking"
        />
      </div>
      {v.myPick && (
        <div className="fic-row fic-row--wait">
          <Roll ids={v.players} done={v.play.picked} players={byId} />
          <Nudge v={v} send={send} busy={busy} now={now} />
        </div>
      )}
    </div>
  );
}

/** Someone who's done can give everyone else 20 seconds (once a phase, unless the clock is sooner). */
function Nudge({
  v,
  send,
  busy,
  now,
}: {
  v: FictionaryPlayerView;
  send: Send;
  busy: boolean;
  now: () => number;
}) {
  const left =
    v.phase === 'write'
      ? v.players.length - v.play.written.length
      : v.players.length - v.play.picked.length;
  if (left === 0) return null;
  // A clock already running under the countdown makes it pointless.
  if (v.actBy !== null && v.actBy - now() < 25_000) return null;
  return (
    <Plaque small disabled={busy} onClick={() => void send({ type: 'nudge' })}>
      Hurry the rest
    </Plaque>
  );
}

function Like({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      className={cx('fic-like', on && 'fic-like--on')}
      aria-pressed={on}
      aria-label={on ? 'Liked' : 'Like this lie'}
      disabled={disabled}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
      </svg>
    </button>
  );
}

function Next({
  v,
  now,
  send,
  busy,
}: {
  v: FictionaryPlayerView;
  now: () => number;
  send: Send;
  busy: boolean;
}) {
  const left = useCountdown(v.nextAt, now);
  const last = v.play.n >= v.total;
  return (
    <div className="fic-row fic-row--next">
      <Plaque small disabled={busy} onClick={() => void send({ type: 'next', after: v.play.n })}>
        {last ? 'See who won' : 'Next card'}
        {left !== null ? ` · ${left}` : ''}
      </Plaque>
    </div>
  );
}
