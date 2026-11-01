import { expect, test } from '@playwright/test';

const SHOTS = process.env.E2E_SHOTS;

test('tetra against a bot: the countdown, stones dropped from the pad, and the TV', async ({
  browser,
}) => {
  const page = await (
    await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true })
  ).newPage();
  await page.goto('/');
  await page.getByLabel('Your name').fill('Wren');
  await page.getByRole('button', { name: 'Create a lobby' }).click();
  await page.waitForURL(/\/r\/[A-Z]{4}$/);
  const code = page.url().split('/').pop()!;
  await page.getByRole('button', { name: /Tetra/ }).first().click();
  await page.getByRole('button', { name: 'Add a computer player' }).first().click();
  await page.getByRole('button', { name: 'Start Tetra' }).click();

  const well = page.getByRole('img', { name: 'Your well' });
  await expect(well).toBeVisible();
  // The countdown, then stones: drop a few from the pad.
  await expect(page.locator('.ttr-count')).toBeVisible();
  await expect(page.locator('.ttr-count')).toBeHidden({ timeout: 6_000 });
  const drop = page.getByRole('button', { name: 'Drop', exact: true });
  for (let i = 0; i < 6; i++) {
    await page.getByRole('button', { name: i % 2 ? 'Left' : 'Right', exact: true }).click();
    await drop.click();
    await page.waitForTimeout(120);
  }
  await expect(page.getByRole('img', { name: /'s well$/ }).first()).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/tetra-phone-375.png` });

  const tv = await (
    await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  ).newPage();
  await tv.goto(`/tv/${code}`, { waitUntil: 'domcontentloaded' });
  await expect(tv.locator('.ttr-tv .ttr-tv__one')).toHaveCount(2);
  if (SHOTS) {
    await page.waitForTimeout(4_000);
    await tv.screenshot({ path: `${SHOTS}/tetra-tv-1920.png` });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/tetra-phone-1440.png` });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/tetra-dark-375.png` });
  }
});
