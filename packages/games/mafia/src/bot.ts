import { botSlips, type BotContext } from '@jackdaw/engine';
import { ROLE_INFO } from './roles';
import type { MafiaAction, MafiaPlayerView, MafiaTableView } from './rules';

/** How long a bot lets the table talk before it's ready to vote. */
const TALK_MS = 40_000;

/**
 * A computer player. It plays only from its own view: its prompt says what it can do and who it
 * can pick. Killers back a teammate's pick so the pack agrees; the Sheriff and the Seer check
 * people they haven't yet; by day it votes for a killer it knows about, a teammate never, and
 * otherwise picks someone (now and then it skips).
 */
export function mafiaBot(ctx: BotContext<MafiaPlayerView, MafiaTableView>): MafiaAction | null {
  const { view: v, rng, now, level } = ctx;
  const me = v.me;
  if (!v.alive_) return null;

  if (v.phase === 'deal') return v.ready.includes(me) ? null : { type: 'ready', on: true };

  if (v.phase === 'day') {
    if (v.ready.includes(me)) return null;
    const talked = now - v.since;
    return talked > TALK_MS || (v.ready.length > 0 && talked > 10_000)
      ? { type: 'ready', on: true }
      : null;
  }

  const p = v.prompt;
  if (!p || p.locked) return null;
  const pick = (xs: string[]) => (xs.length ? rng.pick(xs) : null);
  const others = p.targets.filter((x) => x !== me);
  const friend = (x: string) => {
    const r = v.known[x];
    return !!r && x !== me && ROLE_INFO[r].team === ROLE_INFO[v.role].team;
  };
  const caught = p.targets.filter((x) => {
    const r = v.known[x];
    if (r && ROLE_INFO[r].team === 'pack' && ROLE_INFO[v.role].team !== 'pack') return true;
    return v.checks.some((c) => c.target === x && c.result === 'mafia');
  });

  switch (p.act) {
    case 'kill': {
      const theirs = Object.entries(v.packPicks ?? {}).find(([id]) => id !== me)?.[1];
      if (p.pick && (!theirs || theirs === p.pick)) return null;
      const t = theirs && p.targets.includes(theirs) ? theirs : pick(p.targets);
      return t && t !== p.pick ? { type: 'pick', target: t } : null;
    }
    case 'love': {
      const [a, b] = rng.shuffle(p.targets);
      return a && b ? { type: 'pick', target: a, second: b } : null;
    }
    case 'save': {
      const t = rng.next() < 0.35 ? me : pick(others.length ? others : p.targets);
      return t ? { type: 'pick', target: t } : null;
    }
    case 'ask':
    case 'see': {
      const fresh = others.filter((x) => !v.checks.some((c) => c.target === x));
      const t = pick(fresh.length ? fresh : others);
      return t ? { type: 'pick', target: t } : null;
    }
    case 'stab':
    case 'suspect': {
      const t = pick(others);
      return t ? { type: 'pick', target: t } : null;
    }
    case 'potion': {
      const w = v.witch;
      const heal = !!w?.victim && w.heal && (w.victim === me || rng.next() < 0.6);
      const poison = w?.poison && rng.next() < 0.2 ? pick(others) : null;
      return { type: 'potion', heal, poison };
    }
    case 'vote': {
      if (p.pick) return null;
      const known = caught.filter((x) => p.targets.includes(x));
      if (known.length && !botSlips(level, rng)) return { type: 'vote', target: rng.pick(known) };
      if (rng.next() < 0.15) return { type: 'vote', target: 'skip' };
      const fair = p.targets.filter((x) => !friend(x));
      const t = pick(fair.length ? fair : p.targets);
      return { type: 'vote', target: t ?? 'skip' };
    }
    case 'shoot': {
      const fair = caught.length ? caught : others.filter((x) => !friend(x));
      return { type: 'shoot', target: pick(fair) };
    }
  }
}
