import type { Card, Clue, CodenamesTableView, Guess } from './rules';
import { TEAM_NAME, type Team } from './teams';

/**
 * The latest guess, found from the public table only (every guessed word's colour is public), so
 * phones and the TV can mark it without any hidden information.
 */
export function lastGuess(
  t: Pick<CodenamesTableView, 'clues'>,
): { clue: Clue; guess: Guess } | null {
  for (let i = t.clues.length - 1; i >= 0; i--) {
    const clue = t.clues[i]!;
    const guess = clue.guesses[clue.guesses.length - 1];
    if (guess) return { clue, guess };
  }
  return null;
}

/**
 * How a guess went for one viewer: a win or loss for the guessing team's players, a reveal for
 * everyone else (the other team, and anyone watching).
 */
export function guessOutcome(
  clue: Clue,
  guess: Guess,
  myTeam: Team | null,
): 'win' | 'loss' | 'reveal' {
  if (myTeam !== clue.team) return 'reveal';
  return guess.card === clue.team ? 'win' : 'loss';
}

export function cardName(card: Card): string {
  if (card === 'bystander') return 'a bystander';
  if (card === 'assassin') return 'the assassin';
  return `${TEAM_NAME[card]}'s`;
}

/** The headline for a guess, from the guessing team's side or a watcher's. */
export function guessTitle(word: string, clue: Clue, guess: Guess, myTeam: Team | null): string {
  const w = word.charAt(0) + word.slice(1).toLowerCase();
  const mine = myTeam === clue.team;
  if (guess.card === 'assassin')
    return mine ? `${w} was the assassin` : `${TEAM_NAME[clue.team]} hit the assassin`;
  if (guess.card === clue.team)
    return mine ? `${w} is one of ours` : `${TEAM_NAME[clue.team]} found ${w}`;
  if (guess.card === 'bystander')
    return mine ? `${w} is a bystander` : `${TEAM_NAME[clue.team]} hit a bystander`;
  return mine
    ? `${w} was ${TEAM_NAME[guess.card]}'s`
    : `${TEAM_NAME[clue.team]} found one of ${TEAM_NAME[guess.card]}'s`;
}

/** One plain line under the headline. */
export function guessDetail(clue: Clue, guess: Guess, name: (id: string) => string): string {
  const who = name(guess.by);
  const end =
    clue.ended === 'bystander' || clue.ended === 'other-team'
      ? ' The turn passes.'
      : clue.ended === 'limit'
        ? ' That was the last guess this turn.'
        : '';
  return `${who} guessed it for the clue ${clue.word} ${clue.count ?? '∞'}.${end}`;
}
