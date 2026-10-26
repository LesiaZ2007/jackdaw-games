import type { Names } from './board';

/**
 * Chance and Community Chest: sixteen cards each, the classic cards. The market-town board words
 * them its own way (TOWN_TEXT); the effects are the same.
 */

export type CardEffect =
  | { t: 'advance'; to: number }
  | { t: 'nearestRailroad' }
  | { t: 'nearestUtility' }
  | { t: 'back'; n: number }
  | { t: 'jail' }
  | { t: 'free' }
  | { t: 'collect'; n: number }
  | { t: 'pay'; n: number }
  | { t: 'repairs'; house: number; hotel: number }
  | { t: 'payEach'; n: number }
  | { t: 'collectEach'; n: number };

export type Deck = 'chance' | 'chest';

export interface Card {
  id: string;
  deck: Deck;
  text: string;
  effect: CardEffect;
}

const card = (deck: Deck, n: number, text: string, effect: CardEffect): Card => ({
  id: `${deck}${n}`,
  deck,
  text,
  effect,
});

export const CHANCE: readonly Card[] = [
  card('chance', 1, 'Advance to GO. Collect $200.', { t: 'advance', to: 0 }),
  card('chance', 2, 'Advance to Illinois Avenue. If you pass GO, collect $200.', {
    t: 'advance',
    to: 24,
  }),
  card('chance', 3, 'Advance to St. Charles Place. If you pass GO, collect $200.', {
    t: 'advance',
    to: 11,
  }),
  card(
    'chance',
    4,
    'Advance to the nearest utility. If it is owned, roll the dice and pay the owner ten times the throw.',
    { t: 'nearestUtility' },
  ),
  card(
    'chance',
    5,
    'Advance to the nearest railroad. If it is owned, pay the owner twice the rent.',
    {
      t: 'nearestRailroad',
    },
  ),
  card(
    'chance',
    6,
    'Advance to the nearest railroad. If it is owned, pay the owner twice the rent.',
    {
      t: 'nearestRailroad',
    },
  ),
  card('chance', 7, 'The bank pays you a dividend of $50.', { t: 'collect', n: 50 }),
  card('chance', 8, 'Get out of Jail free. Keep this card until you need it.', { t: 'free' }),
  card('chance', 9, 'Go back three spaces.', { t: 'back', n: 3 }),
  card('chance', 10, 'Go to Jail. Do not pass GO, do not collect $200.', { t: 'jail' }),
  card(
    'chance',
    11,
    'Make general repairs on all your property: pay $25 for each house and $100 for each hotel.',
    {
      t: 'repairs',
      house: 25,
      hotel: 100,
    },
  ),
  card('chance', 12, 'Speeding fine: pay $15.', { t: 'pay', n: 15 }),
  card('chance', 13, 'Take a trip to Reading Railroad. If you pass GO, collect $200.', {
    t: 'advance',
    to: 5,
  }),
  card('chance', 14, 'Advance to Boardwalk.', { t: 'advance', to: 39 }),
  card('chance', 15, 'You have been elected chairman of the board. Pay each player $50.', {
    t: 'payEach',
    n: 50,
  }),
  card('chance', 16, 'Your building loan matures. Collect $150.', { t: 'collect', n: 150 }),
];

export const CHEST: readonly Card[] = [
  card('chest', 1, 'Advance to GO. Collect $200.', { t: 'advance', to: 0 }),
  card('chest', 2, 'Bank error in your favour. Collect $200.', {
    t: 'collect',
    n: 200,
  }),
  card('chest', 3, "Doctor's fee. Pay $50.", { t: 'pay', n: 50 }),
  card('chest', 4, 'From the sale of stock you get $50.', { t: 'collect', n: 50 }),
  card('chest', 5, 'Get out of Jail free. Keep this card until you need it.', { t: 'free' }),
  card('chest', 6, 'Go to Jail. Do not pass GO, do not collect $200.', { t: 'jail' }),
  card('chest', 7, 'Holiday fund matures. Collect $100.', { t: 'collect', n: 100 }),
  card('chest', 8, 'Income tax refund. Collect $20.', { t: 'collect', n: 20 }),
  card('chest', 9, 'It is your birthday. Collect $10 from each player.', {
    t: 'collectEach',
    n: 10,
  }),
  card('chest', 10, 'Life insurance matures. Collect $100.', { t: 'collect', n: 100 }),
  card('chest', 11, 'Pay hospital fees of $100.', { t: 'pay', n: 100 }),
  card('chest', 12, 'Pay school fees of $50.', { t: 'pay', n: 50 }),
  card('chest', 13, 'Receive a $25 consultancy fee.', { t: 'collect', n: 25 }),
  card(
    'chest',
    14,
    'You are assessed for street repairs: pay $40 for each house and $115 for each hotel.',
    {
      t: 'repairs',
      house: 40,
      hotel: 115,
    },
  ),
  card('chest', 15, 'You have won second prize in a beauty contest. Collect $10.', {
    t: 'collect',
    n: 10,
  }),
  card('chest', 16, 'You inherit $100.', { t: 'collect', n: 100 }),
];

const ALL = new Map([...CHANCE, ...CHEST].map((c) => [c.id, c]));

export function cardById(id: string): Card {
  const found = ALL.get(id);
  if (!found) throw new RangeError(`No card ${id}`);
  return found;
}

/** The market town's wording of each card. */
const TOWN_TEXT: Readonly<Record<string, string>> = {
  chance2: 'Ride to Raven Hill. If you pass GO, collect $200.',
  chance3: 'Take the long way to Chapel Close. If you pass GO, collect $200.',
  chance4:
    'Advance to the nearest guild. If it is owned, roll and pay the owner ten times the dice.',
  chance5: 'Advance to the nearest inn. If it is owned, pay the owner twice the rent.',
  chance6: 'Advance to the nearest inn. If it is owned, pay the owner twice the rent.',
  chance11: 'Mend your roofs: pay $25 for each house and $100 for each hotel.',
  chance12: 'Fined $15 for racing your cart through the market.',
  chance13: 'Take a room at The Swan. If you pass GO, collect $200.',
  chance14: 'Stroll up to Crown Terrace.',
  chance15: 'You are made mayor. Pay each player $50.',
  chance16: 'Your loan to the mill comes good. Collect $150.',
  chest2: 'The counting house errs in your favour. Collect $200.',
  chest3: 'The physician calls. Pay $50.',
  chest4: 'You sell your share in a wool ship. Collect $50.',
  chest7: 'The harvest fair pays out. Collect $100.',
  chest8: 'The tithe was overpaid. Collect $20.',
  chest9: 'It is your name day. Collect $10 from each player.',
  chest10: 'Your annuity falls due. Collect $100.',
  chest11: 'Pay the apothecary $100.',
  chest12: 'Pay the schoolmaster $50.',
  chest13: 'You advise the guild masters. Collect $25.',
  chest14: 'The street wardens call: pay $40 for each house and $115 for each hotel.',
  chest15: 'Second prize at the May fair. Collect $10.',
  chest16: 'An uncle leaves you $100.',
};

/** A card's words on this board. */
export function cardText(id: string, names: Names = 'classic'): string {
  return (names === 'town' ? TOWN_TEXT[id] : undefined) ?? cardById(id).text;
}
