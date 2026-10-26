import { expect, test, type Page } from '@playwright/test';

const SHOTS = process.env.E2E_SHOTS;
let shotPopup = false;

/** Make whatever move the dock offers: roll, buy, bid, or end the turn. */
async function move(page: Page): Promise<string | null> {
  // A popup about what just happened waits for a tap.
  const pop = page.locator('.mnp-pop__card');
  if (await pop.count()) {
    if (SHOTS && !shotPopup) {
      shotPopup = true;
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${SHOTS}/monopoly-popup-375.png` });
    }
    await pop.first().click();
    return 'popup';
  }
  const choices = [
    /^Roll the dice$/,
    /^Roll for doubles$/,
    /^Buy /,
    /^End turn$/,
    /^Drop out$/,
    /^Accept$/,
  ];
  for (const name of choices) {
    const button = page.getByRole('button', { name }).first();
    if ((await button.count()) && (await button.isEnabled())) {
      await button.click();
      return String(name);
    }
  }
  return null;
}

/** Tap away any popups still waiting. */
async function clearPops(page: Page) {
  for (let k = 0; k < 12; k++) {
    const pop = page.locator('.mnp-pop__card');
    if (!(await pop.count())) return;
    await pop.first().click();
    await page.waitForTimeout(250);
  }
}

test('Monopoly: the host plays a few turns against two bots, and the TV shows the board', async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const host = await context.newPage();
  await host.goto('/');
  await host.getByLabel('Your name').fill('Wren');
  await host.getByRole('button', { name: 'Create a lobby' }).click();
  await host.waitForURL(/\/r\/[A-Z]{4}$/);
  const code = host.url().split('/').pop()!;

  await host
    .getByRole('button', { name: /Monopoly/ })
    .first()
    .click();
  for (let k = 0; k < 2; k++) {
    await host.getByRole('button', { name: 'Add a computer player' }).first().click();
  }
  await expect(host.getByRole('listitem', { name: /Bot \w+, computer player/ })).toHaveCount(2);
  await host.getByRole('button', { name: 'Start Monopoly' }).click();
  await expect(host.locator('.mnp-board')).toBeVisible();

  if (SHOTS) {
    await host.waitForTimeout(300);
  }
  const tv = await (
    await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  ).newPage();
  await tv.goto(`/tv/${code}`, { waitUntil: 'domcontentloaded' });
  await expect(tv.locator('.mnp-board--tv')).toBeVisible();

  // Play until the host has made a dozen moves; the bots take their own turns in between.
  let made = 0;
  for (let tries = 0; tries < 160 && made < 12; tries++) {
    if (await move(host)) {
      made += 1;
      await host.waitForTimeout(500);
    } else await host.waitForTimeout(700);
  }
  expect(made).toBeGreaterThan(3);
  await expect(host.locator('.mnp-person')).toHaveCount(3);

  await clearPops(host);
  // A space opens its deed.
  await host.locator('.mnp-sp').nth(1).click();
  await expect(host.getByRole('dialog', { name: 'Deed' })).toContainText('Mediterranean Avenue');
  if (SHOTS) {
    await host.waitForTimeout(700);
    await host.screenshot({ path: `${SHOTS}/monopoly-deed-375.png` });
  }
  await host.keyboard.press('Escape');

  await clearPops(host);
  await host.getByRole('button', { name: 'Your deeds' }).click();
  await expect(host.getByRole('dialog', { name: 'Your deeds' })).toBeVisible();
  if (SHOTS) {
    await host.waitForTimeout(700);
    await host.screenshot({ path: `${SHOTS}/monopoly-estate-375.png` });
  }
  await host.keyboard.press('Escape');

  await clearPops(host);
  await host.getByRole('button', { name: /^Trade/ }).click();
  await expect(host.getByRole('dialog', { name: 'Trade' })).toBeVisible();
  if (SHOTS) {
    await host.waitForTimeout(700);
    await host.screenshot({ path: `${SHOTS}/monopoly-trade-375.png` });
  }
  await host.keyboard.press('Escape');

  if (SHOTS) {
    await host.screenshot({ path: `${SHOTS}/monopoly-375.png` });
    await tv.waitForTimeout(1500);
    await tv.screenshot({ path: `${SHOTS}/monopoly-tv-1920.png` });
    for (const [w, h] of [
      [1440, 900],
      [960, 540],
    ] as const) {
      await tv.setViewportSize({ width: w, height: h });
      await tv.waitForTimeout(600);
      await tv.screenshot({ path: `${SHOTS}/monopoly-tv-${w}.png` });
    }
    await host.setViewportSize({ width: 1440, height: 900 });
    await host.waitForTimeout(800);
    await host.screenshot({ path: `${SHOTS}/monopoly-1440.png` });
    await host.setViewportSize({ width: 768, height: 1024 });
    await host.waitForTimeout(800);
    await host.screenshot({ path: `${SHOTS}/monopoly-768.png` });
  }

  // Nothing scrolls sideways on a phone.
  await host.setViewportSize({ width: 375, height: 812 });
  const wide = await host.evaluate(() => document.documentElement.scrollWidth);
  expect(wide).toBeLessThanOrEqual(375);
});
