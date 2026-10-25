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
  await host.getByLabel('Your name').fill('Wren');
  await host.getByRole('button', { name: 'Create a lobby' }).click();
  await host.waitForURL(/\/r\/[A-Z]{4}$/);
  const code = host.url().split('/').pop()!;

  const rook = await newPlayer(browser);
  const magpie = await newPlayer(browser);
  await join(rook, code, 'Rook');
  await join(magpie, code, 'Magpie');
  await expect(host.getByText('3 of 15 seats')).toBeVisible();

  // Rook changes name, crest and colour from the lobby; the host sees the owl is now taken.
  await rook.getByRole('button', { name: 'Change your crest and colour' }).click();
  const mine = rook.getByRole('dialog', { name: 'You at the table' });
  await mine.getByLabel('Your name').fill('Kestrel');
  await mine.getByRole('button', { name: 'Owl', exact: true }).click();
  await mine.getByRole('button', { name: 'Lagoon', exact: true }).click();
  await mine.getByRole('button', { name: 'Save' }).click();
  await expect(mine).toBeHidden();
  await expect(host.getByRole('listitem', { name: /Kestrel/ })).toBeVisible();
  await host.getByRole('button', { name: 'Change your crest and colour' }).click();
  await expect(
    host.getByRole('dialog').getByRole('button', { name: 'Owl, taken by Kestrel' }),
  ).toBeDisabled();
  await host.keyboard.press('Escape');

  // Host picks the game and makes it a single round.
  await host
    .getByRole('button', { name: /Rock Paper Scissors/ })
    .first()
    .click();
  // Next up starts small; the host opens it to reach the options.
  await expect(host.getByText('Rounds: 3')).toBeVisible();
  await host.getByRole('button', { name: 'Show options and rules' }).click();
  await host.getByRole('button', { name: 'Fewer rounds' }).click();
  await host.getByRole('button', { name: 'Fewer rounds' }).click();
  await expect(host.getByText('Rounds: 1')).toBeVisible();
  await host.getByRole('button', { name: 'Start Rock Paper Scissors' }).click();

  for (const p of [host, rook, magpie])
    await expect(p.getByRole('radiogroup', { name: 'Throw' })).toBeVisible();

  await throwPick(host, 'Rock');
  // A refreshed phone drops straight back into its seat, mid-game.
  await rook.reload();
  await expect(rook.getByRole('radiogroup', { name: 'Throw' })).toBeVisible();
  await throwPick(rook, 'Scissors');
  await throwPick(magpie, 'Scissors');

  // Rock beats both scissors: Wren wins, and everyone sees it.
  for (const p of [host, rook, magpie])
    await expect(p.getByRole('list', { name: 'Winners' })).toContainText('Wren');
  await expect(rook.getByText(/Waiting for Wren/)).toBeVisible();

  await host.getByRole('button', { name: 'Play Rock Paper Scissors again' }).click();
  for (const p of [host, rook, magpie])
    await expect(p.getByRole('radiogroup', { name: 'Throw' })).toBeVisible();
  await expect(magpie.getByText(/Round 1 of 1/)).toBeVisible();
});
