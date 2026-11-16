'use client';

import { Token, useMoment, VerdictMoment, type GameUi, type ScreenPlayer } from '@jackdaw/ui';
import type { FictionaryTableView } from '../rules';
import {
  cx,
  Entry,
  Head,
  RevealStage,
  Roll,
  ScoreIndex,
  TabChoice,
  useBeat,
  useBookClass,
} from './book';
import { myMoment, stageLine, stageName, statusLine } from './words';
import './fictionary.css';

/**
 * Fictionary on the TV: the book lies open. The left page holds the entry, huge, with who has
 * written or picked; the right page holds the answers to pick from, or the reveal, where each lie
 * that fooled someone is stamped FIB with its author and its victims, then the truth is stamped
 * FACT with the story behind it. The index of scores runs along the foot.
 */
export const TvScreen: GameUi['TvScreen'] = ({ tableView, reactions, now, ...props }) => {
  const t = tableView as FictionaryTableView;
  const players = props.players as ScreenPlayer[];
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  const beat = useBeat(t, now);
  const scored = beat?.kind === 'scores';
  const [fresh, dismiss] = useMoment(`${t.history.length}:${scored ? 1 : 0}`);
  const card = t.reveal;
  const moment = fresh !== null && scored && card ? myMoment(card, null, name) : null;
  const p = t.play;
  const cls = useBookClass('fic-tv');
  const q = card?.q ?? p.q;
  const done = t.phase === 'write' ? p.written : t.phase === 'pick' ? p.picked : undefined;

  return (
    <div className={cls}>
      <div className="fic-book">
        <section className="fic-leaf fic-leaf--left">
          <Head t={t} now={now} name={name} />
          {t.phase === 'choose' ? (
            <div className="fic-choose">
              <p className="fic-kicker">{stageName(p.stage)}</p>
              <h2 className="fic-title">{statusLine(t, name)}</h2>
              <p className="fic-sub">{stageLine(p.stage)}</p>
              {p.chooser && byId.get(p.chooser) && (
                <div className="fic-chooser">
                  <Token avatar={byId.get(p.chooser)!.avatar} size={120} />
                </div>
              )}
            </div>
          ) : (
            q && (
              <Entry
                q={q}
                fill={card && beat && beat.kind !== 'lie' ? card.answer : null}
                tone={card && beat && beat.kind !== 'lie' ? 'truth' : undefined}
                className="fic-entry--tv"
              />
            )
          )}
          <p className="fic-status">{statusLine(t, name)}</p>
          {done && <Roll ids={t.players} done={done} players={byId} size={56} />}
        </section>

        <section className={cx('fic-leaf', 'fic-leaf--right', `fic-leaf--${t.phase}`)}>
          {t.phase === 'choose' && <TabChoice offer={p.offer} />}
          {t.phase === 'write' && (
            <div className="fic-writing">
              <svg className="fic-quill" viewBox="0 0 64 64" aria-hidden="true">
                <path d="M14 50C18 30 32 14 54 8c-4 20-18 34-36 38" />
                <path d="M14 50l22-24M30 26l6 1M24 33l6 1M40 19l5 1" />
                <path className="fic-quill__line" d="M10 56h40" />
              </svg>
              <p className="fic-title">Lies are being written</p>
              <p className="fic-sub">
                {p.written.length} of {t.players.length} in
              </p>
            </div>
          )}
          {t.phase === 'pick' && (
            <ol
              className={cx(
                'fic-answers',
                'fic-answers--tv',
                p.entries.length > 7 && 'fic-answers--tight',
              )}
            >
              {p.entries.map((e) => (
                <li key={e.id} className="fic-answer">
                  <span className="fic-answer__pick">
                    <span className="fic-answer__id">{e.id}</span>
                    <span className="fic-answer__text">{e.text}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
          {t.phase === 'reveal' && card && beat && (
            <RevealStage card={card} beat={beat} players={byId} name={name} scores={t.scores} />
          )}
        </section>
      </div>

      <footer className="fic-foot">
        <ScoreIndex players={byId} me={null} scores={t.scores} reactions={reactions} />
      </footer>

      {moment && (
        <VerdictMoment
          key={fresh}
          size="tv"
          outcome={moment.outcome}
          title={moment.title}
          detail={moment.detail}
          onDone={dismiss}
        />
      )}
    </div>
  );
};
