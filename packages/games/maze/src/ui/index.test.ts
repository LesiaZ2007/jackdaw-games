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
});
