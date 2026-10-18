import { expect, test } from '@playwright/test';

test('the code chits on the home page take typing, and Join opens that lobby', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  // Click where the chits are drawn, as a person would (real hit-testing), then type.
  const box = (await page.locator('.home-join .jd-chits').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height / 2);
  await page.keyboard.type('abcd');
  await expect(page.getByLabel('Lobby code')).toHaveValue('ABCD');
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.waitForURL(/\/r\/ABCD$/);
});

test('the token on the home page opens the crest and colour picker and remembers the choice', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Change your crest and colour' }).click();
  const sheet = page.getByRole('dialog', { name: 'Your token' });
  await sheet.getByRole('button', { name: 'Owl' }).click();
  await sheet.getByRole('button', { name: 'Ochre' }).click();
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(sheet).toBeHidden();
  const saved = await page.evaluate(() => localStorage.getItem('jackdaw:avatar'));
  expect(JSON.parse(saved!)).toEqual({ crest: 'owl', tint: 'ochre' });
  await page.reload();
  await page.getByRole('button', { name: 'Change your crest and colour' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Your token' }).getByRole('button', { name: 'Owl' }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('Browse the games scrolls down to the games, which filter by kind', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  const games = page.getByRole('heading', { name: 'The games', level: 2 });
  await expect(games).not.toBeInViewport();
  await page.getByRole('button', { name: 'Browse the games' }).click();
  await expect(games).toBeInViewport();
  await page.getByLabel('Kind').selectOption('card');
  await expect(page.getByRole('link', { name: /Poker/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Rock Paper Scissors/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page
    .getByRole('link', { name: /Rock Paper Scissors/ })
    .first()
    .click();
  await page.waitForURL(/\/games\/rps$/);
});

test('a short link opens its lobby, and other short paths are not found', async ({ page }) => {
  await page.goto('/qgyr');
  await page.waitForURL(/\/r\/QGYR$/);
  const missing = await page.goto('/notacode');
  expect(missing?.status()).toBe(404);
});
