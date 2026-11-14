import type { Dir, Vec } from './walker';

export const MAZE_W = 27;
export const MAZE_H = 24;

/**
 * One maze. `rows` are 24 strings of 27 characters: `#` wall, `.` pellet, `o` power spot,
 * `-` ghost door, ` ` empty (the ghost house and the tunnel mouths). A row that is open at both
 * edges is a tunnel: walking off one side comes back on the other.
 */
export interface MazeLayout {
  id: string;
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

export const wrapX = (x: number): number => ((x % MAZE_W) + MAZE_W) % MAZE_W;

export function isWall(m: MazeLayout, x: number, y: number): boolean {
  if (y < 0 || y >= MAZE_H) return true;
  return m.rows[y]![wrapX(x)] === '#';
}

export function isDoor(m: MazeLayout, x: number, y: number): boolean {
  if (y < 0 || y >= MAZE_H) return false;
  return m.rows[y]![wrapX(x)] === '-';
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
      const nx = wrapX(x + DIRS[d][0]);
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

/** Builds a full row from its left 14 characters; the 14th is the middle column. */
const mirror = (half: string[]): string[] =>
  half.map((l) => l + [...l.slice(0, 13)].reverse().join(''));

const POWERS_3_18: Vec[] = [
  [1, 3],
  [25, 3],
  [1, 18],
  [25, 18],
];

export const MAZE_LAYOUTS: MazeLayout[] = [
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
];
