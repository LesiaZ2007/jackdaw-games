import { defineProject } from 'vitest/config';

// The hidden-information fuzz plays 24 whole games and checks every view after every move; on a
// busy machine that can pass the default 5 seconds.
export default defineProject({ test: { name: '@jackdaw/game-cambio', testTimeout: 30_000 } });
