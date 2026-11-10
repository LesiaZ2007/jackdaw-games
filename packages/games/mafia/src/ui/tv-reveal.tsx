'use client';

import type { CSSProperties, ReactNode } from 'react';
import type { RecapEvent } from '@jackdaw/engine';
import { Token, useTheme, type GameUi } from '@jackdaw/ui';
import { ROLE_INFO, TEAM_NAME, type Mode, type Team } from '../roles';
import { teamOf, type Death, type MafiaReveal } from '../rules';
import { RoleMark } from './art';
import { MASTHEAD, MASTHEAD_SHORT } from './words';
import './mafia.css';
import './tv-reveal.css';

const vars = (v: Record<string, string | number>) => v as CSSProperties;

const TEAM_ORDER: Team[] = ['town', 'pack', 'jester', 'killer', 'lovers'];

const HOW: Record<Death['cause'], string> = {
  night: 'Killed in the night',
  vote: 'Voted out',
  grief: 'Died of a broken heart',
  shot: 'Shot by the Hunter',
};

/** The banner over the page: who won, in the setting's own words. */
function banner(r: MafiaReveal): string {
  if (r.alive.length === 0) return 'Nobody left';
  const city = r.mode === 'Mafia';
  switch (r.win.team) {
    case 'town':
      return city ? 'Town prevails' : 'The village is saved';
    case 'pack':
      return city ? 'The Mafia takes the city' : 'The wolves win';
    case 'jester':
      return 'The Jester wins';
    case 'killer':
      return 'The Serial Killer wins';
    case 'lovers':
      return 'Love wins';
    default:
      return 'Game over';
  }
}

type Mark = 'moon' | 'sun' | 'shot' | 'heart' | 'alive';

/** The little printed marks: night, day, the Hunter's sight, a broken heart, a check. */
function Glyph({ mark }: { mark: Mark }) {
  const line = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  let body: ReactNode;
  switch (mark) {
    case 'moon':
      body = <path d="M38 6a26 26 0 1 0 20 40A22 22 0 0 1 38 6z" fill="currentColor" />;
      break;
    case 'sun':
      body = (
        <g {...line}>
          <circle cx="32" cy="32" r="11" fill="currentColor" />
          <path d="M32 6v8M32 50v8M6 32h8M50 32h8M14 14l6 6M44 44l6 6M50 14l-6 6M20 44l-6 6" />
        </g>
      );
      break;
    case 'shot':
      body = (
        <g {...line} strokeWidth={5}>
          <circle cx="32" cy="32" r="20" />
          <path d="M32 4v14M32 46v14M4 32h14M46 32h14" />
        </g>
      );
      break;
    case 'heart':
      body = (
        <path
          d="M32 54C14 42 8 32 8 23a11 11 0 0 1 24-5 11 11 0 0 1 24 5c0 9-6 19-24 31z"
          fill="currentColor"
        />
      );
      break;
    default:
      body = <path {...line} strokeWidth={8} d="M10 34l16 16 28-34" />;
  }
  return (
    <svg viewBox="0 0 64 64" className="mf-rv__glyph" aria-hidden="true">
      {body}
    </svg>
  );
}

const CAUSE_MARK: Record<Death['cause'], Mark> = {
  night: 'moon',
  vote: 'sun',
  shot: 'shot',
  grief: 'heart',
};

/** Which night or day a death belongs to: a morning is a night, after a vote it's the day. */
const whenOf = (d: Death) => (d.night > d.day ? d.night : d.day);

interface NightLine {
  mark: Mark;
  n: number;
  text: string;
}

/** The public turning points of each night and day, from the recap's structured data. */
function nightsOf(recap: RecapEvent[], name: (id: string) => string): NightLine[] {
  const out: NightLine[] = [];
  for (const e of recap) {
    const d = e.data as
      | {
          kind?: string;
          night?: number;
          day?: number;
          dead?: string[];
          out?: string | null;
          by?: string;
          target?: string | null;
        }
      | undefined;
    if (!d) continue;
    if (d.kind === 'dawn' && typeof d.night === 'number')
      out.push({
        mark: 'moon',
        n: d.night,
        text: d.dead?.length ? d.dead.map(name).join(', ') : 'No one died',
      });
    else if (d.kind === 'vote' && typeof d.day === 'number')
      out.push({ mark: 'sun', n: d.day, text: d.out ? `${name(d.out)} out` : 'No verdict' });
    else if (d.kind === 'shot' && d.target && d.by)
      out.push({
        mark: 'shot',
        n: e.round ?? 0,
        text: `${name(d.by)} shot ${name(d.target)}`,
      });
  }
  return out;
}

const NIGHTS_SHOWN = 8;

/**
 * The TV's results for Mafia and Werewolf: the front page (city) or the proclamation (village).
 * A banner for who won, then every player's card turned face up, grouped by team (the winning
 * side first), with a mark for how each one ended, and a narrow column of how the nights and days
 * went when the line-up leaves room. It fills the box the platform gives it and never scrolls.
 */
export const TvReveal: NonNullable<GameUi['TvReveal']> = ({ result, players }) => {
  const r = result.reveal as MafiaReveal;
  const look = useTheme();
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  const mode: Mode = r.mode;
  const kind = mode === 'Mafia' ? 'city' : 'village';
  const draw = r.alive.length === 0;
  const alive = new Set(r.alive);

  const order = Object.keys(r.roles);
  const groups = TEAM_ORDER.map((team) => ({
    team,
    ids: order
      .filter((id) => teamOf(r, id) === team)
      .sort((a, b) => {
        const da = r.deaths.findIndex((d) => d.id === a);
        const db = r.deaths.findIndex((d) => d.id === b);
        // The living first, then the dead in the order they went.
        return (da < 0 ? -1 : da) - (db < 0 ? -1 : db);
      }),
  }))
    .filter((g) => g.ids.length > 0)
    .sort(
      (a, b) => Number(!draw && b.team === r.win.team) - Number(!draw && a.team === r.win.team),
    );

  const nights = nightsOf(result.recap, name).slice(-NIGHTS_SHOWN);
  const cells = order.length + groups.length;
  const showNights = nights.length > 0 && cells <= 12;
  const cols = showNights ? 2 : cells > 18 ? 4 : cells > 6 ? 3 : 2;
  const rows = Math.ceil(cells / cols);
  let at = 0;

  return (
    <div className={`mf mf--${kind} mf-rv`} data-look={look}>
      <header className="mf-rv__head">
        <h2 className="mf-rv__mast">{(showNights ? MASTHEAD : MASTHEAD_SHORT)[mode]}</h2>
        <p className="mf-rv__banner">{banner(r)}</p>
      </header>
      <div className={`mf-rv__body${showNights ? ' has-nights' : ''}`}>
        <ul className="mf-rv__line" style={vars({ '--cols': cols, '--rows': rows })}>
          {groups.flatMap((g) => {
            const won = !draw && g.team === r.win.team;
            return [
              <li
                key={`team-${g.team}`}
                className={`mf-rv__team mf-team-${g.team}${won ? ' is-won' : ''}`}
                style={vars({ '--i': at++ })}
              >
                <b>{TEAM_NAME[mode][g.team]}</b>
                <span>{won ? 'Won' : g.ids.length}</span>
              </li>,
              ...g.ids.map((id) => {
                const p = byId.get(id);
                const role = r.roles[id]!;
                const death = r.deaths.find((d) => d.id === id);
                const isWinner = result.winners.includes(id);
                const status = death
                  ? `${HOW[death.cause]}, ${death.night > death.day ? 'night' : 'day'} ${whenOf(death)}`
                  : alive.has(id)
                    ? 'Survived'
                    : 'Out';
                return (
                  <li
                    key={id}
                    className={`mf-rv__p mf-team-${ROLE_INFO[role].team}${isWinner ? ' is-won' : ''}${death ? ' is-dead' : ''}`}
                    style={vars({ '--i': at++ })}
                  >
                    {p ? <Token avatar={p.avatar} size={40} /> : <span className="mf-rv__gone" />}
                    <span className="mf-rv__who">
                      <b>{name(id)}</b>
                      <span>
                        <RoleMark role={role} size="1em" />
                        {ROLE_INFO[role].name}
                      </span>
                    </span>
                    <span className="mf-rv__end" title={status}>
                      <Glyph mark={death ? CAUSE_MARK[death.cause] : 'alive'} />
                      {death && <b>{whenOf(death)}</b>}
                      <span className="sr-only">{status}</span>
                    </span>
                  </li>
                );
              }),
            ];
          })}
        </ul>
        {showNights && (
          <aside className="mf-rv__nights" aria-label="How the nights went">
            <h3>How the nights went</h3>
            <ol>
              {nights.map((l, i) => (
                <li key={i}>
                  <Glyph mark={l.mark} />
                  <b>{l.n}</b>
                  <span>{l.text}</span>
                </li>
              ))}
            </ol>
          </aside>
        )}
      </div>
    </div>
  );
};
