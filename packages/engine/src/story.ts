import type { GameStory, StoryChart, StoryFact, StoryHeadline } from './contract';

/** One player's running total, after each step (index 0 is the start). */
export interface RaceSeries {
  playerId: string;
  points: number[];
}

export interface RaceInput {
  series: RaceSeries[];
  winners: string[];
  /** What a step is called, lower case: "hand", "turn", "round". */
  step: string;
  /** The chart's title: "Chips", "Score". */
  title: string;
  /** Unit after a number in facts, with its leading space: " chips", " points". Empty by default. */
  unit?: string;
  /** For games where the low score wins (golf-style card games). */
  lowWins?: boolean;
  /** Steps worth pinning on the chart. */
  marks?: StoryChart['marks'];
}

export interface RaceStory {
  chart: StoryChart;
  headlines: StoryHeadline[];
  facts: StoryFact[];
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Reads the story of a race out of everyone's running totals: the winning margin, how often the
 * lead changed hands, the biggest lead, the comeback, wire-to-wire, a photo finish, and the
 * biggest single gain and loss. Facts are only made when they are true and worth saying.
 */
export function raceStory(input: RaceInput): RaceStory {
  const { series, winners, step, unit = '', lowWins = false } = input;
  const chart: StoryChart = {
    title: input.title,
    xLabel: cap(step),
    kind: 'race',
    series: series.map((s) => ({ playerId: s.playerId, points: s.points })),
    ...(input.marks?.length ? { marks: input.marks } : {}),
  };
  const headlines: StoryHeadline[] = [];
  const facts: StoryFact[] = [];
  const steps = Math.max(0, ...series.map((s) => s.points.length));
  if (series.length < 2 || steps < 2) return { chart, headlines, facts };

  // "Better" in a common direction: higher is better after this.
  const good = (v: number) => (lowWins ? -v : v);
  const at = (s: RaceSeries, i: number) => s.points[Math.min(i, s.points.length - 1)] ?? 0;

  // Who led after each step (null for a tie at the top), and by how much.
  const leaders: (string | null)[] = [];
  let bigLead = { by: 0, player: '', step: 0 };
  for (let i = 1; i < steps; i++) {
    const ranked = [...series].sort((a, b) => good(at(b, i)) - good(at(a, i)));
    const [first, second] = ranked;
    const gap = good(at(first!, i)) - good(at(second!, i));
    leaders.push(gap > 0 ? first!.playerId : null);
    if (gap > bigLead.by) bigLead = { by: gap, player: first!.playerId, step: i };
  }

  let changes = 0;
  let last: string | null = null;
  for (const l of leaders) {
    if (l === null) continue;
    if (last !== null && l !== last) changes++;
    last = l;
  }

  const finalRank = [...series].sort((a, b) => good(at(b, steps - 1)) - good(at(a, steps - 1)));
  const winner = winners.length === 1 ? winners[0]! : undefined;
  const top = finalRank[0]!;
  const runnerUp = finalRank.find((s) => s.playerId !== top.playerId)!;
  const margin = Math.abs(at(top, steps - 1) - at(runnerUp, steps - 1));

  if (winner === top.playerId && margin > 0) {
    headlines.push({
      label: 'Winning margin',
      value: `${fmt(margin)}`,
      detail: `{${top.playerId}} over {${runnerUp.playerId}}`,
      playerId: top.playerId,
    });
  }
  headlines.push({
    label: 'Lead changes',
    value: fmt(changes),
    detail: changes === 0 ? 'Nobody else ever led' : `over ${steps - 1} ${step}s`,
  });
  if (bigLead.by > 0) {
    headlines.push({
      label: 'Biggest lead',
      value: fmt(bigLead.by),
      detail: `{${bigLead.player}}, ${step} ${bigLead.step}`,
      playerId: bigLead.player,
    });
  }

  if (winner) {
    const w = series.find((s) => s.playerId === winner);
    if (w) {
      // The deepest hole the winner climbed out of.
      let worst = { gap: 0, step: 0, rank: 1 };
      for (let i = 1; i < steps; i++) {
        const best = Math.max(...series.map((s) => good(at(s, i))));
        const gap = best - good(at(w, i));
        const rank = 1 + series.filter((s) => good(at(s, i)) > good(at(w, i))).length;
        if (gap > worst.gap) worst = { gap, step: i, rank };
      }
      const ledAll = leaders.every((l) => l === null || l === winner) && leaders.includes(winner);
      if (worst.gap > 0 && worst.step < steps - 1 && worst.rank >= Math.min(3, series.length)) {
        facts.push({
          label: 'Comeback',
          text:
            worst.rank === series.length
              ? `{${winner}} was dead last after ${step} ${worst.step}, ${fmt(worst.gap)}${unit} behind, and still won.`
              : `{${winner}} was ${fmt(worst.gap)}${unit} behind after ${step} ${worst.step} and still won.`,
          playerIds: [winner],
          tone: 'good',
        });
      } else if (ledAll && steps > 3) {
        facts.push({
          label: 'Wire to wire',
          text: `{${winner}} led from the first ${step} to the last.`,
          playerIds: [winner],
          tone: 'good',
        });
      }
      // A finish within a twentieth of the winner's total, or one point.
      const scale = Math.max(1, Math.abs(at(w, steps - 1)));
      if (margin > 0 && (margin <= 1 || margin / scale <= 0.05) && w === top) {
        facts.push({
          label: 'Photo finish',
          text: `{${winner}} won by just ${fmt(margin)}${unit}.`,
          playerIds: [winner, runnerUp.playerId],
        });
      }
    }
  }

  // The biggest swings between two steps, either way.
  let gain = { by: 0, player: '', step: 0 };
  let drop = { by: 0, player: '', step: 0 };
  for (const s of series) {
    for (let i = 1; i < s.points.length; i++) {
      const d = good(s.points[i]!) - good(s.points[i - 1]!);
      if (d > gain.by) gain = { by: d, player: s.playerId, step: i };
      if (-d > drop.by) drop = { by: -d, player: s.playerId, step: i };
    }
  }
  if (gain.by > 0) {
    facts.push({
      label: 'Best ' + step,
      text: `{${gain.player}} ${lowWins ? 'shed' : 'gained'} ${fmt(gain.by)}${unit} on ${step} ${gain.step}.`,
      playerIds: [gain.player],
      tone: 'good',
    });
  }
  if (drop.by > 0) {
    facts.push({
      label: 'Worst ' + step,
      text: `{${drop.player}} ${lowWins ? 'took on' : 'lost'} ${fmt(drop.by)}${unit} on ${step} ${drop.step}.`,
      playerIds: [drop.player],
      tone: 'bad',
    });
  }
  if (changes >= 4) {
    facts.push({
      label: 'Seesaw',
      text: `The lead changed hands ${changes} times.`,
    });
  }

  return { chart, headlines, facts };
}

/**
 * Puts a game's story together: the race's parts first unless the game has its own, extra
 * headlines and facts after, at most four headlines. Empty parts are left out.
 */
export function buildStory(parts: {
  race?: RaceStory;
  headlines?: StoryHeadline[];
  charts?: StoryChart[];
  bars?: GameStory['bars'];
  facts?: StoryFact[];
  /** Put the game's own headlines before the race's. */
  ownFirst?: boolean;
}): GameStory | undefined {
  const race = parts.race;
  const own = parts.headlines ?? [];
  const headlines = (
    parts.ownFirst ? [...own, ...(race?.headlines ?? [])] : [...(race?.headlines ?? []), ...own]
  ).slice(0, 4);
  const charts = [...(race ? [race.chart] : []), ...(parts.charts ?? [])].filter(
    (c) => c.series.length > 0 && c.series.some((s) => s.points.length > 1),
  );
  const bars = (parts.bars ?? []).filter((b) => b.rows.length > 0);
  const facts = [...(parts.facts ?? []), ...(race?.facts ?? [])];
  const story: GameStory = {
    ...(headlines.length ? { headlines } : {}),
    ...(charts.length ? { charts } : {}),
    ...(bars.length ? { bars } : {}),
    ...(facts.length ? { facts } : {}),
  };
  return Object.keys(story).length ? story : undefined;
}
