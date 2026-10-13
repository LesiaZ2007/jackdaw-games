import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';

// Outcome moments: each phone sees its own round result as it resolves, the TV names the round's
// winner, and the results screen gives each player their own verdict. Set SHOTS=1 to also run
// at 375 and 1280 in light and dark, with screenshots mid-animation and settled.
const RUNS = process.env.SHOTS
  ? ([
      [375, 812, 'light'],
      [375, 812, 'dark'],
      [1280, 800, 'light'],
      [1280, 800, 'dark'],
    ] as const)
  : ([[390, 844, 'light']] as const);

async function phone(browser: Browser, width: number, height: number, scheme: 'light' | 'dark') {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme });
  return context.newPage();
}

async function shot(info: TestInfo, page: Page, name: string) {
  const body = await page.screenshot({
    path: process.env.SHOTS ? info.outputPath(`${name}.png`) : undefined,
  });
  await info.attach(name, { body, contentType: 'image/png' });
}

async function throwPick(page: Page, pick: 'Rock' | 'Paper' | 'Scissors') {
  await page.getByRole('radiogroup', { name: 'Throw' }).getByRole('radio', { name: pick }).click();
}

/** Put a round's moment away (it also clears itself after a few seconds). */
async function dismiss(page: Page) {
  const moment = page.locator('.jd-moment');
  // Escape rather than a tap: a tap can land while the moment is already fading out.
  if (await moment.count()) await page.keyboard.press('Escape');
  await expect(moment).toHaveCount(0);
}

for (const [width, height, scheme] of RUNS) {
  test(`round and game verdicts at ${width}px (${scheme})`, async ({ browser }, info) => {
    const host = await phone(browser, width, height, scheme);
    await host.goto('/');
    await host.waitForLoadState('networkidle');
    await host.getByLabel('Your name').fill('Lesia');
    await host.getByRole('button', { name: 'Create a lobby' }).click();
    await host.waitForURL(/\/r\/[A-Z]{4}$/);
    const code = host.url().split('/').pop()!;

    const bran = await phone(browser, width, height, scheme);
    await bran.goto(`/r/${code}`);
    await bran.waitForLoadState('networkidle');
    await bran.getByLabel('Your name').fill('Bran');
    await bran.getByRole('button', { name: 'Take a seat' }).click();
    await expect(bran.getByText('At the table')).toBeVisible();

    const tv = await phone(browser, 1920, 1080, scheme);
    await tv.goto(`/tv/${code}`);

    await host
      .getByRole('button', { name: /Rock Paper Scissors/ })
      .first()
      .click();
    await host.getByRole('button', { name: 'Start Rock Paper Scissors' }).click();
    for (const p of [host, bran])
      await expect(p.getByRole('radiogroup', { name: 'Throw' })).toBeVisible();
    // The TV polls; let it reach the table before anyone throws, as it would in a real room.
    await expect(tv.getByText('Waiting on 2 players')).toBeVisible();

    // Round 1: Lesia's rock beats Bran's scissors.
    await throwPick(host, 'Rock');
    await throwPick(bran, 'Scissors');
    await expect(host.getByText('You won round 1')).toBeVisible();
    await expect(bran.getByText('You lost round 1')).toBeVisible();
    await expect(tv.getByText('Lesia takes round 1')).toBeVisible();
    await expect(bran.getByText('Lesia beat your scissors with rock.')).toBeVisible();
    const tag = `${width}-${scheme}`;
    await shot(info, host, `r1-win-mid-${tag}`);
    await shot(info, bran, `r1-loss-mid-${tag}`);
    await host.waitForTimeout(1500);
    await shot(info, host, `r1-win-settled-${tag}`);
    await shot(info, bran, `r1-loss-settled-${tag}`);
    await shot(info, tv, `r1-tv-${tag}`);
    await dismiss(host);
    await dismiss(bran);
    await shot(info, host, `r1-board-${tag}`);

    // Round 2: both throw rock, a stand-off.
    await throwPick(host, 'Rock');
    await throwPick(bran, 'Rock');
    await expect(host.getByText('Round 2 is a stand-off')).toBeVisible();
    await expect(bran.getByText('Round 2 is a stand-off')).toBeVisible();
    await host.waitForTimeout(1200);
    await shot(info, host, `r2-draw-${tag}`);
    await dismiss(host);
    await dismiss(bran);

    // Round 3 decides it: Lesia wins the game.
    await throwPick(host, 'Paper');
    await throwPick(bran, 'Rock');
    await expect(host.getByRole('status').getByText('You won', { exact: true })).toBeVisible();
    await expect(bran.getByRole('status').getByText('You lost', { exact: true })).toBeVisible();
    await expect(tv.getByText('Lesia wins')).toBeVisible();
    await shot(info, host, `results-win-mid-${tag}`);
    await host.waitForTimeout(1600);
    await shot(info, host, `results-win-${tag}`);
    await shot(info, bran, `results-loss-${tag}`);
    await shot(info, tv, `results-tv-${tag}`);

    const overflow = await host.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, 'results scroll sideways').toBeLessThanOrEqual(0);
  });
}
