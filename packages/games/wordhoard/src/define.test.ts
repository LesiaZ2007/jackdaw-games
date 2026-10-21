import { describe, expect, it } from 'vitest';
import { fromFreeDictionary, fromWiktionary, stripHtml } from './define';

describe('definitions', () => {
  it('takes one sense per part of speech from dictionaryapi.dev', () => {
    const body = [
      {
        word: 'hoard',
        meanings: [
          {
            partOfSpeech: 'noun',
            definitions: [{ definition: 'A hidden supply or fund.' }, { definition: 'A trove.' }],
          },
          { partOfSpeech: 'verb', definitions: [{ definition: 'To amass.' }] },
          { partOfSpeech: 'adjective', definitions: [{ definition: 'Never shown.' }] },
        ],
      },
    ];
    expect(fromFreeDictionary(body)).toEqual([
      { part: 'noun', text: 'A hidden supply or fund.' },
      { part: 'verb', text: 'To amass.' },
    ]);
  });

  it('reads nothing from an error body', () => {
    expect(fromFreeDictionary({ title: 'No Definitions Found' })).toEqual([]);
    expect(fromWiktionary(null)).toEqual([]);
  });

  it('turns Wiktionary HTML into plain English senses', () => {
    const body = {
      en: [
        {
          partOfSpeech: 'Noun',
          definitions: [
            { definition: '<span class="x"></span>' },
            {
              definition:
                'Alternative form of <i><a href="/wiki/chi">chi</a></i>: life force &amp; energy.',
            },
          ],
        },
      ],
      sq: [{ partOfSpeech: 'Conjunction', definitions: [{ definition: 'që' }] }],
    };
    expect(fromWiktionary(body)).toEqual([
      { part: 'noun', text: 'Alternative form of chi: life force & energy.' },
    ]);
  });

  it('passes over symbols and abbreviations when a word has a real meaning', () => {
    const body = {
      en: [
        { partOfSpeech: 'Symbol', definitions: [{ definition: 'ISO 639-3 code for Semai.' }] },
        { partOfSpeech: 'Noun', definitions: [{ definition: 'A large body of salt water.' }] },
      ],
    };
    expect(fromWiktionary(body)).toEqual([{ part: 'noun', text: 'A large body of salt water.' }]);
    expect(fromWiktionary({ en: [body.en[0]] })).toEqual([
      { part: 'symbol', text: 'ISO 639-3 code for Semai.' },
    ]);
  });

  it('cuts a long definition at a word', () => {
    const long = 'word '.repeat(60);
    const [sense] = fromFreeDictionary([
      { meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: long }] }] },
    ]);
    expect(sense!.text.length).toBeLessThanOrEqual(181);
    expect(sense!.text.endsWith('word…')).toBe(true);
  });

  it('strips tags and entities', () => {
    expect(stripHtml('<b>a</b> &lt;b&gt; &#39;c&#39;')).toBe("a <b> 'c'");
  });
});
