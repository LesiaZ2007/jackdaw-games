// SPIKE (docs/maze/LIVE-PLAN-1.md): builds the live maze's feel-check page into worker/.spike and
// starts wrangler dev on the LAN (port 8787), so phones on the same Wi-Fi can join.
// `--build-only` stops after the bundle.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(web, 'worker/.spike');
const require = createRequire(import.meta.url);
// esbuild comes with wrangler.
const esbuild = require(
  require.resolve('esbuild', { paths: [require.resolve('wrangler/package.json')] }),
);

mkdirSync(out, { recursive: true });
await esbuild.build({
  entryPoints: [join(web, 'worker/spike-client.tsx')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  jsx: 'automatic',
  minify: true,
  outfile: join(out, 'spike.js'),
  loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file', '.svg': 'file', '.png': 'file' },
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});
writeFileSync(
  join(out, 'index.html'),
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>Live maze: feel check</title>
<link rel="stylesheet" href="/spike.css">
<style>html,body{margin:0;height:100%;background:var(--paper);overscroll-behavior:none;touch-action:none}</style>
</head>
<body><div id="root"></div><script type="module" src="/spike.js"></script></body>
</html>
`,
);
console.log('Built worker/.spike');

if (!process.argv.includes('--build-only')) {
  const wrangler = spawn(
    'pnpm',
    [
      'exec',
      'wrangler',
      'dev',
      '-c',
      'worker/spike.wrangler.jsonc',
      '--ip',
      '0.0.0.0',
      '--port',
      '8787',
    ],
    { cwd: web, stdio: 'inherit', shell: process.platform === 'win32' },
  );
  wrangler.on('exit', (code) => process.exit(code ?? 0));
}
