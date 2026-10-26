import { expect, test, type Page } from '@playwright/test';
import { solve } from '@jackdaw/game-kings';

const SHOTS = process.env.E2E_SHOTS;

async function createLobby(page: Page, name: string) {
  await page.goto('/');
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Create a lobby' }).click();
  await page.waitForURL(/\/r\/[A-Z]{4}$/);
  await page
    .getByRole('button', { name: /^(Board )?Kings 1/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Show options and rules' }).click();
}

/** Reads the board's colours from the squares' labels, works out the kings, and taps them in. */
async function solveBoard(page: Page, puzzle: number) {
  const board = page.getByRole('grid', { name: new RegExp(`^Puzzle ${puzzle},`) });
  await expect(board).toBeVisible();
  const labels = await board
    .getByRole('button')
    .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''));
  const size = Math.sqrt(labels.length);
  const regions = labels.map((l) => Number(/colour (\d+)/.exec(l)![1]) - 1);
  const answer = solve({ size, regions }, 1)[0]!;
  const cells = board.getByRole('button');
  for (const [r, c] of answer.entries()) {
    const cell = cells.nth(r * size + c);
    await cell.click();
    await cell.click();
  }
}

test('alone: one puzzle, solved, lands on the results with its answer', async ({ browser }) => {
  const page = await (
    await browser.newContext({ viewport: { width: 375, height: 812 } })
  ).newPage();
  await createLobby(page, 'Wren');
  await page.getByRole('radio', { name: '5×5' }).click();
  await expect(page.getByRole('slider', { name: 'Puzzles' })).toHaveValue('1');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/kings-lobby-375.png`, fullPage: true });
  await page.getByRole('button', { name: 'Start Kings' }).click();

  const board = page.getByRole('grid', { name: /^Puzzle 1,/ });
  await expect(board).toBeVisible();
  // A tap crosses out, a second places a king, a third clears.
  const first = board.getByRole('button').first();
  await first.click();
  await expect(first).toHaveAccessibleName(/crossed out/);
  await first.click();
  await expect(first).toHaveAccessibleName(/king/);
  await first.click();
  await expect(first).toHaveAccessibleName(/empty/);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/kings-phone-375.png` });

  await solveBoard(page, 1);
  await expect(page.getByText(/Solved 1 puzzle in/).first()).toBeVisible();
  await expect(page.getByRole('grid', { name: 'Puzzle 1, solved' })).toBeVisible();
});

test('a race: the slider sets the puzzles, a bot races, everyone gets the same boards', async ({
  browser,
}) => {
  const host = await (
    await browser.newContext({ viewport: { width: 1280, height: 800 } })
  ).newPage();
  await createLobby(host, 'Heron');
  const code = host.url().split('/').pop()!;
  await host.getByRole('radio', { name: '5×5' }).click();
  const slider = host.getByRole('slider', { name: 'Puzzles' });
  await slider.focus();
  await host.keyboard.press('ArrowRight');
  await expect(slider).toHaveValue('2');
  await host.getByRole('button', { name: 'More puzzles' }).click();
  await expect(slider).toHaveValue('3');
  await host.getByRole('button', { name: 'Fewer puzzles' }).click();
  await expect(slider).toHaveValue('2');

  const rook = await (
    await browser.newContext({ viewport: { width: 375, height: 812 } })
  ).newPage();
  await rook.goto(`/r/${code}`);
  await rook.getByLabel('Your name').fill('Rook');
  await rook.getByRole('button', { name: 'Take a seat' }).click();
  await expect(rook.getByText('Puzzles: 2')).toBeVisible();
  await host.getByRole('button', { name: 'Add a computer player' }).first().click();
  await host.getByRole('button', { name: 'Start Kings' }).click();

  const regionsOf = (page: Page) =>
    page
      .getByRole('grid', { name: /^Puzzle 1,/ })
      .getByRole('button')
      .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
  await expect(rook.getByRole('grid', { name: /^Puzzle 1,/ })).toBeVisible();
  expect(await regionsOf(rook)).toEqual(await regionsOf(host));
  await expect(rook.getByRole('list', { name: 'The race' })).toContainText('Heron');
  if (SHOTS) await host.screenshot({ path: `${SHOTS}/kings-desktop.png` });

  await solveBoard(host, 1);
  await expect(host.getByText('Puzzle 2 of 2')).toBeVisible();
  await solveBoard(host, 2);
  await expect(host.getByText('Watching the race')).toBeVisible();
  await expect(host.getByRole('article', { name: /^Rook: / })).toBeVisible();
  await expect(rook.getByText(/The race ends in/)).toBeVisible();
  if (SHOTS) await rook.screenshot({ path: `${SHOTS}/kings-closing-375.png` });

  await solveBoard(rook, 1);
  await solveBoard(rook, 2);
  // The bot may still be going; ending now saves the race so far.
  const end = host.getByRole('button', { name: 'End game' });
  if (await end.isVisible()) {
    await end.click();
    await host.getByRole('button', { name: 'Save the rounds so far' }).click();
  }
  const stats = await (await host.request.get(`/api/lobby/${code}/stats`)).json();
  expect(stats.history).toHaveLength(1);
  expect(stats.history[0].summary).toMatch(/2 of 2 solved in/);
});
