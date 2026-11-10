import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

/** `--table` inside the block that starts at `marker` in tokens.css. */
function table(css: string, marker: string): string {
  const at = css.indexOf(marker);
  expect(at).toBeGreaterThan(-1);
  return /--table:\s*(#[0-9a-f]{6})/i.exec(css.slice(at))![1]!.toLowerCase();
}

describe('theme-color literals', () => {
  const tokens = read('../../../packages/ui/src/tokens.css');
  const day = table(tokens, ':root {');
  const dark = table(tokens, ":root[data-theme='dark'] {");

  it('layout.tsx matches --table in day and dark', () => {
    const layout = read('../app/layout.tsx').toLowerCase();
    expect(layout).toContain(`color: '${day}'`);
    expect(layout).toContain(`color: '${dark}'`);
  });

  it('manifest.ts matches the dark --table', () => {
    const manifest = read('../app/manifest.ts').toLowerCase();
    expect(manifest).toContain(`theme_color: '${dark}'`);
    expect(manifest).toContain(`background_color: '${dark}'`);
  });
});
