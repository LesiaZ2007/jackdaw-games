# Fictionary: design

2026-11-16: "as big of a fact bank as possible… make it the best it can be". Fictionary is the
old parlor game (the Dictionary game) grown into bluffing trivia: every card is a true but unlikely
fact, or a real word nobody knows, with one blank. Everyone writes a lie for the blank, then
everyone tries to pick the truth out of all the lies.

## A game

- 2 to 12 players. Three rounds: Round 1, Round 2 (points doubled) and the Final Fib (one card,
  points tripled). Length is Short (2 + 2 + 1 cards), Standard (3 + 3 + 1) or Long (4 + 4 + 1).
- **Choose.** A rotating chooser picks one of three tabs (categories) for the card, with 20
  seconds before one is picked for them. With the Tabs option on Random, or a deck with one tab
  (Words), cards are dealt straight away.
- **Write.** Everyone writes a lie of up to 40 characters. Typing the truth is refused ("That's the
  truth! Write a lie instead."), forgiving case, articles, punctuation, number words, a plural and
  one typo (`truth.ts`). "Help me lie" hands you two of the card's four house lies, once.
- **Pick.** The truth, every lie (the same lie from two players merges into one answer, credited
  to both) and house lies up to at least four answers, shuffled and lettered. You can't pick your
  own lie. One like per card, during the pick or the reveal.
- **Reveal.** Each lie that fooled someone is stamped FIB with its author and its victims, fewest
  fooled first, then the truth is stamped FACT with the story behind it, then the scores.
- **Scores**, times the round: 1000 for finding the truth, 500 to each author for every player
  their lie fooled, 100 for every like. Awards: Biggest fib, Crowd favorite.
- **Timer** Relaxed (90 s to write, 40 to pick), Quick (50 / 25) or Off. With no clock, anyone
  who's done can give the rest 20 seconds.

## The bank

`src/bank/`, one file per tab, each card `{ q, a, alt?, lies[4], note, src }` (`types.ts`). Every
card is true and checkable on the Wikipedia article named in `src` (Wiktionary for words); a test
checks the shape of every card, that no house lie reads as the truth, and that no card repeats.
The bank is imported only by the rules, never by a screen, so the answers never reach a browser:
views carry the card in play, and its answer and note only from the reveal on.

## Requests

Plain polling, nothing live: one request per choose, write, help, pick or like. The reveal is
timed from `revealAt` and plays on every screen without polling, then moves on by itself.

## Bots

A bot knows no more than a person in its seat, so it never knows the truth: it asks the house
for help, writes one of the lies it's handed, and picks among the answers that aren't its own.

## Look: "The Dictionary of Fibs"

A page of an old dictionary: cream paper, charcoal ink, an oxblood binding, thumb-index tabs in
each category's color. The card is set as an entry with its blank as a ruled line (your own lie
pencilled in as you type, the truth inked in green on the reveal); answers are lettered senses;
the reveal slams rubber stamps onto slips (FIB in gules, FACT in vert); scores are the book's
index with dot leaders. The TV is the open book: the entry on the left page, the answers or the
reveal on the right, the index along the foot. Dark is the same book by lamplight. Jackdaw's
lobby. Colors at the top of `fictionary.css`, prefix `fic`.
