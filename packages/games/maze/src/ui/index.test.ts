import { describe, expect, it } from 'vitest';
import type { MazeTableView } from '../rules';
import { mazeUi } from './index';

const view = (mode: MazeTableView['mode'], phase: MazeTableView['phase']) =>
  ({ mode, phase }) as MazeTableView;

describe('live poll', () => {
  it('Shared play polls at the 600 ms floor', () => {
    expect(mazeUi.livePoll!(view('Shared', 'play'))).toBe(600);
    expect(mazeUi.livePoll!(view('Shared', 'countdown'))).toBeNull();
    expect(mazeUi.livePoll!(view('Shared', 'between'))).toBeNull();
  });

  it('Solo play polls slowly: at most 10 requests a minute with its reports', () => {
    const ms = mazeUi.livePoll!(view('Solo', 'play'))!;
    expect(ms).toBeGreaterThanOrEqual(6000);
    // A minute of Solo: the polls, plus a maze clear and the final report at most.
    expect(Math.ceil(60_000 / ms) + 2).toBeLessThanOrEqual(10);
    // Before and after play, the platform's usual pace.
    expect(mazeUi.livePoll!(view('Solo', 'countdown'))).toBeNull();
    expect(mazeUi.livePoll!(view('Solo', 'over'))).toBeNull();
    // Race keeps the usual pace (its attacks ride on the replies).
    expect(mazeUi.livePoll!(view('Race', 'play'))).toBeNull();
  });
});
