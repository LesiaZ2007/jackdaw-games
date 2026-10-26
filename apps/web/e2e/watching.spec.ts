import { expect, test, type Page } from '@playwright/test';

const SHOTS = process.env.E2E_SHOTS;

/** The TV screen a latecomer watches sits whole inside the window, at a size you can see. */
async function expectWholeTable(page: Page, minWidth: number) {
  const stage = page.locator('.tv-window .tv-stage');
  await expect(stage).toBeVisible();
  const box = (await stage.boundingBox())!;
  const view = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThan(0);
  expect(box.x + box.width).toBeLessThanOrEqual(view.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(view.height + 1);
  expect(box.width).toBeGreaterThanOrEqual(minWidth);
}

test('a latecomer watches the game on a phone, and the whole TV table sideways or on a laptop', async ({
  browser,
}) => {
  const host = await (
    await browser.newContext({ viewport: { width: 375, height: 812 } })
  ).newPage();
  await host.goto('/');
  await host.getByLabel('Your name').fill('Heron');
  await host.getByRole('button', { name: 'Create a lobby' }).click();
  await host.waitForURL(/\/r\/[A-Z]{4}$/);
  const code = host.url().split('/').pop()!;

  await host
    .getByRole('button', { name: /Battleship/ })
    .first()
    .click();
  await host.getByRole('button', { name: 'Add a computer player' }).first().click();
  await host.getByRole('button', { name: 'Start Battleship' }).click();

  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const rook = await context.newPage();
  await rook.goto(`/r/${code}`);
  await rook.getByLabel('Your name').fill('Rook');
  await rook.getByRole('button', { name: 'Watch, and play next game' }).click();

  // Upright, the game's own watch screen: one sea at a time, a tab for each.
  await expect(rook.getByText('Watching Battleship. You’ll play next game.')).toBeVisible();
  await expect(rook.getByRole('tab', { name: 'Heron’s sea', exact: true })).toBeVisible();
  await rook.getByRole('tab', { name: /^Bot \w+’s sea$/ }).click();
  await expect(rook.getByRole('tab', { name: /^Bot \w+’s sea$/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(rook.locator('.tv-window')).toHaveCount(0);
  // The page itself doesn't scroll: the screen is fitted under the bar.
  expect(await rook.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(812);
  if (SHOTS) await rook.screenshot({ path: `${SHOTS}/watch-375.png` });

  // On its side, the TV screen, scaled whole under the note.
  await rook.setViewportSize({ width: 812, height: 375 });
  await expect(rook.getByText(/You’re watching this round of Battleship/)).toBeVisible();
  await expect(rook.getByText('Turn your phone sideways to see more.')).toBeHidden();
  await expectWholeTable(rook, 380);
  if (SHOTS) await rook.screenshot({ path: `${SHOTS}/watch-812x375.png` });

  await rook.setViewportSize({ width: 1280, height: 800 });
  await expectWholeTable(rook, 800);
  if (SHOTS) await rook.screenshot({ path: `${SHOTS}/watch-1280.png` });
});
