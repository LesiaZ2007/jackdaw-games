# Fandango

LinkedIn's Tango, called Fandango, for 1 to 15 players in Jackdaw's lobby (Lesia, 2026-10-26:
"same approach as Kings and Zap: build Fandango, our version of LinkedIn's Tango"). It plays like
Kings and Zap: choose the board, play alone or race over 1 to 20 puzzles, every puzzle fresh with
exactly one answer. It's a Mini game.

## Rules

Fill an N×N board (N even) with suns and moons. Every row and every column holds as many suns as
moons, and never three of the same next to each other across or down. An = between two squares
means they hold the same; an × means they differ. Some squares come filled in. Boards are 4×4,
6×6, 8×8 and 10×10.

## Puzzles

`src/puzzle.ts` makes every puzzle fresh from the session's rng. Each has exactly one answer, and
it can be reached by reasoning alone, without guessing:

1. Lay out an answer a row at a time, from the rows that keep the rules on their own, checking
   the columns as it goes.
2. Work out what follows from the clues so far: a sign with one side known gives the other, and a
   row or column whose every possible filling (given its squares and signs) agrees on a square
   fixes it. Where that gets stuck, fill in a square or add a sign beside one, and go again until
   the whole board follows.
3. Take clues away again in random order while the board still follows, stopping once clues
   number about three tenths of the squares, so puzzles stay friendly rather than bare. A 6×6
   ends with about six filled squares and five signs, like LinkedIn's.

Reasoning only ever finds what must be true, so a board it finishes has exactly one answer; the
tests also check that by search. About 2 ms on average at 6×6 and 13 ms at 10×10. Puzzles are made
when the first player reaches them, so a 20-puzzle race doesn't hold up Start.

## The race

As in Kings and Zap: everyone gets the same puzzles in the same order, the marks stay on the phone
(kept per puzzle in `sessionStorage`), the marks so far go to the server a moment after you stop
tapping (`progress`, kept without the squares that came filled in), and a full board is sent as
`solve`, which the server checks. The table only ever says how many squares each player has
filled; the marks themselves go to players who have finished every puzzle, so they can watch the
rest, and to the TV when one person plays alone. Most puzzles solved wins; the quickest to get
there breaks a tie. Once someone has solved them all, the rest get two minutes (`CLOSE_MS`). Alone
it ends when the last puzzle is solved.

Bots fill squares in the order reasoning finds them, slowly at first and quicker as the board
fills, now and then putting the wrong mark down and righting it a step later. The time is per
square of board (about 1.5 s at Easy, 0.9 s at Normal, 0.5 s at Hard), varied each puzzle, and
wrong marks get rarer with the level.

## Hints

Only when one person plays alone, and only if the lobby option _Hints when alone_ is on (it is by
default). Two plaques sit under the board: **Hint** and **Show a mistake**. The reasoning runs on
the phone (`src/hints.ts`), so nothing about the answer is sent anywhere new; the phone only tells
the server a hint was used (`hint`), and the server refuses that in a race or with hints off. The
table never sees hints, so they're never on the TV or in someone else's race.

A hint is a short note under the board, a ring round the square it's about, and a light shade over
the squares that explain it. It stays until the board changes. _Show a mistake_ rings the first
wrong mark in red, or says "No mistakes so far." (which isn't counted). If the board has a mistake,
Hint asks you to put that right first. Hints used are counted per puzzle and shown in the results
(the summary line says ", 3 hints", and the results card has a Hints line); a run with none reads
as before.

Hints try, in order: a = or × sign next to a filled square; two alike side by side, so the
squares either side are the other; a square between two alike; a row or column that already has
its share of one symbol; then trying every way a row or column could be finished and keeping what
they all agree on. A mistake is a mark that differs from the answer (squares that came filled in
can't be wrong).

## Look

The same printed puzzle book as Kings and Zap, the same by day and in the dark: amber suns with a
darker rim, blue crescent moons, squares that came filled in on a darker paper, and small inked =
and × signs sitting on the line between two squares. A tap gives a sun, a second a moon, a third
clears it. Marks that break a rule (three alike in a row, too many of one in a line, a sign not
kept) turn red over a hatched square, and a full board that's wrong says why. Undo and Clear sit
under the board on a phone and beside it on a laptop.

The TV, spectating and the results are Kings' and Zap's, with a bar for how much of the board each
player has filled and the answers drawn in full.
