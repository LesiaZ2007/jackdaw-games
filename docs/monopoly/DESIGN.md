# Monopoly: design

2026-10-25. Classic property trading for two to six players, on a board of our own town.
Monopoly is a trademark of Hasbro. The street names, inns, guilds and cards are the site's
own. It uses Jackdaw's lobby.

## How it plays

Each player starts with $1,500 and a token on GO. The board has forty spaces in the classic
order, with the town's names (`board.ts`). Turn order is drawn at random at the start. On
your turn you throw two dice and move forward by the total. Passing GO pays $200.

What you land on decides the next step:

- An unowned street, inn or guild is offered to you at its list price.
- A deed someone else owns, and has not mortgaged, charges rent.
- Chance and Community Chest draw a card (sixteen of each, in `cards.ts`).
- Income Tax ($200) and Luxury Tax ($100) are paid to the bank.
- Go to Jail sends you to the jail, space 10.
- Free Parking does nothing, unless the taxes option is on (see Options).

Throwing doubles gives you another roll, and three doubles in a row sends you to Jail.

Example: Wren rolls 2 and 3 from GO and lands on The Swan, which nobody owns. She can buy it
for $200, or decline and let it go to auction.

## Players and options

Two to six players. `validateOptions` refuses any other count.

Jackdaw's options panel offers four settings:

| Key         | Label            | Choices                                             | Default           |
| ----------- | ---------------- | --------------------------------------------------- | ----------------- |
| `ends`      | Game ends        | Last one standing, After 30 rounds, After 20 rounds | Last one standing |
| `unbought`  | Land nobody buys | Goes to auction, Stays with the bank                | Goes to auction   |
| `parking`   | Free Parking     | Nothing, Collects the taxes                         | Nothing           |
| `turnTimer` | Turn timer       | Off, 60 seconds, 90 seconds                         | Off               |

- **Game ends.** Either the last player standing wins, or the game stops once the round
  limit is reached and the richest player wins (see Ended early).
- **Land nobody buys.** A declined deed goes to auction. With "Stays with the bank" there is
  no auction, and the deed stays unowned until someone lands on it and buys it.
- **Free Parking.** With "Collects the taxes" the bail, the taxes, and the card payments
  that go to the bank are put in a pot. Landing on Free Parking takes the whole pot.
- **Turn timer.** One shared clock for the table. See Timers.

## Turn flow

A turn moves through these states, in order:

- `roll`: the turn player may first pay bail or use a Jail card, then rolls.
- `buy`: the player has landed on an unowned deed, and buys it or declines.
- `auction`: a declined deed is up for bids, if the auction option is on.
- `debt`: a payment the player cannot make from cash is owed (see Debts and bankruptcy).
- `done`: the roll is resolved and the turn player ends the turn.

After a turn ends the next player in order starts in `roll`. The game then passes through
`show` (a short beat, see Timers) and `over`.

## Jail

A player goes to Jail from space 30, from the Go to Jail card, or by throwing three doubles
in a row. Landing on the Jail space while just visiting does nothing.

In Jail, before rolling, a player may:

- pay $50 bail, or
- use a Get out of Jail free card, which goes to the bottom of its deck once used.

A roll of doubles gets you out and moves you by that roll, with no extra roll. Any other roll
ends the turn. On the third failed roll you pay the $50 and move by that roll.

## Buying and auctions

A player who lands on an unowned deed may buy it at its list price, if they have the cash.

If they decline and the auction option is on, the deed goes to auction:

- The opening bid is at least $1. Each bid must beat the current high and be covered by
  the bidder's cash.
- Every bid restarts the clock at 15 seconds.
- A player may pass. The top bidder may not.
- When every other player has passed, the top bidder wins. If nobody bid, nobody buys the
  deed, and it stays unowned.

## Rent

- **Streets** charge the rent in the board's table for their house count (bare, one to four
  houses, then a hotel). A bare deed in a full colour group charges double.
- **Inns** charge $25, doubled for each further inn the owner holds: $50, $100, $200.
- **Guilds** charge the dice total times four, or times ten if the owner holds both guilds.
- **Cards** change this. A Chance card that sends you to the nearest inn charges double rent
  there. The card that sends you to the nearest guild has you throw again and pay ten times
  that roll.
- A mortgaged deed charges no rent.

## Building

A house can go on a street only when its owner holds the whole colour group, and no deed in
the group is mortgaged. Inns and guilds cannot be built on.

- Build evenly. A street may not get a house while another in its group has fewer.
- A house costs the price shown for its street, and sells back at half.
- A fifth building is a hotel. It costs one house price, uses a hotel from the bank, and
  returns the bank's four houses.
- The bank holds 32 houses and 12 hotels. A build is refused when the bank has none left.
- Sell evenly as well: no street may keep more buildings than another in its group.
  Selling a hotel brings it back to four houses if the bank has them, and otherwise to as
  many as the bank has.

## Mortgages

A deed can be mortgaged if it has no buildings anywhere in its group. The bank pays half its
price, and the deed collects no rent until the mortgage is lifted. Lifting costs the loan
plus 10%, rounded up. A group with a mortgage on it cannot be built on until the mortgage is
lifted.

## Debts and bankruptcy

A payment is made at once when the payer has the cash and nothing is already owed ahead of
it. Otherwise it joins a queue of debts.

- The first debt in the queue is paid as soon as the debtor has the cash.
- If the debtor's cash, plus half the value of their buildings, plus the mortgage value of
  their unmortgaged deeds still cannot cover it, they go bankrupt at once.
- Otherwise the game enters `debt`. Only the debtor's turn moves on. They raise the money by
  selling, mortgaging or trading, or give up with the bankrupt action. Other players can
  still trade and sell or mortgage their own deeds, but cannot build or lift mortgages.

On bankruptcy the buildings go back to the bank for half their cost. The rest of the estate
(cash, deeds with their mortgages, and Jail cards) goes to the creditor. If the creditor is
the bank, the deeds become unowned and the Jail cards return to the bottom of their decks.
Debts owed to the bankrupt player become owed to the bank, and their open offers are dropped.

## Trades

Any player may offer any other player cash, deeds and Jail cards, on both sides. An empty
offer is refused.

- Cash must be in hand when the offer is made.
- A deed must be owned by the side giving it, and must have no buildings in its colour group.
  Mortgaged deeds may be traded.
- A player has one open offer at a time. A new one replaces the old.
- The recipient accepts or rejects, and the proposer may cancel. Acceptance checks both sides
  again. An accepted trade also removes other open offers over the same deeds.

Offers do not end a turn or stop the game. The clock does not answer them for anyone. Offers
are not accepted during an auction.

## Public and hidden

Everything at a Monopoly table is public except the order of the two card decks. That is
the only thing the state keeps secret, and it never reaches any view.

Cash, positions, deeds with their houses and mortgages, the dice, the card just drawn, every
move, the debts, the open offers, the log, the bank's stock, and the Free Parking pot are
all shown to every player and to the TV. A player's Jail cards show as a count.

## Timers

- **Turn timer.** One clock runs in `roll`, `buy`, `done` and `debt`. It restarts when the
  turn or the state changes, and when the player the table is waiting on acts. Out of time:
  a roll is thrown for the player, an unbought deed is declined (to auction if that option
  is on), the turn ends in `done`, and in `debt` the table raises what it can and then
  declares bankruptcy if the debt is still unpaid.
- **Auction.** Always 15 seconds after the last bid, whatever the turn timer says. When it
  runs out the top bidder wins.
- **Show.** After the game's last moment, the table holds for 3.6 seconds (`SHOW_MS`) before
  the results. During the beat there is no one to wait on.

## Ended early

`partialResult` is null before anything has happened. After that the leader is the richest
player by net worth: cash, plus each deed at its price (half if mortgaged), plus buildings at
their cost. Ties share the lead, and the result reads "Level on worth."

The round limit counts turns around the table. When the order wraps past 20 or 30 rounds the
game ends, and the richest player wins with the same measure.

## Simplifications

These differ from the printed rules:

- A mortgaged deed changes hands in a trade without the 10% fee.
- A deed owed to the bank by a bankrupt player goes back unowned, rather than being auctioned.
- A hotel sold when the bank has fewer than four houses comes down to what the bank has.

## Testing

- Rules (`rules.test.ts`): moving, GO, doubles, Jail, every card kind, buying, auctions and
  their clock, rent for streets, inns and guilds, building and selling evenly with the bank's
  limits, mortgages, debts and bankruptcy, trades, both endings, the turn timer, and a leak
  test that the deck order never reaches any view.
- End to end (`apps/web/e2e/monopoly.spec.ts`): a host plays turns against two bots on a phone
  while the TV shows the board.
- Bots: whole games played to the end by bots alone, with a round limit and with last one
  standing, one with the bank keeping unbought land and a Free Parking pot, and a check
  that a bot turns down a trade that hands over a full set.
