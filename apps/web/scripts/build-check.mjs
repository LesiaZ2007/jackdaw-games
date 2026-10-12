// Production build into .next-check, so it's safe to run while a dev server is using .next.
import { spawnSync } from 'node:child_process';

const result = spawnSync('next', ['build'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, NEXT_DIST_DIR: '.next-check' },
});
process.exit(result.status ?? 1);
