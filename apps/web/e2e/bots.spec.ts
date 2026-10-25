import { expect, test } from '@playwright/test';

const SHOTS = process.env.E2E_SHOTS;

test('the host seats a bot with the +, plays it, and ending early can save the rounds', async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const host = await context.newPage();
  if (SHOTS) {
    host.on('console', (m) => m.type() === 'error' && console.log('[console]', m.text()));
    host.on('pageerror', (e) => console.log('[pageerror]', e.message));
    const wide = await (
      await browser.newContext({ viewport: { width: 1280, height: 800 } })
    ).newPage();
    await wide.goto('/');
    await wide.screenshot({ path: `${SHOTS}/home-1280.png` });
  }
  await host.goto('/');
  if (SHOTS) await host.screenshot({ path: `${SHOTS}/home-375.png` });
  await host.getByLabel('Your name').fill('Heron');
  await host.getByRole('button', { name: 'Create a lobby' }).click();
  await host.waitForURL(/\/r\/[A-Z]{4}$/);
  const code = host.url().split('/').pop()!;

  await host
    .getByRole('button', { name: /Rock Paper Scissors/ })
    .first()
    .click();
  await host.getByRole('button', { name: 'Add a computer player' }).first().click();
  // A random bird's name; the host gets one level for every bot.
  await expect(host.getByRole('listitem', { name: /Bot \w+, computer player/ })).toBeVisible();
  await host.getByRole('radio', { name: 'Hard' }).click();
  await expect(host.getByRole('radio', { name: 'Hard' })).toHaveAttribute('aria-checked', 'true');
  if (SHOTS) await host.screenshot({ path: `${SHOTS}/lobby-bot-375.png`, fullPage: true });

  // Nobody else gets the +.
  const rook = await (
    await browser.newContext({ viewport: { width: 375, height: 812 } })
  ).newPage();
  await rook.goto(`/r/${code}`);
  await rook.getByLabel('Your name').fill('Rook');
  await rook.getByRole('button', { name: 'Take a seat' }).click();
  await expect(rook.getByText('At the table')).toBeVisible();
  await expect(rook.getByRole('button', { name: 'Add a computer player' })).toHaveCount(0);

  await host.getByRole('button', { name: 'Start Rock Paper Scissors' }).click();
  for (const page of [host, rook]) {
    await page
      .getByRole('radiogroup', { name: 'Throw' })
      .getByRole('radio', { name: 'Rock' })
      .click();
  }
  // The bot throws by itself, so the round resolves.
  await expect(host.getByText(/Round 2 of/)).toBeVisible();

  await host.getByRole('button', { name: 'End game' }).click();
  await expect(host.getByRole('button', { name: 'Save the rounds so far' })).toBeVisible();
  if (SHOTS) await host.screenshot({ path: `${SHOTS}/end-save-375.png` });
  await host.getByRole('button', { name: 'Save the rounds so far' }).click();
  const stats = await (await host.request.get(`/api/lobby/${code}/stats`)).json();
  expect(stats.history).toHaveLength(1);
  expect(stats.history[0].summary).toMatch(/^Ended early\./);
});
