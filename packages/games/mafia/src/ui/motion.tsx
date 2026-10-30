'use client';

import { Fragment, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useMoment } from '@jackdaw/ui';
import type { MafiaTableView } from '../rules';
import { Moon, Skyline, Village } from './art';
import { isNight, MASTHEAD } from './words';
import './motion.css';

/**
 * Mafia's moving print. Each step that matters gets one orchestrated moment over the whole
 * page (a curtain), and the scenery keeps a little life in between: rain on the city at night,
 * stars, clouds and wolves' eyes over the village, a jackdaw crossing by day. Everything is flat
 * printed shapes moving, with no glows, and it all stops under reduced motion (mafia.css).
 */

const vars = (v: Record<string, string | number>) => v as CSSProperties;

export type CurtainKind = 'night' | 'news' | 'over';

/** How long each curtain covers the page, in ms (mafia.css times its keyframes to match). */
export const CURTAIN_MS: Record<CurtainKind, number> = { night: 2300, news: 2500, over: 3200 };

function kindOf(t: MafiaTableView): CurtainKind | null {
  if (t.phase === 'night') return 'night';
  if (t.phase === 'dawn' || t.phase === 'dusk') return 'news';
  if (t.phase === 'over') return 'over';
  return null;
}

/**
 * The curtain for the step just reached (never for the step the screen opened on), and whether
 * it's still playing, so a player's own moment can wait for it.
 */
export function useCurtain(t: MafiaTableView, head: string): { node: ReactNode; busy: boolean } {
  const [fresh, dismiss] = useMoment(t.step);
  const kind = fresh !== null ? kindOf(t) : null;
  useEffect(() => {
    if (fresh === null) return;
    const id = setTimeout(dismiss, kind ? CURTAIN_MS[kind] : 0);
    return () => clearTimeout(id);
  }, [fresh, kind, dismiss]);
  if (!kind) return { node: null, busy: false };
  return { node: <Curtain key={t.step} kind={kind} t={t} head={head} />, busy: true };
}

function Curtain({ kind, t, head }: { kind: CurtainKind; t: MafiaTableView; head: string }) {
  const city = t.mode === 'Mafia';
  const pack = t.win?.team === 'pack';
  const cls = `mf-curtain mf-curtain--${kind}${pack ? ' is-pack' : ''}`;
  if (kind === 'night')
    return (
      <div className={cls} aria-hidden="true">
        <div className="mf-curtain__sheet">
          {!city && (
            <span className="mf-curtain__arc">
              <Moon night={Math.max(1, t.night)} className="mf-curtain__moon" />
            </span>
          )}
          <span className="mf-curtain__word">{city ? 'Night edition' : 'Night falls'}</span>
          <span className="mf-curtain__small">{city ? 'The city sleeps' : `Night ${t.night}`}</span>
          {city ? <Skyline className="mf-curtain__sky" /> : <Village className="mf-curtain__sky" />}
        </div>
      </div>
    );
  // The news: in the city, the front page spins in as in an old film; in the village, the sun
  // (or, if the wolves won, a blood moon) rises over the trees.
  if (city)
    return (
      <div className={cls} aria-hidden="true">
        <div className="mf-curtain__paper">
          <span className="mf-curtain__mast">{MASTHEAD.Mafia}</span>
          <span className="mf-curtain__extra">
            {kind === 'over' ? 'Final edition' : 'Extra! Extra!'}
          </span>
          <span className="mf-curtain__head">{head}</span>
          <span className="mf-curtain__cols" />
        </div>
      </div>
    );
  return (
    <div className={cls} aria-hidden="true">
      <div className="mf-curtain__sheet">
        <span className="mf-curtain__rise">
          {pack ? (
            <svg viewBox="0 0 40 40" className="mf-curtain__blood">
              <circle cx="20" cy="20" r="17" />
            </svg>
          ) : (
            <Sun />
          )}
        </span>
        <span className="mf-curtain__head">{head}</span>
        <Village className="mf-curtain__sky" />
      </div>
    </div>
  );
}

/** A woodcut sun: a disc and straight rays that turn slowly. */
function Sun() {
  return (
    <svg viewBox="0 0 100 100" className="mf-sun">
      <g className="mf-sun__rays">
        {Array.from({ length: 16 }, (_, i) => (
          <path key={i} d="M50 4v14" transform={`rotate(${i * 22.5} 50 50)`} />
        ))}
      </g>
      <circle cx="50" cy="50" r="22" className="mf-sun__disc" />
    </svg>
  );
}

/**
 * The weather over the page, behind everything: rain in the city at night, stars and a drifting
 * cloud over the village.
 */
export function Weather({ t, drops = 18 }: { t: MafiaTableView; drops?: number }) {
  const night = isNight(t) || (t.phase === 'over' && t.win?.team === 'pack');
  const city = t.mode === 'Mafia';
  return (
    <div className="mf-weather" aria-hidden="true">
      {night &&
        city &&
        Array.from({ length: drops }, (_, i) => (
          <i
            key={i}
            className="mf-rain"
            style={vars({
              '--x': `${(i * 53) % 100}%`,
              '--d': `${((i * 0.37) % 1.3).toFixed(2)}s`,
              '--s': `${(0.7 + ((i * 7) % 5) * 0.08).toFixed(2)}s`,
            })}
          />
        ))}
      {night && !city && (
        <>
          {Array.from({ length: drops }, (_, i) => (
            <i
              key={i}
              className="mf-star"
              style={vars({
                '--x': `${(i * 61 + 7) % 100}%`,
                '--y': `${(i * 37) % 46}%`,
                '--d': `${((i * 0.53) % 3).toFixed(2)}s`,
              })}
            />
          ))}
          <i className="mf-cloud" />
        </>
      )}
    </div>
  );
}

/** A jackdaw in flight, wings beating, crossing the sky (the lobby's wall). */
export function Jackdaw() {
  return (
    <span className="mf-bird">
      <svg viewBox="0 0 40 20">
        <path className="mf-bird__wing" d="M20 11C14 3 7 2 1 5c6 0 11 3 15 8z" />
        <path
          className="mf-bird__wing mf-bird__wing--far"
          d="M20 11c6-8 13-9 19-6-6 0-11 3-15 8z"
        />
        <ellipse cx="20" cy="12" rx="5" ry="2.6" />
        <path d="M24.5 11.2l3.4-.6-3.2 1.8z" />
      </svg>
    </span>
  );
}

/**
 * The back of every card: an art-deco sunburst in the city, a moon over the pines in the village.
 * Printed in the card's ink.
 */
export function CardBack({ city }: { city: boolean }) {
  if (city)
    return (
      <svg className="mf-back" viewBox="0 0 100 140" preserveAspectRatio="xMidYMid slice">
        <g className="mf-back__rays">
          {Array.from({ length: 36 }, (_, i) => (
            <path key={i} d="M50 70L50 -40" transform={`rotate(${i * 10} 50 70)`} />
          ))}
        </g>
        <rect x="8" y="8" width="84" height="124" className="mf-back__frame" />
        <path d="M50 22l10 16H40zM50 118l10-16H40z" className="mf-back__fill" />
      </svg>
    );
  return (
    <svg className="mf-back" viewBox="0 0 100 140" preserveAspectRatio="xMidYMid slice">
      <g className="mf-back__stars">
        {[
          [18, 20],
          [80, 16],
          [64, 34],
          [26, 46],
          [86, 52],
          [12, 70],
        ].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" />
        ))}
      </g>
      <path d="M58 26a16 16 0 1 0 14 24 13 13 0 0 1-14-24z" className="mf-back__fill" />
      <path
        d="M0 140V112l8-16 6 10 8-22 8 20 6-12 8 18 8-24 8 22 6-10 8 18 8-20 8 18 10-14V140z"
        className="mf-back__fill"
      />
      <rect x="8" y="8" width="84" height="124" className="mf-back__frame" />
    </svg>
  );
}

/** The Hunter's sight, sweeping the table while they choose. */
export function Scope() {
  return (
    <span className="mf-scope" aria-hidden="true">
      <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" />
        <circle cx="50" cy="50" r="6" />
        <path d="M50 2v30M50 68v30M2 50h30M68 50h30" />
      </svg>
    </span>
  );
}

/**
 * Who has just died, since this screen opened (never the dead it opened on): their placards get
 * the stamp slammed on, or the tombstone raised. Clears after the stamp has landed.
 */
export function useFreshDead(dead: string[]): string[] {
  const key = dead.join(',');
  const [seen, setSeen] = useState(key);
  const [fresh, setFresh] = useState<string[]>([]);
  if (key !== seen) {
    const before = new Set(seen.split(','));
    setSeen(key);
    setFresh(dead.filter((id) => !before.has(id)));
  }
  useEffect(() => {
    if (!fresh.length) return;
    const id = setTimeout(() => setFresh([]), 5_000);
    return () => clearTimeout(id);
  }, [fresh]);
  return fresh;
}

/**
 * A headline printed as it would come off the press: in the city each letter is stamped down in
 * turn; in the village the line is pulled from the woodblock left to right.
 */
export function PrintedHead({
  text,
  className,
  city,
}: {
  text: string;
  className: string;
  city: boolean;
}) {
  if (!city)
    return (
      <h2 className={`${className} mf-head--pull`} key={text}>
        {text}
      </h2>
    );
  return (
    <h2 className={`${className} mf-head--press`} aria-label={text} key={text}>
      {text.split(' ').map((word, w, words) => (
        <Fragment key={w}>
          <span className="mf-head__w" aria-hidden="true">
            {[...word].map((ch, c) => (
              <span
                key={c}
                className="mf-head__ch"
                style={vars({ '--i': words.slice(0, w).join('').length + c })}
              >
                {ch}
              </span>
            ))}
          </span>
          {w < words.length - 1 ? ' ' : ''}
        </Fragment>
      ))}
    </h2>
  );
}
