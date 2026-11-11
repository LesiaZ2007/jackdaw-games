# Cambio

Cambio, also played as Cactus or Pablo, is the traditional memory and swap card game, for 2 to 8
players in Jackdaw's lobby. It uses standard playing cards only. You try to end a round with the
lowest hand, but you can only see your own cards through what you remember and what you learn.

## The deck

Two to five players use one standard 52-card deck. Six to eight players use two decks shuffled
together (104 cards). Cards count:

| Card                             | Value      |
| -------------------------------- | ---------- |
| Ace                              | 1          |
| 2 to 10                          | face value |
| Jack                             | 11         |
| Queen                            | 12         |
| King of spades or clubs (black)  | 13         |
| King of hearts or diamonds (red) | 0          |

## A round

Everyone is dealt four cards face down in a 2×2 grid (slots 0 to 3, the bottom two being slots 2
and 3). One card is turned face up to start the discard pile and the rest is the stock.

**Peek.** Each player may look at their two bottom cards once. Their view shows those two faces
until they press ready, or until 20 seconds pass and the round starts by itself. Everyone must be
ready (or time out) before anyone moves. The player after the dealer goes first, and the dealer
moves one seat on each round.

**A turn** is exactly one of these:

1. **Call Cambio** instead of drawing. It is not allowed on the very first turn of a round. Every
   other player then takes exactly one more turn and the round ends. The caller's cards are
   locked: nobody may look at them or swap with them.
2. **Draw** from the stock. Only the drawer sees the card. Then either **keep** it (it replaces
   one of your four cards, which goes face up on the discard pile) or **discard** it.
3. **Take** the top discard and keep it in your grid (the card it replaces goes on the pile). Everyone
   saw the card, so everyone knows what is in that slot until it moves. A card taken from the pile
   can't be discarded again.

**Powers.** Discarding a card you just drew from the stock may give you a power. Using it is
optional (skip it to end your turn).

| Card          | Power                                                                           |
| ------------- | ------------------------------------------------------------------------------- |
| 7 or 8        | Look at one of your own cards.                                                  |
| 9 or 10       | Look at one card of another player.                                             |
| Jack or Queen | Swap one of your cards with another player's. Nobody looks.                     |
| Black King    | Look at one of yours and one of another player's, then swap them or leave them. |

A red King has no power. Powers only come from a card drawn from the stock and discarded. A card
you took from the discard pile, kept from a draw, or replaced out of your grid gives nothing. A
caller's cards can't be a target. If every other player is locked out (two players, after a call),
the power can only be skipped.

If the stock runs out, the discard pile (except its top card) is shuffled into a new stock.

## Scoring

When the round ends, every card turns face up and everyone is scored on the sum of their four
cards. If the caller has the lowest total (strictly lowest, or tied for lowest) the caller scores 0.
If someone has a lower total than the caller, the caller scores their own total plus 10. Everyone
else scores their total. Scores add up from round to round, and low score wins.

The scoring screen shows all cards and the round's scores. The next round starts when every player
has pressed next, or after 15 seconds, whichever comes first.

## Options

- **Game length**: first to 100 (the default), first to 50, 3 rounds or 5 rounds. In the
  first-to games, the game ends after the round in which any player's score reaches the target.
  In the round-count games, it ends after that many rounds. Either way the lowest total score wins
  and ties share the win.
- **Turn timer**: off (the default), 30 or 60 seconds. When it runs out, the player draws and
  discards without using a power. If they are already holding a card from the stock it is
  discarded, and if it came from the discard pile it goes into a random slot. A power on offer is
  skipped, and a King's look is left as it was.

## House rules

Cambio has many local variants, so the host can change the numbers. Every option is a plain choice
in the lobby's options panel, and the defaults are the traditional game described above: with the
defaults nothing here applies. The choices are resolved once, when the game starts, into
`state.house` (and `house` on the table view, since they are public: the screens and the bot read
card values and powers from it, never from the defaults). Changing the options mid-game does not
touch a game under way.

| Option          | Choices (default first)                 | Effect                                                                          |
| --------------- | --------------------------------------- | ------------------------------------------------------------------------------- |
| `peekCards`     | 7 and 8, 9 and 10, Jack and Queen, None | Discarding a card of these ranks lets you look at one of your own.              |
| `spyCards`      | 9 and 10, 7 and 8, Jack and Queen, None | ...lets you look at one card of another player.                                 |
| `swapCards`     | Jack and Queen, 7 and 8, 9 and 10, None | ...lets you swap one of yours with another player's, unseen.                    |
| `kingPower`     | Black Kings, All Kings, None            | ...look at one of yours and one of theirs, then swap or not.                    |
| `redKings`      | 0, -1, 13                               | What a red King counts. Black Kings are always 13.                              |
| `callerPenalty` | 10, 5, 20, Double                       | A caller who isn't lowest scores their total plus this, or their total doubled. |
| `callerBonus`   | 0, Their total, -5                      | A caller who is lowest (or tied) scores this; "Their total" gives no bonus.     |
| `openingPeek`   | Two, One, None                          | Cards looked at when a round starts: slots 2 and 3, slot 2 only, or none.       |
| `exactly100`    | Off, Drops to 50                        | In a game to 100, a score of exactly 100 after a round goes down to 50.         |
| `jokers`        | None, Two per deck                      | Adds two jokers to each deck: worth 0, no power.                                |

- **Two powers can't share ranks.** `peekCards`, `spyCards` and `swapCards` must name different
  cards (None can repeat), or the lobby refuses to start: "Peek and spy can't both use 7 and 8.
  Pick different cards for one of them." King power is on the Kings and can't clash.
- **Opening peek None** skips the peek phase altogether: the round is dealt and goes straight to
  play with the player after the dealer, and nobody knows any card. With One, only slot 2 (the
  bottom left) is shown, and the phase works as before.
- **Doubling** only makes a positive total worse: a caller with 0 or less keeps their total. The
  caller's score lines on the screens say which rule applied ("14 + 10", "14 doubled: 28",
  "lowest: -5").
- **Exactly 100.** After the round's scores are added, any player at exactly 100 is set to 50
  (`RoundResult.dropped` lists them, and the round's `scored` numbers stay as played). The game ends
  only if someone is at 100 or more after that, so a dropped player does not end it on their own
  account. Only a game to 100 is affected.
- **Negative numbers.** Red Kings at -1 and a -5 caller bonus let totals and running scores go
  below zero. Ranking, the lowest hand of the game, the winner and the summary all use the plain
  numbers, and the screens print a proper minus sign.
- **Jokers.** Their ids start at 104 (two per deck: 104 and 105, plus 106 and 107 with two decks),
  so the existing ids 0 to 103 are untouched. They are black, worth 0, never give a power, and show a
  star where a suit would be.
- The screens list only the rules that differ from the default: a small "House rules" plaque
  opens a sheet on a phone, and a short list sits in the side panel on a laptop and the TV.

## The knowledge model

The state keeps `known[viewer][owner][slot]`: whether this player currently knows the face of that
card. It is the only thing `getPlayerView` reads: a player's grid view holds a face where they
know it and `null` elsewhere. Their held card is added to it, and everything public.

| Event                                        | What changes                                                                     |
| -------------------------------------------- | -------------------------------------------------------------------------------- |
| Deal                                         | Each player knows their own slots 2 and 3.                                       |
| Keep a card drawn from the stock into a slot | Its owner knows the slot. Everyone else forgets it.                              |
| Take from the pile and keep it               | Everyone knows the slot.                                                         |
| 7 or 8 look                                  | The looker knows that own slot.                                                  |
| 9 or 10 look                                 | The looker knows that slot of the other player.                                  |
| Blind swap (Jack or Queen)                   | Knowledge follows the card: every player's flags for the two slots trade places. |
| King's look                                  | The looker knows both cards. A swap then moves the flags too.                    |
| Round ends                                   | Every card is public.                                                            |
| New round                                    | Everything resets to the new peek.                                               |

A swap is visible to everyone as "this slot with that slot", so a player who knew one of the
cards still knows it in its new place, and a player who didn't learns nothing. A card that goes
face up on the discard pile is public for as long as it is there.

Known faces stay in a player's view after they were learned, as a reminder (including the
two peeked at the start). The game doesn't test anyone's memory for them. It is the same
information the player had, just kept on the screen.

The table view has no hidden faces: grids only appear in it once the round is over. It shows
the top of the discard pile, a card in hand only if it was taken from the discard pile, who has
called, whose turn it is, how many turns are left, the scores and a public log. The log says what
happened (who drew, what was discarded or kept over, which slots were swapped or looked at)
without any face that wasn't on the table.

## Choices made beyond the base rules

- Calling is blocked only while no turn has been taken this round.
- The caller doesn't act again. The round ends when play comes back round to them.
- A drawn card can't be put back on the stock or looked at without being used.
- Powers are optional, and `skipPower` is always allowed at the power step.
- No "snapping" (throwing in a matching card out of turn) and no penalty draws.
- A bot or the turn timer that has to place a card taken from the discard pile does so without
  using a power, like any card from the pile.
- Computer players call Cambio after a very long round (12 turns each) even without knowing
  all of their cards, so a round can't last forever.
