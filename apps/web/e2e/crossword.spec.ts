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
    options: { puzzle: 'ink', help: true, size: 'mini', mode: 'cooperative' },
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
  await wren!.locator('[data-cell="0"]').click();
  await expect(wren!.locator('[data-cell="0"]')).toHaveAttribute('inputmode', 'text');
  await wren!.keyboard.press('ArrowDown');
  await expect(wren!.locator('.cw-current b')).toHaveText('1 down');
  await wren!.keyboard.press('ArrowRight');
  await expect(wren!.locator('.cw-current b')).toHaveText('1 across');
  await wren!.keyboard.type('p');
  await wren!.keyboard.type('en', { delay: 40 });
  await expect(wren!.locator('[data-cell="5"]')).toBeFocused();
  await expect(rook!.getByRole('textbox', { name: 'Row 1, column 3: N', exact: true })).toBeVisible(
    {
      timeout: 20000,
    },
  );
  await rook!.locator('[data-cell="5"]').click();
  await expect(rook!.locator('[data-cell="5"]')).toBeFocused();
  await rook!.keyboard.type('eras', { delay: 30 });
  await expect(rook!.locator('[data-cell="10"]')).toBeFocused();
  await expect(wren!.getByRole('textbox', { name: 'Row 2, column 4: S', exact: true })).toBeVisible(
    {
      timeout: 20000,
    },
  );
  await wren!.reload();
  await expect(
    wren!.getByRole('textbox', { name: 'Row 1, column 1: P', exact: true }),
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
      const overflow = await wren!.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      );
      if (overflow > 0) {
        await wren!.screenshot({ path: info.outputPath('overflow-' + width + '.png') });
        console.log(
          'Overflow',
          width,
          scheme,
          await wren!.evaluate(() =>
            [...document.querySelectorAll('*')]
              .filter((e) => e.getBoundingClientRect().right > innerWidth + 1)
              .map((e) => ({
                tag: e.tagName,
                cls: e.className,
                right: e.getBoundingClientRect().right,
                width: e.getBoundingClientRect().width,
                min: getComputedStyle(e).minWidth,
              }))
              .slice(0, 15),
          ),
        );
      }
      expect(overflow, 'Horizontal overflow at ' + width + ' ' + scheme).toBeLessThanOrEqual(0);
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

for (const [size, width] of [
  ['mini', 5],
  ['standard', 9],
  ['large', 13],
  ['extraLarge', 17],
  ['sunday', 21],
  ['giant', 31],
] as const)
  test(
    'crossword: generated ' + width + ' × ' + width + ' uses the native keyboard and a fitted grid',
    async ({ browser, request }, info) => {
      test.setTimeout(180000);
      const key = 'size-' + size + '-' + Date.now() + '-abcdefghijklmnop';
      const { code } = await call(request, '/api/lobby', key, {
        name: 'Heron',
        gameId: 'crossword',
      });
      const url = '/api/lobby/' + code;
      await call(request, url, key, {
        type: 'setOptions',
        options: { puzzle: 'random', size, mode: 'cooperative', help: true, difficulty: 'hard' },
      });
      const started = await call(request, url, key, { type: 'start', look: 'light' });
      const view = started.tableView as CrosswordView;
      expect(view.width).toBe(width);
      expect(view.puzzleId).toMatch(/^generated-/);
      const context = await browser.newContext({
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
      });
      await context.addInitScript((t) => localStorage.setItem('jackdaw:token', t), key);
      const page = await context.newPage();
      await page.goto('/r/' + code);
      // Next's development insight badge covers the bottom-left phone control.
      await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
      const input = page.locator('.cw-input').first();
      await expect(input).toBeVisible({ timeout: 60000 });
      await expect(input).toHaveAttribute('inputmode', 'text');
      await input.fill('a');
      await expect
        .poll(async () => {
          const s = await call(request, url, key);
          return (s.view as CrosswordView).letters.filter(Boolean).length;
        })
        .toBe(1);
      expect(await page.locator('.cw-keyboard').count()).toBe(0);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      ).toBeLessThanOrEqual(0);
      expect(
        await page
          .locator('.cw-cell')
          .first()
          .evaluate((c) => parseFloat(getComputedStyle(c).borderLeftWidth)),
      ).toBeGreaterThanOrEqual(2);
      expect((await input.boundingBox())!.width).toBeGreaterThanOrEqual(44);
      if (width > 5)
        expect(
          await page.locator('.cw-grid-wrap').evaluate((e) => e.scrollWidth > e.clientWidth),
        ).toBe(false);
      expect(
        await page.evaluate(() => document.documentElement.scrollHeight - innerHeight),
      ).toBeLessThanOrEqual(1);
      if (width > 5) {
        await page.getByRole('button', { name: 'All clues', exact: true }).click();
        const clueView = (await call(request, url, key)).view as CrosswordView;
        await expect(page.locator('.cw-clue-panel .cw-clue')).toHaveCount(clueView.clues.length);
        await expect(page.getByRole('button', { name: 'Next clues', exact: true })).toHaveCount(0);
        await page.locator('.cw-clue-panel .cw-clue').last().click();
        await expect(page.locator('.cw-clue-panel--open')).toHaveCount(0);
      }
      await page.screenshot({
        path: info.outputPath('generated-' + width + '-phone.png'),
        style: 'nextjs-portal{display:none!important}',
      });
      await page.setViewportSize({ width: 1280, height: 720 });
      if (width > 5) {
        const fit = await page.locator('.cw-grid-wrap').evaluate((e) => ({
          x: e.scrollWidth - e.clientWidth,
          y: e.scrollHeight - e.clientHeight,
        }));
        expect(fit.x).toBeLessThanOrEqual(1);
        expect(fit.y).toBeLessThanOrEqual(1);
        expect(
          await page.evaluate(() => document.documentElement.scrollHeight - innerHeight),
        ).toBeLessThanOrEqual(1);
      }
      const allClues = (await call(request, url, key)).view as CrosswordView;
      await expect(page.locator('.cw-clue-panel .cw-clue')).toHaveCount(allClues.clues.length);
      await page.locator('.cw-clue-panel .cw-clue').last().click();
      expect(
        await page.evaluate(() => document.documentElement.scrollHeight - innerHeight),
      ).toBeLessThanOrEqual(1);
      await page.screenshot({ path: info.outputPath('generated-' + width + '-desktop.png') });
      const tv = await context.newPage();
      await tv.setViewportSize({ width: 1920, height: 1080 });
      await tv.goto('/tv/' + code);
      await expect(tv.locator('.cw-board')).toBeVisible();
      await tv.screenshot({
        path: info.outputPath('generated-' + width + '-tv.png'),
        style: 'nextjs-portal{display:none!important}',
      });
      await context.close();
    },
  );
test('crossword race: separate native-input grids, private letters and one winner', async ({
  browser,
  request,
}) => {
  test.setTimeout(180000);
  const keys = ['wren', 'rook'].map((n) => 'race-' + n + '-' + Date.now() + '-abcdefghijklmnop');
  const { code } = await call(request, '/api/lobby', keys[0]!, {
    name: 'Wren',
    gameId: 'crossword',
  });
  const url = '/api/lobby/' + code;
  await call(request, url, keys[1]!, { type: 'join', name: 'Rook' });
  await call(request, url, keys[0]!, {
    type: 'setOptions',
    options: { puzzle: 'ink', size: 'mini', mode: 'race', help: true },
  });
  await call(request, url, keys[0]!, { type: 'start', look: 'light' });
  const contexts = await Promise.all(
    keys.map(async (key) => {
      const c = await browser.newContext({ viewport: { width: 375, height: 812 } });
      await c.addInitScript((t) => localStorage.setItem('jackdaw:token', t), key);
      return c;
    }),
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  await Promise.all(pages.map((p) => p.goto('/r/' + code)));
  await pages[0]!.locator('[data-cell="0"]').fill('P');
  await expect
    .poll(async () => ((await call(request, url, keys[0]!)).view as CrosswordView).letters[0])
    .toBe('P');
  expect(((await call(request, url, keys[1]!)).view as CrosswordView).letters[0]).toBe('');
  expect(
    ((await call(request, url, null)).tableView as CrosswordView).letters.every((l) => !l),
  ).toBe(true);
  await expect(pages[1]!.locator('[data-cell="0"]')).toHaveValue('');
  await expect(pages[0]!.getByRole('button', { name: 'Check grid', exact: true })).toHaveCount(0);
  const answer = 'PEN##ERAS#ARIAS#SLIP##SLY';
  for (let cell = 0; cell < answer.length; cell++) {
    if (answer[cell] === '#') continue;
    const s = await call(request, url, keys[1]!);
    const v = s.view as CrosswordView;
    await call(request, url, keys[1]!, {
      type: 'action',
      sessionId: s.session!.id,
      seq: s.session!.seq,
      action: { type: 'edit', cell, letter: answer[cell], revision: v.revisions[cell] },
    });
  }
  for (const page of pages)
    await expect(page.getByText(/First correct finish in/).first()).toBeVisible({ timeout: 20000 });
  const ended = await call(request, url, keys[1]!);
  expect(ended.results?.winners).toEqual([ended.me]);
  for (const c of contexts) await c.close();
});

for (const activeHuman of [false, true])
  for (const mode of ['cooperative', 'race'] as const)
    test(
      'crossword bots progress ' +
        (activeHuman ? 'during human activity: ' : 'while humans watch: ') +
        mode,
      async ({ request }) => {
        test.setTimeout(90000);
        const key = 'bot-' + mode + '-' + Date.now() + '-abcdefghijklmnop';
        const { code } = await call(request, '/api/lobby', key, {
          name: 'Wren',
          gameId: 'crossword',
        });
        const url = '/api/lobby/' + code;
        await call(request, url, key, { type: 'addBot' });
        await call(request, url, key, {
          type: 'setOptions',
          options: {
            puzzle: activeHuman ? 'ink' : 'random',
            size: activeHuman ? 'mini' : 'giant',
            mode,
            help: false,
            difficulty: 'hard',
          },
        });
        await call(request, url, key, { type: 'start', look: 'light' });
        await expect
          .poll(
            async () => {
              const s = await call(request, url, key);
              if (activeHuman)
                await call(request, url, key, {
                  type: 'action',
                  sessionId: s.session!.id,
                  seq: s.session!.seq,
                  action: { type: 'focus', cell: 24, direction: 'across' },
                });
              const v = s.view as CrosswordView;
              const bot = v.players.find((p) => p !== s.me)!;
              if (mode === 'race') {
                expect(v.letters.every((l) => !l)).toBe(true);
                expect((s.tableView as CrosswordView).letters.every((l) => !l)).toBe(true);
              }
              return v.progress[bot] ?? 0;
            },
            { timeout: 45000, intervals: [700] },
          )
          .toBeGreaterThan(0);
      },
    );
