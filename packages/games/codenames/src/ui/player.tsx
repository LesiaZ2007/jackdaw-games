'use client';

import { useState, type FormEvent } from 'react';
import { useMoment, useTheme, VerdictMoment, type GameUi } from '@jackdaw/ui';
import { guessDetail, guessOutcome, guessTitle, lastGuess } from '../outcome';
import {
  clueOnBoard,
  clueProblem,
  MAX_CLUE,
  type Clue,
  type CodenamesAction,
  type CodenamesPlayerView,
  type CodenamesTableView,
} from '../rules';
import { TEAM_NAME } from '../teams';
import { CardMark } from './art';
import { Board } from './board';
import { TeamFiles } from './teams';
import './codenames.css';

/** "RIVER 2", "RIVER ∞". */
export const clueText = (c: Pick<Clue, 'word' | 'count'>) => `${c.word} ${c.count ?? '∞'}`;

/** The clue in play, as a rubber stamp on the case file. */
export function ClueStamp({ clue, size = 'phone' }: { clue: Clue; size?: 'phone' | 'tv' }) {
  return (
    <span className={`cn-stamp cn-stamp--${clue.team} cn-stamp--${size}`}>
      <span className="cn-stamp__word">{clue.word}</span>
      <span className="cn-stamp__count">{clue.count ?? '∞'}</span>
    </span>
  );
}

/** One line for whose move it is, from the public table. */
export function turnLine(t: CodenamesTableView, name: (id: string) => string): string {
  const team = TEAM_NAME[t.turn];
  if (t.phase === 'over') return t.winner ? `${TEAM_NAME[t.winner]} wins` : 'Game over';
  if (t.phase === 'clue')
    return `${team}'s spymaster, ${name(t.spymasters[t.turn])}, is thinking of a clue`;
  const left =
    t.guessesLeft === null
      ? 'as many guesses as they dare'
      : `${t.guessesLeft} guess${t.guessesLeft === 1 ? '' : 'es'} left`;
  return `${team} is guessing: ${left}`;
}

export const PlayerScreen: GameUi['PlayerScreen'] = ({
  view,
  me,
  players,
  sendAction,
  reactions,
}) => {
  const v = view as CodenamesPlayerView;
  const look = useTheme();
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  const [focus, setFocus] = useState<number | null>(null);
  const current = v.phase === 'guess' ? v.clues[v.clues.length - 1] : undefined;
  const myTurn = v.myTeam === v.turn;
  const canGuess = myTurn && !v.spymaster && v.phase === 'guess';
  const mySuggestion = me in v.suggestions ? v.suggestions[me]! : null;
  const loupe = mySuggestion ?? (focus !== null && !v.revealed[focus] ? focus : null);

  // A guess that lands while this screen is open gets its moment (not one from before a refresh).
  const [fresh, dismiss] = useMoment(v.guessCount);
  const last = lastGuess(v);
  const send = (a: CodenamesAction) => sendAction(a);

  return (
    <div className="cn cn-play" data-look={look}>
      <header className={`cn-turn cn-turn--${v.turn}`}>
        <span className="cn-turn__team">{TEAM_NAME[v.turn]}&rsquo;s turn</span>
        {current ? <ClueStamp clue={current} /> : null}
        <p className="cn-turn__line" role="status">
          {turnLine(v, name)}
        </p>
        {current?.onBoard && <p className="cn-turn__flag">That clue is a word on the board.</p>}
      </header>

      <TeamFiles
        teams={v.teams}
        spymasters={v.spymasters}
        left={v.left}
        turn={v.turn}
        players={players}
        me={me}
        reactions={reactions}
      />

      <Board
        words={v.words}
        revealed={v.revealed}
        keyCards={v.key}
        suggestions={v.suggestions}
        players={players}
        me={me}
        focus={loupe}
        latest={last ? { index: last.guess.index, at: v.guessCount } : null}
        onTap={(i) => {
          setFocus(i);
          if (canGuess) void send({ type: 'suggest', index: i });
        }}
        onHold={canGuess ? (i) => void send({ type: 'guess', index: i }) : undefined}
      />

      <section className="cn-act" aria-label="Your move">
        {v.spymaster ? (
          <SpymasterDesk view={v} send={send} name={name} />
        ) : (
          <OperativeDesk
            view={v}
            me={me}
            loupe={loupe}
            canGuess={canGuess}
            send={send}
            name={name}
          />
        )}
      </section>

      {v.clues.length > 0 && <ClueLog clues={v.clues} words={v.words} name={name} />}

      {fresh !== null && last && v.phase !== 'over' && (
        <VerdictMoment
          key={v.guessCount}
          outcome={guessOutcome(last.clue, last.guess, v.myTeam)}
          title={guessTitle(v.words[last.guess.index]!, last.clue, last.guess, v.myTeam)}
          detail={guessDetail(last.clue, last.guess, name)}
          emblem={<CardMark card={last.guess.card} size={34} />}
          onDone={dismiss}
        />
      )}
    </div>
  );
};

function SpymasterDesk({
  view: v,
  send,
  name,
}: {
  view: CodenamesPlayerView;
  send: (a: CodenamesAction) => Promise<boolean>;
  name: (id: string) => string;
}) {
  const [word, setWord] = useState('');
  const [count, setCount] = useState<string>('1');
  const myTurn = v.myTeam === v.turn && v.phase === 'clue';
  const problem = word.trim() ? clueProblem(word) : null;
  const onBoard =
    word.trim() && !problem
      ? clueOnBoard(
          word,
          v.words.filter((_, i) => !v.revealed[i]),
        )
      : false;

  async function give(e: FormEvent) {
    e.preventDefault();
    if (!word.trim() || problem) return;
    const ok = await send({ type: 'clue', word, count: count === 'inf' ? null : Number(count) });
    if (ok) setWord('');
  }

  if (!myTurn) {
    return (
      <p className="cn-act__wait">
        You&rsquo;re {TEAM_NAME[v.myTeam!]}&rsquo;s spymaster. The coloured corners are the key:
        only you and {name(v.spymasters[v.myTeam === 'red' ? 'blue' : 'red'])} can see them.
        {v.phase === 'guess' && v.myTeam === v.turn
          ? ' Your team is guessing now. Keep a straight face.'
          : ' Wait for your turn to give a clue.'}
      </p>
    );
  }
  return (
    <form className="cn-clue" onSubmit={give}>
      <label className="cn-clue__field">
        <span>Your clue</span>
        <input
          value={word}
          onChange={(e) => setWord(e.target.value)}
          maxLength={24}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="One word"
          aria-invalid={Boolean(problem)}
        />
      </label>
      <label className="cn-clue__count">
        <span>Number</span>
        <select value={count} onChange={(e) => setCount(e.target.value)}>
          {Array.from({ length: MAX_CLUE + 1 }, (_, n) => (
            <option key={n} value={String(n)}>
              {n}
            </option>
          ))}
          <option value="inf">∞</option>
        </select>
      </label>
      <button
        type="submit"
        className="cn-btn cn-btn--go"
        disabled={!word.trim() || Boolean(problem)}
      >
        Give clue
      </button>
      {problem && (
        <p className="cn-clue__note" role="alert">
          {problem}
        </p>
      )}
      {onBoard && (
        <p className="cn-clue__note">
          That&rsquo;s a word on the board. You can still give it; everyone will see it flagged.
        </p>
      )}
    </form>
  );
}

function OperativeDesk({
  view: v,
  me,
  loupe,
  canGuess,
  send,
  name,
}: {
  view: CodenamesPlayerView;
  me: string;
  loupe: number | null;
  canGuess: boolean;
  send: (a: CodenamesAction) => Promise<boolean>;
  name: (id: string) => string;
}) {
  const word = loupe !== null ? v.words[loupe] : null;
  const backers =
    loupe !== null
      ? Object.entries(v.suggestions)
          .filter(([, i]) => i === loupe)
          .map(([id]) => id)
      : [];
  if (!canGuess) {
    return (
      <>
        {word && <p className="cn-loupe">{word}</p>}
        <p className="cn-act__wait">
          {v.myTeam === null
            ? 'You’re watching this game.'
            : v.myTeam !== v.turn
              ? `${TEAM_NAME[v.turn]} is playing. Your team goes next.`
              : `Waiting for ${name(v.spymasters[v.turn])}'s clue.`}{' '}
          Tap a word to see it bigger.
        </p>
      </>
    );
  }
  return (
    <>
      {word ? (
        <p className="cn-loupe">
          {word}
          {backers.length > 0 && (
            <small>
              {backers.map((id) => (id === me ? 'You' : name(id))).join(', ')}{' '}
              {backers.length === 1 && backers[0] !== me ? 'suggests' : 'suggest'} it
            </small>
          )}
        </p>
      ) : (
        <p className="cn-act__wait">
          Tap a word to suggest it to your team. It&rsquo;s guessed when most of you agree, or hold
          a word to guess it straight away.
        </p>
      )}
      <div className="cn-act__row">
        {loupe !== null && (
          <button
            type="button"
            className="cn-btn cn-btn--go"
            onClick={() => void send({ type: 'guess', index: loupe })}
          >
            Guess {word}
          </button>
        )}
        <button type="button" className="cn-btn" onClick={() => void send({ type: 'pass' })}>
          End our turn
        </button>
      </div>
    </>
  );
}

/** Every clue so far (newest first, or in order), with the words guessed for it. */
export function ClueLog({
  clues,
  words,
  name,
  size = 'phone',
  oldestFirst = false,
}: {
  clues: Clue[];
  words: string[];
  name: (id: string) => string;
  size?: 'phone' | 'tv';
  oldestFirst?: boolean;
}) {
  const shown = oldestFirst ? clues : [...clues].reverse();
  return (
    <section className={`cn-log cn-log--${size}`} aria-label="Clues so far">
      <h3 className="cn-log__title">Clues</h3>
      <ol>
        {shown.map((c, i) => (
          <li
            key={oldestFirst ? i : clues.length - i}
            className={`cn-log__row cn-log__row--${c.team}`}
          >
            <span className="cn-log__clue">
              {clueText(c)}
              <small>{name(c.by)}</small>
            </span>
            <span className="cn-log__guesses">
              {c.guesses.length === 0 && (
                <span className="cn-log__none">{c.ended === 'pass' ? 'Passed' : '…'}</span>
              )}
              {c.guesses.map((g) => (
                <span key={g.index} className={`cn-chip is-${g.card}`}>
                  {words[g.index]}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
