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

## Layout by width

Check every screen at **375, 768, 1280, 1920**.

- **Phone (375):** portrait, one hand. Bar on top (mark, code chits, icon buttons), content,
  dock at the bottom with the primary plaque. Safe-area padding.
- **Tablet (768):** two columns where it helps (seat track beside the game picker).
- **Laptop (1280):** home is the welcome screen with its nav in one row, then shelves of game
  covers ("Browse the games" scrolls there). Catalog = filters | shelf | detail panel.
  Lobby = table (the wider column, tokens about 84px) | game | chat.
- **TV (1920):** no hover. Huge code chits + QR, the seat track along the bottom, the next game
  on the right, all on one screen. Only the lobby scrolls: below its first screen is **the night
  so far** (highlights on banded cards, the score tally as a ranked board with each player's
  bar in their tint, and the games played tonight). A small "The night so far" hint shows once
  a game has finished. Games and results never scroll. Everything on the TV is also on every
  phone.

## Words

Plain verbs in sentence case on buttons that say what happens: "Create a lobby", "Join",
"Start Avalon", "Play again", "Back to lobby". Errors say what went wrong and what to do
("That code has expired. Ask for a new one."). Empty states invite the next step.

## Credits

- Bird mark: "Black bird" by OpenMoji (openmoji.org), CC BY-SA 4.0. Credited on the About page.
- Fonts: Google Fonts (SIL Open Font License).
- Game names and rules belong to their creators; each game's detail page credits them.
