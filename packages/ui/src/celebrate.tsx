'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { Avatar } from '@jackdaw/engine';
import { Icon } from './icons';
import { Token } from './pieces';
import './celebrate.css';

/**
 * The outcome moment every game shares. When a round or a game resolves, each phone shows the
 * player's own result as a heraldic banner with a wax seal pressed onto it:
 *
 * - win: a vert banner, a gold seal, and a burst of punched-out chits and jackdaw feathers;
 * - loss: a muted gules banner that droops;
 * - draw: a sable banner;
 * - reveal: an azure banner for someone watching (a spectator, or the TV naming the winners).
 *
 * One orchestrated motion (the seal slams down, the banner unfurls, the burst flies), about 1.4s.
 * With reduced motion it simply appears. See CLAUDE.md, "Outcome moments", for how games use it.
 */
export type Outcome = 'win' | 'loss' | 'draw' | 'reveal';

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');
const vars = (v: Record<string, string | number>) => v as CSSProperties;

export interface VerdictProps {
  outcome: Outcome;
  /** Short and plain: "You won the round", "Rook wins". */
  title: string;
  /** One line under the banner: who beat whom, the score. */
  detail?: ReactNode;
  /** The token pressed into the seal. Without one the seal shows a crown (win) or a mark. */
  avatar?: Avatar;
  /** Something else for the seal, e.g. a game emblem. Wins over `avatar`. */
  emblem?: ReactNode;
  /** `tv` doubles every dimension for a screen across the room. */
  size?: 'phone' | 'tv';
  className?: string;
}

/** The banner and seal, in place (results screens, the head of a game's reveal). */
export function Verdict({
  outcome,
  title,
  detail,
  avatar,
  emblem,
  size = 'phone',
  className,
}: VerdictProps) {
  const seal =
    emblem ??
    (avatar ? (
      <Token avatar={avatar} size={size === 'tv' ? 120 : 60} />
    ) : (
      <span className="jd-verdict__mark">{outcome === 'win' ? <Icon.host /> : <SealMark />}</span>
    ));
  return (
    <div
      className={cx(
        'jd-verdict',
        `jd-verdict--${outcome}`,
        size === 'tv' && 'jd-verdict--tv',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      {outcome === 'win' && <Burst />}
      <div className="jd-verdict__seal" aria-hidden="true">
        <svg className="jd-verdict__wax" viewBox="0 0 100 100">
          <path d={WAX} />
          <circle cx="50" cy="50" r="38" />
        </svg>
        <span className="jd-verdict__face">{seal}</span>
      </div>
      <div className="jd-verdict__banner">
        <span className="jd-verdict__tail jd-verdict__tail--l" aria-hidden="true" />
        <span className="jd-verdict__tail jd-verdict__tail--r" aria-hidden="true" />
        <h2 className="jd-verdict__title">{title}</h2>
      </div>
      {detail && <p className="jd-verdict__detail">{detail}</p>}
    </div>
  );
}

/**
 * The same moment laid over a game screen for a few seconds (between rounds). Tap anywhere or
 * press Escape to put it away; it also clears itself after `ms`, so it never blocks the next move.
 */
export function VerdictMoment({
  onDone,
  ms = 3400,
  ...props
}: VerdictProps & { onDone: () => void; ms?: number }) {
  // The latest onDone, so a re-render (every snapshot) doesn't restart the timer.
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);
  const { outcome, title } = props;
  useEffect(() => {
    const t = setTimeout(() => done.current(), ms);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && done.current();
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
    };
    // A new moment (outcome or title) starts its own clock.
  }, [ms, outcome, title]);
  return (
    <div
      className={cx('jd-moment', props.size === 'tv' && 'jd-moment--tv')}
      onClick={onDone}
      style={vars({ '--moment-ms': `${ms}ms` })}
    >
      <Verdict {...props} />
      {props.size !== 'tv' && <span className="jd-moment__hint">Tap to carry on</span>}
    </div>
  );
}

/**
 * A burst of punched-out chits and black feathers flying from the centre of its parent. The
 * parent needs `position: relative`. Deterministic: the same pieces fly the same way every time.
 */
export function Burst({ pieces = 22 }: { pieces?: number }) {
  return (
    <span className="jd-burst" aria-hidden="true">
      {Array.from({ length: pieces }, (_, i) => {
        // Spread evenly round the circle, nudged by a fixed wobble so it doesn't look mechanical.
        const angle = (i / pieces) * Math.PI * 2 + Math.sin(i * 12.9898) * 0.35;
        const reach = 0.75 + ((Math.sin(i * 78.233) + 1) / 2) * 0.55;
        const feather = i % 5 === 2;
        return (
          <span
            key={i}
            className={feather ? 'jd-burst__feather' : 'jd-burst__chit'}
            style={vars({
              '--x': Math.cos(angle) * reach,
              '--y': Math.sin(angle) * reach,
              '--spin': `${((i * 137) % 360) - 180}deg`,
              '--fill': `var(--${BURST_FILLS[i % BURST_FILLS.length]})`,
              '--delay': `${(i % 4) * 30}ms`,
            })}
          >
            {feather && <Feather />}
          </span>
        );
      })}
    </span>
  );
}

const BURST_FILLS = ['gules', 'azure', 'vert', 'or', 'purpure', 'tenne', 'on-fill'];

/** A small coloured result chip ("Won", "+2") that pops in when it appears or changes. */
export function OutcomeChip({
  outcome,
  children,
  className,
}: {
  outcome: Outcome;
  children: ReactNode;
  className?: string;
}) {
  return <span className={cx('jd-chip', `jd-chip--${outcome}`, className)}>{children}</span>;
}

/**
 * A score that pops and shows a rising "+n" whenever it goes up. Starts still: a score that is
 * already there when the screen opens doesn't animate.
 */
export function Tally({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const [gain, setGain] = useState<{ by: number; at: number } | null>(null);
  // Adjusting state while rendering (not in an effect): React's pattern for "value changed".
  if (value !== shown) {
    setGain(value > shown ? { by: value - shown, at: value } : null);
    setShown(value);
  }
  return (
    <span className={cx('jd-tally', className)}>
      <span
        key={gain?.at ?? 'still'}
        className={gain ? 'jd-tally__n jd-tally__n--up' : 'jd-tally__n'}
      >
        {value}
      </span>
      {gain && (
        <span key={`gain-${gain.at}`} className="jd-tally__gain" aria-hidden="true">
          +{gain.by}
        </span>
      )}
    </span>
  );
}

/**
 * Remembers a key (e.g. "rounds resolved so far") and returns it when it moves on after the
 * screen first opened, until dismissed. A refresh mid-game shows nothing old again.
 */
export function useMoment<K extends string | number>(key: K): [K | null, () => void] {
  const [seen, setSeen] = useState(key);
  const [fresh, setFresh] = useState<K | null>(null);
  if (key !== seen) {
    setSeen(key);
    setFresh(key);
  }
  const dismiss = useCallback(() => setFresh(null), []);
  return [fresh, dismiss];
}

function SealMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3l2.4 5.6L20 9.3l-4.3 3.9 1.3 5.8L12 16l-5 3 1.3-5.8L4 9.3l5.6-.7z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A jackdaw's feather, drawn in ink. */
function Feather() {
  return (
    <svg viewBox="0 0 24 48" aria-hidden="true">
      <path d="M12 46C11 34 4 30 5 18 6 8 11 3 12 2c2 3 7 8 7 17 0 11-6 15-7 27z" />
      <path d="M12 46V8" fill="none" stroke="var(--rule)" strokeWidth="1.2" />
    </svg>
  );
}

/** The wavy rim of a pressed wax seal, as one path on a 100×100 box. */
const WAX = (() => {
  const points: string[] = [];
  const lobes = 14;
  for (let i = 0; i <= lobes * 4; i++) {
    const a = (i / (lobes * 4)) * Math.PI * 2;
    const r = 46 + Math.sin(a * lobes) * 3.2 + Math.sin(a * 3 + 1) * 1.2;
    points.push(`${(50 + Math.cos(a) * r).toFixed(1)} ${(50 + Math.sin(a) * r).toFixed(1)}`);
  }
  return `M${points.join('L')}Z`;
})();
