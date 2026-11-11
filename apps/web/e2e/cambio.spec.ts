import { expect, test, type Page } from '@playwright/test';

// Cambio on a phone, from the lobby: the host picks it, seats two computer players, readies after
// the opening peek, plays a turn or two by the names on the cards and buttons, then ends the game
// from the bar. The TV only ever shows the table: no face from a hidden grid is in its page.

/** Draw, then swap the drawn card into the top left slot (always legal), ending the turn. */
async function playATurn(page: Page) {
  await expect(page.getByRole('heading', { name: 'Your turn' })).toBeVisible({ timeout: 120_000 });
  await page.getByRole('button', { name: 'Draw from the stock' }).click();
  await expect(page.getByRole('button', { name: 'Discard', exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: /^Your card, top left/ }).click();
  await expect(page.getByRole('heading', { name: 'Your turn' })).toHaveCount(0, {
    timeout: 20_000,
  });
}

test('cambio: the host seats bots, peeks, plays turns, and ends the game from the bar', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const host = await context.newPage();
  await host.goto('/');
  await host.getByLabel('Your name').fill('Heron');
  await host.getByRole('button', { name: 'Create a lobby' }).click();
  await host.waitForURL(/\/r\/[A-Z]{4}$/);
  const code = host.url().split('/').pop()!;

  await host
    .getByRole('button', { name: /Cambio/ })
    .first()
    .click();
  await host.getByRole('button', { name: 'Add a computer player' }).first().click();
  await expect(host.getByRole('group', { name: /^Bot \w+, computer player/ })).toBeVisible();
  await host.getByRole('button', { name: 'Add a computer player' }).first().click();
  await host.getByRole('button', { name: 'Start Cambio' }).click();

  // The opening peek: the two bottom cards face up until Ready.
  await expect(host.getByRole('heading', { name: 'Remember these two' })).toBeVisible();
  await expect(host.getByRole('timer')).toBeVisible();
  await host.getByRole('button', { name: 'Ready' }).click();

  // Every card of the table is on the phone, and a legal turn or two plays.
  await expect(host.getByRole('group', { name: 'Your cards' })).toBeVisible();
  await playATurn(host);
  await playATurn(host);
  await expect(host.getByRole('list', { name: 'What just happened' })).toBeVisible();

  // The TV shows the table, and no face from any grid is in the page.
  const tv = await (
    await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  ).newPage();
  await tv.goto(`/tv/${code}`, { waitUntil: 'domcontentloaded' });
  await expect(tv.locator('.cmb-felt')).toBeVisible({ timeout: 30_000 });
  await expect(tv.locator('.cmb-seat')).toHaveCount(3);
  await expect(tv.locator('.cmb-seat .cmb-card__face')).toHaveCount(0);
  await expect(tv.locator('.cmb-seat .cmb-card.is-up')).toHaveCount(0);
  const seatText = (await tv.locator('.cmb-seat').allInnerTexts()).join(' ');
  expect(seatText).not.toMatch(/\b(?:Ace|King|Queen|Jack|\d+) of (?:hearts|spades|diamonds|clubs)/);
  const seatLabels = await tv
    .locator('.cmb-seat [aria-label]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? '').join(' '));
  expect(seatLabels).not.toMatch(/of (?:hearts|spades|diamonds|clubs)/);
  await tv.context().close();

  // The host can end the game from the bar; it saves the rounds if any were scored.
  await host.getByRole('button', { name: 'End game' }).click();
  const save = host.getByRole('button', { name: 'Save the rounds so far' });
  if (await save.isVisible({ timeout: 2_000 }).catch(() => false)) await save.click();
  else await host.getByRole('button', { name: 'End it for everyone' }).click();
  await expect(host.getByRole('heading', { name: 'At the table' })).toBeVisible();
});
