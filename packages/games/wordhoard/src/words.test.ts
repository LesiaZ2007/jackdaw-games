import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.doUnmock('#packed-words');
  vi.resetModules();
});

describe('a word list kept outside the bundle', () => {
  it('is missing until provided, then checks words from it', async () => {
    vi.resetModules();
    vi.doMock('#packed-words', () => ({ PACKED_WORDS: '' }));
    const { isWord, provideWords, wordsMissing } = await import('./words');
    expect(wordsMissing()).toBe(true);
    // The packed form: a capital letter says how many letters to keep from the previous word.
    provideWords('AhoardFs');
    expect(wordsMissing()).toBe(false);
    expect(isWord('HOARD')).toBe(true);
    expect(isWord('hoards')).toBe(true);
    expect(isWord('QI')).toBe(true);
    expect(isWord('jackdaw')).toBe(false);
  });

  it('is never missing when the bundle has it', async () => {
    const { wordsMissing } = await import('./words');
    expect(wordsMissing()).toBe(false);
  });
});
