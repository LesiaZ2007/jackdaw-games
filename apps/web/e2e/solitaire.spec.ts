import { expect, test, type Page } from '@playwright/test';

const SHOTS = process.env.E2E_SHOTS;

async function createLobby(page: Page, name: string) {
  await page.goto('/');
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Create a lobby' }).click();
  await page.waitForURL(/\/r\/[A-Z]{4}$/);
  await page
    .getByRole('button', { name: /^(Card game )?Solitaire 1/ })
    .first()
    .click();
}

test('a race with a bot: turn the stock, play a card, the TV shows every layout', async ({
  browser,
}) => {
  const page = await (
    await browser.newContext({ viewport: { width: 375, height: 812 } })
  ).newPage();
  await createLobby(page, 'Wren');
  const code = page.url().split('/').pop()!;
  await page.getByRole('button', { name: 'Add a computer player' }).first().click();
  await page.getByRole('button', { name: 'Start Solitaire' }).click();

  await expect(page.getByLabel('The middle')).toBeVisible();
  const stock = page.getByRole('button', { name: /^Turn the stock: \d+ left$/ });
  await expect(stock).toHaveAccessibleName('Turn the stock: 24 left');
  await stock.click();
  await expect(stock).toHaveAccessibleName('Turn the stock: 23 left');

  // A hint points at a move (or the stock); tapping what it marks plays it.
  await page.getByRole('button', { name: 'Hint' }).click();
  await expect(page.locator('.sol-mark')).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/solitaire-375.png` });

  const tv = await (
    await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  ).newPage();
  await tv.goto(`/tv/${code}`, { waitUntil: 'domcontentloaded' });
  await expect(tv.locator('.sol-board')).toHaveCount(2);
  if (SHOTS) {
    // Let the bot put a few cards up first, for pictures of a game under way.
    await tv.waitForTimeout(12_000);
    await tv.screenshot({ path: `${SHOTS}/solitaire-tv.png` });
    await tv.setViewportSize({ width: 1440, height: 900 });
    await tv.screenshot({ path: `${SHOTS}/desktop.png` });
    await page.screenshot({ path: `${SHOTS}/game-phone.png` });
  }
});
