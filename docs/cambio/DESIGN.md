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
