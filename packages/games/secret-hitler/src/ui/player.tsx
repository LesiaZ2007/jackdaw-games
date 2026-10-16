'use client';

import { useState } from 'react';
import { useMoment, VerdictMoment, type GameUi, type ScreenPlayer } from '@jackdaw/ui';
import type { Policy, Role } from '../lineup';
import { POWER_LABEL, policyMoment, powerLine, voteMoment } from '../moments';
import { roleName, type ShAction, type ShPlayerView, type ShTableView } from '../rules';
import { BALLOT, PowerIcon, RoleEmblem } from './art';
import { nameFrom, Placards, PolicyCard, ShFrame, Tracks } from './board';

/** What the round is waiting on, in one plain line everyone can read. */
export function statusLine(t: ShTableView, name: (id: string) => string): string {
  switch (t.phase) {
    case 'nominate':
      return `${name(t.president)} is president and must nominate a chancellor.`;
    case 'vote':
      return `Vote on ${name(t.president)} as president and ${name(t.nominee!)} as chancellor.`;
    case 'president':
      return `${name(t.president)} drew three policies and is passing two to ${name(t.nominee!)}.`;
    case 'chancellor':
      return `${name(t.nominee!)} is choosing which policy to enact.`;
    case 'veto':
      return `${name(t.nominee!)} asked to veto. ${name(t.president)} decides.`;
    case 'power':
      return t.pending ? `${powerLine(t.pending, t.president, name)}.` : '';
    case 'over':
      return 'The game is over.';
  }
}

const ROLE_LINE: Record<Role, string> = {
  liberal: 'Pass five Liberal policies, or find and execute Hitler.',
  fascist: 'Pass six Fascist policies, or get Hitler elected chancellor once three are down.',
  hitler:
    'You are Hitler. Get elected chancellor once three Fascist policies are down, and keep your head down until then.',
};

/** Your secret membership card: face down until you tap it, so the person beside you can't see. */
function RoleCard({ v, name }: { v: ShPlayerView; name: (id: string) => string }) {
  const [open, setOpen] = useState(false);
  if (!v.myRole) return null;
  const role = v.myRole;
  return (
    <section className="sh-role" aria-label="Your secret role">
      <button
        type="button"
        className={`sh-role__card${open ? ` is-open sh-role__card--${role}` : ''}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {open ? (
          <>
            <span className="sh-role__emblem">
              <RoleEmblem role={role} size={56} />
            </span>
            <span className="sh-role__text">
              <span className="sh-role__kicker">Your secret role</span>
              <span className="sh-role__name">{roleName(role)}</span>
              <span className="sh-role__line">{ROLE_LINE[role]}</span>
            </span>
          </>
        ) : (
          <span className="sh-role__text">
            <span className="sh-role__kicker">Your secret role</span>
            <span className="sh-role__name">Tap to look</span>
            <span className="sh-role__line">Shield your screen first.</span>
          </span>
        )}
      </button>
      {open && (v.known.length > 0 || v.investigations.length > 0) && (
        <div className="sh-role__known">
          {v.known.length > 0 && (
            <p>
              <b>Your side:</b>{' '}
              {v.known.map((k) => `${name(k.id)} (${roleName(k.role)})`).join(', ')}
            </p>
          )}
          {v.investigations.map((x) => (
            <p key={x.target}>
              <b>You investigated {name(x.target)}:</b>{' '}
              {x.team === 'liberal' ? 'a Liberal.' : 'on the Fascist team.'}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

/** Pick a card (or a player), then confirm: one tap alone never commits a secret move. */
function CardChoice({
  cards,
  verb,
  hint,
  onChoose,
  extra,
}: {
  cards: Policy[];
  verb: string;
  hint: string;
  onChoose: (p: Policy) => void;
  extra?: React.ReactNode;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <div className="sh-hand">
      <p className="sh-hand__hint">{hint}</p>
      <div className="sh-hand__cards" role="radiogroup" aria-label="Your policies">
        {cards.map((c, i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={picked === i}
            aria-label={`${c === 'liberal' ? 'Liberal' : 'Fascist'} policy`}
            className={`sh-hand__card${picked === i ? ' is-picked' : ''}`}
            onClick={() => setPicked(i)}
          >
            <PolicyCard policy={c} size="lg" />
          </button>
        ))}
      </div>
      <div className="sh-row">
        <button
          type="button"
          className="sh-btn sh-btn--go"
          disabled={picked === null}
          onClick={() => picked !== null && onChoose(cards[picked]!)}
        >
          {picked === null
            ? `Pick one to ${verb}`
            : `${verb[0]!.toUpperCase()}${verb.slice(1)} the ${cards[picked] === 'liberal' ? 'Liberal' : 'Fascist'} policy`}
        </button>
        {extra}
      </div>
    </div>
  );
}

function Actions({
  v,
  me,
  name,
  send,
  target,
  setTarget,
}: {
  v: ShPlayerView;
  me: string;
  name: (id: string) => string;
  send: (a: ShAction) => Promise<boolean>;
  target: string | null;
  setTarget: (id: string | null) => void;
}) {
  const dead = v.dead.includes(me);
  const seated = v.players.includes(me);
  if (!seated)
    return <p className="sh-wait">You're watching this game. You can play the next one.</p>;
  if (dead)
    return (
      <p className="sh-wait">
        You were executed. Stay quiet about your role; you can still watch the table.
      </p>
    );

  if (v.phase === 'nominate') {
    if (me !== v.president) return <p className="sh-wait">{statusLine(v, name)}</p>;
    return (
      <div className="sh-panel">
        <h3 className="sh-panel__title">Nominate a chancellor</h3>
        <p className="sh-panel__hint">Tap a name at the table. Term-limited players can't serve.</p>
        <button
          type="button"
          className="sh-btn sh-btn--go"
          disabled={!target}
          onClick={() =>
            target &&
            void send({ type: 'nominate', chancellor: target }).then((ok) => ok && setTarget(null))
          }
        >
          {target ? `Nominate ${name(target)}` : 'Choose someone above'}
        </button>
      </div>
    );
  }

  if (v.phase === 'vote') {
    return (
      <div className="sh-panel">
        <h3 className="sh-panel__title">
          {name(v.president)} and {name(v.nominee!)}?
        </h3>
        <div className="sh-ballots" role="radiogroup" aria-label="Your vote">
          {([true, false] as const).map((ja) => (
            <button
              key={String(ja)}
              type="button"
              role="radio"
              aria-checked={v.myVote === ja}
              className={`sh-ballot ${ja ? 'is-ja' : 'is-nein'}${v.myVote === ja ? ' is-cast' : ''}`}
              onClick={() => void send({ type: 'vote', ja })}
            >
              {ja ? BALLOT.ja : BALLOT.nein}
            </button>
          ))}
        </div>
        <p className="sh-panel__hint" role="status">
          {v.myVote === null
            ? 'Votes are secret until everyone has voted.'
            : `You voted ${v.myVote ? 'Ja' : 'Nein'}. You can change it until the last vote is in.`}{' '}
          {v.voted.length} of {v.players.length - v.dead.length} in.
        </p>
      </div>
    );
  }

  if (v.phase === 'president' && me === v.president && v.hand.length === 3) {
    return (
      <CardChoice
        cards={v.hand}
        verb="discard"
        hint={`You drew three. Throw one away; ${name(v.nominee!)} gets the other two.`}
        onChoose={(policy) => void send({ type: 'discard', policy })}
      />
    );
  }

  if (v.phase === 'chancellor' && me === v.nominee && v.hand.length === 2) {
    return (
      <CardChoice
        cards={v.hand}
        verb="enact"
        hint={`${name(v.president)} passed you these two. Enact one; the other is discarded.`}
        onChoose={(policy) => void send({ type: 'enact', policy })}
        extra={
          v.vetoUnlocked && !v.vetoAsked ? (
            <button
              type="button"
              className="sh-btn"
              onClick={() => void send({ type: 'veto' })}
              title="Ask the president to throw both away"
            >
              <PowerIcon power="veto" size={22} /> Ask to veto
            </button>
          ) : undefined
        }
      />
    );
  }

  if (v.phase === 'veto' && me === v.president) {
    return (
      <div className="sh-panel">
        <h3 className="sh-panel__title">{name(v.nominee!)} asks to veto both policies</h3>
        <p className="sh-panel__hint">
          Agreeing throws both away and counts as a failed government on the tracker.
        </p>
        <div className="sh-row">
          <button
            type="button"
            className="sh-btn sh-btn--go"
            onClick={() => void send({ type: 'vetoReply', accept: true })}
          >
            Agree to the veto
          </button>
          <button
            type="button"
            className="sh-btn"
            onClick={() => void send({ type: 'vetoReply', accept: false })}
          >
            Refuse: enact one
          </button>
        </div>
      </div>
    );
  }

  if (v.phase === 'power' && me === v.president && v.pending) {
    if (v.pending === 'peek') {
      return (
        <div className="sh-panel">
          <h3 className="sh-panel__title">The next three policies</h3>
          <div className="sh-hand__cards">
            {(v.peek ?? []).map((c, i) => (
              <PolicyCard key={i} policy={c} size="lg" />
            ))}
          </div>
          <p className="sh-panel__hint">
            Only you see these. What you tell the table is up to you.
          </p>
          <button
            type="button"
            className="sh-btn sh-btn--go"
            onClick={() => void send({ type: 'power' })}
          >
            Done looking
          </button>
        </div>
      );
    }
    const verb =
      v.pending === 'investigate'
        ? 'Investigate'
        : v.pending === 'special'
          ? 'Make president'
          : 'Execute';
    return (
      <div className="sh-panel">
        <h3 className="sh-panel__title">
          <PowerIcon power={v.pending} size={26} /> {POWER_LABEL[v.pending]}
        </h3>
        <p className="sh-panel__hint">
          {v.pending === 'investigate'
            ? 'Tap a player to see their party card. Only you will know.'
            : v.pending === 'special'
              ? 'Tap a player to be the next president. Then the turn order carries on from you.'
              : 'Tap a player to execute. If it is Hitler, the Liberals win.'}
        </p>
        <button
          type="button"
          className={`sh-btn sh-btn--go${v.pending === 'execute' ? ' sh-btn--danger' : ''}`}
          disabled={!target}
          onClick={() =>
            target && void send({ type: 'power', target }).then((ok) => ok && setTarget(null))
          }
        >
          {target ? `${verb} ${name(target)}` : 'Choose someone above'}
        </button>
      </div>
    );
  }

  return <p className="sh-wait">{statusLine(v, name)}</p>;
}

/** Who you may tap at the table right now. */
function pickableFor(v: ShPlayerView, me: string): string[] {
  if (v.dead.includes(me)) return [];
  if (v.phase === 'nominate' && me === v.president) return v.eligible;
  if (v.phase === 'power' && me === v.president && v.pending && v.pending !== 'peek') {
    const investigated = new Set(
      v.governments.filter((g) => g.power?.kind === 'investigate').map((g) => g.power!.target),
    );
    return v.players.filter(
      (id) =>
        id !== me && !v.dead.includes(id) && !(v.pending === 'investigate' && investigated.has(id)),
    );
  }
  return [];
}

/** The moment for whatever just resolved: a policy going down beats the vote before it. */
export function useShMoment(t: ShTableView, me: string | null, name: (id: string) => string) {
  const [policyKey, clearPolicy] = useMoment(t.enactedCount);
  const [voteKey, clearVote] = useMoment(t.votesResolved);
  const ev = t.event;
  if (policyKey !== null && ev?.kind === 'enacted' && t.phase !== 'over')
    return {
      moment: policyMoment(t, ev.policy, ev.by === 'chaos'),
      done: clearPolicy,
      key: `p${policyKey}`,
    };
  if (voteKey !== null && t.phase !== 'over') {
    const m = voteMoment(t, me, name);
    if (m) return { moment: m, done: clearVote, key: `v${voteKey}` };
  }
  return null;
}

export const PlayerScreen: GameUi['PlayerScreen'] = ({
  view,
  me,
  players,
  sendAction,
  reactions,
}) => {
  const v = view as ShPlayerView;
  const name = nameFrom(players as ScreenPlayer[]);
  const [target, setTarget] = useState<string | null>(null);
  const pickable = pickableFor(v, me);
  const send = (a: ShAction) => sendAction(a);
  const m = useShMoment(v, me, name);

  return (
    <ShFrame className="sh-game">
      <header className="sh-status">
        <p className="sh-status__line" role="status">
          {statusLine(v, name)}
        </p>
      </header>
      <RoleCard v={v} name={name} />
      <Tracks t={v} />
      <Placards
        t={v}
        players={players as ScreenPlayer[]}
        me={me}
        reactions={reactions}
        pickable={pickable}
        onPick={(id) => setTarget(id === target ? null : id)}
      />
      {target && pickable.includes(target) && (
        <p className="sh-picked" aria-live="polite">
          Chosen: <b>{name(target)}</b>
        </p>
      )}
      <section className="sh-actions" aria-label="Your move">
        <Actions v={v} me={me} name={name} send={send} target={target} setTarget={setTarget} />
      </section>
      {m && (
        <VerdictMoment
          key={m.key}
          outcome={m.moment.outcome}
          title={m.moment.title}
          detail={m.moment.detail}
          emblem={
            m.key.startsWith('p') && v.event?.kind === 'enacted' ? (
              <PolicyCard policy={v.event.policy} size="sm" />
            ) : undefined
          }
          onDone={m.done}
        />
      )}
    </ShFrame>
  );
};
