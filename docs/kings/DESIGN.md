# Kings

LinkedIn's Queens, called Kings, for 1 to 15 players in Jackdaw's lobby (Lesia, 2026-10-26:
"choose the size of the board, play by yourself or race your friends in one, five, 10 puzzles
(slider between 1-20), generate random puzzles").

## Rules

An N×N board is cut into N coloured regions. Place N kings: one in every row, every column and
every region, and no two touching, not even at a corner. Boards run from 5×5 to 10×10.

## Puzzles

`src/puzzle.ts` makes every puzzle fresh from the session's rng, and each has exactly one answer:

1. Lay out an answer: one king a row and a column, none touching.
2. Grow a region out from each king, a square at a time from a random region's edge (regions
   grow at different rates, so some are long and thin and some broad).
3. While a second answer exists, hand one of its squares to a neighbouring region (keeping every
   region in one piece and every king of the first answer in place). A board that won't settle
   is thrown away.
4. Shuffle the region numbers, so a colour says nothing about where its king is.

About 55 ms on average at 10×10 (230 ms at worst); 11×11 takes seconds, so 10 is the largest.
Puzzles are made when the first player reaches them, so a 20-puzzle race doesn't hold up Start.

## The race

Everyone gets the same puzzles in the same order. Marks stay on the phone (kept per puzzle in
`sessionStorage`). Where your kings are goes to the server a moment after you stop tapping
(`progress`), and a finished board is sent as `solve`, which the server checks. The table only
ever says how many kings each player has placed; where they are goes to players who have finished
every puzzle, so they can watch the rest (2026-10-26: "once done with your puzzles enter spectate
mode and you can see others' progress"), and to the TV when one person plays alone. Most puzzles
solved wins; the quickest to get there breaks a tie. Once someone has solved them all, the rest get
two minutes (`CLOSE_MS`). Alone it ends when the last puzzle is solved. Ending early saves the race
so far.

Bots work a puzzle the way a person does: kings go down over the puzzle's time, smallest region
first, now and then one in the wrong square of the right region, so the TV and anyone watching see
them build up. The time is per square of board (about 0.9 s at Easy, 0.5 s at Normal, 0.3 s at
Hard), varied each puzzle, and slips get rarer with the level.

## Look

A printed puzzle book: region inks in ten soft printed colours (the same by day and in the dark),
heavy ink where regions meet, a double-ruled frame. A tap crosses a square out, a second places a
king, a third clears; dragging crosses out a row of squares. Kings that break a rule turn red and
hatched. Auto-cross (per device) faintly crosses out what your kings rule out. Undo, Clear and
Auto-cross sit in a row under the board on a phone and stack as large buttons beside it on a
laptop.

The TV gives every player a card: their place, clock, the puzzle they're on, a crown for each king
placed, and a stamp when they solve one. Above sits the race clock (the countdown once it's
closing) and who leads; below, the latest solves. Past eight players each card puts its board
beside the rest. Phones watching, and players who have finished, get the same cards with the kings
drawn in.

The results list everyone in finishing order with their total and a chip for each puzzle's time
(the fastest on each picked out), or for one player their total, fastest and average; then every
answer with who solved it quickest. The TV shows the fastest solve and every answer.

## Platform addition

The lobby's options panel draws a number option whose range is 10 or more as a slider with − and

- beside it (Kings' puzzles, 1 to 20). It saves when the slider is let go.
