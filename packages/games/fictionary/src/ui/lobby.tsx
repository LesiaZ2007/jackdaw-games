'use client';

import { useEffect, useState } from 'react';
import {
  AddSeat,
  LobbyChatPanel,
  Plaque,
  PlayerReaction,
  ReactionBar,
  Token,
  usePrefersReducedMotion,
  type GameLobbyProps,
  type ScreenPlayer,
} from '@jackdaw/ui';
import { CATEGORIES, type Category } from '../bank/types';
import { DECKS, LENGTHS, TABS, TIMERS, ROUND_CARDS } from '../constants';
import { meta } from '../meta';
import { Card, cx, useBookClass } from './book';
import { optionHelp } from './help';
import { pts } from './words';
import './fictionary.css';

/**
 * Fictionary's own lobby: the book lies open at its title page. The left page is the frontispiece,
 * "The Dictionary of Fibs", with everyone at the table listed as its compilers. The right page
 * plays a specimen entry on a loop (two lies pencilled into the blank and stamped FIB, then the
 * truth inked in and stamped FACT), so a new player sees how a card goes before the first one.
 * Below it the edition: the options as rows of tabs, then Start. The thumb index down the fore
 * edge shows which tabs of the book this edition opens.
 */

type Opts = { deck: string; length: string; timer: string; tabs: string };
const DEFAULTS: Opts = {
  deck: 'Mixed',
  length: 'Standard',
  timer: 'Relaxed',
  tabs: 'Chooser picks',
};

const EDITION: { key: keyof Opts; label: string; choices: readonly string[] }[] = [
  { key: 'deck', label: 'Deck', choices: DECKS },
  { key: 'length', label: 'Length', choices: LENGTHS },
  { key: 'timer', label: 'Clock', choices: TIMERS },
  { key: 'tabs', label: 'Tabs', choices: TABS },
];

/**
 * The specimens: true, checkable entries written for the lobby only (the bank never reaches a
 * browser, and these are not in it), each with two lies a friend might write.
 */
const SPECIMENS: { cat: Category; q: string; a: string; lies: [string, string]; note: string }[] = [
  {
    cat: 'animals',
    q: 'A group of crows is called a ____.',
    a: 'murder',
    lies: ['sulk', 'hush'],
    note: 'It’s one of the fanciful hunting terms for groups of animals written down in the 1400s.',
  },
  {
    cat: 'words',
    q: 'The little plastic tip on the end of a shoelace is called the ____.',
    a: 'aglet',
    lies: ['lacepin', 'tagling'],
    note: 'From an Old French word for a little needle.',
  },
  {
    cat: 'animals',
    q: 'The jackdaw, a small grey-naped bird, belongs to the ____ family.',
    a: 'crow',
    lies: ['starling', 'pigeon'],
    note: 'Jackdaws are corvids, like rooks, ravens and magpies, and they pair for life.',
  },
];
/** How long each step of a specimen holds: the empty blank, the first lie, the second, the truth. */
const STEP_MS = [1900, 2700, 2700, 4600];
/** Stand-ins for the specimen's lies when the table is too small to lend names. */
const STAND_INS = ['Rook', 'Magpie'];

function readOpts(raw: Record<string, unknown>): Opts {
  const o = { ...DEFAULTS };
  for (const { key, choices } of EDITION) {
    const v = raw[key];
    if (typeof v === 'string' && choices.includes(v)) o[key] = v;
  }
  return o;
}

/** Which tabs of the book this edition can deal from. */
function openTabs(deck: string): Set<Category> {
  const all = Object.keys(CATEGORIES) as Category[];
  if (deck === 'Words') return new Set(['words']);
  if (deck === 'Facts') return new Set(all.filter((c) => c !== 'words'));
  return new Set(all);
}

export function FictionaryLobby({
  code,
  players,
  me,
  hostId,
  isHost,
  options: raw,
  setOptions,
  blocker,
  start,
  onSeat,
  changeGame,
  reactions,
  react,
  chat,
  onAddBot,
}: GameLobbyProps) {
  const cls = useBookClass('fic-lobby');
  const opts = readOpts(raw);
  const [busy, setBusy] = useState(false);
  const host = players.find((p) => p.id === hostId);
  const open = openTabs(opts.deck);
  const [r1, r2] = ROUND_CARDS[opts.length as keyof typeof ROUND_CARDS] ?? [3, 3];
  const cards = r1 + r2 + 1;
  const room = meta.maxPlayers - players.length;

  async function begin() {
    setBusy(true);
    try {
      await start();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cls}>
      <div className="fic-lobby__main">
        <div className="fic-tome">
          <section className="fic-tome__leaf fic-tome__leaf--title" aria-label="The title page">
            <p className="fic-kicker">Fictionary · Lobby {code}</p>
            <h2 className="fic-tome__title" aria-label="The Dictionary of Fibs">
              <span className="fic-tome__line">
                <span className="fic-tome__small">The </span>Dictionary{' '}
              </span>
              <span className="fic-tome__line">
                <span className="fic-tome__small">of </span>
                <span className="fic-tome__fibs">Fibs</span>
              </span>
            </h2>
            <p className="fic-tome__motto">{meta.tagline}</p>
            <span className="fic-tome__rule" aria-hidden="true" />
            <p className="fic-label">
              Compiled by {players.length} {players.length === 1 ? 'hand' : 'hands'}
            </p>
            <Compilers
              players={players}
              me={me}
              hostId={hostId}
              isHost={isHost}
              reactions={reactions}
              onSeat={onSeat}
              onAddBot={onAddBot}
              room={room}
            />
            {me && <ReactionBar className="fic-lobby__react" onReact={react} />}
          </section>

          <section className="fic-tome__leaf fic-tome__leaf--edition" aria-label="This edition">
            <Specimen players={players} />

            <div className="fic-edition">
              <p className="fic-label">
                This edition · {cards} cards, about {Math.round(cards * 2.5)} minutes
              </p>
              {EDITION.map(({ key, label, choices }) => (
                <EditionRow
                  key={key}
                  label={label}
                  choices={choices}
                  value={opts[key]}
                  help={optionHelp[key]?.[opts[key]]}
                  onChange={isHost ? (v) => setOptions({ ...raw, ...opts, [key]: v }) : undefined}
                />
              ))}
            </div>

            <div className="fic-lobby__go">
              {isHost ? (
                <Plaque go disabled={busy || Boolean(blocker)} onClick={begin}>
                  {busy ? 'Opening the book…' : 'Open the book'}
                </Plaque>
              ) : (
                <p className="fic-lobby__wait">
                  Waiting for {host?.name ?? 'the host'} to open the book.
                </p>
              )}
              {blocker && (
                <p className="fic-lobby__blocker" role="status">
                  {blocker}
                </p>
              )}
              {changeGame && (
                <button type="button" className="fic-lobby__link" onClick={changeGame}>
                  Play a different game
                </button>
              )}
            </div>
          </section>

          <ol className="fic-thumbs" aria-label="The tabs in this edition">
            {(Object.keys(CATEGORIES) as Category[]).map((c) => (
              <li
                key={c}
                className={cx('fic-thumbs__tab', `fic-tab--${c}`, !open.has(c) && 'is-shut')}
                title={CATEGORIES[c]}
              >
                <span aria-hidden="true">{CATEGORIES[c].replace(/^The /, '').charAt(0)}</span>
                <span className="fic-sr">
                  {CATEGORIES[c]}
                  {open.has(c) ? '' : ' (not in this deck)'}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <LobbyChatPanel chat={chat} players={players} className="fic-chat" />
    </div>
  );
}

/** Everyone at the table, set as the book's list of compilers, dot leaders and all. */
function Compilers({
  players,
  me,
  hostId,
  isHost,
  reactions,
  onSeat,
  onAddBot,
  room,
}: Pick<
  GameLobbyProps,
  'players' | 'me' | 'hostId' | 'isHost' | 'reactions' | 'onSeat' | 'onAddBot'
> & {
  room: number;
}) {
  return (
    <ol className={cx('fic-compilers', players.length > 6 && 'fic-compilers--many')}>
      {players.map((p, i) => {
        const tappable = isHost || p.id === me;
        return (
          <li
            key={p.id}
            className="fic-compiler"
            style={{ ['--i' as string]: i, ['--tilt' as string]: `${((i % 3) - 1) * 1.4}deg` }}
          >
            <button
              type="button"
              className={cx('fic-sig', p.id === me && 'is-me', !p.online && 'is-away')}
              disabled={!tappable}
              onClick={() => onSeat(p.id)}
              aria-label={
                p.id === me
                  ? `${p.name} (you): change your name, crest or color`
                  : isHost
                    ? `${p.name}${p.bot ? ', computer player' : ''}: remove or make host`
                    : `${p.name}${p.bot ? ', computer player' : ''}`
              }
            >
              <span className="fic-sig__tok">
                <Token avatar={p.avatar} away={!p.online} host={p.id === hostId} />
                <PlayerReaction reactions={reactions} playerId={p.id} name={p.name} size={60} />
              </span>
              <span className="fic-sig__name">{p.name}</span>
              <svg className="fic-sig__scrawl" viewBox="0 0 120 12" aria-hidden="true">
                <path d="M3 8c10-6 16 4 26-1s14-5 22 0 16 4 26-1 18-4 26 0 10 1 14-2" />
              </svg>
              <span className="fic-sig__role">
                {p.id === me ? `You · ${role(p, hostId)}` : role(p, hostId)}
              </span>
            </button>
          </li>
        );
      })}
      {room > 0 && (
        <li
          className="fic-compiler fic-compiler--open"
          style={{ ['--i' as string]: players.length }}
        >
          <span className="fic-sig fic-sig--open">
            <span className="fic-sig__tok">
              {onAddBot ? (
                <AddSeat onAdd={onAddBot} className="fic-addseat" />
              ) : (
                <span className="fic-sig__nib" aria-hidden="true" />
              )}
            </span>
            <span className="fic-sig__name">{onAddBot ? 'Add a bot' : 'Room for more'}</span>
            <span className="fic-sig__role">
              {room} more {room === 1 ? 'seat' : 'seats'}
            </span>
          </span>
        </li>
      )}
    </ol>
  );
}

function role(p: ScreenPlayer, hostId: string): string {
  if (p.bot) return 'Ghostwriter';
  if (p.id === hostId) return 'Editor';
  return 'Contributor';
}

/** One option as a row of tabs; the host taps one, everyone else sees the one chosen. */
function EditionRow({
  label,
  choices,
  value,
  help,
  onChange,
}: {
  label: string;
  choices: readonly string[];
  value: string;
  help?: string;
  onChange?: (v: string) => void;
}) {
  return (
    <div className="fic-ed">
      <span className="fic-ed__label" id={`fic-ed-${label}`}>
        {label}
      </span>
      <span className="fic-ed__choices" role="radiogroup" aria-labelledby={`fic-ed-${label}`}>
        {choices.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={value === c}
            className={cx('fic-ed__choice', value === c && 'is-on')}
            disabled={!onChange}
            onClick={() => onChange?.(c)}
          >
            {c}
          </button>
        ))}
      </span>
      {help && <p className="fic-ed__help">{help}</p>}
    </div>
  );
}

/**
 * A specimen entry, played on a loop: the empty blank, a lie in it struck out and stamped FIB,
 * another, then the truth inked in green and stamped FACT, with the story behind it. The lies are
 * credited to people at the table. With reduced motion it rests on the first one's truth.
 */
function Specimen({ players }: { players: ScreenPlayer[] }) {
  const still = usePrefersReducedMotion();
  const [at, setAt] = useState({ i: 0, step: 0 });
  useEffect(() => {
    if (still) return;
    const id = setTimeout(
      () =>
        setAt(({ i, step }) =>
          step + 1 < STEP_MS.length
            ? { i, step: step + 1 }
            : { i: (i + 1) % SPECIMENS.length, step: 0 },
        ),
      STEP_MS[at.step],
    );
    return () => clearTimeout(id);
  }, [at, still]);
  const { i, step } = still ? { i: 0, step: 3 } : at;
  const s = SPECIMENS[i]!;
  const hands = players.length >= 2 ? players.map((p) => p.name) : STAND_INS;
  const by = (k: number) => hands[(i + k) % hands.length]!;
  const lie = step === 1 || step === 2 ? s.lies[step - 1]! : null;
  const truth = step === 3;

  return (
    <figure className={cx('fic-specimen', `fic-tab--${s.cat}`)} aria-label="How a card plays">
      <figcaption className="fic-specimen__cap">
        <span className="fic-label">Specimen entry</span>
        <span className="fic-specimen__pips" aria-hidden="true">
          {SPECIMENS.map((_, k) => (
            <i key={k} className={cx(k === i && 'is-on')} />
          ))}
        </span>
      </figcaption>
      <Card
        n={i + 1}
        cat={s.cat}
        q={s.q}
        fill={truth ? s.a : lie}
        tone={truth ? 'truth' : lie ? 'fib' : undefined}
        className="fic-card--specimen"
      />
      <div className="fic-specimen__slip" aria-live="off">
        {step === 0 && (
          <p className="fic-specimen__line" key={`${i}:0`}>
            Everyone writes a lie for the blank…
          </p>
        )}
        {lie && (
          <p className="fic-specimen__line" key={`${i}:${step}`}>
            <span className="fic-stamp fic-stamp--small">Fib</span>“{lie}”, coined by {by(step - 1)}
            . +{pts(500)} for each friend it fools.
          </p>
        )}
        {truth && (
          <p className="fic-specimen__line fic-specimen__line--fact" key={`${i}:3`}>
            <span className="fic-stamp fic-stamp--small fic-stamp--fact">Fact</span>
            {s.note} Find it: +{pts(1000)}.
          </p>
        )}
      </div>
    </figure>
  );
}
