import { defineProject } from 'vitest/config';

export default defineProject({
  test: { name: '@jackdaw/web', include: ['lib/**/*.test.ts'] },
});
