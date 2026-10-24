import type { BotContext } from '@jackdaw/engine';
import { NEUTRAL, reachable, territoriesOf } from './board';
import { allSets, bestSet } from './cards';
import { getMap, type MapDef } from './maps';
import { seen } from './fog';
import type { RiskAction, RiskTableView, RiskView } from './rules';

/**
 * A computer general. It plays from exactly what a person in its seat would see (its own view laid
 * over the table view, so the fog binds it too), and every move it returns is legal:
 *
 * - Trades a set whenever it holds one (it must at five cards).
 * - Piles its reinforcements onto the border that best sets up an attack it wants: weak
 *   neighbours, territories in its mission's continents, its destroy target, a continent it's
 *   one short of. With plenty to place, some go to the border under most pressure.
 * - Attacks only with a clear edge (3+ armies and 2+ more than the defender), blitzing when the
 *   edge is big and rolling one throw at a time when it's close, so it stops once it runs thin.
 * - Moves in after a conquest by where the danger is: all of them forward if the old territory is
 *   safe behind, the fewest if the new one is, otherwise most of them.
 * - Fortifies its biggest idle stack behind the lines up to the front, then ends its turn.
 *
 * Every attack costs armies and every turn ends with a fortify or End turn, so a turn always
 * finishes and the game moves on.
 */
export function riskBot(ctx: BotContext<RiskView, RiskTableView>): RiskAction | null {
  const { playerId: me, view, rng } = ctx;
  const t = seen(ctx.tableView, view);
  if (!view || t.phase === 'over' || !t.seats.includes(me) || t.eliminated.includes(me))
    return null;
  const map = getMap(t.map);
  const b = new Brain(map, t, view, me, rng.shuffle(territoriesOf(t.owner, me)));

  if (t.phase === 'draft') {
    if (view.draft || view.draftLeft <= 0) return null;
    return { type: 'draft', placements: b.placements(view.draftLeft) };
  }
  if (t.turn !== me) return null;

  switch (t.phase) {
    case 'reinforce': {
      const hand = view.hand;
      if (allSets(hand).length) {
        const set = bestSet(hand, t.cardSets, t.setsTraded)!;
        return { type: 'trade', cards: set.map((c) => c.id) as [string, string, string] };
      }
      return { type: 'reinforce', placements: b.placements(t.toPlace) };
    }
    case 'attack': {
      const a = b.bestAttack();
      if (a) return { type: 'attack', ...a };
      return b.fortify() ?? { type: 'endTurn' };
    }
    case 'occupy':
      return t.occupy ? { type: 'occupy', n: b.moveIn(t.occupy) } : null;
    case 'fortify':
      return b.fortify() ?? { type: 'endTurn' };
  }
  return null;
}

class Brain {
  private readonly continentOf = new Map<string, string>();
  private readonly adj = new Map<string, string[]>();
  private readonly goals: Set<string>;
  private readonly target: string | null;

  constructor(
    private readonly map: MapDef,
    private readonly t: RiskTableView,
    view: RiskView,
    private readonly me: string,
    /** Own territories, shuffled so ties break differently from game to game. */
    private readonly mine: string[],
  ) {
    for (const x of map.territories) {
      this.continentOf.set(x.id, x.continent);
      this.adj.set(x.id, x.adj);
    }
    const m = view.mission;
    this.target = m?.kind === 'destroy' ? m.target : null;
    this.goals = new Set(m?.kind === 'continents' ? m.ids : this.likelyContinents());
  }

  private armies = (x: string) => this.t.armies[x] ?? 0;

  /** Neighbours held by someone else (all in sight: they border one of ours). */
  private enemies = (x: string) =>
    (this.adj.get(x) ?? []).filter((n) => this.t.owner[n] !== this.me);

  private pressure = (x: string) =>
    this.enemies(x).reduce((sum, n) => sum + this.armies(n), 0) - this.armies(x);

  /** The continents it holds most of (by share, smaller ones first on a tie): its natural aims. */
  private likelyContinents(): string[] {
    const share = this.map.continents.map((c) => {
      const all = this.map.territories.filter((x) => x.continent === c.id);
      const held = all.filter((x) => this.t.owner[x.id] === this.me).length;
      return { id: c.id, share: held / all.length, size: all.length };
    });
    share.sort((a, b) => b.share - a.share || a.size - b.size);
    return share.slice(0, 2).map((c) => c.id);
  }

  /** How much it wants territory `x`. */
  private want(x: string): number {
    const owner = this.t.owner[x];
    let w = 1;
    const c = this.continentOf.get(x)!;
    if (this.goals.has(c)) w += 2;
    if (owner && owner === this.target) w += 3;
    if (owner === NEUTRAL) w += 0.5;
    // The last piece of a continent.
    const rest = this.map.territories.filter((y) => y.continent === c && y.id !== x);
    if (rest.every((y) => this.t.owner[y.id] === this.me)) w += 3;
    return w;
  }

  private fronts = () => this.mine.filter((x) => this.enemies(x).length > 0);

  /** How good a border is to attack from, with `extra` more armies on it. */
  private staging(x: string, extra = 0): number {
    const here = this.armies(x) + extra;
    return Math.max(...this.enemies(x).map((n) => 3 * this.want(n) - this.armies(n))) + 0.3 * here;
  }

  /** `n` armies: most on the best place to attack from, some on the border under most pressure. */
  placements(n: number): Record<string, number> {
    if (n <= 0) return {};
    const fronts = this.fronts();
    const pool = fronts.length ? fronts : this.mine;
    const best = [...pool].sort((a, b) => this.staging(b, n) - this.staging(a, n))[0]!;
    const out: Record<string, number> = {};
    const guard = n >= 6 ? Math.floor(n / 3) : 0;
    const threatened = [...pool]
      .filter((x) => x !== best)
      .sort((a, b) => this.pressure(b) - this.pressure(a))[0];
    if (guard && threatened && this.pressure(threatened) > 0) {
      out[threatened] = guard;
      out[best] = n - guard;
    } else out[best] = n;
    return out;
  }

  /** The attack worth making now, if there's one with a clear edge. */
  bestAttack(): { from: string; to: string; mode: 'roll' | 'blitz' } | null {
    let pick: { from: string; to: string; score: number; edge: number } | null = null;
    for (const from of this.mine) {
      const a = this.armies(from);
      if (a < 3) continue;
      for (const to of this.enemies(from)) {
        const edge = a - this.armies(to);
        if (edge < 2) continue;
        const score = edge + 2 * this.want(to);
        if (!pick || score > pick.score) pick = { from, to, score, edge };
      }
    }
    if (!pick) return null;
    const blitz = pick.edge >= 3 || this.armies(pick.to) <= 2;
    return { from: pick.from, to: pick.to, mode: blitz ? 'blitz' : 'roll' };
  }

  /** How many march in after taking `to` from `from`. */
  moveIn(o: { from: string; to: string; min: number; max: number }): number {
    const backThreat = this.enemies(o.from).length;
    const frontThreat = this.enemies(o.to).length;
    if (!backThreat) return o.max;
    if (!frontThreat) return o.min;
    return Math.min(o.max, Math.max(o.min, Math.ceil(o.max * 0.65)));
  }

  /** The biggest stack behind the lines, moved up to the front; null if there's none. */
  fortify(): RiskAction | null {
    const fronts = new Set(this.fronts());
    const idle = this.mine
      .filter((x) => !fronts.has(x) && this.armies(x) > 1)
      .sort((a, b) => this.armies(b) - this.armies(a));
    for (const from of idle) {
      const to = reachable(this.map, this.t.owner, this.me, from)
        .filter((x) => fronts.has(x))
        .sort(
          (a, b) => this.staging(b) + this.pressure(b) - (this.staging(a) + this.pressure(a)),
        )[0];
      if (to) return { type: 'fortify', from, to, n: this.armies(from) - 1 };
    }
    return null;
  }
}
