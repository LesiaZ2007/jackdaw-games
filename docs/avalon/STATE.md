# Avalon in Jackdaw: state, actions and views

> **Superseded (2026-10-13).** Lesia decided to link the live Avalon app instead of porting it;
> see `LINK.md`. Kept as a map of the Avalon app's behaviour and source.

A design for `packages/games/avalon`, mapped onto the game module contract in
`packages/engine/src/contract.ts`. It implements everything in `PARITY.md`. This is a design
document only; no code exists yet. Where a choice depends on a change Lesia hasn't approved, it is
marked **Needs Lesia** and the design says what happens without it.

Source references (`lib/game.js` and so on) are to the current app at
`C:\Users\KBITK\OneDrive\Desktop\avalon`.

## Package layout

```
packages/games/avalon/
  src/meta.ts          GameMeta
  src/roles.ts         ROLES, QUEST_SIZES, EVIL_COUNT, failsNeeded, lineup (ported from lib/rules.js)
  src/rules.ts         optionsSchema, actionSchema, setup, applyAction, getResult
  src/views.ts         getTableView, getPlayerView, knowledge (the two hidden-info gates)
  src/recap.ts         RecapEvent builders
  src/index.ts         the GameModule
  src/*.test.ts        rules, knowledge, leak and scripted-game tests (from scripts/simulate.mjs)
  src/ui/              PlayerScreen, TvScreen, Lobby (round table), Reveal, Tutorial, art, CSS
```

## Meta

```ts
meta = {
  id: 'avalon',
  name: 'Avalon',
  tagline: 'Loyal knights and hidden traitors.',
  minPlayers: 5,
  maxPlayers: 15,
  category: 'social-deduction',
  minutes: [30, 60],
  complexity: 2,
};
```

## Options

The current app nests `custom` and `timers` (`lib/rules.js:137-143`). Jackdaw's generic options
summary (`optionsSummary` in `apps/web/app/r/[code]/next-up.tsx`) and stats read options as flat
keys, so the port flattens them. The values and defaults are unchanged.

```ts
optionsSchema = z.object({
  mode: z.enum(['classic', 'full', 'custom', 'plain']).describe('Roles'),
  merlin: z.boolean().describe('Merlin & Assassin'), // custom only
  percival: z.boolean(), //                              custom only
  morgana: z.boolean(), //                               custom only
  mordred: z.boolean(), //                               custom only
  oberon: z.boolean(), //                                custom only
  lady: z.boolean().describe('Lady of the Lake'),
  talkTimer: z.union([z.literal(0), z.literal(120), z.literal(180), z.literal(300)]),
  voteTimer: z.union([z.literal(0), z.literal(30), z.literal(60), z.literal(120)]),
});

defaultOptions = () => ({
  mode: 'classic',
  merlin: true,
  percival: true,
  morgana: true,
  mordred: false,
  oberon: false,
  lady: false,
  talkTimer: 0,
  voteTimer: 0,
});

validateOptions = () => null; // the app never rejects a mix; it drops what doesn't fit
```

- `lineup(options, n)` is ported as is (`lib/rules.js:146-177`) and is shared by `setup` and the
  lobby's deal preview, so the preview always matches the deal.
- Timer options stay in the schema even without a clock, so turning them on later needs no
  options migration. Without the clock (**Needs Lesia** 1) the Lobby hides them.

## State

`State` is plain JSON (it lives in the lobby document) and is never sent to a client.
`applyAction` returns a new object (`structuredClone` then mutate the clone, which keeps the port
close to `lib/game.js`).

```ts
type Role =
  'merlin' | 'percival' | 'servant' | 'assassin' | 'morgana' | 'mordred' | 'oberon' | 'minion';
type Side = 'good' | 'evil';
type Phase = 'team' | 'vote' | 'quest' | 'lady' | 'assassin' | 'over';

interface Quest {
  size: number;
  failsNeeded: 1 | 2;
  result: 'success' | 'fail' | null;
  fails: number | null; //  public once the quest resolves
  team: string[] | null; // the team that went, public once the quest resolves
}

interface Proposal {
  quest: number; // quest index 0–4
  leader: string;
  team: string[]; // seat order
  votes: Record<string, boolean>; // SECRET mid-game except while "on the seats"
  yes: number;
  approved: boolean;
}

interface LadyCheck {
  holder: string;
  target: string;
  quest: number; // the quest it followed
  evil: boolean; // SECRET: holder only, everyone at the end
}

type AvalonEvent =
  | { id: number; type: 'start' }
  | { id: number; type: 'vote'; proposal: number } // index into proposals
  | { id: number; type: 'quest'; quest: number };

interface AvalonState {
  options: AvalonOptions;
  seats: string[]; //                       SetupContext.playerIds, seat order
  roles: Record<string, Role>; //           SECRET
  lineup: { good: Role[]; evil: Role[]; dropped: Role[] }; // public (the chronicle shows it)
  phase: Phase;
  phaseSeq: number; //                      +1 on every phase change (keys the timer and overlays)
  phaseAt: number | null; //                server time the phase began (Needs Lesia 1), else null
  leaderIdx: number;
  questIdx: number;
  rejects: number; //                       in a row; reset on approval
  quests: Quest[]; //                       five, sized at setup
  draft: string[]; //                       leader's picks in progress (public)
  team: string[]; //                        the proposed team (public from the vote on)
  votes: Record<string, boolean>; //        SECRET: the vote in progress
  cards: Record<string, 'success' | 'fail'>; // SECRET: the quest in progress
  proposals: Proposal[];
  lady: { holder: string; held: string[]; checks: LadyCheck[] } | null;
  assassinTarget: string | null;
  winner: Side | null;
  reason: string | null;
  event: AvalonEvent | null;
  recap: RecapEvent[];
}
```

Differences from the current room shape (`lib/game.js:177-196`):

- `history` is renamed `proposals`, and `yes` is stored rather than derived.
- The event stores an index instead of copying the votes, so the table view decides what's
  public (this fixes the event leak in `PARITY.md`, "Surprises").
- `phaseSeq` is new, so the shell and the UI can key moments without a clock.
- `recap` is new, appended as the game goes (contract: the recap is built from what happened).
- `options` is kept in the state so views can show the timer lengths.
- `winner`, `reason` and `assassinTarget` are unchanged.

### Setup

```
setup({ playerIds, options, rng }):
  n = playerIds.length            (5–15; the lobby has already checked min/max)
  deal = lineup(options, n)
  dealt = rng.shuffle([...deal.good, ...deal.evil])
  roles = playerIds[i] → dealt[i]
  leaderIdx = rng.int(n)
  lady = options.lady ? { holder: seats[(leaderIdx - 1 + n) % n], held: [that], checks: [] } : null
  quests = QUEST_SIZES[n].map((size, i) => ({ size, failsNeeded: failsNeeded(n, i), ... }))
  phase 'team', phaseSeq 1, event { id: 1, type: 'start' }
  recap: [{ text: 'Roles dealt. Bran leads quest I.', secret: 'Ana was Merlin, …' }]
```

All randomness goes through the injected `Rng` (the lint rule bans `Math.random`).

## Actions

```ts
actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('draft'), team: z.array(z.string()).max(6) }),
  z.object({ type: z.literal('propose'), team: z.array(z.string()).max(6) }),
  z.object({ type: z.literal('vote'), approve: z.boolean() }),
  z.object({ type: z.literal('quest'), success: z.boolean() }),
  z.object({ type: z.literal('lady'), target: z.string() }),
  z.object({ type: z.literal('assassinate'), target: z.string() }),
]);
```

| Action        | Phase    | Allowed when                                             | GameError code                                         | Effect (from `lib/game.js`)                                       |
| ------------- | -------- | -------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------- |
| `draft`       | team     | caller is leader                                         | `NOT_LEADER`                                           | `draft` = unique seated ids, capped at size (298-305)             |
| `propose`     | team     | caller is leader; exactly `size` unique seated ids       | `NOT_LEADER`, `TEAM_SIZE`                              | `team` in seat order, clear draft and votes, phase vote (384-395) |
| `vote`        | vote     | caller is seated                                         | `NOT_SEATED`                                           | set vote; when all are in, resolve (397-403, 209-237)             |
| `quest`       | quest    | caller on team, hasn't played; good can't fail           | `NOT_ON_QUEST`, `ALREADY_PLAYED`, `LOYAL_MUST_SUCCEED` | set card; when all are in, resolve (405-414, 239-266)             |
| `lady`        | lady     | caller holds the Lady; target seated, not self, not held | `NOT_LADY_HOLDER`, `BAD_TARGET`, `ALREADY_HELD`        | record check, pass the Lady, phase team (416-428)                 |
| `assassinate` | assassin | caller is the Assassin; target seated and good           | `NOT_ASSASSIN`, `TARGET_MUST_BE_GOOD`                  | set target, finish (430-439)                                      |

Any action in the wrong phase throws `WRONG_PHASE` ("That move is not available right now.").
Messages keep the app's wording (`PARITY.md`, "Phases and actions").

- **Resolving a vote:** push the proposal, set `event = { type: 'vote', proposal }`. If approved,
  reset rejects and go to quest. Otherwise add a rejection; at five, finish evil ("Five teams in a
  row were rejected."); else move the leader and go to team.
- **Resolving a quest:** count fails, set result, `fails` and `team`, and set
  `event = { type: 'quest', quest }`. Three fails: finish evil. Three successes: go to assassin if
  an Assassin is seated, else finish good. Otherwise move to the next quest and leader, and go to
  lady after quests II–IV when the Lady is on, else to team.
- **Finishing** sets `phase 'over'`, `winner`, `reason`. Scoring is the platform's job (`endGame`
  records standings), so `finish` no longer touches scores.
- **Moving to a new phase** bumps `phaseSeq` and sets `phaseAt` (with the clock). A vote doesn't
  restart the clock; a proposal does (`scripts/simulate.mjs:197-211`).

### Actions handled by the platform instead

| Avalon `type`                   | Jackdaw                                                      |
| ------------------------------- | ------------------------------------------------------------ |
| `chat`                          | `chat`                                                       |
| `avatar`                        | `setAvatar`                                                  |
| `settings`                      | `setOptions` (whole options object, host-only, waiting-only) |
| `start`                         | `start` / `playAgain`                                        |
| `kick`, `leave`                 | `kick`, `leave`                                              |
| `resetScores`                   | `resetScores`                                                |
| `lobby` (after the game)        | `backToLobby`                                                |
| `lobby` (ending early)          | **Needs Lesia** 2: `endGame`                                 |
| `rejoinCode` (for someone else) | **Needs Lesia** 3: `createRejoinCode { playerId? }`          |
| `react`                         | **Needs Lesia** 4: platform `react`                          |
| `theme`                         | Dropped: the device's day/dark choice                        |

The draft is an ordinary game action. Each one bumps `seq` and the lobby version, like the
current app. The 200 ms debounce keeps it well under the runtime's 30 posts per 10 s.

## Views

Both views are built in `views.ts`, which is the only file allowed to read `roles`, `votes`,
`cards` and `lady.checks[].evil`. The leak tests run every phase of every scripted game through
both views and assert the JSON contains nothing it shouldn't.

### "On the seats"

The latest proposal's individual votes are public while the seats show them:

```
onSeats = phase === 'quest' || (phase === 'team' && rejects > 0)
```

At any other time mid-game, proposals carry `yes` and `approved` but not `votes`
(`lib/game.js:530-539`). The vote event's votes follow the same rule, plus the moment it fires:
the event is public in full only while `phaseSeq` hasn't moved past the phase it ended.

### Table view (TV, and every phone)

```ts
interface AvalonTableView {
  phase: Exclude<Phase, 'over'>; // the lobby moves to results when the game ends
  phaseSeq: number;
  phaseAt: number | null; // Needs Lesia 1
  timers: { talk: number; vote: number };
  seats: string[];
  lineup: { good: Role[]; evil: Role[]; dropped: Role[] };
  leader: string;
  questIdx: number;
  rejects: number;
  quests: Quest[];
  draft: string[]; //  team phase only, else []
  team: string[];
  voted: string[]; //  vote phase only, else []
  played: string[]; // quest phase only, else []
  proposals: {
    quest: number;
    leader: string;
    team: string[];
    yes: number;
    approved: boolean;
    votes?: Record<string, boolean>;
  }[]; // votes only on the latest, only while onSeats
  lady: {
    holder: string;
    held: string[];
    checks: { holder: string; target: string; quest: number }[];
  } | null;
  evilRevealed: string[] | null; // assassin phase only
  assassin: string | null; //      assassin phase only
  event: PublicEvent | null;
}

type PublicEvent =
  | { id: number; type: 'start' }
  | {
      id: number;
      type: 'vote';
      quest: number;
      leader: string;
      team: string[];
      votes: Record<string, boolean>;
      approved: boolean;
      rejects: number;
    } // only while fresh
  | {
      id: number;
      type: 'quest';
      quest: number;
      size: number;
      fails: number;
      result: 'success' | 'fail';
      failsNeeded: 1 | 2;
    };
```

### Player view (one seated player)

```ts
interface AvalonPlayerView extends AvalonTableView {
  myRole: Role;
  known: { id: string; kind: 'evil' | 'merlin'; label: 'Evil' | 'Merlin' | 'Merlin or Morgana' }[];
  myVote: boolean | null; //   vote phase only
  myCard: 'success' | 'fail' | null; // quest phase only
  myLadyChecks: { target: string; quest: number; evil: boolean }[]; // checks I made
}
```

Watchers (players who joined mid-game) aren't seated, so the lobby gives them only the table view.
That matches the TV.

### Knowledge

`known` for each role. "Sees" means the player appears in `known` with the label shown; nobody
ever learns another player's exact role mid-game. From `lib/game.js:467-480`.

| Viewer ↓ / sees →     | Merlin                       | Percival | Servant | Assassin | Morgana           | Mordred | Oberon | Minion |
| --------------------- | ---------------------------- | -------- | ------- | -------- | ----------------- | ------- | ------ | ------ |
| **Merlin**            | –                            | ·        | ·       | Evil     | Evil              | ·       | Evil   | Evil   |
| **Percival**          | Merlin / Merlin or Morgana ¹ | –        | ·       | ·        | Merlin or Morgana | ·       | ·      | ·      |
| **Loyal Servant**     | ·                            | ·        | ·       | ·        | ·                 | ·       | ·      | ·      |
| **Assassin**          | ·                            | ·        | ·       | –        | Evil              | Evil    | ·      | Evil   |
| **Morgana**           | ·                            | ·        | ·       | Evil     | –                 | Evil    | ·      | Evil   |
| **Mordred**           | ·                            | ·        | ·       | Evil     | Evil              | –       | ·      | Evil   |
| **Oberon**            | ·                            | ·        | ·       | ·        | ·                 | ·       | –      | ·      |
| **Minion of Mordred** | ·                            | ·        | ·       | Evil     | Evil              | Evil    | ·      | Evil ² |

· = not seen. ¹ "Merlin or Morgana" when Morgana is in the game, otherwise "Merlin".
² Other Minions, not yourself.

Also public to everyone, at set times:

| What                               | Who sees it            | When                              |
| ---------------------------------- | ---------------------- | --------------------------------- |
| Every evil player (Oberon too)     | Everyone, TV included  | Assassin phase                    |
| Who the Assassin is                | Everyone, TV included  | Assassin phase                    |
| A Lady result (good/evil)          | The holder who made it | From the check on                 |
| Your own vote                      | You                    | Vote phase                        |
| Your own card                      | You                    | Quest phase                       |
| Latest proposal's individual votes | Everyone               | While on the seats                |
| Fail count of a quest (never who)  | Everyone               | Once it resolves                  |
| All roles, votes and Lady results  | Everyone               | Game over (the result's `reveal`) |

## Result

`getResult` returns null until `phase === 'over'`. Then:

```ts
{
  winners: seats.filter((id) => side(roles[id]) === winner),
  summary: 'Good wins. The Assassin named Bran, but Merlin stayed hidden.', // `${Side} wins. ${reason}`
  reveal: {
    winner, reason,
    roles,
    lineup,
    quests,
    proposals,                 // every vote
    lady,                      // every check with its result
    assassin, assassinTarget,
    final: PublicEvent | null, // the reveal that ended it, so Reveal can replay it first
  },
  recap,                       // see below
  standings: seats.map((id) => ({
    playerId: id,
    outcome: side(roles[id]) === winner ? 'win' : 'loss',
    team: side(roles[id]) === 'good' ? 'Good' : 'Evil',
    role: ROLES[roles[id]].name, // "Loyal Servant of Arthur", "Assassin", …
  })),
}
```

Once `getResult` is non-null the lobby moves to `results` and stops sending the table view, so
Avalon's `Reveal` (a `GameUi` component) does the whole ending from `reveal`:

1. replay `final` (the last quest's cards, the fifth rejection, or the assassination result);
2. the celebration (see **Needs Lesia** 9);
3. the recap (`components/Recap.js`), with the side tally built from lobby history.

### Recap events

One `RecapEvent` per thing that happened, appended as it happens:

| When            | `text` (public at the time)               | `secret` (shown at the end)                  | `data`                 |
| --------------- | ----------------------------------------- | -------------------------------------------- | ---------------------- |
| Deal            | "Roles dealt. Bran leads quest I."        | Who had which role                           | `{ roles }`            |
| Each proposal   | "Bran sent Ana, Cy and Dee: approved 5–2" | Who voted which way                          | `{ proposal }`         |
| Each quest      | "Quest II failed with 1 Fail card"        | "Cy was evil on this quest"                  | `{ quest, traitors }`  |
| Each Lady check | "Ana used the Lady of the Lake on Bran"   | "Bran is evil"                               | `{ check }`            |
| Assassination   | "The Assassin named Ana"                  | "Ana was Merlin" / "Ana was a Loyal Servant" | `{ assassin, target }` |
| End             | "Good wins. Three quests succeeded."      | –                                            | `{ winner }`           |

The recap never says who played a Fail card, because the app doesn't record it (**Needs Lesia** 8).

## How the UI uses the views

- `PlayerScreen` gets `view` (`AvalonPlayerView`), `tableView`, `me`, `players` (with avatar and
  `online`) and `sendAction`. Everything in "Player screens" in `PARITY.md` is built from those.
  Host-only controls (End game, rejoin for others) live in the shell's menu, so the screen doesn't
  need `hostId`.
- `TvScreen` gets `tableView` and `players`.
- `Lobby` (the round-table waiting room) gets `GameLobbyProps`. For Avalon parity it also wants:
  - seat taps (your own seat opens the avatar picker; the host's tap on another seat opens
    removal);
  - reactions;
  - the lobby history for the side tally.

  These are additions to `GameLobbyProps` in `packages/ui/src/game-ui.ts` (the kit, not the
  contract).

- Overlays key on `event.id` and timers on `phaseSeq`, both through the kit's `useMoment`, so a
  refresh never replays them.
- The look follows `useTheme()`: day renders Parchment (`data-printed` on Avalon's own root),
  dark renders Night. Avalon's CSS is scoped under its root element so its `:root` tokens and
  global classes (`.btn`, `.chip`, `.panel`, `body`) can't leak into the shell.

## Tests

Ported from `scripts/simulate.mjs`, as pure unit tests on the module with a seeded `Rng`:

- the seven scripted games (5, 6, 7, 8, 10, 12 and 15 players), covering an assassin hit and a
  miss, five rejections, three fails, the Lady and house rules;
- quest sizes and evil counts for every n from 5 to 15, and `lineup` for every mode, including
  dropped roles and dependencies;
- every illegal move (wrong size, non-leader, good Fail, played twice, Lady on a past holder,
  assassinating evil);
- knowledge: the table above, for every role, with and without Morgana;
- leaks: for every phase of every scripted game, the table view holds no roles, no votes in
  progress, no cards, no Lady results and no votes off the seats; each player view adds only
  that player's own secrets;
- the vote event's votes disappear once the seats stop showing them.

## Needs Lesia

**All nine approved by Lesia on 2026-10-13** (see CLAUDE.md, "For the Avalon port"). System chat
lines are kept, not dropped, and Avalon's results show its own celebration, then the shared seal.

These are the same as in `PARITY.md`. Each says what the design does without the change.

1. **A clock.** `now` in `SetupContext` and as an `applyAction` argument, and server `now` on
   `LobbySnapshot`. Without it, `phaseAt` stays null and timers are hidden.
2. **`endGame` (host ends early, not scored).** Without it, a stuck game can only finish by
   playing out, or the lobby expiring.
3. **`createRejoinCode { playerId? }`** with Avalon's rule (host for anyone; anyone for a player
   unseen over a minute; only the maker sees it). Without it, a dead phone loses its seat for
   the rest of the game.
4. **Platform reactions.** Without them, Avalon ships without reactions.
5. **Unique names** on `join` and `rename`. Without it, two players can share a name, which makes
   knowledge lists ambiguous.
6. **System chat lines.** The design drops them. They'd need `ChatMessage.playerId` to be optional
   and a way for games to announce.
7. **`sendAction` returns `Promise<boolean>`.** Without it, the UI tracks busy states from the
   next snapshot instead.
8. **Who played Fail in the recap.** The design doesn't record it. It would need `cards` kept per
   quest in state (still secret until the end).
9. **Avalon's celebration or the kit's verdict** on the results screen. The design builds
   `Reveal` so either can be used.
