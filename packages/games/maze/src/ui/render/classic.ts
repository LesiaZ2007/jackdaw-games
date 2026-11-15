import { isWallAt, isDoorAt, type GhostPaint, type LookStyle } from './look';

const BG = '#000008';
const BLOCK = '#1a1fa8';
const RIM = '#5d7bff';
/**
 * Pixels per side of the fine pixel-art grids: 26, each pixel half the size of the first
 * version's, at the same size on screen.
 */
const N = 26;

/** A ghost's body: a round dome on straight sides, N wide. */
const GHOST_BODY: string[] = (() => {
  const rows: string[] = [];
  const r = N / 2;
  for (let j = 0; j < 20; j++) {
    let row = '';
    for (let i = 0; i < N; i++) {
      const dx = i + 0.5 - r;
      const dy = j + 0.5 - r;
      row += j >= r || dx * dx + dy * dy <= r * r + 1 ? '#' : '.';
    }
    rows.push(row);
  }
  return rows;
})();
/** The two skirt frames: feet that swap places. */
const SKIRT_A = [
  '##########################',
  '####..######..######..####',
  '###....####....####....###',
  '##......##......##......##',
  '#.......#........#.......#',
  '#.......#........#.......#',
];
const SKIRT_B = [
  '##########################',
  '##..######..######..######',
  '#....####....####....#####',
  '......##......##......####',
  '......#........#.......###',
  '......#........#.......###',
];

function pixels(
  ctx: CanvasRenderingContext2D,
  rows: readonly string[],
  px: number,
  x0: number,
  y0: number,
): void {
  ctx.beginPath();
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++)
      if (row[i] === '#') ctx.rect(x0 + i * px, y0 + j * px, px + 0.4, px + 0.4);
  });
  ctx.fill();
}

/** Classic: fine pixel art, solid blue block walls with a bright rim, square pellets. */
export const classic: LookStyle = {
  id: 'Classic',
  bg: BG,
  ink: '#000000',
  textStroke: BG,
  go: '#5dff8f',
  gold: '#ffd8a0',
  countColor: '#ffffff',
  players: ['#ff4d4d', '#4dc3ff', '#5dff8f', '#f2f2f2', '#ff9a3d', '#c77dff', '#ff6fae', '#3dffd8'],
  ghosts: ['#ff9a3d', '#c77dff', '#ff6fae', '#3dffd8'],
  jinx: '#b06cff',
  power: {
    hunt: '#22e6ff',
    dash: '#ffe14d',
    phase: '#7dff6a',
    magnet: '#ff5cf0',
    jinx: '#b06cff',
    freeze: '#9be8ff',
    steal: '#ffb13d',
    fog: '#9aa0ab',
  },
  glow: false,
  frightColor: (flash) => (flash ? '#f2f2f2' : '#2a35ff'),
  walls(ctx, m, T, flash) {
    const rim = Math.max(1, T * 0.1);
    ctx.fillStyle = flash ? '#e8e8ff' : BLOCK;
    for (let r = 0; r < m.h; r++)
      for (let c = 0; c < m.w; c++)
        if (m.rows[r]![c] === '#') ctx.fillRect(c * T, r * T, T + 0.5, T + 0.5);
    ctx.fillStyle = flash ? '#ffffff' : RIM;
    for (let r = 0; r < m.h; r++)
      for (let c = 0; c < m.w; c++) {
        if (m.rows[r]![c] !== '#') continue;
        if (!isWallAt(m, c, r - 1)) ctx.fillRect(c * T, r * T, T, rim);
        if (!isWallAt(m, c, r + 1)) ctx.fillRect(c * T, (r + 1) * T - rim, T, rim);
        if (!isWallAt(m, c - 1, r) && c > 0) ctx.fillRect(c * T, r * T, rim, T);
        if (!isWallAt(m, c + 1, r) && c < m.w - 1) ctx.fillRect((c + 1) * T - rim, r * T, rim, T);
      }
    ctx.fillStyle = '#ff9acb';
    for (let r = 0; r < m.h; r++)
      for (let c = 0; c < m.w; c++)
        if (isDoorAt(m, c, r)) ctx.fillRect(c * T, (r + 0.5) * T - T * 0.1, T, T * 0.2);
  },
  pellets(ctx, pellets, T) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffd8b0';
    const s = Math.max(2, Math.round(T * 0.2));
    ctx.beginPath();
    for (const [x, y] of pellets)
      ctx.rect(Math.round((x + 0.5) * T - s / 2), Math.round((y + 0.5) * T - s / 2), s, s);
    ctx.fill();
  },
  powerSpot(ctx, x, y, T, color, pulse) {
    const s = T * 0.62 * pulse;
    ctx.fillStyle = color;
    ctx.fillRect((x + 0.5) * T - s / 2, (y + 0.5) * T - s / 2, s, s);
  },
  chomper(ctx, T, R, m, color, eye) {
    const px = (2 * R) / N,
      c = (N - 1) / 2;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const dx = i - c,
          dy = j - c;
        if (dx * dx + dy * dy > (c + 0.4) * (c + 0.4)) continue;
        if (dx > 0 && Math.abs(Math.atan2(dy, dx)) < m) continue;
        if (eye && i >= 10 && i <= 11 && j >= 5 && j <= 6) continue;
        ctx.rect(-R + i * px, -R + j * px, px + 0.4, px + 0.4);
      }
    ctx.fill();
    if (eye) {
      ctx.fillStyle = '#000008';
      ctx.fillRect(-R + 10 * px, -R + 5 * px, 2 * px + 0.4, 2 * px + 0.4);
    }
    void T;
  },
  ghost(ctx, T, g: GhostPaint) {
    const px = (T * 1.25) / N;
    const x0 = (-N * px) / 2,
      y0 = -13 * px;
    if (!g.eyes) {
      ctx.fillStyle = g.color;
      const alt = Math.floor(g.t * 8 + g.bob) % 2 === 0;
      pixels(ctx, [...GHOST_BODY, ...(alt ? SKIRT_A : SKIRT_B)], px, x0, y0);
      if (g.jinx) {
        ctx.strokeStyle = '#fff';
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(g.t * 12);
        ctx.lineWidth = Math.max(1, px);
        ctx.strokeRect(x0 - px, y0 - px, N * px + 2 * px, 26 * px + 2 * px);
        ctx.globalAlpha = 1;
      }
    }
    const dx = g.dir === 'left' ? -1 : g.dir === 'right' ? 1 : 0;
    const dy = g.dir === 'up' ? -1 : g.dir === 'down' ? 1 : 0;
    if (g.fright && !g.eyes) {
      ctx.fillStyle = '#ffd8b0';
      ctx.fillRect(x0 + 8 * px, y0 + 8 * px, 4 * px, 4 * px);
      ctx.fillRect(x0 + 14 * px, y0 + 8 * px, 4 * px, 4 * px);
      for (let i = 0; i < 6; i++)
        ctx.fillRect(x0 + (4 + i * 3) * px, y0 + (i % 2 ? 16 : 18) * px, 3 * px, 2 * px);
      return;
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x0 + 6 * px, y0 + 8 * px, 6 * px, 8 * px);
    ctx.fillRect(x0 + 14 * px, y0 + 8 * px, 6 * px, 8 * px);
    ctx.fillStyle = g.eyes ? '#22e6ff' : '#1a1fa8';
    ctx.fillRect(x0 + (8 + 2 * dx) * px, y0 + (11 + 2 * dy) * px, 4 * px, 4 * px);
    ctx.fillRect(x0 + (16 + 2 * dx) * px, y0 + (11 + 2 * dy) * px, 4 * px, 4 * px);
  },
  overlay() {},
};
