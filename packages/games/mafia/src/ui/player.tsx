'use client';

import { useState, type ReactNode } from 'react';
import {
  Plaque,
  useMoment,
  useTheme,
  VerdictMoment,
  type GameUi,
  type ScreenPlayer,
} from '@jackdaw/ui';
import { ROLE_INFO } from '../roles';
import type { MafiaAction, MafiaPlayerView } from '../rules';
import { CardBack, PrintedHead, useCurtain, useFreshDead, Weather } from './motion';
import { useNarrator, VoiceButton } from './narrator';
import { VoteBoard } from './vote';
import {
  Masthead,
  Pips,
  Placards,
  progressOf,
  RoleCard,
  rootClass,
  Scenery,
  type PlacardInfo,
} from './table';
import { headline, isNight, moment, narration, PICK_MARK, promptWords } from './words';
import './mafia.css';

/**
 * Mafia on a phone, as a front page: the masthead with the edition and the clock, the headline
 * (what the narrator just said), everyone's placard, and a dock with what you do now. At night
 * the page goes dark and every living player picks someone, so nobody's tapping stands out.
 * Your card stays face down until you look.
 */
export const PlayerScreen: GameUi['PlayerScreen'] = ({
  view,
  sendAction,
  now,
  reactions,
  ...props
}) => {
  const v = view as MafiaPlayerView;
  const players = props.players as ScreenPlayer[];
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  const look = useTheme();
  const night = isNight(v);
  const h = headline(v, name);
  const narr = useNarrator({
    id: String(v.step),
    text: narration(v, name),
    speaker: (props.displays ?? 0) === 0 && props.hostId === v.me,
    startedAt: v.since,
    now,
  });
  const [fresh, dismiss] = useMoment(v.step);
  const m = fresh !== null ? moment(v, v, name) : null;
  const curtain = useCurtain(v, h.head);
  const progress = progressOf(v);
  const freshDead = useFreshDead(v.deaths.map((d) => d.id));
  const [card, setCard] = useState(false);
  const [busy, setBusy] = useState(false);
  // Picks that wait for a confirm, kept per step so a new step starts clean.
  const [sel, setSel] = useState<{ step: number; ids: string[] }>({ step: -1, ids: [] });
  const picked = sel.step === v.step ? sel.ids : [];
  const [heal, setHeal] = useState(false);

  const send = async (a: MafiaAction) => {
    setBusy(true);
    try {
      return await sendAction(a);
    } finally {
      setBusy(false);
    }
  };

  const p = v.prompt;
  const live = p && !p.locked ? p : null;
  const onTap = (id: string) => {
    if (!live || busy) return;
    if (live.act === 'kill') return void send({ type: 'pick', target: id });
    if (live.act === 'vote') return void send({ type: 'vote', target: id });
    if (live.act === 'love') {
      const ids = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id].slice(-2);
      return setSel({ step: v.step, ids });
    }
    setSel({ step: v.step, ids: picked[0] === id ? [] : [id] });
  };

  const info = (id: string): PlacardInfo => {
    const dead = v.deaths.find((d) => d.id === id);
    const tags: string[] = [];
    let isPicked = false;
    let marked = false;
    if (p && (p.pick === id || p.second === id || picked.includes(id))) {
      isPicked = true;
      tags.push(PICK_MARK[p.act]);
    }
    const by: string[] = [];
    if (v.packPicks)
      for (const [who, target] of Object.entries(v.packPicks))
        if (who !== v.me && target === id) {
          marked = true;
          by.push(who);
        }
    for (const c of v.checks)
      if (c.target === id && v.role === 'sheriff')
        tags.push(c.result === 'mafia' ? 'Mafia!' : 'Clean');
    const ok =
      ((v.phase === 'deal' || v.phase === 'day') && v.ready.includes(id)) ||
      (v.phase === 'vote' && v.voted.includes(id));
    if (v.phase === 'dusk' && v.lastVote) {
      const n = v.lastVote.counts[id];
      if (n) tags.push(`${n} vote${n === 1 ? '' : 's'}`);
    }
    return {
      id,
      dead,
      role: id === v.me ? null : (v.known[id] ?? null),
      tags,
      picked: isPicked,
      by,
      ok,
      marked,
      lover: v.lover === id || (!!v.lovers && v.lovers.includes(id)),
    };
  };

  return (
    <div className={rootClass(v, night, 'mf--phone')} data-look={look}>
      <Weather t={v} drops={14} />
      <Masthead t={v} now={now} short>
        <VoiceButton speaking={narr.speaking} pref={narr.pref} />
      </Masthead>

      <section className="mf-front" aria-live="polite">
        <PrintedHead text={h.head} className="mf-head" city={v.mode === 'Mafia'} />
        <p className="mf-sub">{h.sub}</p>
        {progress && <Pips {...progress} />}
        {narr.needsTap && <p className="mf-tapvoice">Tap anywhere to let the narrator speak.</p>}
      </section>

      <div className="mf-board">
        {v.phase === 'deal' ? (
          <DealCard v={v} />
        ) : v.phase === 'dusk' && v.lastVote ? (
          <VoteBoard t={v} players={players} />
        ) : (
          <Placards
            t={v}
            players={players}
            me={v.me}
            info={info}
            targets={
              live?.act === 'potion' ? live.targets.filter((x) => x !== v.me) : live?.targets
            }
            onTap={live ? onTap : undefined}
            reactions={reactions}
            fresh={freshDead}
          />
        )}
      </div>

      <Dock
        v={v}
        picked={picked}
        heal={heal}
        setHeal={setHeal}
        busy={busy}
        send={send}
        name={name}
        openCard={() => setCard(true)}
      />

      <Scenery t={v} repeat={2} />

      {card && (
        <div
          className="mf-sheet"
          role="dialog"
          aria-label="Your card"
          onClick={() => setCard(false)}
        >
          <RoleCard role={v.role}>
            <Knowledge v={v} name={name} />
            <span className="mf-sheet__hint">Tap to put it away</span>
          </RoleCard>
        </div>
      )}

      {curtain.node}

      {m && !curtain.busy && (
        <VerdictMoment
          key={v.step}
          outcome={m.outcome}
          title={m.title}
          detail={m.detail}
          onDone={dismiss}
        />
      )}
    </div>
  );
};

/** What your card lets you know: your pack, your checks, your lover. */
function Knowledge({ v, name }: { v: MafiaPlayerView; name: (id: string) => string }) {
  const pack = Object.entries(v.known).filter(
    ([id, r]) => id !== v.me && ROLE_INFO[r].team === 'pack' && ROLE_INFO[v.role].team === 'pack',
  );
  return (
    <div className="mf-know">
      {pack.length > 0 && (
        <p>
          {v.mode === 'Mafia' ? 'Your family: ' : 'Your pack: '}
          <b>{pack.map(([id]) => name(id)).join(', ')}</b>
        </p>
      )}
      {v.lover && (
        <p>
          You’re in love with <b>{name(v.lover)}</b>. If one of you dies, so does the other.
          {v.team === 'lovers' &&
            ' You’re on opposite sides: now you win only as the last two standing.'}
        </p>
      )}
      {v.checks.length > 0 && (
        <ul className="mf-know__checks">
          {v.checks.map((c) => (
            <li key={`${c.night}-${c.target}`}>
              Night {c.night}: <b>{name(c.target)}</b>{' '}
              {c.result === 'mafia'
                ? 'is Mafia'
                : c.result === 'clean'
                  ? 'is not Mafia'
                  : `is the ${ROLE_INFO[c.result].name}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The deal: your card face down until you tap it. */
function DealCard({ v }: { v: MafiaPlayerView }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      className={open ? 'mf-deal is-open' : 'mf-deal'}
      onClick={() => setOpen(!open)}
      aria-label={
        open
          ? `Your card: ${ROLE_INFO[v.role].name}. Tap to turn it over.`
          : 'Your card, face down. Tap to look.'
      }
    >
      <span className="mf-deal__inner">
        <span className="mf-deal__back" aria-hidden={open}>
          <CardBack city={v.mode === 'Mafia'} />
          <span className="mf-deal__seal">?</span>
          <span className="mf-deal__hint">Tap to look, in secret</span>
        </span>
        <span className="mf-deal__front" aria-hidden={!open}>
          <RoleCard role={v.role} className="mf-deal__face" />
        </span>
      </span>
    </button>
  );
}

function Dock({
  v,
  picked,
  heal,
  setHeal,
  busy,
  send,
  name,
  openCard,
}: {
  v: MafiaPlayerView;
  picked: string[];
  heal: boolean;
  setHeal: (h: boolean) => void;
  busy: boolean;
  send: (a: MafiaAction) => Promise<boolean>;
  name: (id: string) => string;
  openCard: () => void;
}) {
  const cardBtn = (
    <Plaque small onClick={openCard} className="mf-cardbtn">
      Your card
    </Plaque>
  );
  const say = (text: string, extra?: ReactNode) => (
    <section className="mf-dock">
      <p className="mf-dock__say">{text}</p>
      <div className="mf-dock__row">
        {cardBtn}
        {extra}
      </div>
    </section>
  );

  if (v.phase === 'over') return null;

  if (v.phase === 'deal') {
    const seen = v.ready.includes(v.me);
    return (
      <section className="mf-dock">
        <p className="mf-dock__say">
          {seen ? 'Waiting for the others.' : 'Look at your card, then put the phone down.'}{' '}
          {v.ready.length} of {v.players.length} ready.
        </p>
        <Plaque go={!seen} disabled={busy} onClick={() => void send({ type: 'ready', on: !seen })}>
          {seen ? 'Seen. Tap to undo' : 'I’ve seen my card'}
        </Plaque>
      </section>
    );
  }

  if (!v.alive_)
    return say(
      v.mode === 'Mafia'
        ? 'You’re dead. Every card is face up for you now. Watch in silence: no hints!'
        : 'You’re a ghost. Every card is face up for you now. Haunt in silence: no hints!',
    );

  const p = v.prompt;
  if (p && !p.locked) {
    const w = promptWords(p, v.mode, name);
    let go: ReactNode = null;
    if (p.act === 'love')
      go = (
        <Plaque
          go
          disabled={busy || picked.length < 2}
          onClick={() => void send({ type: 'pick', target: picked[0]!, second: picked[1]! })}
        >
          {w.go}
        </Plaque>
      );
    else if (p.act === 'potion') {
      const victim = v.witch?.victim ?? null;
      go = (
        <>
          {victim && v.witch?.heal && (
            <Plaque small aria-pressed={heal} go={heal} onClick={() => setHeal(!heal)}>
              {heal ? `Saving ${name(victim)}` : `Save ${name(victim)}?`}
            </Plaque>
          )}
          <Plaque
            go
            disabled={busy}
            onClick={() =>
              void send({
                type: 'potion',
                heal: heal && !!victim,
                poison: v.witch?.poison ? (picked[0] ?? null) : null,
              })
            }
          >
            {picked[0] ? `Poison ${name(picked[0])}` : w.go}
          </Plaque>
        </>
      );
    } else if (p.act === 'shoot')
      go = (
        <>
          <Plaque small disabled={busy} onClick={() => void send({ type: 'shoot', target: null })}>
            Don’t shoot
          </Plaque>
          <Plaque
            go
            disabled={busy || !picked[0]}
            onClick={() => void send({ type: 'shoot', target: picked[0]! })}
          >
            {picked[0] ? `Shoot ${name(picked[0])}` : w.go}
          </Plaque>
        </>
      );
    else if (p.act === 'vote')
      go = (
        <Plaque
          small
          go={p.pick === 'skip'}
          disabled={busy}
          onClick={() => void send({ type: 'vote', target: 'skip' })}
        >
          {p.pick === 'skip' ? 'Skipping' : 'Skip'}
        </Plaque>
      );
    else if (p.act !== 'kill')
      go = (
        <Plaque
          go
          disabled={busy || !picked[0]}
          onClick={() => void send({ type: 'pick', target: picked[0]! })}
        >
          {picked[0] ? `${w.go}: ${name(picked[0])}` : w.go}
        </Plaque>
      );
    const potionHint =
      p.act === 'potion' && v.witch
        ? `${v.witch.victim ? `The wolves chose ${name(v.witch.victim)}.` : 'The wolves chose nobody.'} ${
            v.witch.poison ? 'Tap a player to poison them.' : 'Your poison is gone.'
          }`
        : null;
    return (
      <section className="mf-dock mf-dock--act">
        <h3 className="mf-dock__title">{w.title}</h3>
        <p className="mf-dock__say">{potionHint ?? w.hint}</p>
        <div className="mf-dock__row">
          {cardBtn}
          {go}
        </div>
      </section>
    );
  }

  if (p?.locked) {
    const last = v.checks[v.checks.length - 1];
    const result =
      last && last.night === v.night && (p.act === 'ask' || p.act === 'see')
        ? last.result === 'mafia'
          ? `${name(last.target)} is Mafia!`
          : last.result === 'clean'
            ? `${name(last.target)} is not Mafia.`
            : `${name(last.target)} is the ${ROLE_INFO[last.result].name}.`
        : null;
    return (
      <section className="mf-dock">
        {result && <p className="mf-dock__result">{result}</p>}
        <p className="mf-dock__say">Done. Keep your screen hidden until morning.</p>
        <div className="mf-dock__row">{cardBtn}</div>
      </section>
    );
  }

  if (v.phase === 'day') {
    const ready = v.ready.includes(v.me);
    return (
      <section className="mf-dock">
        <p className="mf-dock__say">
          {v.ready.length} of {v.readyNeed} needed to start the vote.
        </p>
        <div className="mf-dock__row">
          {cardBtn}
          <Plaque
            go={!ready}
            disabled={busy}
            aria-pressed={ready}
            onClick={() => void send({ type: 'ready', on: !ready })}
          >
            {ready ? 'Ready. Tap to undo' : 'Ready to vote'}
          </Plaque>
        </div>
      </section>
    );
  }

  if (v.phase === 'witch') return say('The night isn’t over yet. Keep your screen hidden.');
  if (v.phase === 'hunter') return say(`${name(v.hunter ?? '')} is choosing who to shoot.`);
  if (v.phase === 'dawn') return say('The day begins in a moment.');
  if (v.phase === 'dusk') return say('Night falls in a moment.');
  return say('Wait for the others.');
}
