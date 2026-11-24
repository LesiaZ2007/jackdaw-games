'use client';

import { Fragment, type ReactNode } from 'react';
import type { GameStory, StoryBars, StoryChart, StoryFact, StoryHeadline } from '@jackdaw/engine';
import type { ScreenPlayer } from './game-ui';
import { Token } from './pieces';
import './story.css';

/**
 * The end-of-game stats page, built from a game's `GameResult.story`. Each part works alone (the
 * TV shows them one at a time) or all together (`StoryView`, on phones). Lines and bars take a
 * player's colour from their place in `order`, so a player is the same colour everywhere.
 */

/** Heraldic inks in the order players get them; past seven, the colours repeat dashed. */
const INKS = ['gules', 'azure', 'vert', 'or', 'purpure', 'tenne', 'sable'] as const;

export interface StoryContext {
  names: Record<string, string>;
  players: ScreenPlayer[];
  /** Player ids in a fixed order, for colours. Winners first reads best. */
  order: string[];
  me?: string | null;
  winners?: string[];
  /** Draw at TV sizes. */
  tv?: boolean;
}

const inkOf = (ctx: StoryContext, id: string | undefined, fallback: number) => {
  const i = id ? ctx.order.indexOf(id) : -1;
  const n = i >= 0 ? i : fallback;
  return { color: `var(--story-${INKS[n % INKS.length]})`, dashed: n >= INKS.length };
};

/** "{a} over {b}" with the names in bold. */
export function storyText(text: string, names: Record<string, string>): ReactNode {
  const parts = text.split(/\{([A-Za-z0-9_-]+)\}/g);
  return parts.map((p, i) =>
    i % 2 === 1 ? <b key={i}>{names[p] ?? 'Someone'}</b> : <Fragment key={i}>{p}</Fragment>,
  );
}

const nameOf = (ctx: StoryContext, id?: string, label?: string) =>
  label ?? (id ? (ctx.names[id] ?? 'Someone') : '');

export function StoryHeadlines({ items, ctx }: { items: StoryHeadline[]; ctx: StoryContext }) {
  if (!items.length) return null;
  const byId = new Map(ctx.players.map((p) => [p.id, p]));
  return (
    <ul className="jd-story__heads" data-count={items.length}>
      {items.map((h, i) => {
        const p = h.playerId ? byId.get(h.playerId) : undefined;
        return (
          <li key={h.label} className="jd-story__head" style={{ animationDelay: `${i * 120}ms` }}>
            <span className="jd-story__kicker">{h.label}</span>
            <span className="jd-story__value">{h.value}</span>
            {(h.detail || p) && (
              <span className="jd-story__detail">
                {p && <Token avatar={p.avatar} size={ctx.tv ? 44 : 24} />}
                <span>{h.detail ? storyText(h.detail, ctx.names) : nameOf(ctx, h.playerId)}</span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Spreads end labels so none overlap: `gap` is the least distance in the 0..1 range. */
function spread(ys: number[], gap: number): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  const n = order.length;
  // Push crowded labels down, then back up from the bottom edge, then down from the top
  // edge: only labels that would touch move.
  for (let k = 1; k < n; k++) order[k]!.y = Math.max(order[k]!.y, order[k - 1]!.y + gap);
  if (n) order[n - 1]!.y = Math.min(order[n - 1]!.y, 1);
  for (let k = n - 2; k >= 0; k--) order[k]!.y = Math.min(order[k]!.y, order[k + 1]!.y - gap);
  if (n) order[0]!.y = Math.max(order[0]!.y, 0);
  for (let k = 1; k < n; k++) order[k]!.y = Math.max(order[k]!.y, order[k - 1]!.y + gap);
  const out = [...ys];
  for (const o of order) out[o.i] = o.y;
  return out;
}

const short = (n: number) =>
  Math.abs(n) >= 10_000 ? `${Math.round(n / 1000)}k` : Math.round(n).toLocaleString('en-US');

export function StoryChartView({ chart, ctx }: { chart: StoryChart; ctx: StoryContext }) {
  const steps = Math.max(...chart.series.map((s) => s.points.length));
  if (steps < 2) return null;
  const all = chart.series.flatMap((s) => s.points);
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (chart.kind !== 'per-step' && lo > 0) lo = 0;
  if (hi === lo) hi = lo + 1;
  const pad = (hi - lo) * 0.06;
  const top = hi + pad;
  const bottom = lo === 0 ? 0 : lo - pad;
  const W = 1000;
  const H = 1000;
  const x = (i: number) => (i / (steps - 1)) * W;
  const y = (v: number) => H - ((v - bottom) / (top - bottom)) * H;
  const winners = new Set(ctx.winners ?? []);
  const lines = chart.series.map((s, i) => {
    const ink = inkOf(ctx, s.playerId, i);
    const last = s.points[s.points.length - 1] ?? 0;
    return {
      key: s.playerId ?? s.label ?? String(i),
      d: s.points.map((v, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(v).toFixed(1)}`).join(''),
      ink,
      won: s.playerId ? winners.has(s.playerId) : false,
      me: s.playerId !== undefined && s.playerId === ctx.me,
      name: nameOf(ctx, s.playerId, s.label),
      last,
      endY: y(last) / H,
    };
  });
  const ends = spread(
    lines.map((l) => l.endY),
    ctx.tv ? 0.085 : 0.11,
  );
  // Draw the winners last, on top.
  const drawn = [...lines].sort((a, b) => Number(a.won) - Number(b.won));
  const zero = bottom < 0 && top > 0 ? y(0) / H : null;
  // Pins close together stack in rows, so their notes don't cover each other.
  const marks: { x: number; text: string; at: number; row: number }[] = [];
  for (const m of [...(chart.marks ?? [])].sort((a, b) => a.x - b.x).slice(0, 6)) {
    const at = m.x / (steps - 1);
    const row = marks.filter((p) => Math.abs(p.at - at) < 0.25).length;
    marks.push({ ...m, at, row });
  }
  const ticks = [top - pad, (top - pad + bottom) / 2, bottom].map((v) => ({
    v,
    at: y(v) / H,
  }));

  return (
    <figure className="jd-story__chart">
      <figcaption className="jd-story__chart-title">{chart.title}</figcaption>
      <div className="jd-story__plot">
        <div className="jd-story__axis" aria-hidden>
          {ticks.map((t) => (
            <span key={t.at} style={{ top: `${t.at * 100}%` }}>
              {short(t.v)}
            </span>
          ))}
        </div>
        <div className="jd-story__area">
          {ticks.map((t) => (
            <span key={t.at} className="jd-story__grid" style={{ top: `${t.at * 100}%` }} />
          ))}
          {zero !== null && (
            <span
              className="jd-story__grid jd-story__grid--zero"
              style={{ top: `${zero * 100}%` }}
            />
          )}
          {marks.map((m) => (
            <span
              key={`${m.x}-${m.text}`}
              className="jd-story__mark"
              data-right={m.at > 0.6 || undefined}
              style={{ left: `${m.at * 100}%`, ['--row' as string]: m.row }}
            >
              <span>{storyText(m.text, ctx.names)}</span>
            </span>
          ))}
          <svg
            className="jd-story__svg"
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`${chart.title} over the game: ${lines
              .map((l) => `${l.name} ended on ${short(l.last)}`)
              .join(', ')}`}
          >
            {drawn.map((l) => (
              <path
                key={l.key}
                d={l.d}
                className="jd-story__line"
                data-won={l.won || undefined}
                style={{
                  stroke: l.ink.color,
                  strokeDasharray: l.ink.dashed ? '10 7' : undefined,
                }}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          {lines.map((l, i) => (
            <span
              key={l.key}
              className="jd-story__end"
              data-won={l.won || undefined}
              data-me={l.me || undefined}
              style={{ top: `${ends[i]! * 100}%`, ['--ink-line' as string]: l.ink.color }}
            >
              <i aria-hidden />
              <span className="jd-story__end-name">{l.name}</span>
              <span className="jd-story__end-val">{short(l.last)}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="jd-story__x" aria-hidden>
        <span>Start</span>
        <span>
          {chart.xLabel ?? 'Step'} {steps - 1}
        </span>
      </div>
    </figure>
  );
}

export function StoryBarsView({ bars, ctx }: { bars: StoryBars; ctx: StoryContext }) {
  const max = Math.max(1, ...bars.rows.map((r) => Math.abs(r.value)));
  const best = Math.max(...bars.rows.map((r) => r.value));
  const byId = new Map(ctx.players.map((p) => [p.id, p]));
  return (
    <figure className="jd-story__bars">
      <figcaption className="jd-story__chart-title">{bars.title}</figcaption>
      <ol>
        {bars.rows.map((r, i) => {
          const p = r.playerId ? byId.get(r.playerId) : undefined;
          return (
            <li
              key={r.playerId ?? r.label ?? i}
              data-best={(r.value === best && best > 0) || undefined}
              data-me={(r.playerId && r.playerId === ctx.me) || undefined}
            >
              <span className="jd-story__bar-who">
                {p && <Token avatar={p.avatar} size={ctx.tv ? 40 : 22} />}
                <span>{nameOf(ctx, r.playerId, r.label)}</span>
              </span>
              <span className="jd-story__bar-track">
                <span
                  className="jd-story__bar"
                  style={{
                    width: `${(Math.abs(r.value) / max) * 100}%`,
                    background: inkOf(ctx, r.playerId, i).color,
                    animationDelay: `${i * 80}ms`,
                  }}
                />
              </span>
              <span className="jd-story__bar-val">{r.display ?? short(r.value)}</span>
            </li>
          );
        })}
      </ol>
    </figure>
  );
}

export function StoryFacts({ facts, ctx }: { facts: StoryFact[]; ctx: StoryContext }) {
  if (!facts.length) return null;
  const byId = new Map(ctx.players.map((p) => [p.id, p]));
  return (
    <ul className="jd-story__facts">
      {facts.map((f, i) => (
        <li
          key={`${f.label}-${i}`}
          className="jd-story__fact"
          data-tone={f.tone}
          style={{ animationDelay: `${i * 110}ms` }}
        >
          <span className="jd-story__fact-label">{f.label}</span>
          <span className="jd-story__fact-text">{storyText(f.text, ctx.names)}</span>
          {f.playerIds?.length ? (
            <span className="jd-story__fact-who" aria-hidden>
              {f.playerIds.slice(0, 3).map((id) => {
                const p = byId.get(id);
                return p ? <Token key={id} avatar={p.avatar} size={ctx.tv ? 48 : 28} /> : null;
              })}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** The whole stats page, for phones: big numbers, charts, comparisons, then the fun facts. */
export function StoryView({ story, ctx }: { story: GameStory | undefined; ctx: StoryContext }) {
  if (!story) return null;
  return (
    <section className="jd-story" aria-label="Game stats">
      <h2 className="jd-h2 jd-recap__title">Game stats</h2>
      {story.headlines && <StoryHeadlines items={story.headlines} ctx={ctx} />}
      {story.charts?.map((c) => (
        <StoryChartView key={c.title} chart={c} ctx={ctx} />
      ))}
      {story.facts && <StoryFacts facts={story.facts.slice(0, 6)} ctx={ctx} />}
      {story.bars?.map((b) => (
        <StoryBarsView key={b.title} bars={b} ctx={ctx} />
      ))}
    </section>
  );
}
