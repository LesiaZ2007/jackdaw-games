/**
 * Chance and Community Chest: sixteen cards each, the classic effects in the town's own words.
 */

export type CardEffect =
  | { t: 'advance'; to: number }
  | { t: 'nearestInn' }
  | { t: 'nearestGuild' }
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
  card('chance', 2, 'Ride to Raven Hill. If you pass GO, collect $200.', { t: 'advance', to: 24 }),
  card('chance', 3, 'Take the long way to Chapel Close. If you pass GO, collect $200.', {
    t: 'advance',
    to: 11,
  }),
  card(
    'chance',
    4,
    'Advance to the nearest guild. If it is owned, roll and pay the owner ten times the dice.',
    { t: 'nearestGuild' },
  ),
  card('chance', 5, 'Advance to the nearest inn. If it is owned, pay the owner twice the rent.', {
    t: 'nearestInn',
  }),
  card('chance', 6, 'Advance to the nearest inn. If it is owned, pay the owner twice the rent.', {
    t: 'nearestInn',
  }),
  card('chance', 7, 'The bank pays you a dividend of $50.', { t: 'collect', n: 50 }),
  card('chance', 8, 'Get out of Jail free. Keep this card until you need it.', { t: 'free' }),
  card('chance', 9, 'Go back three spaces.', { t: 'back', n: 3 }),
  card('chance', 10, 'Go to Jail. Do not pass GO, do not collect $200.', { t: 'jail' }),
  card('chance', 11, 'Mend your roofs: pay $25 for each house and $100 for each hotel.', {
    t: 'repairs',
    house: 25,
    hotel: 100,
  }),
  card('chance', 12, 'Fined $15 for racing your cart through the market.', { t: 'pay', n: 15 }),
  card('chance', 13, 'Take a room at The Swan. If you pass GO, collect $200.', {
    t: 'advance',
    to: 5,
  }),
  card('chance', 14, 'Stroll up to Crown Terrace.', { t: 'advance', to: 39 }),
  card('chance', 15, 'You are made mayor. Pay each player $50.', { t: 'payEach', n: 50 }),
  card('chance', 16, 'Your loan to the mill comes good. Collect $150.', { t: 'collect', n: 150 }),
];

export const CHEST: readonly Card[] = [
  card('chest', 1, 'Advance to GO. Collect $200.', { t: 'advance', to: 0 }),
  card('chest', 2, 'The counting house errs in your favour. Collect $200.', {
    t: 'collect',
    n: 200,
  }),
  card('chest', 3, 'The physician calls. Pay $50.', { t: 'pay', n: 50 }),
  card('chest', 4, 'You sell your share in a wool ship. Collect $50.', { t: 'collect', n: 50 }),
  card('chest', 5, 'Get out of Jail free. Keep this card until you need it.', { t: 'free' }),
  card('chest', 6, 'Go to Jail. Do not pass GO, do not collect $200.', { t: 'jail' }),
  card('chest', 7, 'The harvest fair pays out. Collect $100.', { t: 'collect', n: 100 }),
  card('chest', 8, 'The tithe was overpaid. Collect $20.', { t: 'collect', n: 20 }),
  card('chest', 9, 'It is your name day. Collect $10 from each player.', {
    t: 'collectEach',
    n: 10,
  }),
  card('chest', 10, 'Your annuity falls due. Collect $100.', { t: 'collect', n: 100 }),
  card('chest', 11, 'Pay the apothecary $100.', { t: 'pay', n: 100 }),
  card('chest', 12, 'Pay the schoolmaster $50.', { t: 'pay', n: 50 }),
  card('chest', 13, 'You advise the guild masters. Collect $25.', { t: 'collect', n: 25 }),
  card('chest', 14, 'The street wardens call: pay $40 for each house and $115 for each hotel.', {
    t: 'repairs',
    house: 40,
    hotel: 115,
  }),
  card('chest', 15, 'Second prize at the May fair. Collect $10.', { t: 'collect', n: 10 }),
  card('chest', 16, 'An uncle leaves you $100.', { t: 'collect', n: 100 }),
];

const ALL = new Map([...CHANCE, ...CHEST].map((c) => [c.id, c]));

export function cardById(id: string): Card {
  const found = ALL.get(id);
  if (!found) throw new RangeError(`No card ${id}`);
  return found;
}
