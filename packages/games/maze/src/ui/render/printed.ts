import {
  chomperPath,
  ghostFace,
  ghostPath,
  inkedWalls,
  roundPellets,
  type LookStyle,
} from './look';

const INK = '#1d1d1c';
const PAPER = '#f7f3ea';

/** Printed: ink on paper, heraldic player colors. The default look. */
export const printed: LookStyle = {
  id: 'Printed',
  bg: PAPER,
  ink: INK,
  textStroke: PAPER,
  go: '#30634a',
  gold: '#a77d2c',
  countColor: INK,
  // gules, azure, vert, or, purpure, tenne, sable, teal
  players: ['#b8382c', '#2b5683', '#30634a', '#b8862a', '#6b3a7a', '#c0601e', '#3a3d42', '#2f7f7a'],
  ghosts: ['#9a5a22', '#6a3f74', '#3a3d42', '#2f7f7a'],
  jinx: '#3a3d42',
  power: {
    hunt: '#2b5683',
    dash: '#c08a1e',
    phase: '#30634a',
    magnet: '#8a3f8f',
    jinx: '#3a3d42',
    freeze: '#4f9fc8',
    steal: '#c0601e',
    fog: '#8a8d92',
  },
  glow: false,
  frightColor: (flash) => (flash ? '#c9c4b5' : '#8fa6c8'),
  walls(ctx, layout, T, flash) {
    inkedWalls(ctx, layout, T, flash, {
      fill: '#e7e0cf',
      flashFill: '#e8d9a8',
      bg: PAPER,
      stroke: INK,
      flashStroke: '#a77d2c',
      door: '#a77d2c',
    });
  },
  pellets: (ctx, p, T) => roundPellets(ctx, p, T, INK, false),
  powerSpot(ctx, x, y, T, color, pulse) {
    const cx = (x + 0.5) * T,
      cy = (y + 0.5) * T;
    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, T * 0.34 * pulse, 0, 7);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.arc(cx, cy, T * 0.6 * pulse, 0, 7);
    ctx.fill();
    ctx.globalAlpha = 1;
  },
  chomper(ctx, T, R, m, color, eye) {
    chomperPath(ctx, R, m);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, T * 0.13);
    ctx.strokeStyle = INK;
    ctx.lineJoin = 'round';
    ctx.stroke();
    if (!eye) return;
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ctx.arc(-T * 0.06, -R * 0.5, T * 0.15, 0, 7);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(-T * 0.04, -R * 0.5, T * 0.08, 0, 7);
    ctx.fill();
  },
  ghost(ctx, T, g) {
    ctx.save();
    ctx.scale(T / 9.5, T / 9.5);
    if (!g.eyes) {
      ghostPath(ctx, Math.sin(g.t * 14 + g.bob) * 0.7);
      ctx.fillStyle = g.color;
      ctx.fill();
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = INK;
      ctx.lineJoin = 'round';
      ctx.stroke();
      if (g.jinx) {
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(g.t * 12);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, -1, 8.5, 0, 7);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ghostFace(ctx, g, INK, '#2b5683', INK);
    ctx.restore();
  },
  overlay() {},
};
