// Cloudflare build step (after `opennextjs-cloudflare build`), adding two things to the worker's
// static assets:
// - Letterhoard's packed word list, which the Workers build leaves out of the server bundle
//   (see next.config.ts); lib/words.ts reads it from there.
// - A _headers file. Static files are served without running Next, so next.config.ts's
//   headers() don't reach them: the service worker must still always be fetched fresh.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const assets = join(web, '.open-next/assets');

const source = readFileSync(
  join(web, '../../packages/games/wordhoard/src/words.packed.ts'),
  'utf8',
);
const packed = /PACKED_WORDS =\s*'([A-Za-z]+)'/.exec(source)?.[1];
if (!packed) throw new Error('No packed word list found in words.packed.ts');
mkdirSync(join(assets, '_jackdaw'), { recursive: true });
writeFileSync(join(assets, '_jackdaw/words.txt'), packed);

writeFileSync(
  join(assets, '_headers'),
  [
    '/*',
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  X-Frame-Options: DENY',
    '/sw.js',
    '  Cache-Control: no-cache, no-store, must-revalidate',
    '',
  ].join('\n'),
);
console.log(`Added the word list (${packed.length} characters) and _headers to ${assets}`);
