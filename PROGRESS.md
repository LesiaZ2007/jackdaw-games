# Progress

Read this first. CLAUDE.md has the decisions and rules, and `docs/BUILD_PLAN.md` has the full plan.

## Where we are (2026-10-12)

**Phase 0: done except design sign-off.** Phase 1's backend is built.

### Branches

| Branch                | State                                                                                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main`                | Only the initial workspace commit. Lesia merges.                                                                                                           |
| `chore/phase-0-setup` | Scaffold, CI, engine, docs, round-one mockups. CI is green.                                                                                                |
| `feat/phase-1`        | **The working branch.** It holds Phase 0, the backend (`feat/phase-1-backend`), stats (`feat/stats`) and round-two mockups. CI is green and 64 tests pass. |

### Deployed

- The Vercel project `jackdaw-games` (team lesia-s-projects) has root `apps/web` and is linked to GitHub, so every push gets a preview. Production follows `main`.
- Storage is the shared Upstash store `upstash-kv-carmine-bucket`, also used by Avalon and notes-app. Every Jackdaw key is prefixed `jackdaw:`. The env vars `KV_REST_API_URL` and `KV_REST_API_TOKEN` are set for all environments.
- **Phase 0 acceptance passed:** the deployed home page reached the room server and showed the echoed message, using Upstash storage.
- Preview deployments sit behind Vercel Authentication. Scripts can get past it with the project's protection-bypass secret, sent as the `x-vercel-protection-bypass` header.

### Built

- `packages/engine`:
  - The game contract, including the optional `standings` (approved 2026-10-12) and `actionSchema` (added at kickoff; still to be confirmed with Lesia).
  - Protocol and Zod schemas.
  - A seeded `Rng`.
  - The lobby state machine, covering chat, rejoin codes, scores and spectators seated next game.
  - `lobbyStats`.
- `packages/server`: room storage (memory or Upstash REST), the room runtime (locks, presence, host handover, rate limits, rejoin), and the HTTP handlers.
- `apps/web`:
  - API routes: `/api/lobby`, `/api/lobby/:code`, `/api/lobby/:code/rejoin` and `/api/lobby/:code/stats`.
  - `PollingTransport` and the device identity helpers.
  - A placeholder home page with the echo check.
- `packages/games/rps`: Rock Paper Scissors rules, with leak tests. It has no UI yet.
- `MIGRATION.md`: the env vars and the path to Cloudflare.

### Design

- The review page is https://claude.ai/artifact/T8HQa4wn5a41g7Yj4GBwyC. The mockups are in `mockups/`.
- Lesia picked **A, Compendium**. Their notes:
  - Less Scrabble.
  - Spice it up, because it was too plain.
  - Use Belfry's font (Grenze Gotisch).
  - Make the jackdaw icon better.
  - Each game's lobby should be themed, e.g. Avalon's round table with its rules.
  - Add a Game stats menu.
  - Use stained glass for Avalon-like games.
- **Round two** (`mockups/a2-compendium.html`) answered those notes. Lesia then decided:
  - **Avalon stays exactly as it is today**, in both gameplay and styling. Its waiting room is its current lobby (the round table).
  - **No stained glass** anywhere.
  - The parchment cream was too generic. The small splashes of heraldic colour stay.
  - **Dark mode is approved.**
  - Tapping a game opens a detail view with a description, how to play, and pictures (real screenshots).
- **Round three** (`mockups/a3-compendium.html`, with palette and mark switchers):
  - The day palette is **Pebble**, now grey (`--card #cfcecb`).
  - The mark is **OpenMoji's black bird as line art** (CC BY-SA 4.0, needs a credit). The files are in `mockups/parts/free-icons`.
  - It is **waiting on Lesia's final sign-off.**
- Carry forward:
  - Code letters use roman Grenze, headings Grenze Gotisch, plaques Big Shoulders, and body text Alegreya Sans.
  - Codes are chamfered chits, players are punch-out tokens with heraldic charges, and the 15 seats are a printed track.
  - Each game's box lid gets a heraldic field pattern.
  - Once a game is chosen, its own world opens inside the Jackdaw frame, which always keeps the code, stats and chat.

## Next

1. Get Lesia's feedback on round two, then iterate.
2. Write `STYLE_GUIDE.md` and encode the tokens in `packages/ui` (CSS custom properties, day and dark).
3. Phase 1 UI: home, catalog, lobby (`/r/[code]`), the game shell and results, the RPS screens, TV (`/tv/[code]`), and Playwright at four widths.
4. Define `.claude/agents/` (repo-explorer, rules-tester, hidden-info-auditor, ui-reviewer).

## Open questions

- Should `actionSchema` stay on the game contract? It was added so every incoming action is checked with Zod.
- The plan's strict "reject stale seq" would reject simultaneous votes. Actions are currently rejected only when they come from an earlier game or claim a future seq. Ordering within a game is left to the rules.
- Timers (`onTimer`) are not scheduled yet. That will be decided with the first timed game (Werewolf or Spyfall). On Vercel they'll be evaluated lazily on each poll.
- In dark mode, should Avalon's area switch to Avalon Night? The mockups keep Parchment.
- Secret Hitler house rules for 11 to 15 players still need confirming with the group (Phase 3).
