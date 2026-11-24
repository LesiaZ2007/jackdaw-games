import 'server-only';
import { provideWords, wordsMissing } from '@jackdaw/game-wordhoard';

/** Where the Cloudflare build puts Letterhoard's packed word list (scripts/cf-assets.mjs). */
export const WORDS_ASSET = '/_jackdaw/words.txt';

type AssetsBinding = { fetch(input: string): Promise<Response> };

/**
 * Makes sure Letterhoard's word list is loaded before a request that may check words. On Vercel
 * the list is part of the server bundle, so this does nothing. The Cloudflare build leaves it out
 * (the bundle has a size limit) and reads it from the worker's static assets, once per instance.
 * Each request that finds it missing fetches it itself: a fetch can't be shared across requests there.
 */
export async function ensureWords(): Promise<void> {
  if (!wordsMissing()) return;
  const context = (globalThis as Record<symbol, { env?: { ASSETS?: AssetsBinding } } | undefined>)[
    Symbol.for('__cloudflare-context__')
  ];
  const assets = context?.env?.ASSETS;
  if (!assets) throw new Error('The word list is missing from this server.');
  const res = await assets.fetch(`https://assets.local${WORDS_ASSET}`);
  if (!res.ok) throw new Error(`The word list could not be loaded (${res.status}).`);
  const packed = await res.text();
  if (wordsMissing()) provideWords(packed);
}
