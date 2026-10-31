import { expect, test, type Page } from '@playwright/test';

const SHOTS = process.env.E2E_SHOTS;

/** Plays this turn by tapping: pick up a checker, set it on a marked point, until Done is ready. */
async function playTurn(page: Page) {
  const done = page.getByRole('button', { name: 'Done' });
  for (let i = 0; i < 8 && !(await done.isEnabled()); i++) {
    const target = page.getByRole('button', { name: /move here|Bear off/ }).first();
    if (!(await target.count())) {
      await page
        .getByRole('button', { name: /^(Point \d+|The bar)$/ })
        .first()
        .click();
    }
    await page
      .getByRole('button', { name: /move here|Bear off/ })
      .first()
      .click();
  }
  await expect(done).toBeEnabled();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/backgammon-move-375.png` });
  await done.click();
}

test('backgammon against a bot: the opening roll, a turn played by tapping, and the TV', async ({
  browser,
}) => {
  const page = await (
    await browser.newContext({ viewport: { width: 375, height: 812 } })
  ).newPage();
  await page.goto('/');
  await page.getByLabel('Your name').fill('Wren');
  await page.getByRole('button', { name: 'Create a lobby' }).click();
  await page.waitForURL(/\/r\/[A-Z]{4}$/);
  const code = page.url().split('/').pop()!;
  await page
    .getByRole('button', { name: /Backgammon/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Add a computer player' }).first().click();
  await page.getByRole('button', { name: 'Start Backgammon' }).click();

  await expect(page.getByRole('img', { name: /^The board\./ })).toBeVisible();
  // Whoever opens, it comes round to Wren: roll, then move.
  const status = page.locator('.bgm-status');
  await expect(status).toHaveText(/^(Move|Roll|Your roll)/, { timeout: 30_000 });
  if ((await status.textContent())?.startsWith('Move') !== true) {
    await page.getByRole('button', { name: 'Roll', exact: true }).click();
    await expect(status).toHaveText(/^(Move|.* to roll)/);
  }
  if ((await status.textContent())?.startsWith('Move')) await playTurn(page);
  await expect(page.locator('.bgm-log li').first()).toBeAttached();

  const tv = await (
    await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  ).newPage();
  await tv.goto(`/tv/${code}`, { waitUntil: 'domcontentloaded' });
  await expect(tv.locator('.bgm-tv .bgm-tables')).toBeVisible();
  if (SHOTS) {
    await page.screenshot({ path: `${SHOTS}/backgammon-phone-375.png` });
    await tv.screenshot({ path: `${SHOTS}/backgammon-tv-1920.png` });
    const wide = await (
      await browser.newContext({ viewport: { width: 1440, height: 900 } })
    ).newPage();
    await wide.goto(`/tv/${code}`, { waitUntil: 'domcontentloaded' });
    await expect(wide.locator('.bgm-tables')).toBeVisible();
    await wide.screenshot({ path: `${SHOTS}/backgammon-tv-1440.png` });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: `${SHOTS}/backgammon-phone-1440.png` });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.screenshot({ path: `${SHOTS}/backgammon-dark-375.png` });
  }
});
