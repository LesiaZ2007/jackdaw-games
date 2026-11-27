// Cloudflare Workers build config (used only by `pnpm cf:build`).
// Vercel ignores this file; `next build` is unchanged.
import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import staticAssetsIncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache';

// Tells next.config.ts this `next build` is for Workers (the build runs in a child process that inherits it).
process.env.JACKDAW_CLOUDFLARE = '1';
// Read at build time: link previews and the TV's join address need the public address (Vercel
// fills it in itself), and the CSP lets the Avalon TV frame in. Keep these in step with
// wrangler.jsonc (the custom domain and AVALON_URL).
process.env.NEXT_PUBLIC_SITE_URL ??= 'https://jackdaw.lastivka.dev';
process.env.AVALON_URL ??= 'https://play-avalon.vercel.app';
// Live (Contact) Pac-Man runs only here: its Durable Object is in this Worker (worker/index.ts).
process.env.NEXT_PUBLIC_LIVE ??= '1';

export default defineCloudflareConfig({
  // Prerendered pages are served from the static assets. No R2/KV needed,
  // so this stays on the free Workers plan.
  incrementalCache: staticAssetsIncrementalCache,
});
