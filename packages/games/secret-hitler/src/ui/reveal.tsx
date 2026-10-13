'use client';

import { Token, type GameUi, type ScreenPlayer } from '@jackdaw/ui';
import { teamOf, roleName, type Government, type ShReveal } from '../rules';
import { POWER_LABEL } from '../moments';
import { BALLOT, PowerIcon, RoleEmblem } from './art';
import { nameFrom, PolicyCard, ShFrame } from './board';

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');

/** One government in the recap: the vote, then what was really drawn and passed on. */
function GovernmentRow({ g, name }: { g: Government; name: (id: string) => string }) {
  const ja = Object.entries(g.votes)
    .filter(([, v]) => v)
    .map(([id]) => name(id));
  const nein = Object.entries(g.votes)
    .filter(([, v]) => !v)
    .map(([id]) => name(id));
  return (
    <li className={cx('sh-gov', g.passed ? 'is-passed' : 'is-failed')}>
      <header className="sh-gov__head">
        <span className="sh-gov__n">{g.n}</span>
        <span className="sh-gov__who">
          <b>{name(g.president)}</b> nominated <b>{name(g.chancellor)}</b>
        </span>
        <span className="sh-gov__result">{g.passed ? 'Elected' : 'Voted down'}</span>
      </header>
      <p className="sh-gov__votes">
        <span className="sh-ballot-chip is-ja">{BALLOT.ja}</span> {ja.join(', ') || 'nobody'}
        <span className="sh-gov__gap" />
        <span className="sh-ballot-chip is-nein">{BALLOT.nein}</span> {nein.join(', ') || 'nobody'}
      </p>
      {g.drawn && (
        <div className="sh-gov__cards">
          <span className="sh-gov__label">Drawn by {name(g.president)}</span>
          <span className="sh-gov__hand">
            {g.drawn.map((c, i) => (
              <PolicyCard
                key={i}
                policy={c}
                size="sm"
                className={
                  // Mark the first card of each discarded type as the one thrown away.
                  i === g.drawn!.indexOf(g.presidentDiscard!) ? 'is-tossed' : undefined
                }
              />
            ))}
          </span>
          <span className="sh-gov__label">
            {g.presidentDiscard && <>Discarded {g.presidentDiscard}. </>}
            {g.vetoed
              ? 'Vetoed: both thrown away.'
              : g.enacted
                ? `${name(g.chancellor)} enacted ${g.enacted}${g.chancellorDiscard ? ` and discarded ${g.chancellorDiscard}` : ''}.`
                : ''}
          </span>
        </div>
      )}
      {g.hitlerElected && (
        <p className="sh-gov__power is-end">{name(g.chancellor)} was Hitler. The Fascists win.</p>
      )}
      {g.power && (
        <p className="sh-gov__power">
          <PowerIcon power={g.power.kind} size={20} /> {POWER_LABEL[g.power.kind]}
          {g.power.target && <>: {name(g.power.target)}</>}
          {g.secret?.team && (
            <> (secretly {g.secret.team === 'liberal' ? 'a Liberal' : 'on the Fascist team'})</>
          )}
          {g.secret?.cards && <> (saw {g.secret.cards.join(', ')})</>}
        </p>
      )}
    </li>
  );
}

/**
 * The full recap: every player's role, then every government with every vote and the policies
 * actually drawn, discarded and enacted, so the table can check everyone's claims.
 */
export const Reveal: NonNullable<GameUi['Reveal']> = ({ result, players }) => {
  const r = result.reveal as ShReveal;
  const name = nameFrom(players as ScreenPlayer[]);
  const byId = new Map(players.map((p) => [p.id, p]));
  // Governments and top-decked policies, in the order they happened.
  const timeline: (
    { kind: 'gov'; g: Government } | { kind: 'chaos'; policy: string; at: number }
  )[] = [];
  for (const g of r.governments) {
    timeline.push({ kind: 'gov', g });
    for (const c of r.chaos.filter((c) => c.after === g.n))
      timeline.push({ kind: 'chaos', policy: c.enacted, at: c.after });
  }
  return (
    <ShFrame className="sh-reveal">
      <section aria-label="Who was who">
        <h3 className="sh-reveal__title">Who was who</h3>
        <ul className="sh-roles">
          {Object.entries(r.roles).map(([id, role]) => {
            const p = byId.get(id);
            return (
              <li key={id} className={cx('sh-roles__item', `is-${teamOf(role)}`)}>
                {p && <Token avatar={p.avatar} size={40} />}
                <span className="sh-roles__name">
                  {name(id)}
                  {r.dead.includes(id) && <small> (executed)</small>}
                </span>
                <span className="sh-roles__role">
                  <RoleEmblem role={role} size={24} /> {roleName(role)}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
      <section aria-label="Every government">
        <h3 className="sh-reveal__title">
          Every government ({r.liberal} Liberal, {r.fascist} Fascist enacted)
        </h3>
        <ol className="sh-govs">
          {timeline.map((item) =>
            item.kind === 'gov' ? (
              <GovernmentRow key={`g${item.g.n}`} g={item.g} name={name} />
            ) : (
              <li key={`c${item.at}`} className="sh-gov is-chaos">
                Three failed governments in a row: the top policy, {item.policy}, was enacted with
                no power.
              </li>
            ),
          )}
        </ol>
      </section>
    </ShFrame>
  );
};
