import type { Fact } from './bank/types';

/**
 * Whether a typed lie is really the truth, so it can be refused ("That's the truth! Write a lie
 * instead."). Generous on purpose: case, accents, punctuation, a leading "a", "an" or "the",
 * number words and a single typo in a longer answer all still count as the truth.
 */

const NUMBERS: Record<string, string> = {
  zero: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  eleven: '11',
  twelve: '12',
  thirteen: '13',
  fourteen: '14',
  fifteen: '15',
  sixteen: '16',
  seventeen: '17',
  eighteen: '18',
  nineteen: '19',
  twenty: '20',
  thirty: '30',
  forty: '40',
  fifty: '50',
  hundred: '100',
  thousand: '1000',
  million: '1000000',
};

/** The words of an answer, stripped down to what tells it apart. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/(\d),(\d{3})/g, '$1$2')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => NUMBERS[w] ?? w)
    .filter((w, i) => !(i === 0 && (w === 'a' || w === 'an' || w === 'the')))
    .join(' ')
    .replace(/^(1|a) (100|1000|1000000)\b/, '$2');
}

/** Edits to turn one string into the other, giving up past `max`. */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(
        prev[j]! + 1,
        row[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      row.push(v);
      best = Math.min(best, v);
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length]!;
}

export function isTruth(text: string, fact: Pick<Fact, 'a' | 'alt'>): boolean {
  const typed = normalize(text);
  if (!typed) return false;
  for (const answer of [fact.a, ...(fact.alt ?? [])]) {
    const truth = normalize(answer);
    if (!truth) continue;
    if (typed === truth) return true;
    // "parliaments", "parlament": one slip in an answer long enough that it can't be another word.
    const t = typed.replace(/s$/, '');
    const a = truth.replace(/s$/, '');
    if (t === a) return true;
    if (a.length >= 6 && !/\d/.test(a) && distance(t, a, 1) <= 1) return true;
  }
  return false;
}
