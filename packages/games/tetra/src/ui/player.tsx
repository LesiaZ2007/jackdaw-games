'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useMoment, useTheme, VerdictMoment, type GameUi, type ScreenPlayer } from '@jackdaw/ui';
import {
  fmtTime,
  SPRINT_LINES,
  type PublicBoard,
  type TetraAction,
  type TetraPlayerView,
} from '../rules';
import { preview } from '../sim';
import { Runner, type Input } from './runner';
import { fitCanvas, paintWell, readInk, Stone, Well } from './well';
import { Countdown, Pips, roundVerdict, Statline } from './parts';
import './tetra.css';

const KEYS: Record<string, Input> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowDown: 'soft',
  ' ': 'hard',
  ArrowUp: 'cw',
  x: 'cw',
  X: 'cw',
  z: 'ccw',
  Z: 'ccw',
  Control: 'ccw',
  a: 'half',
  A: 'half',
  c: 'hold',
  C: 'hold',
  Shift: 'hold',
};

const PAD: { input: Input; label: string; glyph: string }[] = [
  { input: 'hold', label: 'Hold', glyph: 'M5 7h14v10H5z' },
  { input: 'ccw', label: 'Turn left', glyph: 'M8 6H4V2M4.5 6A8 8 0 1 1 4 13' },
  { input: 'cw', label: 'Turn right', glyph: 'M16 6h4V2M19.5 6A8 8 0 1 0 20 13' },
  { input: 'left', label: 'Left', glyph: 'M15 4l-8 8 8 8' },
  { input: 'soft', label: 'Soft drop', glyph: 'M4 9l8 8 8-8' },
  { input: 'right', label: 'Right', glyph: 'M9 4l8 8-8 8' },
  { input: 'hard', label: 'Drop', glyph: 'M4 5l8 7 8-7M4 12l8 7 8-7' },
];

/**
 * Tetra on a phone: your well in the middle with the stone you hold on the left and the next five
 * on the right, the rubble you're owed rising as a red bar beside it, and everyone else's wells in
 * a strip on top. Play with the pad under the well (hold left or right to slide), or a keyboard:
 * arrows, Space to drop, Z and X (or Up) to turn, A for a half turn, C or Shift to hold. Once you're
 * out, the screen shows everyone still playing.
 */
export const PlayerScreen: GameUi['PlayerScreen'] = ({ view, sendAction, now, ...props }) => {
  const v = view as TetraPlayerView;
  const look = useTheme();
  const players = props.players as ScreenPlayer[];
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? 'Someone';
  // One runner for the life of the screen, always holding the latest props.
  const [runner] = useState(() => new Runner());
  const live = useRef(now);
  useLayoutEffect(() => {
    live.current = now;
    const count = v.boards.length;
    runner.connect(
      (a: TetraAction) => sendAction(a),
      () => Math.min(1500, Math.max(600, 260 * count)),
    );
    runner.sync(v);
  }, [runner, v, now, sendAction]);

  const canvas = useRef<HTMLCanvasElement>(null);
  const [, setHud] = useState(0);

  // The frame loop: step the well, paint it, and refresh the HUD when something changed.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let seen = -1;
    let clock = 0;
    const frame = (t: number) => {
      const dt = Math.min(100, t - last);
      last = t;
      runner.step(live.current(), dt, t);
      const c = canvas.current;
      if (c) {
        const piece = runner.piece;
        paintWell(c, runner.stack.well, readInk(c), fitCanvas(c), {
          piece,
          ghost: runner.ghost(),
          grid: true,
          dim: runner.stack.topped,
        });
      }
      if (runner.version !== seen || t - clock > 200) {
        seen = runner.version;
        clock = t;
        setHud((n) => n + 1);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [runner]);

  // Keyboard, for laptops (ignored while typing in table talk).
  useEffect(() => {
    const typing = (e: KeyboardEvent) =>
      e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    const down = (e: KeyboardEvent) => {
      const input = KEYS[e.key];
      if (!input || typing(e) || e.metaKey || e.altKey) return;
      e.preventDefault();
      if (!e.repeat) runner.press(input, performance.now());
    };
    const up = (e: KeyboardEvent) => {
      const input = KEYS[e.key];
      if (input) runner.release(input);
    };
    const blur = () => runner.releaseAll();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [runner]);

  const t = now();
  const mine = v.boards.find((b) => b.id === v.me);
  const others = v.boards.filter((b) => b.id !== v.me);
  const watching = !mine || (mine.done && v.phase === 'play' && others.some((b) => !b.done));
  const owing = runner.owing();
  const next = v.seed !== null ? preview(runner.stack, v.seed, 5) : [];

  const [ended, dismiss] = useMoment(v.rounds.length);
  const lastRound = v.rounds[v.rounds.length - 1];
  const verdict = ended && lastRound ? roundVerdict(v, lastRound, v.me, name) : null;

  const [shout, setShout] = useState(runner.shout);
  if (runner.shout && runner.shout.id !== shout?.id) setShout(runner.shout);
  useEffect(() => {
    if (!shout) return;
    const id = setTimeout(() => setShout(null), 1400);
    return () => clearTimeout(id);
  }, [shout]);

  const myKo = [...v.feed].reverse().find((f) => f.kind === 'ko' && f.by === v.me);
  const [ko, dismissKo] = useMoment(myKo?.seq ?? 0);
  useEffect(() => {
    if (!ko) return;
    const id = setTimeout(dismissKo, 1800);
    return () => clearTimeout(id);
  }, [ko, dismissKo]);

  const pad = (input: Input) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      runner.press(input, performance.now());
    },
    onPointerUp: () => runner.release(input),
    onPointerCancel: () => runner.release(input),
    onLostPointerCapture: () => runner.release(input),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  return (
    <div className="ttr ttr-phone" data-look={look}>
      {others.length > 0 && (
        <ul className="ttr-rivals" aria-label="Everyone else">
          {others.map((b) => (
            <Rival key={b.id} b={b} v={v} name={name(b.id)} />
          ))}
        </ul>
      )}

      {watching ? (
        <div className="ttr-watch">
          <p className="ttr-watch__line">
            {mine
              ? mine.topped
                ? 'Topped out. Watching the rest…'
                : 'Done. Watching the rest…'
              : 'Watching'}
          </p>
          <div className="ttr-watch__grid" data-count={others.filter((b) => !b.done).length}>
            {others
              .filter((b) => !b.done)
              .map((b) => (
                <figure key={b.id} className="ttr-watch__one">
                  <Well well={b.well} label={`${name(b.id)}'s well`} />
                  <figcaption>{name(b.id)}</figcaption>
                </figure>
              ))}
          </div>
        </div>
      ) : (
        <div className="ttr-stage">
          <aside className="ttr-side ttr-side--left">
            <span className="ttr-label">Hold</span>
            <Stone kind={runner.stack.hold} faded={runner.holdUsed} />
            {mine && <Statline v={v} b={mine} now={t} />}
          </aside>

          <div className="ttr-frame">
            <div className="ttr-meter" aria-label={`${owing} rows of rubble owed`}>
              <span style={{ height: `${Math.min(100, (owing / 20) * 100)}%` }} />
            </div>
            <div className="ttr-wellbox">
              <canvas
                ref={canvas}
                className="ttr-well ttr-well--live"
                role="img"
                aria-label="Your well"
              />
              <Countdown v={v} now={t} />
              {shout && (
                <div
                  key={shout.id}
                  className={`ttr-shout${shout.big ? ' ttr-shout--big' : ''}`}
                  aria-live="polite"
                >
                  <b>{shout.text}</b>
                  {shout.sub && <span>{shout.sub}</span>}
                </div>
              )}
              {ko && myKo && (
                <div className="ttr-ko" aria-live="polite">
                  Knocked out {name(myKo.who)}
                </div>
              )}
              {mine?.done && v.phase === 'play' && (
                <div className="ttr-veil">
                  {mine.topped
                    ? 'Topped out'
                    : v.mode === 'sprint' && mine.finishMs !== null
                      ? fmtTime(mine.finishMs)
                      : 'Time'}
                </div>
              )}
            </div>
          </div>

          <aside className="ttr-side ttr-side--right">
            <span className="ttr-label">Next</span>
            <div className="ttr-next">
              {next.map((k, i) => (
                <Stone key={`${runner.stack.next + i}`} kind={k} />
              ))}
            </div>
          </aside>
        </div>
      )}

      {!watching && (
        <div className="ttr-pad" role="group" aria-label="Controls">
          {PAD.map((b) => (
            <button
              key={b.input}
              type="button"
              className={`ttr-key ttr-key--${b.input}`}
              aria-label={b.label}
              {...pad(b.input)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={b.glyph} />
              </svg>
            </button>
          ))}
        </div>
      )}
      <p className="ttr-keys">
        ← → move · ↓ soft drop · Space drop · Z / X turn · A half turn · C hold
      </p>

      {verdict && (
        <VerdictMoment
          key={`round-${lastRound!.round}`}
          outcome={verdict.outcome}
          title={verdict.title}
          detail={verdict.detail}
          onDone={dismiss}
        />
      )}
    </div>
  );
};

function Rival({ b, v, name }: { b: PublicBoard; v: TetraPlayerView; name: string }) {
  return (
    <li className={`ttr-rival${b.done ? ' ttr-rival--out' : ''}`}>
      <div className="ttr-rival__well">
        <Well well={b.well} dim={b.topped} label={`${name}'s well`} />
        {b.owing > 0 && (
          <span
            className="ttr-rival__owe"
            style={{ height: `${Math.min(100, (b.owing / 20) * 100)}%` }}
          />
        )}
      </div>
      <span className="ttr-rival__name">{name}</span>
      {v.mode === 'versus' ? (
        <Pips won={v.wins[b.id] ?? 0} of={v.firstTo} />
      ) : (
        <span className="ttr-rival__stat">
          {v.mode === 'sprint'
            ? b.finishMs !== null
              ? fmtTime(b.finishMs)
              : `${b.lines}/${SPRINT_LINES}`
            : b.score.toLocaleString('en-GB')}
        </span>
      )}
    </li>
  );
}
