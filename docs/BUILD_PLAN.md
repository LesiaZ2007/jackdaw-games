# Jackdaw Games — Build Plan

Oct 12, 2026 · @Lesia

> This is Lesia's original plan, saved verbatim at kickoff. Where kickoff decisions changed it
> (hosting, player counts, platform features), `CLAUDE.md` wins. See "Kickoff decisions" there.

## How to use this plan

Hand this whole doc to Claude Code at kickoff and work through it one phase at a time. Each phase ends with acceptance criteria; stop there for review and a playtest before starting the next.

Working rules for Claude Code:

- **Ask questions early and often.** Whenever something is ambiguous, underspecified, or a judgment call (rules, house rules, design, scope, naming), ask before building. Asking first is always better than building the wrong thing and redoing it. At the start of each phase, gather open questions and ask them together.
- **Aesthetic is a top priority.** A screen that works but looks generic isn't done. Follow the Visual style section below, and match the design language of Luminae Vigila and Avalon.
- Treat Avalon as the reference implementation. Read its repo before writing anything, and model the platform and every new game on its patterns: screen flow, TV mode, role reveals, phase handling, and look and feel. Reuse its stack and conventions where they fit.
- Create a `CLAUDE.md` at the repo root in Phase 0 that summarizes this plan's decisions, and keep it current.
- Work in small commits, one checklist item at a time, with a clear message per commit.
- Game rules are pure TypeScript with unit tests. No rules logic lives in React components.
- Never send another player's hidden information to a client. Treat this as a bug at the same level as a crash.
- Ask before changing the game module contract, the lobby state machine, or the message protocol, since every game depends on them.
- When something in this plan turns out to be wrong, say so and propose a fix rather than working around it silently.

## Working efficiently: models, subagents, and usage

Match the model to the task and keep the main session's context focused. Spend the strongest model on decisions that are hard to undo, and use cheaper models or subagents for everything else. When unsure, favor getting it right over saving tokens.

Which model for which work (switch with `/model`, and say when and why you're switching):

| Work                                                                                      | Model            | Why                                                            |
| ----------------------------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------- |
| Game module contract, lobby state machine, protocol, hidden-information design, hard bugs | Opus             | Mistakes here ripple into every game and are expensive to redo |
| Style guide and first mockups                                                             | Opus             | Design taste matters most at the start, when the look is set   |
| Implementing features from a clear spec, game rules, UI from approved mockups, tests      | Sonnet (default) | Capable and much cheaper for well-defined work                 |
| Original content lists (Codenames words, Wavelength pairs, Spyfall locations)             | Sonnet           | Quality affects how fun the game is                            |
| Searching the codebase, renames, boilerplate, formatting, summarizing logs                | Haiku            | Mechanical work that doesn't need deep reasoning               |

If a cheaper model fails twice on the same problem, escalate to a stronger one instead of looping.

Subagents:

- Use subagents for work that would flood the main context with noise: reading the Avalon and Luminae Vigila repos, scanning the codebase, running and triaging test output, and reviewing diffs. Have each return a short summary, not raw output.
- Run independent work in parallel only when it touches separate files or packages, such as writing tests for one game's rules while the main session builds another screen. The main session integrates and reviews.
- Define reusable project subagents in `.claude/agents/` and commit them, for example:
  - `repo-explorer` (Haiku, read-only): finds files and summarizes how something works.
  - `rules-tester` (Sonnet): writes unit tests for a game's rules from its spec.
  - `hidden-info-auditor` (Opus): checks every player view, table view, and message for leaked secrets after each game is built.
  - `ui-reviewer` (Sonnet): captures screenshots at the four widths and compares them against `STYLE_GUIDE.md`.
- Don't use subagents for small tasks where the setup costs more than it saves, or for decisions that depend on the full conversation with the user.

Usage habits:

- Work one phase per session where possible, and start fresh sessions at phase boundaries. Clear or compact context between unrelated tasks.
- Keep a `PROGRESS.md` (current phase, what's done, what's next, open questions) alongside `CLAUDE.md`, so a new session can pick up without rereading everything.
- Read files selectively instead of dumping whole files or long logs into context.
- Run only the relevant tests while iterating, and the full suite before each commit.
- Plan before large changes, and ask questions before building, since redoing work is the most expensive use of tokens.

## Product summary and requirements

Jackdaw Games is a private web platform where a group of friends opens one shared lobby and plays several games in a row, each person on their own phone. Avalon, already built as a standalone app, is the first game to move in.

Non-negotiable requirements:

1. **Two entry points, one lobby system.** From the catalog, picking a game creates a lobby with that game preselected. From the home page, creating a lobby leaves the game empty for the host to choose. Both produce the same lobby object.
2. **The lobby outlives each game.** When a game ends, everyone sees the results, then returns to the same lobby with the same link and code.
3. **Play again is the default.** After a game ends, the lobby's selected game is the game just played, with the same options (for example the same Avalon roles). The host can start the next round with one tap or switch to a different game.
4. **Catalog filters.** Browse and filter by player count, category (social deduction, card, board, word/party), length, and complexity. Inside a lobby, games that don't fit the current player count are grayed out with the reason shown.
5. **No accounts required.** Lobbies hold up to 15 players, plus any number of TV displays. Players join with a nickname via link or code. Refreshing or briefly losing connection must drop a player back into their seat.
6. **Hidden information stays hidden.** Each client receives only what that player is allowed to see.
7. **Looks great on every screen.** Every page must look polished, not merely fit, on phones, tablets, laptops, and large TVs.
8. **Every game has a TV mode, like Avalon.** A shared big screen shows the public table. TV mode is optional, so everything the TV shows must also be on every phone. A game isn't done until its TV mode is. Every game also ends with a recap: a timeline of what happened, with all hidden information revealed.

## Design: visual style, screens, and TV mode

Every game ships two screens built from the same patterns as Avalon: a private player screen on each phone, and a TV screen for a shared display. Start Phase 1 by studying how Avalon's TV mode and phone screens work today and copy what works.

Visual style (top priority):

- Jackdaw Games should feel like part of the same family as Luminae Vigila (luminae-vigila.vercel.app) and Avalon (play-avalon.vercel.app). Treat those two apps as the source of truth for the aesthetic.
- Study both repos and live sites before designing anything: color palette, typography, spacing, corner radii, shadows and glows, backgrounds and textures, iconography, animation, and overall mood. Write down what makes them feel the way they do.
- Capture the result in `STYLE_GUIDE.md` with concrete values, and encode it as design tokens in `packages/ui`. Every screen is built from those tokens.
- Before building real screens, make mockups of the home page, catalog, lobby, TV lobby, and an Avalon game screen on both phone and TV, and get sign-off. Ask about anything that's unclear rather than guessing at taste.
- Each game can have its own theme within the shared language (Avalon's look, a distinct look for Secret Hitler or Werewolf), while the platform shell stays consistent.
- Avoid anything that looks templated: default component library styling, generic gradients, stock icons, or placeholder layouts.
- Share screenshots of new screens at the end of each phase for review, and expect design iteration to be part of the work, not an afterthought.

How TV mode works:

- A TV joins a lobby as a display, not a player: open `/tv/[code]` on a laptop or smart TV browser, or tap Show on TV in the lobby. It takes no seat and doesn't count toward the player count.
- In the lobby, the TV shows the lobby code, a large QR code, the player list, and the selected game, so people can join from across the room.
- During a game, the TV shows the public table: whose turn it is, scores, vote and quest results, card counts, timers, and a short action log. It never shows hidden information.
- At the end, the TV runs the big reveal (roles, hands, winners) and every phone shows the same reveal along with each player's own result.
- TV mode is optional, since a TV isn't always available. Everything the TV shows must also appear on every phone: each player screen includes the full public table, with that player's private information added on top. The TV is a bigger view of the same information, never the only place it appears.

Responsive design rules:

- Design each screen at four widths and check them all: 375px (phone), 768px (tablet), 1280px (laptop), and 1920px (TV).
- Phone screens are portrait-first and one-handed, with primary actions in the bottom third, tap targets at least 44px, and safe-area padding for notches.
- TV screens are built to be read from across a room: large type, high contrast, no hover states, and no scrolling.
- On tablets and laptops, the player screen uses the extra space (for example hand and table side by side) rather than stretching a phone layout.
- Use a fluid type and spacing scale (`clamp()`) and shared design tokens in `packages/ui`, so every game feels like part of one platform.
- Animate reveals and transitions, and respect `prefers-reduced-motion`.
- Playwright captures screenshots of each game screen at all four widths so layout regressions are caught.

The game kit: as Avalon is ported, pull its reusable pieces into `packages/ui` as a kit that later games are built from: player and TV layouts, phase banner, role reveal, voting, timer, action log, results reveal, and recap timeline. New games should mostly be assembled from the kit.

## Tech stack and key decisions

The default stack is Next.js on Vercel for the website plus a separate realtime room server, because Vercel's serverless functions can't hold open WebSocket connections. Confirm or swap each choice at kickoff after looking at the Avalon repo.

| Area             | Default choice                                                 | Why                                                                                                       | Revisit if                                                                                    |
| ---------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Language         | TypeScript, strict mode                                        | One language for rules, server, and UI                                                                    | Never                                                                                         |
| Web app          | Next.js (App Router) on Vercel                                 | Matches the existing Avalon deployment                                                                    | Avalon uses something else you prefer. Planned later move to Cloudflare Workers (see Hosting) |
| Styling          | Tailwind CSS                                                   | Fast mobile-first layouts                                                                                 | Avalon already has a design system                                                            |
| Realtime rooms   | PartyKit / Cloudflare Durable Objects (`partyserver`)          | One object per lobby holds state in memory and owns its WebSockets, which matches the lobby model exactly | Avalon already runs on Supabase, Firebase, or Socket.IO and works well                        |
| Room persistence | Durable Object storage                                         | Lobby survives server restarts; no database needed for v1                                                 | You want cross-lobby stats (add Postgres later)                                               |
| Validation       | Zod                                                            | Validate every incoming message and game options                                                          | Never                                                                                         |
| Tests            | Vitest for rules and server; Playwright for multi-player flows | Rules are pure functions and easy to test                                                                 | Never                                                                                         |
| Repo             | pnpm workspace monorepo                                        | Shared types between web, server, and games                                                               | Never                                                                                         |

Repo layout:

```
apps/web            Next.js site: home, catalog, lobby, game shell
apps/server         Room server: one Durable Object per lobby
packages/engine     GameModule contract, lobby state machine, protocol types, RNG
packages/ui         Shared components: cards, role reveal, voting, timer
packages/games/<id> One package per game: rules.ts, meta.ts, ui/, tests/
```

## Architecture

The server is authoritative: each lobby is one room on the server that holds the full game state, and phones only send actions and render what they receive.

A phone sends an action, the room validates it through the game module, saves the new state, then sends each player their own view and everyone the public lobby snapshot. Because full state never leaves the room, nobody can find hidden roles or cards in dev tools. A TV screen joins the same room as a display and receives only the public table view.

## Data model and message protocol

All state for a lobby lives in that lobby's room on the server. Clients hold no authoritative state; they render what the server sends.

```ts
type Player = {
  id: string; // stable per device, from the stored token
  name: string;
  connected: boolean;
  joinedAt: number;
};

type Lobby = {
  code: string; // 4 letters, no ambiguous characters (no I, L, O, 0, 1)
  hostId: string;
  players: Player[]; // seat order
  displays: number; // connected TV screens, not counted as players
  status: 'waiting' | 'in_game' | 'results';
  selectedGameId: string | null;
  gameOptions: Record<string, unknown>; // validated by the game's optionsSchema
  session: Session | null;
  history: { gameId: string; endedAt: number; summary: string }[];
  lastActivityAt: number;
};

type Session = {
  gameId: string;
  state: unknown; // the game's private full state, never sent to clients
  seq: number; // increments on every accepted action
  startedAt: number;
};
```

Lobby lifecycle:

1. `waiting`: players join, host picks a game and options, host taps Start once the player count fits.
2. `in_game`: the server runs the game module; each player receives only their own view.
3. `results`: everyone sees the outcome and full reveal (all roles, all hands).
4. Host taps Play again or Back to lobby. Either way the lobby returns to `waiting` with `selectedGameId` and `gameOptions` unchanged, so the same game is ready to go. Play again also starts it immediately if the player count still fits.

Client → server messages:

| Message                 | Sent by          | Payload                                                    |
| ----------------------- | ---------------- | ---------------------------------------------------------- |
| `join`                  | anyone           | name, token (if returning), and role: player or TV display |
| `setGame`               | host             | gameId                                                     |
| `setOptions`            | host             | options object                                             |
| `start`                 | host             | none                                                       |
| `action`                | player in game   | game-specific action, last seen seq                        |
| `playAgain`             | host, in results | none                                                       |
| `backToLobby`           | host, in results | none                                                       |
| `kick` / `transferHost` | host             | playerId                                                   |
| `leave`                 | anyone           | none                                                       |

Server → client messages:

| Message   | Content                                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------- |
| `lobby`   | public lobby snapshot (players, host, status, selected game, options, history)                                            |
| `view`    | this player's game view plus seq; players also receive the public table view, and TV displays receive only the table view |
| `results` | final result and full reveal                                                                                              |
| `error`   | code and human-readable message, for example `NOT_YOUR_TURN`                                                              |

Rules: validate every message with Zod, reject actions whose seq is stale, and reassign host to the longest-connected player if the host leaves for more than 60 seconds.

## Game module contract

Every game implements this one interface, so the platform can run any game without special cases. Adding a game means writing its rules functions and its UI component, nothing else.

```ts
interface GameMeta {
  id: string; // "avalon"
  name: string;
  tagline: string; // one line for the catalog card
  minPlayers: number;
  maxPlayers: number;
  category: 'social-deduction' | 'card' | 'board' | 'word';
  minutes: [number, number]; // typical length range
  complexity: 1 | 2 | 3;
}

interface SetupContext<Options> {
  playerIds: string[]; // in seat order
  options: Options;
  rng: Rng; // seeded, injected so tests are deterministic
}

interface GameModule<State, Action, View, TableView, Options> {
  meta: GameMeta;
  optionsSchema: ZodType<Options>;
  defaultOptions(playerCount: number): Options;
  validateOptions?(options: Options, playerCount: number): string | null; // error text or null

  setup(ctx: SetupContext<Options>): State;
  getPlayerView(state: State, playerId: string): View;
  getTableView(state: State): TableView; // public-only view for TV mode
  applyAction(state: State, playerId: string, action: Action, rng: Rng): State; // throws GameError if illegal
  getResult(state: State): GameResult | null; // null while in progress

  onTimer?(state: State, timerId: string): State; // optional, for timed phases
}

interface GameResult {
  winners: string[]; // player ids
  summary: string; // "Good wins: Merlin survived"
  reveal: unknown; // full state safe to show everyone at the end
  recap: RecapEvent[]; // ordered timeline of the game, secrets included
}
```

Each game exports two UI components built from the game kit: `PlayerScreen`, which receives `{ view, tableView, me, players, sendAction }`, and `TvScreen`, which receives `{ tableView, players }`. The player screen always renders the table view, so a game is fully playable with no TV. Neither ever sees full state, and both must pass the four-width screenshot check.

Rules for game modules:

- `setup`, `applyAction`, and `getResult` are pure: same input and same RNG seed give the same output.
- All randomness goes through the injected `rng`. Never call `Math.random`.
- `getPlayerView` and getTableView are the only gates on hidden information. Every game ships a test asserting that no player's view contains another player's secrets and the table view contains no secrets at all.
- Games register themselves in one registry file, which also feeds the catalog. Each game records recap events as it goes (round, actor, what happened, and the hidden truth behind it), so the recap is built from state, never reconstructed afterward.

## Phase 0: Project setup

Goal: an empty but deployed monorepo where the website can open a WebSocket to a lobby room.

- [ ] Read the existing Avalon repo and write a short summary: framework, how realtime works today, how roles and phases are modeled, and what looks reusable.
- [ ] Confirm or adjust the stack table above based on that summary, and note any changes in `CLAUDE.md`.
- [ ] Create a new repo `jackdaw-games` as a pnpm workspace with `apps/web`, `apps/server`, `packages/engine`, `packages/ui`, and `packages/games`.
- [ ] Set up TypeScript strict mode, ESLint, Prettier, and Vitest across the workspace with one root `pnpm test` and `pnpm lint`.
- [ ] Scaffold `apps/web` with Next.js, Tailwind, and a placeholder home page titled Jackdaw Games.
- [ ] Scaffold `apps/server` with one room class that accepts connections and echoes a message.
- [ ] Deploy web to Vercel and the room server to Cloudflare; store the server URL in an environment variable.
- [ ] Add a CI workflow that runs lint, type-check, and tests on every push.
- [ ] Write `CLAUDE.md`: repo layout, commands, the working rules from this plan, and the game module contract.

Design discovery, before any UI is built:

- [ ] Study Luminae Vigila and Avalon (repos and live sites) and write `STYLE_GUIDE.md` as described in the Visual style section.
- [ ] Set up the design tokens in `packages/ui` from the style guide.
- [ ] Mock up the home page, catalog, lobby, TV lobby, and an Avalon game screen at phone and TV sizes, then review them and iterate until approved.

Acceptance: the deployed home page connects to a room on the deployed server and shows the echoed message.

## Phase 1: Platform foundation

Goal: friends can create or join a lobby, pick a game from a filtered catalog, play a tiny test game, and land back in the lobby with that game still selected.

**1.1 Engine package**

- [ ] Define `GameModule`, `GameMeta`, `GameResult`, `GameError`, and the seeded `Rng` in `packages/engine`.
- [ ] Define the protocol message types and their Zod schemas, shared by web and server.
- [ ] Implement the lobby state machine as pure functions (`join`, `leave`, `setGame`, `start`, `applyGameAction`, `endGame`, `playAgain`, `backToLobby`) with unit tests, including a test that `endGame` then `backToLobby` keeps `selectedGameId` and `gameOptions`.
- [ ] Create the game registry that lists every module and exports catalog metadata.

**1.2 Room server**

- [ ] One room per lobby code. Generate 4-letter codes from an unambiguous alphabet and retry on collision.
- [ ] Wire messages to the lobby state machine, then broadcast `lobby` to everyone and a separate `view` to each player.
- [ ] Persist lobby state to room storage after every change so a server restart doesn't lose a game in progress.
- [ ] Handle disconnects: mark the player disconnected, keep their seat, and reassign host after 60 seconds away.
- [ ] Expire idle lobbies after 24 hours with a storage alarm.
- [ ] Rate-limit messages per connection to stop accidental spam loops.

**1.3 Identity and reconnect**

- [ ] On first visit, prompt for a nickname and generate a random player token stored in `localStorage`.
- [ ] Send the token on `join`; a matching token reclaims the same seat, even mid-game.
- [ ] Remember the last nickname so returning friends skip the prompt.

**1.4 Home and catalog pages**

- [ ] Home: Create lobby, Join with code, and Browse games.
- [ ] Catalog: a grid of game cards showing name, tagline, player range, length, and category.
- [ ] Filters for player count (a number stepper), category, length, and complexity, reflected in the URL so filtered views can be shared.
- [ ] Game detail sheet with a short how-to-play and a Start a lobby with this game button that creates the lobby with that game preselected.

**1.5 Lobby page (`/r/[code]`)**

- [ ] Player list in seat order with host badge and connection dots; host can kick and transfer host.
- [ ] Share controls: copy link, show code in large type, and a QR code for people in the same room.
- [ ] Game picker opened from the lobby, using the same catalog cards; games that don't fit the current count are grayed out with a reason like "Needs 5 to 10 players".
- [ ] Options panel rendered from the game's `optionsSchema`; non-hosts see options read-only.
- [ ] Start button, enabled only when the count fits and options are valid; disabled state explains why.
- [ ] Recent games strip from `history` (for example "Avalon: Evil won").

**1.6 Game shell and results**

- [ ] A shell that loads the selected game's UI component and passes `view`, `me`, `players`, and `sendAction`.
- [ ] Show `error` messages as brief toasts.
- [ ] Results screen with winners, summary, full reveal, and the recap timeline, then host buttons Play again (primary) and Back to lobby. Non-hosts see "Waiting for host".
- [ ] After either button, the lobby shows the same game selected with the same options.

**1.7 Test game**

- [ ] Build a throwaway 2 to 10 player game (Rock Paper Scissors with simultaneous secret picks) to prove the whole pipeline, including hidden information and a TV screen, before Avalon.
- [ ] Playwright test with three browser contexts: create lobby, join twice, play a round, Play again, confirm the same game is selected.

**1.8 TV mode and responsive shell**

- [ ] Study Avalon's TV mode and phone screens, and write down the patterns to copy: layouts, how the TV pairs with a lobby, and what it shows in each phase.
- [ ] Set up design tokens (colors, type scale, spacing, radii) and the fluid `clamp()` scale in `packages/ui`, following the approved style guide.
- [ ] Add the `/tv/[code]` route and a Show on TV button in the lobby; the TV joins as a display and takes no seat.
- [ ] TV lobby screen: huge lobby code, QR code, player list with join animations, and the selected game.
- [ ] Game shell renders `TvScreen` with the table view on displays and `PlayerScreen` on phones; TV switches to the results reveal when a game ends and back to the lobby screen after.
- [ ] Make every Phase 1 page responsive at 375, 768, 1280, and 1920px wide, and add Playwright screenshot tests at those widths.

Acceptance: three phones can join one lobby by QR code, play the test game twice in a row with one tap between rounds, a refreshed phone rejoins its seat, and a laptop plugged into a TV shows the lobby and the test game's table view.

## Phase 2: Port Avalon

Goal: Avalon runs inside Jackdaw Games with full parity to play-avalon.vercel.app, built on the module contract. The old app stays live until this phase passes a real game night.

- [ ] Write a parity checklist from the existing app: every role, option, phase, screen, and edge case it supports today.
- [ ] Model state: seats, roles, leader index, quest number, proposed team, votes, failed-proposal count, quest results, Lady of the Lake holder (if supported), and phase.
- [ ] Implement `setup` with the standard good/evil split per player count (5 to 10) and role assignment through the seeded RNG.
- [ ] Implement actions by phase: propose team, approve/reject vote, quest success/fail card, assassination target, and Lady of the Lake check if the existing app has it.
- [ ] Enforce rules: team size per quest and player count, two fails needed on quest 4 with 7+ players, evil wins after five rejected proposals in a row, good players can only play success.
- [ ] Implement `getPlayerView` for each role's knowledge: Merlin sees evil except Mordred, Percival sees Merlin and Morgana without knowing which is which, evil sees each other except Oberon, Oberon sees no one.
- [ ] Votes are hidden until everyone has voted; quest cards are shuffled and only counts are revealed.
- [ ] Options schema for which special roles are in play, with validation that the role mix fits the player count.
- [ ] Port the UI into `packages/games/avalon/ui`, reusing existing components where possible, and pull the role reveal and voting widgets into `packages/ui` for later games.
- [ ] Tests: a full scripted game for each win condition, and a knowledge test per role asserting exactly what each view reveals.
- [ ] Playtest with the group, then fix anything from the parity checklist that's missing.

TV mode and the game kit:

- [ ] Port Avalon's existing TV mode as its `TvScreen`, driven by `getTableView`: quest track, current leader, proposed team, vote results once revealed, quest results, and the rejected-proposal counter.
- [ ] Keep Avalon's dramatic moments on the TV: vote reveals, quest card flips, and the assassination and final role reveal. Add a recap: every proposed team, how each player voted, and each quest's result with who played fail cards.
- [ ] Polish the player screen at all four widths, using tablet and laptop space for the quest track beside the player's own controls. On phones, the quest track, current leader, and vote results are always visible.
- [ ] Extract the game kit from Avalon into `packages/ui` (player and TV layouts, phase banner, role reveal, voting, timer, action log, results reveal, recap timeline), then rebuild Avalon on the kit to prove it works.
- [ ] Write a short `GAME_KIT.md` describing each kit piece and when to use it, so later games follow the Avalon pattern.

Acceptance: a full 7-player game with Merlin, Percival, Morgana, and Mordred plays start to finish, Play again starts a second game with the same roles, the TV shows the whole game without leaking anything, and nobody can find hidden info in dev tools.

## Phase 3: Secret Hitler, the second game

Goal: a Secret Hitler that matches the official online version for 5 to 10 players, then goes beyond it with games of more than 10 players and a full post-game recap. It reuses the Avalon kit heavily, so it should be quick to build.

Why Secret Hitler: the group already plays it often, the official online version caps at 10 players and has no recap, and having it inside the lobby means going from Avalon to Secret Hitler without switching sites.

License:

- [ ] Secret Hitler is released under CC BY-NC-SA 4.0, which allows a free, non-commercial version with attribution. Credit its creators on the rules page and use original art rather than copying official assets.

Rules for 5 to 10 players (official):

- [ ] Roles by player count: 5 = 3 Liberals, 1 Fascist, Hitler; 6 = 4, 1, Hitler; 7 = 4, 2, Hitler; 8 = 5, 2, Hitler; 9 = 5, 3, Hitler; 10 = 6, 3, Hitler. Fascists know each other and Hitler; Hitler knows the Fascists only in 5 and 6 player games.
- [ ] Policy deck of 6 Liberal and 11 Fascist; reshuffle the discards in when fewer than 3 remain.
- [ ] Round flow: the presidency rotates; the president nominates a chancellor; everyone votes Ja or Nein at once and votes are revealed together; the president draws 3 policies and discards 1; the chancellor enacts 1 of the remaining 2.
- [ ] Term limits: the last elected chancellor can't be nominated, nor the last president unless only 5 players remain.
- [ ] Election tracker: 3 failed elections in a row enact the top policy, ignore its power, and reset term limits.
- [ ] Presidential powers on the Fascist track: 5 to 6 players get a policy peek at 3; 7 to 8 get investigate at 2 and special election at 3; 9 to 10 get investigate at 1 and 2 and special election at 3; every board has execution at 4 and 5. Veto unlocks after 5 Fascist policies.
- [ ] Win conditions: Liberals win with 5 Liberal policies or by executing Hitler; Fascists win with 6 Fascist policies or by electing Hitler chancellor after 3 Fascist policies.

Going beyond the official version:

- [ ] Games of 11 to 15 players: confirm house rules with the group, then encode them as options with sensible defaults per count (number of Fascists, which power board, deck size). Validate that every option set keeps Fascists outnumbered.
- [ ] Full recap after every game: each government with every player's vote, the policies actually drawn, discarded, and enacted (so the group can check everyone's spoken claims against the truth), investigation results, special elections, executions, vetoes, and the final role reveal. Shown on TV and phones and saved to lobby history.

Screens and views:

- [ ] Player view: your role and known teammates, who's eligible to nominate, policy cards only for the president and chancellor during their session, investigation results only for the president who investigated, and everything the TV shows (both policy tracks, election tracker, votes, and powers).
- [ ] TV screen: both policy tracks, election tracker, president and chancellor nominee, the simultaneous vote reveal, policy enactment, deck and discard counts, and announcements of presidential powers.
- [ ] Build both screens from the Avalon kit (role reveal, voting, phase banner, results and recap) and check them at all four widths.
- [ ] Tests for every power, term limits, the election tracker, veto, each win condition, the 11+ player options, and the hidden-info view tests for players and TV.

Acceptance: a 10-player game plays by the official rules, 12- and 15-player games run on the house rules, the recap shows the policies actually drawn, discarded, and enacted for every government, and Play again keeps Secret Hitler selected with the same options.

## Phase 4: Codenames

Goal: a team word game for 4 to 15 players that shows off TV mode: the word grid lives on the big screen while only spymasters see the color key on their phones. It's also the first game with two competing teams taking turns, which stretches the platform beyond Avalon's structure.

How it plays: two teams each have a spymaster who sees which of 25 words belong to their team. The spymaster gives a one-word clue and a number, and their teammates guess words. Guessing an opponent's word or a neutral word ends the turn, and guessing the assassin loses the game.

Rules:

- [ ] Board of 25 words from an original word list (at least 400 words; don't copy the official cards). Key: the starting team has 9 words, the other 8, plus 7 neutral and 1 assassin.
- [ ] Teams: the host can randomize or let players pick; options to rotate spymasters each game and to balance team sizes.
- [ ] Clue: the spymaster types one word and a number (0 to 9, or unlimited). Warn, but don't block, if the clue matches a word on the board.
- [ ] Guessing: operatives may guess up to the clue's number plus one. Any operative taps a word to suggest it (teammates see the suggestion); a guess locks in when a majority of the team taps it or one player holds to confirm. A Pass button ends the turn.
- [ ] Turn ends on a wrong-colored guess, a pass, or hitting the guess limit. The game ends when a team finds all its words or someone guesses the assassin.
- [ ] Option: an optional turn timer for the clue and guessing phases.

Screens:

- [ ] Spymaster phone: the full grid with the color key, the clue entry, and the team's live suggestions.
- [ ] Operative phone: the grid with only revealed colors, the current clue, guesses left, and the team's suggestions.
- [ ] TV: the large grid with revealed colors, the current clue and team, words remaining per team, and a flip animation for each guess. The grid is on every phone too, readable at 375px wide with words that shrink to fit and tap-to-zoom, along with the clue and words remaining, so the game works fully without a TV. On a laptop or tablet the grid fills the screen.

Recap: every clue in order, the words guessed for each clue, which guesses were wrong, and the final board with the full key revealed.

- [ ] Tests for guess limits, turn ending, the assassin, win detection, and hidden-info view tests (operatives and TV never receive unrevealed colors).

Acceptance: a 10-player game with two teams plays to a win on the TV, spymasters and operatives each see only what they should, and Play again starts a new board with the same team options.

## Phase 5: Werewolf

> Dropped by Lesia, 2026-10-24. Kept for reference.

Goal: classic Werewolf for 6 to 15 players where the app is the moderator, so nobody has to sit out to run the game. This is the first game with player elimination and timed night and day phases.

How it plays: at night, the werewolves secretly pick someone to kill while special roles use their powers. By day, everyone learns who died, discusses, and votes to eliminate a suspect. Villagers win by eliminating every werewolf; werewolves win when they equal or outnumber everyone else.

Rules:

- [ ] Roles: Werewolf, Villager, Seer (checks one player's team each night), and Doctor (protects one player each night), with optional Witch (one save potion, one kill potion) and Hunter (takes someone down when eliminated).
- [ ] Default werewolf count by players: 2 for 6 to 8, 3 for 9 to 11, and 4 for 12 to 15. The host can adjust counts and toggle optional roles, with validation that the mix is playable.
- [ ] Night: werewolves see each other and must agree on one target (a majority vote among wolves, with a timer); then the Seer, Doctor, and Witch act in turn.
- [ ] Every living player taps something during every night, with villagers given a harmless dummy task, so the sound of tapping never reveals who has a power.
- [ ] Day: announce deaths, run a discussion timer (host-adjustable, with an option to end early), then nominations and a simultaneous vote to eliminate. Ties mean no elimination by default, with an option for a revote between tied players.
- [ ] Option to reveal or hide an eliminated player's role.
- [ ] Eliminated players become spectators who can see all roles but get a clear "no talking" reminder.

Screens:

- [ ] Phone: your role card (tap to reveal, so nobody glances at it), your night action, your day vote, and a list of living players.
- [ ] TV as narrator: "Night falls" and "Morning comes" scenes, deaths announced, the discussion timer, vote reveals, and living players. Optional narration through the TV's speakers.
- [ ] Every phone also shows the announcements, deaths, timer, and vote results, and without a TV the host's phone can play the narration.

Recap: every night's actions (wolf target, doctor save, seer checks and results, witch potions), every day's votes and eliminations, and the full role reveal.

- [ ] Tests for each role's power, the doctor saving the wolves' target, Hunter and Witch edge cases, win conditions, and hidden-info view tests for living players, spectators, and the TV.

Acceptance: a 12-player game runs from first night to a win without a human moderator, nobody can tell from their phone who has night powers, and the recap reconstructs every night correctly.

## Phase 6: Wavelength

Goal: a party guessing game for 4 to 15 players built around a big dial on the TV. It's the first game with a shared, continuously moving control that several phones adjust at once.

How it plays: each round, one player (the psychic) secretly sees a target somewhere on a spectrum between two opposites, like Cold to Hot. They give a clue that fits that spot, and their team turns the dial to where they think the target is. Points depend on how close the dial lands.

Rules:

- [ ] Spectrum cards from an original list of at least 150 opposite pairs (don't copy the official cards), plus an option for the group to add its own pairs.
- [ ] Two teams; the psychic role rotates through each team. The psychic can choose between two spectrum cards each round.
- [ ] The hidden target is a random position on a 0 to 100 scale, with scoring bands: 4 points for the center, 3 for either side of it, 2 for the outer edges, 0 outside.
- [ ] Guessing: teammates drag a shared dial on their phones, with every movement synced live, and lock in by majority or a hold-to-confirm.
- [ ] Then the other team guesses whether the target is left or right of the dial for 1 bonus point.
- [ ] First team to 10 points wins. Option: a cooperative mode where everyone plays together for a high score over a set number of rounds.

Screens:

- [ ] Psychic phone: the spectrum, the target zone, and clue entry.
- [ ] Team phone: the spectrum and the shared dial with a big lock-in button; the other team sees the same live dial plus left and right buttons. Every phone shows the reveal and scoreboard too.
- [ ] TV: the large dial and spectrum, the clue, the live dial movement, a dramatic reveal of the target and points, and the scoreboard.

Recap: every round's spectrum, clue, psychic, target position, final dial position, left/right call, and points.

- [ ] Tests for scoring bands, the bonus guess, team rotation, win detection, and hidden-info view tests (only the psychic receives the target before the reveal).

Acceptance: a 10-player game played on the TV feels smooth while several people drag the dial at once, and only the psychic's phone ever has the target before the reveal.

## Phase 7: Spyfall

> Dropped by Lesia, 2026-10-24. Kept for reference.

Goal: a fast social deduction game for 3 to 15 players with short rounds, a good warm-up or filler between longer games.

How it plays: everyone except the spy is secretly shown the same location, like a submarine or a hospital, and their own role there. Players take turns asking each other questions about the location. Non-spies try to prove they know it without giving it away; the spy tries to blend in and figure out where they are.

Rules:

- [ ] Locations from an original list of at least 30, each with 6 or more roles (for example, Hospital: Surgeon, Nurse, Patient).
- [ ] One spy for 3 to 10 players; an option for two spies (who don't know each other) at 11 to 15.
- [ ] Rounds last 8 minutes by default (host-adjustable). The app shows whose turn it is to ask; the person answering asks next, and can't ask back the person who just asked them.
- [ ] Accusations: once per round, any player can call a vote on a suspect. If everyone except the accused agrees, the round ends and the suspect is revealed.
- [ ] At any time, the spy can stop the round and guess the location from the list.
- [ ] When time runs out, everyone votes on a suspect.
- [ ] Scoring across several rounds, following the official point values, with a running scoreboard.

Screens:

- [ ] Phone: your location and role (tap to reveal), or "You are the spy" with the location list and a Guess button. Every phone also shows the timer, whose turn it is to ask, accusation votes, and the scoreboard, and everyone has the full location list to cross off privately.
- [ ] TV: the round timer, whose turn it is to ask, the full list of possible locations, accusation votes, and the scoreboard.

Recap: each round's location, who was the spy, accusations and votes, and the spy's guess.

- [ ] Tests for accusation outcomes, the spy's guess, the timer running out, two-spy games, and hidden-info view tests (the spy and the TV never receive the location).

Acceptance: a 5-round game for 8 players runs smoothly, the spy's phone and the TV never contain the location, and Play again starts a new round set with the same options.

## Phase 8: Polish, then Phase 9: more games

Phase 8 makes game night feel smooth; Phase 9 is a repeatable loop for adding games.

Phase 8 checklist:

- [ ] Branding: Jackdaw name, a jackdaw logo and favicon, a consistent color palette, dark mode, and a branded TV idle screen.
- [ ] Spectators: people who join mid-game watch with a public-only view and are seated at the next Play again.
- [ ] Lobby history and simple stats per lobby: games played and wins per player.
- [ ] Lightweight reactions (a few emoji) visible to everyone during games.
- [ ] Sound and vibration cues for "your turn" and "vote now", with a mute toggle; game sound effects play from the TV when one is connected.
- [ ] Rules page per game, linked from the catalog and the in-game menu.
- [ ] Error boundary around the game shell so a UI bug in one game can't break the lobby.
- [ ] Accessibility pass: tap targets at least 44px, readable contrast, and no information carried by color alone.

Phase 9 loop for each new game:

1. Write `meta.ts` and the options schema.
2. Write rules as pure functions with tests, including the hidden-info view test.
3. Build the player screen and TV screen from the game kit, following the Avalon pattern, and check both at all four widths.
4. Register the game; it appears in the catalog automatically.
5. Playtest with the group, then fix.

Keep prioritizing games the group doesn't own physically. Card games the group already owns, like Fish and Cabo, come later once the platform is mature.

## Domains, hosting, and migrating play-avalon

Recommendation: one codebase and one main domain for Jackdaw Games, with play-avalon.vercel.app kept alive as a shortcut into it rather than a separate app.

Why one home:

- The persistent lobby is the main feature. If Avalon lives on its own domain with its own rooms, friends can't play Avalon and then Secret Hitler without everyone switching links.
- One codebase means a fix to joining, reconnecting, or the results screen fixes every game at once.

Why keep play-avalon anyway:

- Existing links and bookmarks keep working.
- It can serve as a standalone Avalon entry point: visiting it creates a Jackdaw lobby with Avalon preselected, branded as Avalon, so it still feels like its own thing.

Migration steps:

1. Keep the current Avalon app untouched while Phases 0 to 2 are built.
2. Once Avalon passes a real game night on Jackdaw, point play-avalon at Jackdaw with a redirect to `/play/avalon`, which creates a lobby with Avalon selected.
3. Retire the old Avalon code after a few weeks without issues.

Other notes:

- When it's time for a custom domain, buy one domain for all projects and use subdomains (games., notes., calendar.), through Cloudflare Registrar, which sells at wholesale price with no renewal markup.
- Avalon, Codenames, Wavelength, Spyfall, and similar commercial titles are trademarks, and their word lists and cards are copyrighted, which is why this plan writes original content for each. Private play with friends is low-risk, but if the site ever goes public, give those games original names and art. Secret Hitler is covered by its CC BY-NC-SA 4.0 license as long as the site stays non-commercial and credits its creators.

Hosting now, and a later move to Cloudflare:

For now everything is hosted on Vercel, but the code must stay portable so the whole platform can move to Cloudflare later (website on Cloudflare Workers, rooms on Durable Objects, domain on Cloudflare Registrar) without a rewrite.

- One catch to settle at kickoff: Vercel functions can't hold open WebSocket connections, so the realtime room server can't run on Vercel itself. Check how Avalon handles realtime today. If it already works on Vercel with a service you like, keep that approach behind the transport interface below; otherwise run only the room server on Cloudflare's free plan from the start, which is also the end state.

Portability rules for Claude Code:

- [ ] No hard-coded domains anywhere. Every URL (site, room server, share links, QR codes, TV links) comes from environment variables such as `PUBLIC_SITE_URL` and `ROOM_SERVER_URL`.
- [ ] No Vercel-only features in the app (Vercel KV, Blob, Edge Config, `@vercel/*` packages) unless wrapped in a small adapter with a Cloudflare equivalent noted.
- [ ] Realtime goes through a `RoomTransport` interface, and room persistence through a `RoomStorage` interface, so the hosting provider can change without touching game or lobby code.
- [ ] Server code uses web-standard APIs (`fetch`, `crypto.subtle`, `Request`/`Response`) and avoids Node-only modules like `fs` or native add-ons, so it runs on the Cloudflare Workers runtime.
- [ ] A CI job also builds the website for Cloudflare Workers with the OpenNext Cloudflare adapter, so incompatibilities are caught as they're introduced rather than at migration time.
- [ ] Keep a short `MIGRATION.md` listing every environment variable, external service, and step needed to switch hosts.

Migration steps, when the time comes:

1. Buy the domain through Cloudflare Registrar.
2. Deploy the website to Cloudflare Workers next to the room server and connect the subdomain.
3. Run a full game night on the new address before switching anything off.
4. Keep a tiny Vercel project that redirects the old vercel.app addresses (including play-avalon.vercel.app) to the new domain, so old links keep working.

Cost: the domain is the only required expense (roughly $10 a year for a .com). The Cloudflare free plan includes Durable Objects with a daily request limit that counts WebSocket messages, which a friend group won't approach as long as messages stay lean (for example, throttle dial-drag updates in Wavelength).

## Kickoff checklist and open questions

Have these ready before starting Phase 0:

- [ ] Access to the Avalon repo on the machine where Claude Code runs.
- [ ] A Vercel account (existing) and a Cloudflare account for the room server.
- [ ] A GitHub repo named `jackdaw-games`.
- [ ] A decision on where the realtime room server runs for now (see Hosting). The custom domain waits until the Cloudflare move.

Open questions to answer at kickoff:

- What does the current Avalon app use for realtime, and does it already handle reconnecting?
- Which optional Avalon roles and variants does your group actually use?
- Should anyone be able to change the game, or only the host?
- Do you want lobby history to persist long term, or reset when the lobby expires?
