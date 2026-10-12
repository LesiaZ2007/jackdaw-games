import type { NextConfig } from 'next';

const config: NextConfig = {
  // build:check builds into a separate folder so it can run while `next dev` holds .next.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  transpilePackages: ['@jackdaw/engine', '@jackdaw/server', '@jackdaw/ui', '@jackdaw/game-rps'],
  // Put metadata in <head> for every client so link previews work.
  htmlLimitedBots: /.*/,
};

export default config;
