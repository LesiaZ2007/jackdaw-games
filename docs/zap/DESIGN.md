# Zap

LinkedIn's Zip, called Zap, for 1 to 15 players in Jackdaw's lobby (Lesia, 2026-10-26: "let's do a
very similar thing with Zip from LinkedIn, but call it Zap"). It plays like Kings: choose the board,
play alone or race over 1 to 20 puzzles, every puzzle fresh with exactly one answer.

## Rules

An N×N board has numbered squares and a few walls between squares. Draw one line from 1 that steps
to a square next door each time, goes through the numbers in order, never crosses itself and fills
every square. Boards run from 5×5 to 8×8.

## Puzzles

`src/puzzle.ts` makes every puzzle fresh from the session's rng, and each has exactly one answer:

1. Lay out an answer: a snake through every square, scrambled by many backbite moves, so it winds
   rather than sweeping row by row.
2. Put numbers on it, spread evenly along the line, the first at its start and the last at its end.
3. While a second answer exists, either wall off a step that answer takes and the real one doesn't,
   or number the square where it first parts from the real line. If the search runs long, a number
   goes in the longest gap between numbers, which narrows the search.

The solver walks the line square by square, keeps the numbers in order, and gives up on a branch
that leaves a dead end or cuts the empty squares in two. About 35 ms on average at 8×8 (170 ms at
worst); 9×9 is too slow to be sure of, so 8 is the largest. Puzzles are made when the first player
reaches them, so a 20-puzzle race doesn't hold up Start.

## The race

As in Kings: everyone gets the same puzzles in the same order, the line stays on the phone (kept
per puzzle in `sessionStorage`), the line so far goes to the server a moment after you stop
drawing (`progress`), and a full line is sent as `solve`, which the server checks. The table only
ever says how many squares each player has drawn; the line itself goes to players who have
finished every puzzle, so they can watch the rest, and to the TV when one person plays alone. Most
puzzles solved wins; the quickest to get there breaks a tie. Once someone has solved them all, the
rest get two minutes (`CLOSE_MS`). Alone it ends when the last puzzle is solved.

Bots draw the answer a stretch at a time over the puzzle's time, slow at first and quicker at the
end, now and then wandering a square or two off it and back. The time is per square of board
(about 1.1 s at Easy, 0.65 s at Normal, 0.38 s at Hard), varied each puzzle, and wrong turns get
rarer with the level.

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

Hints follow the line: start on 1, then the only way on from here, a square that would be cut
off if the line doesn't take it now, or the next number when it's right beside the end. Otherwise
it shows the next square of the answer. A mistake is where the line first leaves the answer, and
Hint says to take it back to the square before.

## Look

Kings' printed puzzle book with an orange line: ink numbers in circles, heavy walls, a double-ruled
frame. Press on 1 and drag; dragging back over the line takes it back, and a tap next to the end of
the line extends it (a tap on the line cuts it there). Dragging into older line only stops the
finger; nothing is lost unless you press on the line on purpose (2026-10-26: "it should only set
back progress if I set my finger at that point on purpose"). The line stops at the last number
(2026-10-26: "the last point should be the last number"). While drawing, its tip leans from the
end square toward the finger, up to the edge of a square it could go to, and a quick or diagonal
drag fills in the squares between. The squares behind the line are tinted. A
number reached out of order turns red, and a full board that's wrong says why. Undo and Clear sit
under the board on a phone and beside it on a laptop.

The TV, spectating and the results are Kings', with a bar for how much of the board each player has
drawn and the answers drawn as lines.
