import {
  chomperPath,
  ghostFace,
  ghostPath,
  inkedWalls,
  roundPellets,
  type LookStyle,
} from './look';

const BG = '#07140c';
const DARK = '#0b1a10';
const GOLD = '#c99a4b';

/** Cabinet: walnut walls with a gold rule on a dim green screen, softer colors, cream ghosts. */
export const cabinet: LookStyle = {
  id: 'Cabinet',
  bg: BG,
  ink: DARK,
  textStroke: DARK,
  go: '#9fd8a8',
  gold: GOLD,
  countColor: '#efe4c4',
  players: ['#d96a5a', '#6aa8d9', '#7cc48a', '#d9b25a', '#b88ad9', '#d98f5a', '#a9b0b8', '#5ac4b8'],
  ghosts: ['#efe4c4', '#e6d3a8', '#f2d9c9', '#d8e4cc'],
  jinx: '#c9a0e0',
  power: {
    hunt: '#6aa8d9',
    dash: '#e0b84a',
    phase: '#7cc48a',
    magnet: '#c88ad0',
    jinx: '#b08ad0',
    freeze: '#a8dcef',
    steal: '#e0904a',
    fog: '#aab0b4',
  },
  glow: false,
  frightColor: (flash) => (flash ? '#efe4c4' : '#6f8fb8'),
  walls(ctx, layout, T, flash) {
    inkedWalls(ctx, layout, T, flash, {
      fill: '#4a2c18',
      flashFill: '#8a5a30',
      bg: BG,
      stroke: GOLD,
      flashStroke: '#ffe7a8',
      door: GOLD,
    });
  },
  pellets: (ctx, p, T) => roundPellets(ctx, p, T, '#cfe8c0', false),
  powerSpot(ctx, x, y, T, color, pulse) {
    const cx = (x + 0.5) * T,
      cy = (y + 0.5) * T;
    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, T * 0.32 * pulse, 0, 7);
    ctx.fill();
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    ctx.arc(cx, cy, T * 0.58 * pulse, 0, 7);
    ctx.fill();
    ctx.globalAlpha = 1;
  },
  chomper(ctx, T, R, m, color, eye) {
    chomperPath(ctx, R, m);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = Math.max(1.2, T * 0.1);
    ctx.strokeStyle = DARK;
    ctx.lineJoin = 'round';
    ctx.stroke();
    if (!eye) return;
    ctx.fillStyle = '#efe4c4';
    ctx.beginPath();
    ctx.arc(-T * 0.06, -R * 0.5, T * 0.14, 0, 7);
    ctx.fill();
    ctx.fillStyle = DARK;
    ctx.beginPath();
    ctx.arc(-T * 0.04, -R * 0.5, T * 0.07, 0, 7);
    ctx.fill();
  },
  ghost(ctx, T, g) {
    ctx.save();
    ctx.scale(T / 9.5, T / 9.5);
    if (!g.eyes) {
      ghostPath(ctx, Math.sin(g.t * 14 + g.bob) * 0.7);
      ctx.fillStyle = g.color;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = DARK;
      ctx.lineJoin = 'round';
      ctx.stroke();
      if (g.jinx) {
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(g.t * 12);
        ctx.beginPath();
        ctx.arc(0, -1, 8.5, 0, 7);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ghostFace(ctx, g, DARK, '#6aa8d9', DARK);
    ctx.restore();
  },
  overlay(ctx, w, h) {
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
    const gr = ctx.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * 0.4,
      w / 2,
      h / 2,
      Math.max(w, h) * 0.75,
    );
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, w, h);
  },
};
