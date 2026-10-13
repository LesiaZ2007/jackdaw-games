// Production build into .next-check, so it's safe to run while a dev server is using .next.
// `next build` rewrites next-env.d.ts to point at the build folder, so put it back afterwards.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const nextEnv = fileURLToPath(new URL('../next-env.d.ts', import.meta.url));
const original = existsSync(nextEnv) ? readFileSync(nextEnv, 'utf8') : null;

const result = spawnSync('next', ['build'], {
  stdio: 'inherit',
  shell: true,
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  env: { ...process.env, NEXT_DIST_DIR: '.next-check' },
});

if (original !== null && readFileSync(nextEnv, 'utf8') !== original) {
  writeFileSync(nextEnv, original);
}
process.exit(result.status ?? 1);
