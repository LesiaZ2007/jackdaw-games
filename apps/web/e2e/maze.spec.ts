import { expect, test, type Browser, type Page } from '@playwright/test';

const SHOTS = process.env.E2E_SHOTS;

async function lobby(browser: Browser, name: string, size: { width: number; height: number }) {
  const page = await (await browser.newContext({ viewport: size })).newPage();
  const api: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/api/')) api.push(r.url());
  });
  await page.goto('/');
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Create a lobby' }).click();
  await page.waitForURL(/\/r\/[A-Z]{4}$/);
  await page
    .getByRole('button', { name: /^(Word and party )?Pac Man/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'Pac Man', exact: true })).toBeVisible();
  return { page, api, code: page.url().split('/').pop()! };
}

/** Open the lobby's Settings, pick the mode, and close it again. */
async function pickMode(page: Page, mode: 'Solo' | 'Shared' | 'Race') {
  await page.getByRole('button', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('radio', { name: mode, exact: true }).click();
  await expect(settings.getByRole('radio', { name: mode, exact: true })).toBeChecked();
  await settings.getByRole('button', { name: 'Done' }).click();
  await expect(settings).toBeHidden();
}

/** Seat computer players from the lobby's "+ Add a CPU" slot. */
async function addCpus(page: Page, n: number) {
  for (let i = 1; i <= n; i++) {
    await page.getByRole('button', { name: 'Add a computer player' }).first().click();
    await expect(page.getByLabel(/, computer player/)).toHaveCount(i);
  }
}

/** The score cards must end above the maze, never overlap it, and the page must not scroll. */
async function expectFits(page: Page) {
  const cards = (await page.locator('.mz-cards').first().boundingBox())!;
  const maze = (await page.locator('.mz-player .mz-canvas').boundingBox())!;
  expect(cards.y + cards.height).toBeLessThanOrEqual(maze.y + 1);
  const scrolls = await page.evaluate(
    () => document.documentElement.scrollHeight > window.innerHeight + 1,
  );
  expect(scrolls).toBe(false);
}

const myScore = async (page: Page) =>
  Number(await page.locator('.mz-card.is-you .mz-card__score').first().innerText());

async function steer(page: Page, ms: number) {
  const keys = ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'];
  const end = Date.now() + ms;
  for (let i = 0; Date.now() < end; i++) {
    await page.keyboard.press(keys[i % 4]!);
    await page.waitForTimeout(350);
  }
}

test('solo: start, steer with the arrows, the score moves, and the maze fits', async ({
  browser,
}) => {
  const { page, api } = await lobby(browser, 'Wren', { width: 360, height: 640 });
  await pickMode(page, 'Solo');
  await page.getByRole('button', { name: 'Start Pac Man' }).click();
  await expect(page.getByLabel('The maze')).toBeVisible();
  await expect(page.locator('.mz-card.is-you')).toBeVisible();
  await page.waitForTimeout(5_000); // the countdown
  const t0 = Date.now();
  const n0 = api.length;
  await expect
    .poll(async () => {
      await steer(page, 2_000);
      return myScore(page);
    })
    .toBeGreaterThan(0);
  await expectFits(page);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/maze-solo-360.png` });
  await page.setViewportSize({ width: 1280, height: 680 });
  await page.waitForTimeout(500);
  await expectFits(page);
  await steer(page, Math.max(0, 20_000 - (Date.now() - t0)));
  const perMin = ((api.length - n0) * 60_000) / (Date.now() - t0);
  console.log(`maze requests/min/player solo: ${perMin.toFixed(1)}`);
});

test('shared: three computer players score, the TV shows four chompers', async ({ browser }) => {
  const { page, api, code } = await lobby(browser, 'Wren', { width: 360, height: 640 });
  await pickMode(page, 'Shared');
  await addCpus(page, 3);
  await page.getByRole('button', { name: 'Start Pac Man' }).click();
  await expect(page.getByLabel('The maze')).toBeVisible();
  await expect(page.locator('.mz-card')).toHaveCount(4);
  const tv = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await tv.goto(`/tv/${code}`, { waitUntil: 'domcontentloaded' });
  await expect(tv.locator('.mz-tv .mz-card')).toHaveCount(4);
  await expect(tv.getByLabel('The maze')).toBeVisible();

  await page.waitForTimeout(5_000);
  const t0 = Date.now();
  const n0 = api.length;
  await steer(page, 10_000);
  const scores = await page.locator('.mz-card:not(.is-you) .mz-card__score').allInnerTexts();
  expect(scores).toHaveLength(3);
  expect(scores.some((s) => Number(s) > 0)).toBe(true);
  await expectFits(page);
  await page.setViewportSize({ width: 1280, height: 680 });
  await page.waitForTimeout(500);
  await expectFits(page);
  await steer(page, Math.max(0, 20_000 - (Date.now() - t0)));
  const perMin = ((api.length - n0) * 60_000) / (Date.now() - t0);
  console.log(`maze requests/min/player shared: ${perMin.toFixed(1)}`);
  if (SHOTS) await tv.screenshot({ path: `${SHOTS}/maze-tv.png` });
});

test('race: two players at the normal pace', async ({ browser }) => {
  const { page, api } = await lobby(browser, 'Wren', { width: 390, height: 844 });
  await pickMode(page, 'Race');
  await addCpus(page, 1);
  await page.getByRole('button', { name: 'Start Pac Man' }).click();
  await expect(page.getByLabel('The maze')).toBeVisible();
  await page.waitForTimeout(5_000);
  const t0 = Date.now();
  const n0 = api.length;
  await steer(page, 20_000);
  const perMin = ((api.length - n0) * 60_000) / (Date.now() - t0);
  console.log(`maze requests/min/player race: ${perMin.toFixed(1)}`);
});
