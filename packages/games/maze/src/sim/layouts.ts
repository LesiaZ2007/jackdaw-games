import type { Dir, Vec } from './walker';

export type MazeSize = 'Small' | 'Medium' | 'Large';

/** Width and height in tiles of each maze size. */
export const SIZE_DIMS: Record<MazeSize, { w: number; h: number }> = {
  Small: { w: 21, h: 20 },
  Medium: { w: 27, h: 24 },
  Large: { w: 33, h: 30 },
};

/**
 * One maze. `rows` are `h` strings of `w` characters: `#` wall, `.` pellet, `o` power spot,
 * `-` ghost door, ` ` empty (the ghost house and the tunnel mouths). A row that is open at both
 * edges is a tunnel: walking off one side comes back on the other.
 */
export interface MazeLayout {
  id: string;
  size: MazeSize;
  w: number;
  h: number;
  rows: string[];
  /** Up to 8 players' start tiles and facing, in seat order. */
  starts: [number, number, Dir][];
  /** The middle of the ghost house; the door is the tile above it. */
  house: Vec;
  /** Where ghosts head to leave the house. */
  exit: Vec;
  fruit: Vec;
  powers: Vec[];
}

export const DIRS: Record<Dir, Vec> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};
/** The order ghosts weigh their options in; ties go to the first. */
export const DIR_ORDER: readonly Dir[] = ['up', 'left', 'down', 'right'];

export const opposite = (d: Dir): Dir =>
  d === 'up' ? 'down' : d === 'down' ? 'up' : d === 'left' ? 'right' : 'left';

/** `x` wrapped into the maze's columns (the tunnels join the two edges). */
export const wrapX = (m: MazeLayout, x: number): number => ((x % m.w) + m.w) % m.w;

export function isWall(m: MazeLayout, x: number, y: number): boolean {
  if (y < 0 || y >= m.h) return true;
  return m.rows[y]![wrapX(m, x)] === '#';
}

export function isDoor(m: MazeLayout, x: number, y: number): boolean {
  if (y < 0 || y >= m.h) return false;
  return m.rows[y]![wrapX(m, x)] === '-';
}

const houses = new WeakMap<MazeLayout, Set<string>>();

/** Every tile inside the ghost house, door included, as "x,y" keys. */
export function houseTiles(m: MazeLayout): Set<string> {
  const cached = houses.get(m);
  if (cached) return cached;
  const out = new Set<string>();
  const q: [number, number][] = [[m.house[0], m.house[1]]];
  out.add(`${m.house[0]},${m.house[1]}`);
  while (q.length) {
    const [x, y] = q.shift()!;
    for (const d of DIR_ORDER) {
      const nx = wrapX(m, x + DIRS[d][0]);
      const ny = y + DIRS[d][1];
      const k = `${nx},${ny}`;
      if (out.has(k) || isWall(m, nx, ny)) continue;
      out.add(k);
      // The door belongs to the house, but nothing past it does.
      if (!isDoor(m, nx, ny)) q.push([nx, ny]);
    }
  }
  houses.set(m, out);
  return out;
}

/** Builds full rows from their left halves; the last character of each half is the middle column. */
const mirror = (half: string[]): string[] =>
  half.map((l) => l + [...l.slice(0, -1)].reverse().join(''));

type LayoutSpec = Omit<MazeLayout, 'size' | 'w' | 'h'>;

/** Tags layouts with their size. */
const sized = (size: MazeSize, specs: LayoutSpec[]): MazeLayout[] =>
  specs.map((l) => ({ ...l, size, ...SIZE_DIMS[size] }));

const POWERS_3_18: Vec[] = [
  [1, 3],
  [25, 3],
  [1, 18],
  [25, 18],
];

const MEDIUM = sized('Medium', [
  {
    // The maze from the signed-off demo.
    id: 'grove',
    rows: mirror([
      '##############',
      '#......#.....#',
      '#.####.#.###.#',
      '#o####.#.###.#',
      '#.............',
      '#.###.####.###',
      '#.###.####.###',
      '#.....##......',
      '#####.##.#####',
      '#####.##.#####',
      '#####.##......',
      '#####.##.####-',
      '     .##.#    ',
      '#####.##.#####',
      '#####.##......',
      '#####.##.#####',
      '#............#',
      '#.####.#####.#',
      '#o..##........',
      '###.##.##.####',
      '#......##....#',
      '#.####.#####.#',
      '#.............',
      '##############',
    ]),
    starts: [
      [13, 18, 'left'],
      [1, 1, 'right'],
      [25, 1, 'left'],
      [13, 22, 'right'],
      [1, 22, 'right'],
      [25, 22, 'left'],
      [1, 16, 'right'],
      [25, 16, 'left'],
    ],
    house: [13, 12],
    exit: [13, 7],
    fruit: [13, 14],
    powers: POWERS_3_18,
  },
  {
    // Long straight lanes and two side alleys that meet at the tunnel.
    id: 'lattice',
    rows: mirror([
      '##############',
      '#............#',
      '#.###.##.###.#',
      '#o###.##.###.#',
      '#.............',
      '#.#.##.###.##.',
      '#.#.##.###.##.',
      '#......#......',
      '###.##.#.#####',
      '###.##.#.#####',
      '###.##.#......',
      '###.##.#.####-',
      '   ....#.#    ',
      '###.##.#.#####',
      '###.##.#......',
      '###.##.#.#####',
      '#............#',
      '#.##.###.###.#',
      '#o##.###.###.#',
      '#.............',
      '#.###.###.###.',
      '#.###.###.###.',
      '#.............',
      '##############',
    ]),
    starts: [
      [13, 19, 'left'],
      [1, 1, 'right'],
      [25, 1, 'left'],
      [13, 22, 'right'],
      [1, 22, 'right'],
      [25, 22, 'left'],
      [1, 7, 'right'],
      [25, 7, 'left'],
    ],
    house: [13, 12],
    exit: [13, 10],
    fruit: [13, 14],
    powers: POWERS_3_18,
  },
  {
    // Tall side columns, a high tunnel and a winding floor.
    id: 'twist',
    rows: mirror([
      '##############',
      '#....#.......#',
      '#.##.#.#####.#',
      '#o##...#####.#',
      '#.##.#........',
      '#....#.##.##.#',
      '####.#.##.##.#',
      '    ......#...',
      '####.#.##.#.##',
      '####.#.##...##',
      '####.#.##.#...',
      '#....#.##.###-',
      '#.##.#.##.#   ',
      '#.##...##.####',
      '#.##.#.##.....',
      '#.##.#.##.####',
      '#....#........',
      '##.#.#.####.##',
      '#o.#.#....#...',
      '#.##.####.#.##',
      '#.........#..#',
      '#.#######.##.#',
      '#............#',
      '##############',
    ]),
    starts: [
      [13, 16, 'left'],
      [1, 1, 'right'],
      [25, 1, 'left'],
      [13, 4, 'right'],
      [1, 22, 'right'],
      [25, 22, 'left'],
      [1, 11, 'right'],
      [25, 11, 'left'],
    ],
    house: [13, 12],
    exit: [13, 10],
    fruit: [13, 14],
    powers: POWERS_3_18,
  },
  {
    // Small rooms and short hops; the tunnel runs just under the house.
    id: 'hive',
    rows: mirror([
      '##############',
      '#.......#....#',
      '#.#####.#.##.#',
      '#o#####.#.##..',
      '#.........##.#',
      '###.#.###....#',
      '###.#.###.##.#',
      '#...#...#.##.#',
      '#.#.###.#....#',
      '#.#.....#.####',
      '#.#####.#.....',
      '#.......#.###-',
      '###.###.#.#   ',
      '   .#...#.####',
      '###.#.#.#.....',
      '#.....#...####',
      '#.###.#.#.####',
      '#o###...#.....',
      '#.....#.#.#.##',
      '##.##.#.#.#.##',
      '#...#.....#...',
      '#.#.#.###.#.##',
      '#...#.........',
      '##############',
    ]),
    starts: [
      [13, 17, 'left'],
      [1, 1, 'right'],
      [25, 1, 'left'],
      [13, 22, 'right'],
      [1, 22, 'right'],
      [25, 22, 'left'],
      [1, 11, 'right'],
      [25, 11, 'left'],
    ],
    house: [13, 12],
    exit: [13, 10],
    fruit: [13, 14],
    powers: [
      [1, 3],
      [25, 3],
      [1, 17],
      [25, 17],
    ],
  },
]);

const SMALL = sized('Small', [
  {
    // Two long side lanes, a tunnel past the house and a ladder of short hops below.
    id: 'sprout',
    rows: mirror([
      '###########',
      '#........##',
      '#o##.###.##',
      '#.##.###.##',
      '#..........',
      '#.##.#.####',
      '#....#...##',
      '####.#.#...',
      '####.#.###-',
      '    ...#   ',
      '####.#.####',
      '####.#.....',
      '#....#.##.#',
      '#.##.#.##.#',
      '#o.........',
      '#.##.#.##.#',
      '#....#....#',
      '#.##.#.##.#',
      '#..........',
      '###########',
    ]),
    starts: [
      [10, 14, 'left'],
      [1, 1, 'right'],
      [19, 1, 'left'],
      [10, 18, 'right'],
      [1, 18, 'right'],
      [19, 18, 'left'],
      [1, 6, 'right'],
      [19, 6, 'left'],
    ],
    house: [10, 9],
    exit: [10, 7],
    fruit: [10, 11],
    powers: [
      [1, 2],
      [19, 2],
      [1, 14],
      [19, 14],
    ],
  },
  {
    // Staggered rooms up top that step down to the tunnel, then an open floor.
    id: 'steps',
    rows: mirror([
      '###########',
      '#...#......',
      '#.#.#.####.',
      '#o#...#....',
      '#.#.#.#.###',
      '#...#...#..',
      '###.###.#.#',
      '#.....#...#',
      '#.###.#.###',
      '#...#.#....',
      '###.#.####-',
      '   .#..#   ',
      '###.##.####',
      '#..........',
      '#.##.#.##.#',
      '#o...#.....',
      '#.##.#.##.#',
      '#.##.#.##.#',
      '#..........',
      '###########',
    ]),
    starts: [
      [10, 15, 'left'],
      [1, 1, 'right'],
      [19, 1, 'left'],
      [10, 18, 'right'],
      [1, 18, 'right'],
      [19, 18, 'left'],
      [1, 7, 'right'],
      [19, 7, 'left'],
    ],
    house: [10, 11],
    exit: [10, 9],
    fruit: [10, 13],
    powers: [
      [1, 3],
      [19, 3],
      [1, 15],
      [19, 15],
    ],
  },
]);

const LARGE = sized('Large', [
  {
    // A wide grid of small blocks with a few long walls; plenty of ways around.
    id: 'orchard',
    rows: mirror([
      '#################',
      '#.......##.......',
      '#o##.##.##.##.###',
      '#.##.##.##.##.###',
      '#................',
      '#.##.#####.##.###',
      '#.##.#####.##.###',
      '#....##.......###',
      '#.##.##.##.##.###',
      '#.##.##.##.##.###',
      '#.......##.......',
      '#.##.##.##.##.###',
      '#.##.##.##.......',
      '#.##.##.##.#####-',
      '   ........###   ',
      '#.##.##.##.######',
      '#.......##.......',
      '#.##.##.##.##.###',
      '#.##.##.##.##.###',
      '#..........##....',
      '#.##.##.##.##.###',
      '#.##.##.##.##.###',
      '#....##..........',
      '#.##.##.#####.###',
      '#.##.##.#####.###',
      '#o...............',
      '#.##.##.##.##.###',
      '#.##.##.##.##.###',
      '#.......##.......',
      '#################',
    ]),
    starts: [
      [16, 19, 'left'],
      [1, 1, 'right'],
      [31, 1, 'left'],
      [16, 28, 'right'],
      [1, 28, 'right'],
      [31, 28, 'left'],
      [1, 10, 'right'],
      [31, 10, 'left'],
    ],
    house: [16, 14],
    exit: [16, 12],
    fruit: [16, 16],
    powers: [
      [1, 2],
      [31, 2],
      [1, 25],
      [31, 25],
    ],
  },
  {
    // Tall terraces of blocks, a low house and long cross lanes to split up on.
    id: 'terrace',
    rows: mirror([
      '#################',
      '#........##......',
      '#.##.###.##.##.##',
      '#o##.###.##.##.##',
      '#.##.###.##.##.##',
      '#................',
      '#.######.##.##.##',
      '#.######.##.##.##',
      '#....###.......##',
      '#.##.###.##.##.##',
      '#.##.###.##.##.##',
      '#........##......',
      '#.##.###.##.##.##',
      '#.##.###.##......',
      '#.##.###.##.####-',
      '    .###.##.##   ',
      '#.##.###.##.#####',
      '#........##......',
      '#.##.###.##.##.##',
      '#.##.###.##.##.##',
      '#..............##',
      '#.##.######.##.##',
      '#.##.######.##.##',
      '#o...............',
      '#.##.###.##.##.##',
      '#.##.###.##.##.##',
      '#........##......',
      '#.##.###.##.##.##',
      '#................',
      '#################',
    ]),
    starts: [
      [16, 23, 'left'],
      [1, 1, 'right'],
      [31, 1, 'left'],
      [16, 28, 'right'],
      [1, 28, 'right'],
      [31, 28, 'left'],
      [1, 11, 'right'],
      [31, 11, 'left'],
    ],
    house: [16, 15],
    exit: [16, 13],
    fruit: [16, 17],
    powers: [
      [1, 3],
      [31, 3],
      [1, 23],
      [31, 23],
    ],
  },
]);

/** Every maze, Medium first (the signed-off maze is index 0). Indexes are stored in game state. */
export const MAZE_LAYOUTS: MazeLayout[] = [...MEDIUM, ...SMALL, ...LARGE];

/** The mazes of one size. */
export const layoutsOf = (size: MazeSize): MazeLayout[] =>
  MAZE_LAYOUTS.filter((m) => m.size === size);
