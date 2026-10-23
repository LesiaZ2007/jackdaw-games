# Jackdaw Style Guide

Signed off on 2026-10-12, after three rounds (`mockups/a3-compendium.html` is the reference;
open it in a browser and use the switchers). Tokens live in `packages/ui/src/tokens.css`; every
screen is built from them. If a value isn't here or in the tokens, it doesn't belong on screen.

## The idea

Jackdaw is a **compendium of games**: a printed boxed set. Every piece of the shell looks like
something you'd punch out of card or find in the box:

| Thing on screen        | Printed piece                                                                           | Why                                                 |
| ---------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Lobby code, code entry | **Chits**: chamfered card squares in heraldic colours                                   | Readable across a room; no Scrabble tiles           |
| Player                 | **Token**: a punch-out disc in their tint with their crest, die-cut ring and sprue nubs | Same crests as Avalon                               |
| Seats (up to 15)       | **Seat track**: 15 numbered printed spaces                                              | Open seats at a glance                              |
| Game                   | **Box lid**: a heraldic field pattern behind the game's emblem                          | Every game gets its own colour without a new layout |
| Game on a shelf        | **Game cover** (`GameCover`): the box lid over a printed label with players and time    | Shelves and pickers read like a games cupboard      |
| A result               | **Verdict**: a wax seal pressed onto a heraldic ribbon (`celebrate.tsx`)                | You can tell at a glance whether you won            |
| Panels                 | **Lid**: paper card with a double rule and fleuron corners                              | Echoes Avalon's double-ruled frames                 |
| Buttons                | **Plaque**: condensed caps on a double-ruled plate                                      | Shared with Avalon                                  |
| Stats                  | **Score pad**: a ruled sheet torn off a pad                                             | Board games come with score pads                    |

Background: the **table**, a flat grey with faint jackdaw footprints wandering across it and a
light print grain. The jackdaw itself is a **line-drawn black bird** (OpenMoji, CC BY-SA 4.0).

**Colour and life (after the Phase 1 playtest):** the table stays quiet grey, but the pieces on
it are bold. Game covers fill shelves with their heraldic colours, player names take their tint,
and every result lands with a coloured moment: vert for a win, gules for a loss, sable for a
draw, azure for someone watching. Still no gradients as decoration, no stained glass, no glows,
no yellow button blocks, no italics for flavour, no wrapping centred pill rows.

**Games keep their own world.** When a game is chosen, its own look opens inside the Jackdaw
frame, which keeps the code, stats and chat. **Avalon looks and plays exactly as it does today**.

## Colour

Day is **Pebble**; dark is **jackdaw-black board**. Both are defined on `:root`, with dark under
`@media (prefers-color-scheme: dark)` and `[data-theme="dark"]` (a manual toggle wins).

| Token       | Day (Pebble) | Dark      | Used for                                 |
| ----------- | ------------ | --------- | ---------------------------------------- |
| `--table`   | `#cfcecb`    | `#1c1e20` | Page background                          |
| `--table-2` | `#bfbebb`    | `#25282b` | Shaded table, sheet backdrops            |
| `--paper`   | `#f7f7f5`    | `#2b2f32` | Lids, inputs, spaces, cards              |
| `--ink`     | `#1d1d1c`    | `#ede5d3` | Text, rules, borders                     |
| `--ink-2`   | `#4a4947`    | `#aeb5b8` | Secondary text, labels                   |
| `--rule`    | `#9a9995`    | `#4f5559` | Hairlines, empty slots, numbers          |
| `--on-fill` | `#f6f0e1`    | `#f6f0e1` | Text and lines on heraldic fills         |
| `--or`      | `#a77d2c`    | `#d2aa5c` | Host badge, selected outline (sparingly) |
| `--danger`  | `#a63a30`    | `#d4695d` | Reasons a thing can't happen, errors     |

Heraldic fills stay the **same in both themes** (they're printed): gules `#a63a30`, azure
`#2b5683`, vert `#30634a` (the go colour), sable `#3a3d42`, purpure `#6a3f74`, tenné `#9a5a22`.

Player tints (from Avalon, by id): slate `#3e5b6b`, plum `#5b4b6f`, moss `#4f6348`, umber
`#6c5a3d`, teal `#3e5f5a`, mauve `#6a4b57`, indigo `#4a5678`, olive `#5e6440`, pewter `#55606c`,
rust `#6f5147`, ochre `#7a6930`, pine `#33604a`, violet `#4c4980`, orchid `#6e4475`, lagoon `#2d6874`.

Contrast: body text on `--table` and `--paper` is at least 7:1 in both themes; `--ink-2` at
least 4.5:1. Never carry meaning by colour alone: unfit games also say why, away players also
fade and say "away".

## Type

| Role                                                       | Face                                    | Token            | Notes                                       |
| ---------------------------------------------------------- | --------------------------------------- | ---------------- | ------------------------------------------- |
| Display: wordmark, screen and section headings, game names | **Grenze Gotisch** 700–800              | `--font-display` | Never for body or codes                     |
| Codes: lobby code letters, rejoin codes                    | **Grenze** 800                          | `--font-code`    | Roman sibling: an A must never read as an R |
| Plaques: buttons, labels, name plates, numbers             | **Big Shoulders Display** 700–900, caps | `--font-plaque`  | Letter-spacing .03–.12em                    |
| Body                                                       | **Alegreya Sans** 400/500/700/800       | `--font-body`    | 18px base on phones                         |

Fluid scale (`clamp()`), defined as `--step--1` … `--step-5`: small text 15→16px, body 18→21px,
h2 30→40px, wordmark 64→96px. Chat is 18px at least, with each name in the player's tint
(mixed toward cream in dark mode). TV screens use the `tv-*` sizes (code chits 190px, names
22px+, body 28px+). Labels are small caps plaques (`--font-plaque`, 14px, .12em). No italics.

## Shape and depth

- Frames: 2px ink border plus a 1px inner rule 6–7px in (`outline-offset: -6px`). Corner radius
  0, except chits (chamfered 16%) and tokens (round).
- Shadows are printed, not glowing: chits and tokens drop `0 0.05em 0` of `--shadow`; sheets use
  `0 20px 50px -24px --shadow`. No coloured glows.
- Spacing: 4px base (`--space-1` 4, `-2` 8, `-3` 12, `-4` 16, `-5` 24, `-6` 32, `-7` 48).
  Phone gutters 16px plus safe-area insets. Tap targets at least 44px (plaques 52px).

## Motion

Entrances use `cubic-bezier(.22, 1, .36, 1)` (expo-out, shared with Luminae Vigila), 280–900ms.
One orchestrated moment per screen:

- **A token is placed** on the seat track when someone joins (drops and settles, 900ms).
- **Chits flip in** when a lobby code appears.
- **A result lands** (`VerdictMoment`): the seal stamps onto the ribbon, about 1.4s, with a burst
  of chits and feathers for a win and a drooping ribbon for a loss. It clears itself (tap,
  Escape or about 3.4s) so it never blocks the next move. Scores pop with a rising "+n".
- **Results reveal**: your own verdict, then standings coloured by outcome, then the recap.

`prefers-reduced-motion: reduce` swaps all of these for an instant state change.

## Each game's lobby

2026-10-13: "each game lobby [has] similar style elements but [is] decently unique."
A game with a strong look of its own brings its own lobby through `GameUi.Lobby`; every other
game uses Jackdaw's lobby (seat track, Next up, Start), which suits simple games best.

- **Jackdaw's bar stays** on every lobby: code chits, invite (with Show on TV), Game stats, chat
  and the menu.
- **A game's own lobby fills the screen** under the bar, edge to edge, not a panel in the middle
  ("full screen when it's selected, not just a weird cutout"). It draws the chat too, in
  its own style ("chat should be like the avalon chat on the right"): Avalon's Table talk,
  docked on the right from 1240px and a drawer from the bar's chat button below that. "Play a different game" brings back
  Jackdaw's lobby with the game list.
- The TV follows: a game with its own lobby can give the TV one too (Avalon: the round table
  beside the join panel and the deal), and every TV screen fills the display.
- Its seats still behave like Jackdaw's: tap your own to change your look, the host taps someone
  to remove them or make them host, reactions pop over seats, away players are marked.

- **Avalon**: the live app's own lobby, copied exactly. The round table with everyone's shield
  (discs at Night), the fanned deal, the settings rows and "Deal the roles". Parchment by day,
  Night in the dark. Its CSS is the app's, copied by `packages/games/avalon/scripts/copy-lobby-css.mjs`
  and scoped under `.avalon`, with Avalon's palette as local custom properties.
- **Codenames**: a case file on the table. The lobby is the two team folders, Red and Blue, each
  with its spymaster pinned in a slot (a magnifying glass marks them) and its operatives below;
  anyone not placed waits in a dashed tray. The host taps a player, then where they play. In
  play the 25 words are index cards (a red rule near the top, condensed caps); an uncovered word
  gets its team's ink stamp flipping down over it (an agent in a hat, a bystander under an
  umbrella, the assassin's crosshairs). The clue in play is a rubber stamp. Kraft and manila by
  day, a slate night-ops desk in the dark; all colours are tokens at the top of
  `packages/games/codenames/src/ui/codenames.css`. The TV lobby shows the folders beside the join
  panel.

- **Secret Hitler**: 1930s print, original art. The players are name placards round a long
  cabinet table seen from above (dark wood ruled in brass), on an art-deco sunburst; beside it a
  dossier with the deal as party cards (Liberal steel blue, Fascist red-orange, Hitler in black),
  the powers on the Fascist track, the host's house rules for 11+ and "Deal the roles". Day is
  cream card stock and charcoal ink with double-ruled frames and condensed caps (Big Shoulders);
  dark is its noir, the same print reversed out of night blue. Ballots are blackletter "Ja!" and
  "Nein". Policy moments look the same on every phone (the policy's own colour), so a moment
  never gives away which side you're on; vote moments are personal because votes are public.
  Tokens are at the top of `packages/games/secret-hitler/src/ui/sh.css`, scoped under `.sh`.
  - **Where the game stands** (2026-10-16: "base it on secret-hitler.online"): the
    phone and TV run top to bottom as the strip of players (office placards, an hourglass on
    exactly whoever the game is waiting on, Ja/Nein once a vote is counted, roles you know,
    executed players greyed), the status bar (the phase, "Your move" in the action green when
    it's you, one named line such as "Waiting for Wren, the president, to nominate a
    chancellor", and "Ja 3 – Nein 2: elected"), your prompt, then the board: draw pile, the
    tracks and tracker, discard pile. A printed band sweeps across with the phase name
    ("Legislative session") at each new phase; it never takes taps, waits for any outcome
    moment, and only fades with reduced motion. The logic is in `src/status.ts`.
  - **Emblems** are filled silhouettes that read at 24px: a dove in flight with an olive
    sprig in a round seal (Liberal), an art-deco skull in an angular badge (Fascist), and the
    badge printed solid with the skull and a crown knocked out (Hitler). Original art.
- **Poker** uses Jackdaw's lobby. In play it's a printed card table seen from above: vert baize
  on a sable rail with a fine cream rule, everyone's token round the rim (you at the bottom) with
  a name plate, stack and last move, bets as small chip stacks pushed toward the middle, the
  shared cards and pot on the baize. Cards are cream stock, charcoal ink, gules for hearts and
  diamonds, an azure lozengy back; they look the same day and dark. `poker.css`.
- **UNO** uses Jackdaw's lobby, seated round its mat. In play it's a round paper mat with a double
  ink rule, its ring a light tint of the colour in play with arrows in that colour turning slowly
  the way play goes; both piles in the middle. Everyone's card count sits on a card-shaped sable
  chit by their token, big enough to read across the table (gules at one card). On a laptop your
  hand runs under the table in bigger cards, the dock beside it. On the TV the room stays Jackdaw's
  table and the card table is printed flat in the colour in play inside a cream rule, with no wash,
  glow or spinning ring (2026-10-23: the gradient "doesn't fit"). Cards are cream stock with a field in gules, or, vert or azure inside a cream double
  rule, the number in Grenze Gotisch; wilds are sable with a quartered shield; the back is sable
  with the jackdaw. They look the same day and dark. `uno.css`.
- **Letterhoard** uses Jackdaw's lobby. A printed board of paper squares ruled in ink, bonus
  squares in heraldic fills (gules triple word, tenné double word, azure triple letter, pale
  azure double letter), a star in the middle; bone tiles with the letter in Grenze and the value
  in the corner, on a sable rack. `wordhoard.css`.
- **Rock Paper Scissors** uses Jackdaw's lobby. Its own chalk-ring lobby was tried and dropped
  (2026-10-13: "the old rock paper scissors lobby was miles better").
- A game that gets its own lobby scopes its look under the game's class, keeps the bar's pieces
  out of it, and follows `useTheme()` for day and dark.

## Layout by width

Check every screen at **375, 768, 1280, 1920**.

- **Phone (375):** portrait, one hand. Bar on top (mark, code chits, icon buttons), content,
  dock at the bottom with the primary plaque. Safe-area padding.
- **Tablet (768):** two columns where it helps (seat track beside the game picker).
- **Laptop (1280):** home is the welcome screen with its nav in one row, then one grid of game
  covers under a row of filters ("Browse the games" scrolls there). Catalog = filters over the
  grid | detail panel. (Shelves come back once there are enough games to fill them.)
  Lobby = table (the wider column, tokens about 84px) | game | chat.
- **TV (1920):** no hover. Huge code chits + QR, the seat track along the bottom, the next game
  on the right, all on one screen. Only the lobby scrolls: below its first screen is **the night
  so far** (highlights on banded cards, the score tally as a ranked board with each player's
  bar in their tint, and the games played tonight). A small "The night so far" hint shows once
  a game has finished. Games and results never scroll. Everything on the TV is also on every
  phone.
- **TV sizes (2026-10-21: "on a real TV stuff is tiny").** The TV is read from the sofa
  and also used on a laptop, so it's one design that has to work for both: sized in stage pixels
  on the 1920×1080 stage, which `TvStage` scales to any window.
  - **Never bare `vh`/`vw`/`vmin` in TV styles.** They measure the browser window, and a TV's
    browser often reports 960×540 however big the set is, which shrank tables to a corner. Use
    the stage's own units, `calc(50 * var(--vh, 1vh))` (also `--vw`, `--vmin`, `--vmax`), or
    pixels, or `cq*` units inside a size container. The fallback keeps phones unchanged.
  - **Nothing under 24px** on the stage (18px on a 1440px laptop); names about 34px, headings
    about 68px. The type steps (`--step-*`) are fixed TV sizes inside the stage.
  - **Fill the screen and keep the shape:** a table sits in a `container-type: size` box and
    takes `min(100cqw, ratio × 100cqh)`, so a 16:10 laptop and a 16:9 TV both fill without
    clipping a seat.
  - **Make it lively:** the TV is the shared moment. Show what just happened big (UNO stamps
    Skip! across the table, prints the table in the colour in play and keeps a play by play;
    Letterhoard drops the tiles in and says what the word means).
  - Check every TV change at 1920×1080, 1440×900 and 960×540.

## Words

Plain verbs in sentence case on buttons that say what happens: "Create a lobby", "Join",
"Start Avalon", "Play again", "Back to lobby". Errors say what went wrong and what to do
("That code has expired. Ask for a new one."). Empty states invite the next step.

## Credits

- Bird mark: "Black bird" by OpenMoji (openmoji.org), CC BY-SA 4.0. Credited on the About page.
- Fonts: Google Fonts (SIL Open Font License).
- Game names and rules belong to their creators; each game's detail page credits them.
