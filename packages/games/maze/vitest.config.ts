import { defineProject } from 'vitest/config';

// The bot and runner tests simulate whole rounds. Alone they take a second or two, but with the
// whole suite running in parallel they can take several times that, so the default 5 s limit is
// raised for every test here (the longest ones set their own, longer limits).
export default defineProject({ test: { name: '@jackdaw/game-maze', testTimeout: 30_000 } });
