'use client';

import { useMoment, useTheme, VerdictMoment, type GameUi, type ScreenPlayer } from '@jackdaw/ui';
import { ROLE_INFO } from '../roles';
import type { MafiaTableView } from '../rules';
import { useNarrator, VoiceButton } from './narrator';
import { CastList, Masthead, Placards, rootClass, Scenery, type PlacardInfo } from './table';
import { headline, isNight, moment, narration } from './words';
import './mafia.css';

/**
 * Mafia on the TV: the narrator's front page. The headline huge across the top, everyone's
 * placard filling the middle (the dead stamped, votes counted under them), and down the side
 * the clock, how many have chosen or voted, the deck, the last vote and who has died. Night
 * turns the whole page dark. The TV reads the narration aloud (switch it off with the button).
 */
export const TvScreen: GameUi['TvScreen'] = ({ tableView, reactions, now, ...props }) => {
  const t = tableView as MafiaTableView;
  const players = props.players as ScreenPlayer[];
  const look = useTheme();
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  const h = headline(t, name);
  const night = isNight(t);
  const narr = useNarrator({
    id: String(t.step),
    text: narration(t, name),
    speaker: true,
    startedAt: t.since,
    now,
  });
  const [fresh, dismiss] = useMoment(t.step);
  const m = fresh !== null ? moment(t, null, name) : null;

  const info = (id: string): PlacardInfo => {
    const tags: string[] = [];
    if ((t.phase === 'deal' || t.phase === 'day') && t.ready.includes(id))
      tags.push(t.phase === 'deal' ? 'Seen' : 'Ready');
    if (t.phase === 'vote' && t.voted.includes(id)) tags.push('Voted');
    if (t.phase === 'dusk' && t.lastVote) {
      const n = t.lastVote.counts[id];
      if (n) tags.push(`${n} vote${n === 1 ? '' : 's'}`);
    }
    if (t.hunter === id) tags.push('Taking aim');
    return {
      id,
      dead: t.deaths.find((d) => d.id === id),
      tags,
      lover: !!t.lovers?.includes(id),
    };
  };

  const progress =
    t.phase === 'night'
      ? `${t.nightDone} of ${t.alive.length} have chosen`
      : t.phase === 'vote'
        ? `${t.voted.length} of ${t.alive.length} have voted`
        : t.phase === 'day'
          ? `${t.ready.length} of ${t.readyNeed} ready to vote`
          : t.phase === 'deal'
            ? `${t.ready.length} of ${t.players.length} have seen their card`
            : null;

  return (
    <div className={rootClass(t, night, 'mf-tv')} data-look={look}>
      <Masthead t={t} now={now}>
        <VoiceButton speaking={narr.speaking} pref={narr.pref} />
      </Masthead>

      <section className="mf-tv__front">
        {(t.phase === 'dawn' || t.phase === 'dusk') && (t.dawn.length > 0 || t.lastVote?.out) && (
          <span className="mf-extra" aria-hidden="true">
            Extra!
          </span>
        )}
        <h2 className="mf-head mf-tv__head" key={t.step}>
          {h.head}
        </h2>
        <p className="mf-sub mf-tv__sub">{h.sub}</p>
        {narr.needsTap && (
          <button type="button" className="mf-tv__tap">
            Click once to let the narrator speak
          </button>
        )}
      </section>

      <div className="mf-tv__table">
        <Placards t={t} players={players} me={null} info={info} reactions={reactions} size="tv" />
      </div>

      <aside className="mf-tv__side">
        {progress && <p className="mf-tv__progress">{progress}</p>}
        <section>
          <h3 className="mf-tv__label">In the deck</h3>
          <CastList cast={t.cast} />
        </section>
        {t.lastVote && t.phase !== 'vote' && <VoteSheet t={t} name={name} />}
        <Obituaries t={t} name={name} />
      </aside>

      <Scenery t={t} repeat={3} />

      {m && (
        <VerdictMoment
          key={t.step}
          size="tv"
          outcome="reveal"
          title={m.title}
          detail={m.detail}
          onDone={dismiss}
        />
      )}
    </div>
  );
};

/** The last vote, counted: each name with its votes as tally marks. */
function VoteSheet({ t, name }: { t: MafiaTableView; name: (id: string) => string }) {
  const v = t.lastVote!;
  const rows = Object.entries(v.counts).sort((a, b) => b[1] - a[1]);
  return (
    <section className="mf-tally">
      <h3 className="mf-tv__label">Day {v.day} vote</h3>
      <ul>
        {rows.map(([who, n]) => (
          <li key={who} className={who === v.out ? 'is-out' : undefined}>
            <span>{who === 'skip' ? 'Skip' : name(who)}</span>
            <span className="mf-tally__marks" aria-label={`${n} votes`}>
              {'|'.repeat(n)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Who has died, and how. */
function Obituaries({ t, name }: { t: MafiaTableView; name: (id: string) => string }) {
  if (!t.deaths.length) return null;
  const how = {
    night: 'in the night',
    vote: 'voted out',
    grief: 'of a broken heart',
    shot: 'shot',
  } as const;
  return (
    <section className="mf-obits">
      <h3 className="mf-tv__label">{t.mode === 'Mafia' ? 'Obituaries' : 'The graveyard'}</h3>
      <ul>
        {t.deaths.slice(-6).map((d) => (
          <li key={d.id}>
            <b>{name(d.id)}</b> {d.role ? `the ${ROLE_INFO[d.role].name}, ` : ''}
            {how[d.cause]}
          </li>
        ))}
      </ul>
    </section>
  );
}
