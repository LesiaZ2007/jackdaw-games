import {
  chomperPath,
  ghostFace,
  ghostPath,
  glow,
  neonWalls,
  roundPellets,
  type LookStyle,
} from './look';

const BG = '#07021a';

/** Neon: glowing outlines on a dark board, with faint scanlines. */
export const neon: LookStyle = {
  id: 'Neon',
  bg: BG,
  ink: BG,
  textStroke: BG,
  go: '#7dff6a',
  gold: '#d2aa5c',
  countColor: '#ffffff',
  players: ['#ff4d4d', '#4dc3ff', '#5dff8f', '#ffe14d', '#ff5cf0', '#ff9a3d', '#b06cff', '#3dffd8'],
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
  glow: true,
  frightColor: (flash) => (flash ? '#ffffff' : '#5b6cff'),
  walls(ctx, layout, T, flash) {
    neonWalls(ctx, layout, T, flash ? '#ffffff' : '#ff2bd6', '#d2aa5c');
  },
  pellets: (ctx, p, T) => roundPellets(ctx, p, T, '#ffffff', true),
  powerSpot(ctx, x, y, T, color, pulse) {
    const cx = (x + 0.5) * T,
      cy = (y + 0.5) * T;
    glow(ctx, color, T);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, T * 0.34 * pulse, 0, 7);
    ctx.fill();
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.arc(cx, cy, T * 0.6 * pulse, 0, 7);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  },
  chomper(ctx, T, R, m, color, eye) {
    glow(ctx, color, T * 0.6);
    chomperPath(ctx, R, m);
    ctx.fillStyle = color + '40';
    ctx.fill();
    ctx.lineWidth = Math.max(1.4, T * 0.15);
    ctx.strokeStyle = color;
    ctx.stroke();
    if (eye) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(-T * 0.06, -R * 0.52, T * 0.11, 0, 7);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  },
  ghost(ctx, T, g) {
    ctx.save();
    ctx.scale(T / 9.5, T / 9.5);
    if (!g.eyes) {
      glow(ctx, g.color, 8);
      ghostPath(ctx, Math.sin(g.t * 14 + g.bob) * 0.7);
      ctx.fillStyle = g.color + '38';
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = g.color;
      ctx.stroke();
      if (g.jinx) {
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(g.t * 12);
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#fff';
        ctx.beginPath();
        ctx.arc(0, -1, 8.5, 0, 7);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.shadowBlur = 0;
    ghostFace(ctx, g, BG, '#22e6ff', null);
    ctx.restore();
  },
  overlay(ctx, w, h) {
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  },
};
