import { buildStory, type GameStory, type StoryFact, type StoryHeadline } from '@jackdaw/engine';
import { clock } from './time';

/** What the story needs from a puzzle race's state. */
export interface RaceState {
  players: string[];
  count: number;
  startedAt: number;
  /** When each player solved each puzzle, server time. */
  times: Record<string, number[]>;
  /** Hints used on each puzzle, when someone played alone. */
  helped?: number[];
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The stats page for a puzzle race: how long each puzzle took each player, the fastest and
 * slowest solves, the closest finish between two players and the longest run of first places.
 */
export function puzzleStory(s: RaceState, winners: string[]): GameStory | undefined {
  const gaps: Record<string, number[]> = {};
  for (const id of s.players) {
    const times = s.times[id] ?? [];
    gaps[id] = times.map((at, i) => at - (i === 0 ? s.startedAt : times[i - 1]!));
  }
  const solved = (id: string) => gaps[id]!.length;
  const all = s.players.flatMap((id) => gaps[id]!.map((ms, i) => ({ id, ms, puzzle: i + 1 })));
  if (all.length === 0) return undefined;
  const racing = s.players.length > 1;
  const sec = (ms: number) => Math.round(ms / 1000);
  const total = (id: string) => (s.times[id]?.at(-1) ?? s.startedAt) - s.startedAt;

  const fastest = all.reduce((a, b) => (b.ms < a.ms ? b : a));
  const slowest = all.reduce((a, b) => (b.ms > a.ms ? b : a));

  // Who finished each puzzle first, and the closest two players came on one.
  const firsts: (string | null)[] = [];
  let close: { by: number; first: string; second: string; puzzle: number } | null = null;
  for (let i = 0; i < s.count; i++) {
    const done = s.players
      .filter((id) => (s.times[id]?.length ?? 0) > i)
      .map((id) => ({ id, at: s.times[id]![i]! }))
      .sort((a, b) => a.at - b.at);
    firsts.push(done.length >= 2 || (done.length === 1 && racing) ? done[0]!.id : null);
    if (done.length >= 2) {
      const by = done[1]!.at - done[0]!.at;
      if (!close || by < close.by)
        close = { by, first: done[0]!.id, second: done[1]!.id, puzzle: i + 1 };
    }
  }
  const streak = { id: '', n: 0, from: 0 };
  let run = { id: '', n: 0, from: 0 };
  firsts.forEach((id, i) => {
    run =
      id && id === run.id ? { ...run, n: run.n + 1 } : { id: id ?? '', n: id ? 1 : 0, from: i + 1 };
    if (run.n > streak.n) Object.assign(streak, run);
  });
  const firstCount = (id: string) => firsts.filter((f) => f === id).length;

  const headlines: StoryHeadline[] = [];
  const best = [...s.players].sort((a, b) => solved(b) - solved(a) || total(a) - total(b))[0]!;
  headlines.push({
    label: racing ? 'Winning time' : 'Total time',
    value: clock(total(best)),
    detail: racing
      ? `{${best}}, ${solved(best)} of ${s.count} solved`
      : `${solved(best)} of ${s.count} solved`,
    playerId: best,
  });
  headlines.push({
    label: 'Fastest solve',
    value: clock(fastest.ms),
    detail: racing ? `{${fastest.id}}, puzzle ${fastest.puzzle}` : `puzzle ${fastest.puzzle}`,
    playerId: fastest.id,
  });
  if (close && close.by >= 1000 && close.by <= 20_000) {
    headlines.push({
      label: 'Closest finish',
      value: `${sec(close.by)}s`,
      detail: `{${close.first}} over {${close.second}}, puzzle ${close.puzzle}`,
      playerId: close.first,
    });
  } else if (all.length >= 3) {
    const avg = all.reduce((a, g) => a + g.ms, 0) / all.length;
    headlines.push({ label: 'Average solve', value: clock(avg) });
  }

  const facts: StoryFact[] = [];
  if (all.length >= 2) {
    facts.push({
      label: 'Lightning',
      text: racing
        ? `{${fastest.id}} solved puzzle ${fastest.puzzle} in just ${clock(fastest.ms)}.`
        : `Puzzle ${fastest.puzzle} fell in just ${clock(fastest.ms)}.`,
      playerIds: racing ? [fastest.id] : [],
      tone: 'good',
    });
  }
  if (close && close.by >= 1000 && close.by <= 5000) {
    facts.push({
      label: 'Photo finish',
      text: `{${close.first}} beat {${close.second}} by just ${plural(sec(close.by), 'second')} on puzzle ${close.puzzle}.`,
      playerIds: [close.first, close.second],
    });
  }
  if (racing && streak.n >= 3 && !(s.count >= 3 && streak.n === s.count)) {
    facts.push({
      label: 'On a roll',
      text: `{${streak.id}} finished first on ${streak.n} puzzles in a row, from puzzle ${streak.from}.`,
      playerIds: [streak.id],
      tone: 'good',
    });
  }
  const typical =
    all.map((g) => g.ms).sort((a, b) => a - b)[Math.floor(all.length / 2)] ?? slowest.ms;
  if (all.length >= 3 && slowest.ms >= 90_000 && slowest.ms >= typical * 2) {
    facts.push({
      label: 'Stumped',
      text: racing
        ? `{${slowest.id}} needed ${clock(slowest.ms)} for puzzle ${slowest.puzzle}, the slowest solve of the game.`
        : `Puzzle ${slowest.puzzle} took ${clock(slowest.ms)}, the slowest of the game.`,
      playerIds: racing ? [slowest.id] : [],
      tone: 'bad',
    });
  }
  if (racing) {
    const sweep = s.players.find((id) => s.count >= 3 && firstCount(id) === s.count);
    if (sweep)
      facts.push({
        label: 'Clean sweep',
        text: `{${sweep}} was first to finish every puzzle.`,
        playerIds: [sweep],
        tone: 'good',
      });
    const unfinished = s.players.filter((id) => solved(id) < s.count);
    const wonBy = winners.length === 1 ? winners[0]! : '';
    if (wonBy && unfinished.length > 0 && !unfinished.includes(wonBy))
      facts.push({
        label: 'Beat the clock',
        text: `{${wonBy}} finished all ${s.count} before ${unfinished.length === 1 ? `{${unfinished[0]}}` : `${unfinished.length} others`} could.`,
        playerIds: [wonBy],
      });
  } else {
    const used = (s.helped ?? []).reduce((a, b) => a + b, 0);
    if (used === 0 && solved(best) >= 2)
      facts.push({ label: 'No hints', text: 'Every puzzle solved without a hint.', tone: 'good' });
    else if (used > 0)
      facts.push({ label: 'Hints', text: `${plural(used, 'hint')} used along the way.` });
  }

  const charts: GameStory['charts'] = [
    {
      title: 'Seconds per puzzle (lower is faster)',
      xLabel: 'Puzzle',
      kind: 'per-step',
      series: s.players
        .filter((id) => solved(id) >= 2)
        .map((id) => ({ playerId: id, points: gaps[id]!.map((ms) => sec(ms)) })),
    },
  ];
  const bars: GameStory['bars'] = [];
  if (racing) {
    bars.push({
      title: 'Puzzles solved',
      rows: [...s.players]
        .sort((a, b) => solved(b) - solved(a))
        .map((id) => ({ playerId: id, value: solved(id) })),
    });
    if (s.count >= 2)
      bars.push({
        title: 'First to finish',
        rows: [...s.players]
          .sort((a, b) => firstCount(b) - firstCount(a))
          .map((id) => ({ playerId: id, value: firstCount(id) })),
      });
  }
  const varied = bars.filter((b) => new Set(b.rows.map((r) => r.value)).size > 1);
  return buildStory({ headlines, charts, bars: varied, facts });
}
