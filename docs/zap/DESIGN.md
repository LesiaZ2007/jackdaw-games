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

## Look

Kings' printed puzzle book with an orange line: ink numbers in circles, heavy walls, a double-ruled
frame. Press on 1 and drag; dragging back over the line takes it back, and a tap next to the end of
the line extends it (a tap on the line cuts it there). The squares behind the line are tinted. A
number reached out of order turns red, and a full board that's wrong says why. Undo and Clear sit
under the board on a phone and beside it on a laptop.

The TV, spectating and the results are Kings', with a bar for how much of the board each player has
drawn and the answers drawn as lines.
