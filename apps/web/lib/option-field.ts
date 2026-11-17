import type { ZodType } from 'zod';
/** Defaults affect parsing, not which kind of control an option needs. */
export function optionField(field: ZodType): ZodType {
  const description = field.description;
  let inner = field;
  while ((inner as unknown as { def: { type: string } }).def.type === 'default')
    inner = (inner as unknown as { unwrap(): ZodType }).unwrap();
  return description && !inner.description ? inner.describe(description) : inner;
}
