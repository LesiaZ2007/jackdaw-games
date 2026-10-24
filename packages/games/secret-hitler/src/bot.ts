import type { BotContext, Rng } from '@jackdaw/engine';
import { HITLER_ZONE, LIBERAL_WIN, type Policy } from './lineup';
import type { ShAction, ShPlayerView, ShTableView } from './rules';

/**
 * A computer player for Secret Hitler (2026-10-24: "play against bots"). It decides only
 * from its own player view, so it knows exactly what a person in its seat would: its role, the
 * Fascists it was shown, its own investigations, its hand, and the public record.
 *
 * - Liberals keep a trust score per player from the public record (passing Liberal policies
 *   earns trust, passing Fascist ones loses it, more so for the chancellor who chose it), back
 *   the governments they trust and throw Fascist cards away.
 * - Fascists know the team: they put teammates in office, get Hitler elected once three Fascist
 *   policies are down, pass Fascist policies when they can, and otherwise vote like a Liberal so
 *   they blend in.
 * - Hitler plays like a Liberal, mostly, so he looks clean enough to be elected later.
 *
 * Every choice has some noise from `ctx.rng`, and every move is legal from the view.
 */

type View = ShPlayerView;

const living = (v: ShTableView) => v.players.filter((id) => !v.dead.includes(id));

/** How much this player trusts each other player, from the public record and its own findings. */
function trustScores(v: View): Record<string, number> {
  const t: Record<string, number> = Object.fromEntries(v.players.map((id) => [id, 0]));
  for (const g of v.governments) {
    if (g.enacted === 'liberal') {
      t[g.president]! += 1;
      t[g.chancellor]! += 1.2;
    } else if (g.enacted === 'fascist') {
      t[g.president]! -= 1;
      t[g.chancellor]! -= 1.3;
    }
  }
  // A chancellor elected with three Fascist policies down is publicly not Hitler.
  for (const id of v.notHitler) t[id]! += 0.5;
  for (const x of v.investigations) t[x.target]! += x.team === 'liberal' ? 10 : -10;
  t[v.me] = 100;
  return t;
}

const team = (v: View) => new Set(v.known.map((k) => k.id));
const hitlerOf = (v: View) => v.known.find((k) => k.role === 'hitler')?.id ?? null;
const isFascist = (v: View) => v.myRole === 'fascist';
const isHitler = (v: View) => v.myRole === 'hitler';
/** Fascists, and Hitler when he knows his team (5–6 players), play for the team openly. */
const knowsTeam = (v: View) => v.myRole !== 'liberal' && v.known.length > 0;

/** The highest-scoring item, with a little noise so bots don't all play the same. */
function best<T>(items: T[], score: (x: T) => number, rng: Rng, noise = 0.6): T {
  let top = items[0] as T;
  let topScore = -Infinity;
  for (const x of items) {
    const s = score(x) + (rng.next() - 0.5) * noise;
    if (s > topScore) {
      topScore = s;
      top = x;
    }
  }
  return top;
}

function nominate(v: View, rng: Rng): ShAction {
  const t = trustScores(v);
  const mates = team(v);
  const hitler = hitlerOf(v);
  if (isFascist(v)) {
    if (hitler && v.fascist >= HITLER_ZONE && v.eligible.includes(hitler))
      return { type: 'nominate', chancellor: hitler };
    const pals = v.eligible.filter((id) => mates.has(id) && id !== hitler);
    if (pals.length > 0 && rng.next() < 0.5)
      return { type: 'nominate', chancellor: rng.pick(pals) };
  }
  // Liberals and Hitler (and Fascists blending in): the most trusted eligible player. In the
  // Hitler zone a Liberal prefers someone already shown not to be Hitler.
  const zone = v.fascist >= HITLER_ZONE && v.myRole === 'liberal';
  const chancellor = best(
    v.eligible,
    (id) => t[id]! + (zone && v.notHitler.includes(id) ? 2 : 0),
    rng,
    1.2,
  );
  return { type: 'nominate', chancellor };
}

function vote(v: View, rng: Rng): ShAction {
  const president = v.president;
  const nominee = v.nominee!;
  if (president === v.me || nominee === v.me) return { type: 'vote', ja: true };
  const mates = team(v);
  if (knowsTeam(v)) {
    const hitler = hitlerOf(v);
    if (nominee === hitler && v.fascist >= HITLER_ZONE) return { type: 'vote', ja: true };
    if (mates.has(president) || mates.has(nominee)) return { type: 'vote', ja: rng.next() < 0.85 };
  }
  // Judge the government on its record. A failed vote moves the tracker closer to chaos, so
  // with two failures already the table leans Ja.
  const t = trustScores(v);
  let score = t[president]! + t[nominee]! + 0.4;
  if (v.tracker >= 2) score += 1.5;
  if (v.myRole === 'liberal' && v.fascist >= HITLER_ZONE && !v.notHitler.includes(nominee))
    score -= t[nominee]! >= 1 ? 0.3 : 1.5;
  score += (rng.next() - 0.5) * 1.5;
  return { type: 'vote', ja: score >= 0 };
}

const has = (hand: Policy[], p: Policy) => hand.includes(p);

function discard(v: View, rng: Rng): ShAction {
  const hand = v.hand;
  const keep = (p: Policy): ShAction => {
    // Discard one of the other kind if there is one; otherwise one of these.
    const other: Policy = p === 'liberal' ? 'fascist' : 'liberal';
    return { type: 'discard', policy: has(hand, other) ? other : p };
  };
  if (isFascist(v) || (isHitler(v) && knowsTeam(v) && rng.next() < 0.5)) {
    const mate = team(v).has(v.nominee!);
    // Pass Fascist cards, unless the table would notice too much (sometimes play clean).
    if (mate || rng.next() < 0.75) return keep('fascist');
    return keep('liberal');
  }
  if (isHitler(v) && v.liberal < LIBERAL_WIN - 1 && rng.next() < 0.2) return keep('fascist');
  return keep('liberal');
}

function legislate(v: View, rng: Rng): ShAction {
  const hand = v.hand;
  const canVeto = v.vetoUnlocked && !v.vetoAsked;
  const fascistSide = v.myRole !== 'liberal';
  if (fascistSide) {
    if (canVeto && hand.every((p) => p === 'liberal')) return { type: 'veto' };
    if (!has(hand, 'fascist')) return { type: 'enact', policy: 'liberal' };
    if (!has(hand, 'liberal')) return { type: 'enact', policy: 'fascist' };
    // Never hand the Liberals their fifth policy.
    if (v.liberal >= LIBERAL_WIN - 1) return { type: 'enact', policy: 'fascist' };
    const fascistChance = isFascist(v) ? 0.8 : 0.3;
    return { type: 'enact', policy: rng.next() < fascistChance ? 'fascist' : 'liberal' };
  }
  if (canVeto && hand.every((p) => p === 'fascist') && rng.next() < 0.85) return { type: 'veto' };
  return { type: 'enact', policy: has(hand, 'liberal') ? 'liberal' : 'fascist' };
}

function vetoReply(v: View, rng: Rng): ShAction {
  const nominee = v.nominee!;
  if (knowsTeam(v)) return { type: 'vetoReply', accept: team(v).has(nominee) };
  // A Liberal president agrees unless one more failure would throw a random policy down.
  if (v.myRole === 'liberal')
    return { type: 'vetoReply', accept: v.tracker < 2 && rng.next() < 0.8 };
  return { type: 'vetoReply', accept: rng.next() < 0.5 };
}

function power(v: View, rng: Rng): ShAction {
  const pending = v.pending!;
  if (pending === 'peek') return { type: 'power' };
  const others = living(v).filter((id) => id !== v.me);
  const t = trustScores(v);
  const mates = team(v);
  const openTeam = knowsTeam(v);
  const hitler = hitlerOf(v);
  if (pending === 'investigate') {
    const done = new Set(
      v.governments.flatMap((g) =>
        g.power?.kind === 'investigate' && g.power.target ? [g.power.target] : [],
      ),
    );
    const open = others.filter((id) => !done.has(id));
    const pool = open.length > 0 ? open : others;
    // Look into whoever is most in doubt: the least trusted, or (for the team) a Liberal.
    const target = openTeam
      ? best(pool, (id) => (mates.has(id) ? -5 : 0), rng, 1)
      : best(pool, (id) => -Math.abs(t[id]! + 0.5) - (t[id]! < 0 ? 0 : 0.5), rng, 1);
    return { type: 'power', target };
  }
  if (pending === 'special') {
    if (openTeam) {
      const pals = others.filter((id) => mates.has(id));
      if (pals.length > 0) {
        const pick = hitler && pals.includes(hitler) && v.fascist >= HITLER_ZONE ? hitler : null;
        return { type: 'power', target: pick ?? best(pals, () => 0, rng, 1) };
      }
    }
    return { type: 'power', target: best(others, (id) => t[id]!, rng, 1) };
  }
  // Execution. The team shoots the most trusted Liberal (never Hitler); a Liberal (or Hitler)
  // shoots the least trusted player.
  if (openTeam) {
    const liberals = others.filter((id) => !mates.has(id));
    if (liberals.length > 0)
      return { type: 'power', target: best(liberals, (id) => t[id]!, rng, 1) };
    return { type: 'power', target: best(others, (id) => (id === hitler ? -100 : 0), rng, 0.1) };
  }
  return { type: 'power', target: best(others, (id) => -t[id]!, rng, 1) };
}

/** The bot's next move, or null when the game isn't waiting on it. */
export function shBot(ctx: BotContext<ShPlayerView, ShTableView>): ShAction | null {
  const v = ctx.view;
  const me = ctx.playerId;
  const rng = ctx.rng;
  if (v.phase === 'over' || v.myRole === null || v.dead.includes(me)) return null;
  switch (v.phase) {
    case 'nominate':
      return me === v.president && v.eligible.length > 0 ? nominate(v, rng) : null;
    case 'vote':
      return v.myVote === null ? vote(v, rng) : null;
    case 'president':
      return me === v.president && v.hand.length === 3 ? discard(v, rng) : null;
    case 'chancellor':
      return me === v.nominee && v.hand.length === 2 ? legislate(v, rng) : null;
    case 'veto':
      return me === v.president ? vetoReply(v, rng) : null;
    case 'power':
      return me === v.president && v.pending ? power(v, rng) : null;
    case 'post':
      return me === v.president ? { type: 'endTerm' } : null;
  }
}
