# Solitaire

Multiplayer Klondike solitaire for 1 to 6 players in Jackdaw's lobby (2026-10-30). Everyone is
dealt their own deck, one each with no jokers, and everyone plays at once. Your own columns and
waste are yours alone, but the foundations in the middle are shared, so a race for them is part
of the game.

## Rules

The deal is Klondike: seven columns, the first with one card face up and the last with seven,
the rest of the deck in a stock. A column builds down in alternating colours, and only a king
can start an empty one. A face-up run can move as a block onto another column, and a covered
card turns over once the face-up cards on top of it have gone.

Turning the stock moves cards to the waste, and when the stock runs out the waste turns back over
to become the stock.

## Shared foundations

Anyone can build on any foundation in the middle. A card goes up when it is the next rank of its
suit, and an ace starts a new pile, so a suit can end up with more than one pile. Uncovered aces
go straight up at the deal, before anyone moves.

## Everyone's stuck

When no player has a move, even after turning through their whole stock, everyone is stuck
together. Each player then pulls the top covered card of their column with the most covered cards
onto their waste, all at once, and the check runs again. This repeats until someone can play.

If nobody has a covered card left to pull, the game ends and the fewest cards left wins. A tie on
the fewest is a draw.

## Winning

The first player to get rid of every card wins, and the game ends there.

## Options

Draw one or Draw three, set in the lobby. Passes through the stock are unlimited.

## Races over polling

Every move names its card. A tap on a card that has already moved gets "That card has already
moved.", and a foundation someone else just built on gets "Someone got there first.", so a stale
view is refused rather than applied to the wrong card.

Tapping a card sends it up if it can go, otherwise onto the first column it fits.

## Bots

Bots take one move at a time, and each level sets a pace per move: 3.2 s at Easy, 2.2 s at
Normal and 1.4 s at Hard (`BOT_PACE`). Turning the stock is quicker, at half that pace. Now and
then a bot turns the stock when it could have played, which is the slip it makes.

## Hidden information

Face-down cards and the stock never leave the server. Everyone sees the face-up cards in every
column, the top few cards of each waste, and the count of everything else. A player's own view
is the same as the table's, plus their own move time.

Example: Rook has four face-down cards in column three with a queen face up on top. Wren's
screen shows four and the queen, and nothing more.

## Ending early

When the lobby ends the game early, the player with the fewest cards left leads. If every player
is level, there is no result yet.
