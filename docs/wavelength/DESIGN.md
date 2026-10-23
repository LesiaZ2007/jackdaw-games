# Wavelength: design

Lesia, 2026-10-23: "Let's do wavelength". Choices made then: the way a team turns the dial is a
game setting (one shared dial anyone can drag, or everyone guesses privately and the team's
guess is the average), both teams and a cooperative mode ship, and the name stays Wavelength
with a credit to its designers. Spectrum cards are written fresh. Lesia allowed merging to main
once it's done and tested.

This un-pauses BUILD_PLAN Phase 6. The plan wanted a dial synced live by WebSocket; here it
runs over the existing polling transport (see "The shared dial over polling").

## How it plays

Each round one player is the **psychic**. They see two spectrum cards (two opposites, like
_Cold — Hot_) and a hidden **target** somewhere on the dial, pick the card that suits the
target, and give a **clue**: a word or phrase that sits at that spot on the spectrum. Their
team turns the dial to where they think the target is, and scores by how close it lands.

- **Target and scoring.** The dial runs 0–100 (left word at 0). The target's centre is a whole
  number from 10 to 90 so its whole zone is on the dial. Distance from the dial to the centre:
  within 2 scores **4**, within 6 scores **3**, within 10 scores **2**, otherwise 0. (Five
  bands, each 4 wide: 20% of the dial, as in the printed game.)
- **Teams mode (4–15 players).** Two teams, Sun and Moon, dealt evenly at random each game.
  Teams take turns; each team's psychic rotates through its members. After a team locks its
  guess, the other team calls whether the target is **left or right** of the dial for 1 point
  (no point if the dial is dead on the centre). If a team scores 4 and is still behind
  afterwards, it goes again at once (the printed catch-up rule). First to the goal wins; if both
  reach it in the same round the higher score wins, and a tie plays on until it's broken.
- **Together mode (2–15 players).** Everyone on one team; the psychic rotates through everyone.
  No left/right call. A fixed number of rounds; a bullseye (4) earns one extra round. The score
  is rated at the end, and everyone wins if the team averaged at least 2 a planned round.

## Options (Jackdaw's options panel)

| Key        | Label      | Choices                       | Default     |
| ---------- | ---------- | ----------------------------- | ----------- |
| `mode`     | Mode       | Teams, Together               | Teams if 4+ |
| `teams`    | Teams      | Random, Chosen                | Random      |
| `guessing` | Guessing   | Shared dial, Everyone guesses | Shared dial |
| `length`   | Length     | Short, Standard, Long         | Standard    |
| `timer`    | Dial timer | Off, 60 seconds, 2 minutes    | Off         |

Length: Teams play to 7 / 10 / 15 points; Together plays 5 / 7 / 10 rounds. Teams mode needs at
least 4 players (`validateOptions`). The timer covers the guessing and the left/right call;
when it runs out the dial locks where it is.

Teams (Lesia, 2026-10-23: "an option to choose either random or selected teams"): Random deals
them afresh each game; Chosen keeps the host's placings, stored in the options as `sides`
(player id -> team), so Play again keeps them. Wavelength's `LobbySeats` draws Sun and Moon side
by side with buttons for the host to move players (the platform passes `setOptions` to lobby
seats for this, and the options panel skips options it can't draw). Anyone unplaced joins the
smaller team at the start, and a team with fewer than two takes a player from the other.

Group-written spectrum pairs (in the plan) wait for a text option in the lobby, which the
options panel doesn't have yet.

## Guessing

- **Shared dial.** Any guesser on the team (everyone but the psychic) drags the one dial; the
  last move wins. Each guesser can tap **Lock in**; moving the dial clears every lock. When more
  than half the guessers have locked, the guess is set.
- **Everyone guesses.** Each guesser sets a dial of their own, hidden from everyone else until
  the reveal, and locks it. When all guessers have locked (or the timer runs out), the team's
  guess is the average of the dials that were set (untouched dials don't count; nobody set =
  the middle).
- **Left/right call** (Teams). Every member of the other team picks Left or Right; it's decided
  when more than half of them agree. On a timeout the larger side wins, and a tie scores nothing.
- **Lock it in now.** Once someone has locked in (or called), the psychic can end the wait, which
  does what the timer would. Without it a phone that drops out could stall Everyone guesses.

## The shared dial over polling

Phones poll every 1.5s while a game runs, and each move is a locked write. So:

- The phone dragging the dial shows its own needle instantly and sends its position at most
  every 450ms while dragging, plus once on release (the server allows 30 posts per 10s).
- Every other screen eases the needle to each new position (about 600ms), so the dial glides
  rather than jumps; it trails the dragger by one to two seconds, fine with everyone in a room.
- A dragging phone ignores the server's dial until a moment after its last send, so it never
  snaps back to an older position.
- No change to the platform contract or transport.

## Phases

`pick` (psychic chooses a card) → `clue` (psychic writes it) → `guess` → `call` (Teams only) →
`reveal` (target shown, points scored; next round after 12s, or anyone taps Next) → … → `over`.
The `pick` and `clue` steps are one screen on the psychic's phone.

## Hidden information

- The target goes only to that round's psychic until the reveal, then to everyone.
- In Everyone guesses, a guesser's own dial goes only to them until the reveal; the table shows
  who has locked.
- The two cards on offer are public (they're no clue to the target).
- The recap is built as the game goes; its `secret` holds the target.

## Screens

Wavelength keeps Jackdaw's lobby (like UNO and Poker). Its own look is a **printed dial
board**: a half-moon dial in sable card with a cream rim, the spectrum words in Big Shoulders on
cream plaques at either end, the target zone printed in banded fills (vert 4, tenné 3, gold 2)
behind a sable shutter, and a cream needle with a round cap. Sun team is gules, Moon team is azure. Same in day and dark (printed), with the rest on
Jackdaw tokens.

- **Phone (`fit`, never scrolls):** the scores and the spectrum on top, the dial filling the
  middle, the dock at the bottom. Psychic: the two cards to choose from with the target zone
  shown on the dial, then a clue box. Guessers: drag the needle, Lock in. Other team: the live
  dial, Left / Right. Everyone: the reveal and the scoreboard.
- **TV:** the big dial and spectrum, the clue large, the needle gliding live, who's locked, the
  two teams' scores with rosters, and a dramatic reveal: the shutter opens, the zone lands, the
  points stamp in. A `VerdictMoment` names what the round scored.
- **Outcome moments** on every phone each round (your team scored / the other team scored /
  you're watching), keyed on the number of rounds revealed.

## Testing

- Rules unit tests: scoring bands and edges, target range, psychic rotation in both modes,
  shared-dial locks (majority, moving clears), Everyone guesses (average, untouched ignored,
  timeout), the left/right call and its ties, the catch-up turn, win and tie-break, Together's
  bonus round and result, timers, `validateOptions`.
- Hidden-info tests: no target in the table view or any non-psychic view before the reveal; no
  private dial in anyone else's view.
- An end-to-end test through the lobby API on real pages: a round from clue to reveal.
- Screens checked at 375, 768, 1280 and the TV at 1920×1080, 1440×900, 960×540, day and dark.
