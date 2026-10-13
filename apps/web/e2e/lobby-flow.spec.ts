import { expect, test, type Browser, type Page } from '@playwright/test';

async function newPlayer(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  return context.newPage();
}

async function join(page: Page, code: string, name: string) {
  await page.goto(`/r/${code}`);
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Take a seat' }).click();
  await expect(page.getByText('At the table')).toBeVisible();
}

async function throwPick(page: Page, pick: 'Rock' | 'Paper' | 'Scissors') {
  await page.getByRole('radiogroup', { name: 'Throw' }).getByRole('radio', { name: pick }).click();
}

test('three phones play a round, a refresh keeps its seat, and Play again keeps the game', async ({
  browser,
}) => {
  const host = await newPlayer(browser);
  await host.goto('/');
  await host.getByPlaceholder('e.g. the owner').fill('Wren');
  await host.getByRole('button', { name: 'Create a lobby' }).click();
  await host.waitForURL(/\/r\/[A-Z]{4}$/);
  const code = host.url().split('/').pop()!;

  const bran = await newPlayer(browser);
  const cerys = await newPlayer(browser);
  await join(bran, code, 'Bran');
  await join(cerys, code, 'Cerys');
  await expect(host.getByText('3 of 15 seats')).toBeVisible();

  // Host picks the game and makes it a single round.
  await host
    .getByRole('button', { name: /Rock Paper Scissors/ })
    .first()
    .click();
  await host.getByRole('button', { name: 'Fewer rounds' }).click();
  await host.getByRole('button', { name: 'Fewer rounds' }).click();
  await host.getByRole('button', { name: 'Start Rock Paper Scissors' }).click();

  for (const p of [host, bran, cerys])
    await expect(p.getByRole('radiogroup', { name: 'Throw' })).toBeVisible();

  await throwPick(host, 'Rock');
  // A refreshed phone drops straight back into its seat, mid-game.
  await bran.reload();
  await expect(bran.getByRole('radiogroup', { name: 'Throw' })).toBeVisible();
  await throwPick(bran, 'Scissors');
  await throwPick(cerys, 'Scissors');

  // Rock beats both scissors: the owner wins, and everyone sees it.
  for (const p of [host, bran, cerys])
    await expect(p.getByRole('list', { name: 'Winners' })).toContainText('Wren');
  await expect(bran.getByText(/Waiting for the owner/)).toBeVisible();

  await host.getByRole('button', { name: 'Play Rock Paper Scissors again' }).click();
  for (const p of [host, bran, cerys])
    await expect(p.getByRole('radiogroup', { name: 'Throw' })).toBeVisible();
  await expect(cerys.getByText(/Round 1 of 1/)).toBeVisible();
});
