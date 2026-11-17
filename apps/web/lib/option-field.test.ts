import { it, expect } from 'vitest';
import { z } from 'zod';
import { optionField } from './option-field';
import { optionsSummary } from './lobby-view';
it('keeps a defaulted difficulty selectable and describes its legacy default', () => {
  const schema = z.object({
    size: z.enum(['mini', 'giant']),
    difficulty: z.enum(['easy', 'normal', 'hard']).default('normal').describe('Puzzle difficulty'),
  });
  const field = optionField(schema.shape.difficulty) as z.ZodEnum<{
    easy: 'easy';
    normal: 'normal';
    hard: 'hard';
  }>;
  expect(field.options).toEqual(['easy', 'normal', 'hard']);
  expect(field.description).toBe('Puzzle difficulty');
  expect(optionsSummary(schema, { size: 'giant' })).toContain('Puzzle difficulty: Normal');
});
