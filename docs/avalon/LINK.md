# Avalon in Jackdaw: the link

Lesia, 2026-10-13: Jackdaw does **not** get its own copy of Avalon. The live app
(`C:\Users\KBITK\OneDrive\Desktop\avalon`, play-avalon.vercel.app) stays the game. Jackdaw is
the lobby: the table gathers in Jackdaw, the host sets Avalon up there, presses Start, and every
phone (and the TV) lands straight in a live Avalon game with roles already dealt. When it ends,
everyone goes back to Jackdaw and the result is in the night's scores.

`PARITY.md` and `STATE.md` were written for the port and are kept for reference only. Their
source references are still the best map of the Avalon app.

## What players see

1. **Jackdaw lobby, Avalon chosen.** The waiting room looks like Avalon's own lobby: the round
   table with shields, Avalon's settings (Classic / Full / Custom / Plain, the custom role
   toggles, Lady of the Lake, talk and vote timers) and the deal preview, in Avalon's Parchment
   look by day and Night look in dark mode. Jackdaw's frame stays around it: the bar with the
   code chits, chat, stats and the TV. Only the host changes settings.
2. **Start Avalon.** Jackdaw's server creates the Avalon room with everyone seated (their names,
   crests and colours), the settings applied and the roles dealt. Each phone is taken to its own
   seat in Avalon; the TV is taken to Avalon's TV screen. Nobody types a code.
3. **The game** is the live Avalon app, unchanged, except that a linked room shows
   "Back to Jackdaw" where it would offer a new game or the Avalon lobby.
4. **Back in Jackdaw**, the results screen shows the outcome with the shared verdict seal, and
   the night's scores and stats include the game. Play again starts a new Avalon room with the
   same settings.
5. If the Avalon host ends the game early, Jackdaw goes back to its lobby and nothing is scored.

## Configuration

| Where                    | Variable              | Value                                                     |
| ------------------------ | --------------------- | --------------------------------------------------------- |
| Both Vercel projects     | `JACKDAW_LINK_SECRET` | One shared random secret (Preview and Production).        |
| Jackdaw                  | `AVALON_URL`          | Avalon's base URL, e.g. `https://play-avalon.vercel.app`. |
| Local dev (both, `.env`) | the same two          | Avalon dev server on its own port.                        |

Server-to-server calls send `authorization: Bearer <JACKDAW_LINK_SECRET>`. Avalon refuses the
`/api/jackdaw/*` routes when the secret is missing or wrong (and when it isn't configured).

## Avalon's side (branch `feat/jackdaw-link` in the Avalon repo)

### `POST /api/jackdaw/rooms`

```jsonc
// request
{
  "jackdawCode": "QGYR",
  "returnUrl": "https://<jackdaw>/r/QGYR",
  "hostId": "<jackdaw player id>",
  "players": [{ "id": "<jackdaw player id>", "name": "Lesia", "avatar": { "icon": "raven", "tint": 0 } }],
  "settings": { "mode": "classic", "custom": { "merlin": true, "percival": true, "morgana": true, "mordred": false, "oberon": false },
                "lady": false, "timers": { "talk": 0, "vote": 0 }, "theme": "parchment" }
}
// 200
{ "code": "ABCD", "seats": { "<jackdaw player id>": { "playerId": "<avalon id>", "token": "<avalon token>" } } }
// 4xx: { "error": "Avalon needs at least 5 players." } (Avalon's own messages)
```

- Seats players in the given order, with their names and avatars (`tint` is the index into
  Avalon's `AVATAR_TINTS`, which is the same 15 colours in the same order as Jackdaw's
  `TINT_CHOICES`; `icon` is the crest id, shared with Jackdaw's crests). The given host is the
  Avalon host. Settings go through the same validation as the `settings` and `theme` actions.
- Starts the game straight away (the same `startGame` as the `start` action).
- Stores `room.jackdaw = { code, returnUrl, ids: { <avalon id>: <jackdaw id> } }`.

### `GET /api/jackdaw/rooms/:code`

```jsonc
{ "phase": "vote", "over": false }
{ "phase": "over", "over": true, "endedEarly": false,
  "winner": "good", "reason": "Merlin survived the assassination.",
  "players": [{ "id": "<jackdaw id>", "side": "good", "role": "merlin", "won": true }] }
{ "phase": "lobby", "over": true, "endedEarly": true }
```

Only after the game is over does this include roles. Nothing secret is returned mid-game. An
unknown or expired room is a 404, which Jackdaw treats as abandoned (nothing scored).

### `DELETE /api/jackdaw/rooms/:code`

Jackdaw's host ended the game in Jackdaw ("End this game"). A running game ends early, exactly
as if Avalon's host had ended it, and the response is the status above. Jackdaw calls it after
saving its own lobby and only logs a failure.

### Entry page `/j/:code`

Reads `#seat=<avalon playerId>.<token>` from the URL fragment (never sent to a server or
logged), saves it with `saveSeat(code, { playerId, token })`, strips the fragment and replaces
the location with `/r/:code`. Without a fragment it goes to `/r/:code` (the normal join screen).

### In a linked room

- Game over (and the menu): "Back to Jackdaw" links to `returnUrl`, in place of the host's
  "lobby" / new-game controls. Avalon's own celebration plays first, as today.
- The host's "end game early" still works; the room then goes to Avalon's lobby phase with a
  "Back to Jackdaw" link and nothing else to do there.
- Nobody can join a linked room by code (it's mid-game anyway).
- Everything else, including the look, gameplay and TV, is unchanged. `/tv/:code` stays
  frameable (no `X-Frame-Options` / `frame-ancestors`), because Jackdaw's TV and latecomers embed it.

## Jackdaw's side (branch `feat/avalon-link`)

- **The game entry.** Avalon becomes a ready game in the catalog (5–15 players, 30–60 min) whose
  rules module is a thin "external game": its options are Avalon's settings (with the deal
  preview from a port of `lineup`), and its state is the Avalon room code plus each player's
  seat. `getPlayerView` gives a player only their own seat; `getTableView` gives only the room
  code. Seat tokens never reach anyone else, the TV, history or chat.
- **Start** calls `POST /api/jackdaw/rooms` from the server before the session is created (a
  failure shows Avalon's message as the Start error and nothing changes). The game module
  contract and lobby machine need an "external start" step for this: setup data fetched by the
  runtime and handed to `setup`. Document it in CLAUDE.md.
- **Phones** go to `<AVALON_URL>/j/<code>#seat=<id>.<token>` as soon as the session starts
  (with a "Go to your seat" button as the fallback). Coming back during the game shows
  "Avalon is underway" with the same button. The TV goes to `<AVALON_URL>/tv/<code>`.
- **The result.** While the session is running, reads check `GET /api/jackdaw/rooms/:code` at
  most every 5 seconds (lazily, like timers). When it's over, the session finishes with a
  `GameResult`: winners are the Jackdaw ids on the winning side, the summary is Avalon's reason,
  standings carry team (Good/Evil) and role labels, and the results screen shows the verdict
  seal. `endedEarly` ends the session unscored.
- **The Avalon lobby look.** Avalon's `GameUi.Lobby`: Avalon's lobby (round table, shields,
  settings, deal preview) ported from `components/Lobby.js`, `RoundTable.js` and the lobby
  parts of `app/globals.css` / `app/themes.css`, scoped under an `.avalon` wrapper so nothing
  leaks into the shell. Parchment by day, Night in dark mode, through `useTheme()`.
