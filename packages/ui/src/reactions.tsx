'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { REACTIONS, REACTION_NAMES, type Reaction, type ReactionKind } from '@jackdaw/engine';
import './reactions.css';

/**
 * Quick reactions: Avalon's six, drawn in the house line style. Each has its own heraldic
 * accent so a glance across the table reads them before the shape does.
 */
const line = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 3.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};
const accent = { ...line, stroke: 'var(--accent)' };
const face = <circle cx="32" cy="32" r="22" {...line} />;

const thumb = (
  <>
    <path
      d="M21 30 L29 12 C31 8 37 9 37 14 V24 H48 C52 24 54 28 53 31 L49 48 C48 51 45 52 42 52 H21 Z"
      {...line}
    />
    <path d="M11 30 H21 V52 H11 Z" {...accent} fill="var(--accent)" />
  </>
);

const ART: Record<ReactionKind, ReactNode> = {
  up: thumb,
  down: <g transform="matrix(1 0 0 -1 0 64)">{thumb}</g>,
  hmm: (
    <>
      <path d="M22 22 C22 12 42 10 42 22 C42 31 32 31 32 41" {...line} strokeWidth={4.4} />
      <circle cx="32" cy="52" r="3.8" fill="var(--accent)" />
    </>
  ),
  sus: (
    <>
      {face}
      <path d="M19 29 H28 M36 21 L47 17" {...line} />
      <circle cx="41" cy="29" r="3" fill="currentColor" />
      <path d="M24 43 L40 39" {...accent} strokeWidth={4.4} />
    </>
  ),
  wow: (
    <>
      {face}
      <path d="M20 20 L27 23 M44 20 L37 23" {...line} />
      <circle cx="25" cy="29" r="2.6" fill="currentColor" />
      <circle cx="39" cy="29" r="2.6" fill="currentColor" />
      <circle cx="32" cy="42" r="6" fill="var(--accent)" />
    </>
  ),
  haha: (
    <>
      {face}
      <path d="M20 28 Q24 22 28 28 M36 28 Q40 22 44 28" {...line} />
      <path d="M20 36 H44 C44 45 39 49 32 49 C25 49 20 45 20 36 Z" fill="var(--accent)" />
    </>
  ),
};

/** Each reaction's heraldic accent. */
const ACCENT: Record<ReactionKind, string> = {
  up: 'var(--vert)',
  down: 'var(--gules)',
  hmm: 'var(--azure)',
  sus: 'var(--purpure)',
  wow: 'var(--or)',
  haha: 'var(--tenne)',
};

const isKind = (k: string): k is ReactionKind => (REACTIONS as readonly string[]).includes(k);

export function ReactionIcon({ kind, size }: { kind: string; size?: number | string }) {
  if (!isKind(kind)) return null;
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      style={{ '--accent': ACCENT[kind] } as CSSProperties}
    >
      {ART[kind]}
    </svg>
  );
}

/**
 * The row of six reaction buttons. A short cool-down after each one matches the server's
 * 800ms limit, so a tap is never silently dropped.
 */
export function ReactionBar({
  onReact,
  label = 'React to the table',
  className,
}: {
  onReact: (kind: ReactionKind) => void;
  label?: string;
  className?: string;
}) {
  const [cooling, setCooling] = useState(false);
  useEffect(() => {
    if (!cooling) return;
    const t = setTimeout(() => setCooling(false), 900);
    return () => clearTimeout(t);
  }, [cooling]);
  return (
    <div
      className={['jd-reactions', className].filter(Boolean).join(' ')}
      role="group"
      aria-label={label}
    >
      {REACTIONS.map((kind) => (
        <button
          key={kind}
          type="button"
          className="jd-reactions__btn"
          aria-label={REACTION_NAMES[kind]}
          title={REACTION_NAMES[kind]}
          disabled={cooling}
          onClick={() => {
            setCooling(true);
            onReact(kind);
          }}
        >
          <ReactionIcon kind={kind} />
        </button>
      ))}
    </div>
  );
}

/** This player's reaction on the table, if any (the newest). */
export function reactionOf(reactions: Reaction[] | undefined, playerId: string) {
  let found: Reaction | undefined;
  for (const r of reactions ?? []) if (r.playerId === playerId) found = r;
  return found;
}

/**
 * A reaction popping up over a seat. Place it inside a positioned element (the seat, or a
 * wrapper round a token); it floats up and fades. Give it `key={reaction.id}` so a new reaction
 * replays the pop, or use `PlayerReaction`, which does.
 */
export function ReactionBubble({
  reaction,
  name,
  size,
}: {
  reaction: Reaction;
  /** Who reacted, for screen readers. */
  name?: string;
  /** Bubble width in px. By default it sizes to the seat track. */
  size?: number;
}) {
  if (!isKind(reaction.kind)) return null;
  return (
    <span
      className="jd-bubble"
      role="img"
      aria-label={`${name ? `${name}: ` : ''}${REACTION_NAMES[reaction.kind]}`}
      style={size ? ({ '--b': `${size}px` } as CSSProperties) : undefined}
    >
      <ReactionIcon kind={reaction.kind} />
    </span>
  );
}

/**
 * The latest reaction from `playerId`, popping over whatever positioned element holds it.
 * Games pass the `reactions` prop they're given straight through.
 */
export function PlayerReaction({
  reactions,
  playerId,
  name,
  size,
}: {
  reactions: Reaction[] | undefined;
  playerId: string;
  name?: string;
  size?: number;
}) {
  const reaction = reactionOf(reactions, playerId);
  return reaction ? (
    <ReactionBubble key={reaction.id} reaction={reaction} name={name} size={size} />
  ) : null;
}
