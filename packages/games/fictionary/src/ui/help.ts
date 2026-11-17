/** One plain line for each option's choices: under the options in the lobby. */
export const optionHelp: Record<string, Record<string, string>> = {
  deck: {
    Mixed: 'Strange facts and strange words, shuffled together.',
    Facts: 'True facts with a blank: animals, history, space and more.',
    Words: 'The classic: real words nobody knows. Invent what they mean.',
  },
  length: {
    Short: '2 cards in each round, then the Final Fib.',
    Standard: '3 cards in each round, then the Final Fib.',
    Long: '4 cards in each round, then the Final Fib.',
  },
  timer: {
    Relaxed: '90 seconds to write a lie, 40 to pick.',
    Quick: '50 seconds to write a lie, 25 to pick.',
    Off: 'No clock. Anyone who’s done can give the rest 20 seconds.',
  },
  tabs: {
    'Chooser picks': 'Players take turns choosing the tab for the next card.',
    Random: 'Every card comes from a random tab.',
  },
};
