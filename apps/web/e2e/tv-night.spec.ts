import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';

// The TV lobby scrolls past its first screen to the night so far: the score tally, highlights
// and the games played. The TV never receives anything hidden. Set SHOTS=1 to also run in dark
// and save full-page screenshots at 1920 and 1280, empty and after two games.
const SCHEMES = process.env.SHOTS ? (['light', 'dark'] as const) : (['light'] as const);

async function open(browser: Browser, width: number, height: number, scheme: 'light' | 'dark') {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme });
  return context.newPage();
}

async function shot(info: TestInfo, page: Page, name: string) {
  if (!process.env.SHOTS) return;
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
}

async function throwPick(page: Page, pick: 'Rock' | 'Paper' | 'Scissors') {
  await page.getByRole('radiogroup', { name: 'Throw' }).getByRole('radio', { name: pick }).click();
}

/** One single-round game: the owner's throw against Bran's. */
async function playRound(
  host: Page,
  bran: Page,
  mine: 'Rock' | 'Paper' | 'Scissors',
  theirs: 'Rock' | 'Paper' | 'Scissors',
) {
  for (const p of [host, bran])
    await expect(p.getByRole('radiogroup', { name: 'Throw' })).toBeVisible();
  await throwPick(host, mine);
  await throwPick(bran, theirs);
  await expect(host.getByRole('button', { name: 'Back to lobby' })).toBeVisible();
  await host.getByRole('button', { name: 'Back to lobby' }).click();
}

for (const scheme of SCHEMES) {
  test(`the TV lobby scrolls to the night so far (${scheme})`, async ({ browser }, info) => {
    const host = await open(browser, 390, 844, scheme);
    await host.goto('/');
    await host.waitForLoadState('networkidle');
    await host.getByLabel('Your name').fill('Wren');
    await host.getByRole('button', { name: 'Create a lobby' }).click();
    await host.waitForURL(/\/r\/[A-Z]{4}$/);
    const code = host.url().split('/').pop()!;

    const bran = await open(browser, 390, 844, scheme);
    await bran.goto(`/r/${code}`);
    await bran.waitForLoadState('networkidle');
    await bran.getByLabel('Your name').fill('Bran');
    await bran.getByRole('button', { name: 'Take a seat' }).click();
    await expect(bran.getByText('At the table')).toBeVisible();

    const tv = await open(browser, 1920, 1080, scheme);
    await tv.goto(`/tv/${code}`);
    const laptop = await open(browser, 1280, 720, scheme);
    await laptop.goto(`/tv/${code}`);
    await expect(tv.getByText('2 at the table')).toBeVisible();

    // Before any game: no hint on the first screen, and an invitation further down.
    const night = tv.getByRole('region', { name: 'The night so far' });
    await expect(tv.getByRole('link', { name: 'The night so far' })).toHaveCount(0);
    await night.scrollIntoViewIfNeeded();
    await expect(night.getByText('No games finished yet.', { exact: false })).toBeVisible();
    await shot(info, tv, `empty-1920-${scheme}`);
    await shot(info, laptop, `empty-1280-${scheme}`);
    // Each part takes over the display: a short scroll snaps a whole screen down, never halfway.
    await laptop.evaluate(() => window.scrollBy({ top: 300 }));
    await expect.poll(() => laptop.evaluate(() => window.scrollY)).toBe(720);

    // A single round makes a quick game.
    await host
      .getByRole('button', { name: /Rock Paper Scissors/ })
      .first()
      .click();
    await host.getByRole('button', { name: 'Show options and rules' }).click();
    await host.getByRole('button', { name: 'Fewer rounds' }).click();
    await expect(host.getByText('Rounds: 2')).toBeVisible();
    await host.getByRole('button', { name: 'Fewer rounds' }).click();
    await expect(host.getByText('Rounds: 1')).toBeVisible();
    await host.getByRole('button', { name: 'Start Rock Paper Scissors' }).click();

    // While a game runs, the TV's read carries the public table only: no private view, no
    // session state, no rejoin codes. The stats it reads later hold finished games only.
    await expect(tv.getByText('Waiting on 2 players')).toBeVisible();
    const live = await (await tv.request.get(`/api/lobby/${code}`)).json();
    expect(live.status).toBe('in_game');
    expect(live.view).toBeUndefined();
    expect(live.rejoinCode).toBeUndefined();
    expect(live.me).toBeNull();
    expect(Object.keys(live.session).sort()).toEqual(['gameId', 'id', 'seq', 'startedAt']);
    expect(live.tableView).toBeDefined();

    await playRound(host, bran, 'Rock', 'Scissors');
    await host.getByRole('button', { name: 'Start Rock Paper Scissors' }).click();
    await playRound(host, bran, 'Rock', 'Paper');

    const stats = await (await tv.request.get(`/api/lobby/${code}/stats`)).json();
    expect(Object.keys(stats).sort()).toEqual(['history', 'stats']);
    expect(stats.history).toHaveLength(2);

    // Back in the lobby: the hint appears, and following it shows the night.
    const hint = tv.getByRole('link', { name: 'The night so far' });
    await expect(hint).toBeVisible();
    await hint.click();
    await expect(night.getByText('2 games', { exact: false })).toBeVisible();
    const board = night.locator('.tv-board > li');
    await expect(board).toHaveCount(2);
    await expect(board.first()).toContainText('1 won, 1 lost');
    await expect(night.getByText('Most played')).toBeVisible();
    await expect(night.getByText('2 times tonight')).toBeVisible();
    await expect(night.getByText('Games tonight')).toBeVisible();
    await shot(info, tv, `night-1920-${scheme}`);
    await expect(laptop.getByRole('link', { name: 'The night so far' })).toBeVisible();
    await shot(info, laptop, `night-1280-${scheme}`);

    // Still never sideways, even on a phone-sized window.
    const phone = await open(browser, 375, 812, scheme);
    await phone.goto(`/tv/${code}`);
    await expect(phone.getByRole('region', { name: 'The night so far' })).toBeAttached();
    for (const p of [tv, laptop, phone]) {
      const overflow = await p.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, 'TV lobby scrolls sideways').toBeLessThanOrEqual(0);
    }
    await shot(info, phone, `night-375-${scheme}`);
  });
}
