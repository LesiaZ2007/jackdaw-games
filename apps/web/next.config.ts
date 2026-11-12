import type { NextConfig } from 'next';

/** The Avalon app's origin: its TV screen is shown in an iframe, the one thing we embed. */
function avalonOrigin(): string | null {
  try {
    return process.env.AVALON_URL ? new URL(process.env.AVALON_URL).origin : null;
  } catch {
    return null;
  }
}

/**
 * The site's Content-Security-Policy. Next adds inline scripts, so script-src needs
 * 'unsafe-inline' (and 'unsafe-eval' in dev only, for React's debugging). Everything else is
 * same-origin, apart from the Avalon TV frame. Navigating to another origin (the Avalon
 * hand-off) isn't restricted by these directives.
 */
function contentSecurityPolicy(): string {
  const dev = process.env.NODE_ENV !== 'production';
  const avalon = avalonOrigin();
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${dev ? ' ws: wss:' : ''}`,
    `frame-src ${avalon ? `'self' ${avalon}` : "'self'"}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
  ].join('; ');
}

const config: NextConfig = {
  poweredByHeader: false,
  // build:check builds into a separate folder so it can run while `next dev` holds .next.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  transpilePackages: [
    '@jackdaw/engine',
    '@jackdaw/server',
    '@jackdaw/ui',
    '@jackdaw/game-rps',
    '@jackdaw/game-risk',
    '@jackdaw/game-avalon',
    '@jackdaw/game-backgammon',
    '@jackdaw/game-tetra',
    '@jackdaw/game-battleship',
    '@jackdaw/game-kings',
    '@jackdaw/game-monopoly',
    '@jackdaw/game-catan',
    '@jackdaw/game-codenames',
    '@jackdaw/game-uno',
    '@jackdaw/game-poker',
    '@jackdaw/game-secret-hitler',
    '@jackdaw/game-wavelength',
    '@jackdaw/game-mafia',
    '@jackdaw/game-wordhoard',
    '@jackdaw/game-zap',
    '@jackdaw/game-fandango',
    '@jackdaw/game-solitaire',
    '@jackdaw/game-cambio',
  ],
  // Put metadata in <head> for every client so link previews work.
  htmlLimitedBots: /.*/,
  // Keep the dev-mode badge out of screenshots.
  devIndicators: false,
  // The service worker must always be fetched fresh, or an old one keeps serving.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
    ];
  },
};

export default config;
