'use client';

import type { GameUi } from '@jackdaw/ui';
import type { MazeTableView } from '../rules';
import { POWER_INFO } from './info';
import { PlayerScreen } from './player';
import { Results } from './results';
import { LIVE_POLL_MS } from './runner';
import { TvScreen } from './tv';

/** A power-up's switch: what it does when on, and that it never appears when off. */
const power = (k: keyof typeof POWER_INFO) => ({
  true: POWER_INFO[k],
  false: 'Never appears.',
});

/** Maze: chomp the maze, dodge the ghosts, jinx your friends. It uses Jackdaw's lobby. */
export const mazeUi: GameUi = {
  art: { band: 'tenne', field: 'checky', glyph: 'chomper' },
  about: {
    description:
      'Steer a round chomper through a maze, eating every pellet while ghosts hunt you down. Play it alone, share one maze with the whole table, or race through the same mazes side by side. Power-ups turn the ghosts edible, speed you up, or mess with whoever is winning.',
    steps: [
      'The host picks the mode, the look, and which power-ups are in.',
      'Swipe on your phone, or use the arrow keys or WASD, to steer. Turns wait for the next junction.',
      'Eat pellets for points and power spots for a power-up. Ghosts cost you points, or a life when you play alone.',
      'Alone, clear every maze before the lives run out. In a shared maze, the most points when the bell rings wins. In a race, clear the mazes first.',
    ],
    pictures: [
      {
        src: '/games/maze/game-phone.png',
        alt: 'Maze on a phone: lives and the maze number, your score card across the top, and a printed maze with pellets, four ghosts and a red chomper.',
      },
      {
        src: '/games/maze/desktop.png',
        alt: 'Maze on a laptop: one score card per player above a big shared maze, with computer chompers named after birds eating pellets while ghosts roam.',
        desktop: true,
      },
      {
        src: '/games/maze/tv.png',
        alt: 'Maze on a TV: a score card for each of four players and the clock above one shared maze, each chomper labeled with its name.',
        desktop: true,
      },
    ],
  },
  optionHelp: {
    mode: {
      Solo: 'One player, three lives, a row of mazes to clear.',
      Shared: 'Everyone chases the same pellets in one maze. The first to a pellet scores it.',
      Race: 'Everyone runs the same mazes on their own. Clearing the last one first earns a bonus.',
    },
    mazes: 'How many mazes to clear in Solo and Race. Later mazes have faster ghosts.',
    minutes: 'How long a Shared maze round lasts, and the time limit in a Race.',
    powerUps: {
      Classic: 'Only Hunt, the one that turns ghosts edible.',
      Mixed: 'Every power-up below that is switched on.',
    },
    hunt: power('hunt'),
    dash: power('dash'),
    phase: power('phase'),
    magnet: power('magnet'),
    jinx: power('jinx'),
    freeze: power('freeze'),
    steal: power('steal'),
    fog: power('fog'),
    look: {
      Printed: 'Ink and paper, like the rest of Jackdaw.',
      Neon: 'Glowing lines on a dark screen.',
      Classic: 'Chunky pixel art on blue block walls.',
      Cabinet: 'Warm wood and gold, like an arcade cabinet.',
    },
    size: {
      Auto: 'Medium, or Large when five or more players share a maze.',
      Small: 'A small, tight maze: quick rounds.',
      Medium: 'The usual size.',
      Large: 'A big maze with room for a crowd.',
    },
  },
  fit: true,
  fullBleed: true,
  livePoll: (t) => {
    const v = t as MazeTableView;
    return v.mode === 'Shared' && v.phase === 'play' ? LIVE_POLL_MS : null;
  },
  PlayerScreen,
  TvScreen,
  Results,
};
