import { test, expect, type APIRequestContext } from '@playwright/test';
import type { LobbySnapshot } from '@jackdaw/engine';
import type { CrosswordView } from '@jackdaw/game-crossword';
async function call(
  request: APIRequestContext,
  path: string,
  key: string | null,
  data?: unknown,
): Promise<LobbySnapshot & { code: string }> {
  for (let attempt = 0; ; attempt++) {
    const headers = key ? { 'x-player-token': key } : undefined;
    const response = data
      ? await request.post(path, { headers, data })
      : await request.get(path, { headers });
    if (response.status() === 429 && attempt < 20) {
      await new Promise((r) => setTimeout(r, 700));
      continue;
    }
    const body = await response.json();
    expect(response.ok(), JSON.stringify(body)).toBe(true);
    return body;
  }
}
test('crossword: two phones share a grid, recover on reload, and finish together', async ({
  browser,
  request,
}, info) => {
  test.setTimeout(240000);
  const keys = ['wren', 'rook'].map(
    (n) => 'crossword-' + n + '-' + Date.now() + '-abcdefghijklmnop',
  );
  const created = await call(request, '/api/lobby', keys[0]!, {
    name: 'Wren',
    gameId: 'crossword',
  });
  const code = created.code;
  const url = '/api/lobby/' + code;
  await call(request, url, keys[1]!, { type: 'join', name: 'Rook' });
  await call(request, url, keys[0]!, {
    type: 'setOptions',
    options: { puzzle: 'ink', help: true },
  });
  await call(request, url, keys[0]!, { type: 'start', look: 'light' });
  const contexts = await Promise.all(
    keys.map(async (key) => {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      await context.addInitScript((t) => localStorage.setItem('jackdaw:token', t), key);
      return context;
    }),
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  const [wren, rook] = pages;
  await Promise.all(pages.map((p) => p.goto('/r/' + code)));
  await expect(wren!.getByRole('heading', { name: 'A little ink' })).toBeVisible({
    timeout: 60000,
  });
  await wren!
    .getByRole('group', { name: 'Letter keyboard' })
    .getByRole('button', { name: 'P', exact: true })
    .click();
  await wren!.keyboard.type('en', { delay: 40 });
  await expect(rook!.getByRole('button', { name: 'Row 1, column 3: N', exact: true })).toBeVisible({
    timeout: 20000,
  });
  await rook!.locator('[data-cell="5"]').click();
  await rook!.keyboard.type('eras', { delay: 30 });
  await expect(wren!.getByRole('button', { name: 'Row 2, column 4: S', exact: true })).toBeVisible({
    timeout: 20000,
  });
  await wren!.reload();
  await expect(
    wren!.getByRole('button', { name: 'Row 1, column 1: P', exact: true }),
  ).toBeVisible();
  const tv = await contexts[0]!.newPage();
  await tv.goto('/tv/' + code);
  await expect(tv.getByRole('heading', { name: 'A little ink' })).toBeVisible();
  for (const scheme of ['light', 'dark'] as const)
    for (const width of [375, 768, 1280, 1920]) {
      await wren!.emulateMedia({ colorScheme: scheme });
      await wren!.evaluate((t) => (document.documentElement.dataset.theme = t), scheme);
      await wren!.setViewportSize({
        width,
        height: width === 375 ? 812 : width === 768 ? 1024 : 1080,
      });
      expect(
        await wren!.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      ).toBeLessThanOrEqual(0);
      const sizes = await wren!.locator('.cw-cell').evaluateAll((cells) =>
        cells.map((c) => ({
          width: c.getBoundingClientRect().width,
          height: c.getBoundingClientRect().height,
        })),
      );
      expect(sizes.every((s) => s.width >= 44 && s.height >= 44)).toBe(true);
      const screenshot = info.outputPath('crossword-' + scheme + '-' + width + '.png');
      await wren!.screenshot({ path: screenshot, style: 'nextjs-portal{display:none!important}' });
      await info.attach('crossword-' + scheme + '-' + width, {
        path: screenshot,
        contentType: 'image/png',
      });
      if (
        process.env.UPDATE_CROSSWORD_PICTURES &&
        scheme === 'light' &&
        (width === 375 || width === 1280)
      ) {
        await wren!.screenshot({
          path: 'public/games/crossword/' + (width === 375 ? 'phone' : 'desktop') + '.png',
          style: 'nextjs-portal{display:none!important}',
        });
      }
      if (width === 375) {
        const notice = await wren!.locator('.cw-notice').boundingBox();
        expect(notice!.y + notice!.height).toBeLessThanOrEqual(812);
      }
    }
  for (const [width, height] of [
    [1920, 1080],
    [1440, 900],
    [960, 540],
  ]) {
    await tv.setViewportSize({ width: width!, height: height! });
    expect(
      await tv.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(0);
    const grid = await tv.locator('.cw-board').boundingBox();
    expect(grid!.width).toBeGreaterThan(width! * 0.2);
    expect(grid!.y + grid!.height).toBeLessThanOrEqual(height!);
    const tvPicture = info.outputPath('crossword-tv-' + width + '.png');
    await tv.screenshot({ path: tvPicture, style: 'nextjs-portal{display:none!important}' });
    await info.attach('crossword-tv-' + width, { path: tvPicture, contentType: 'image/png' });
  }
  const publicSnapshot = await call(request, url, null);
  expect(publicSnapshot.view).toBeUndefined();
  expect(JSON.stringify(publicSnapshot)).not.toContain('PEN##');
  const answer = 'PEN##ERAS#ARIAS#SLIP##SLY';
  for (let cell = 0; cell < answer.length; cell++) {
    if (answer[cell] === '#') continue;
    const s = await call(request, url, keys[0]!);
    const view = s.tableView as CrosswordView;
    if (view.letters[cell] === answer[cell]) continue;
    await call(request, url, keys[0]!, {
      type: 'action',
      sessionId: s.session!.id,
      seq: s.session!.seq,
      action: { type: 'edit', cell, letter: answer[cell], revision: view.revisions[cell] },
    });
  }
  for (const page of pages)
    await expect(page!.getByText(/Solved together in/).first()).toBeVisible({ timeout: 20000 });
  for (const context of contexts) await context.close();
});
