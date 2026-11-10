import { describe, expect, it } from 'vitest';
import { catalog } from './catalog';
import { boxes } from './games-lite';

describe('the home page’s light list of games', () => {
  it('lists the same games as the full catalog, in the same order', () => {
    expect(boxes.map((b) => b.meta.id)).toEqual(catalog.map((e) => e.meta.id));
  });

  it('prints each box exactly as the full catalog does', () => {
    for (const entry of catalog) {
      const box = boxes.find((b) => b.meta.id === entry.meta.id);
      expect(box?.art, entry.meta.id).toEqual(entry.art);
      expect(box?.meta, entry.meta.id).toEqual(entry.meta);
    }
  });
});
