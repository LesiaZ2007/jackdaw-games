import { expect, test, type Locator, type Page } from '@playwright/test';
import { solve, type Puzzle, type Sign } from '@jackdaw/game-fandango';

async function createLobby(page: Page, name: string) {
  await page.goto('/');
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Create a lobby' }).click();
  await page.waitForURL(/\/r\/[A-Z]{4}$/);
  await page
    .getByRole('button', { name: /^(Mini game )?Fandango 1/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Show options and rules' }).click();
}

/** Reads the filled-in squares and signs from the squares' labels and works out the answer. */
async function readBoard(board: Locator): Promise<{ puzzle: Puzzle; answer: number[] }> {
  const labels = await board
    .getByRole('button')
    .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''));
  const size = Math.sqrt(labels.length);
  const given = labels.map((l) => (l.endsWith(', given') ? (l.includes(': sun') ? 1 : 2) : 0));
  const signs: Sign[] = [];
  labels.forEach((l, i) => {
    const right = /([=×]) right/.exec(l);
    if (right) signs.push({ a: i, b: i + 1, same: right[1] === '=' });
    const below = /([=×]) below/.exec(l);
    if (below) signs.push({ a: i, b: i + size, same: below[1] === '=' });
  });
  const puzzle = { size, given, signs };
  return { puzzle, answer: solve(puzzle, 1)[0]! };
}

/** Fills in the answer a tap at a time: once for a sun, twice for a moon. */
async function solveBoard(page: Page, n: number) {
  const board = page.getByRole('grid', { name: new RegExp(`^Puzzle ${n},`) });
  await expect(board).toBeVisible();
  const { puzzle, answer } = await readBoard(board);
  const cells = board.getByRole('button');
  for (const [i, v] of answer.entries()) {
    if (puzzle.given[i]) continue;
    for (let k = 0; k < v; k++) await cells.nth(i).click();
  }
}

test('alone: tap through the marks, undo, see what is wrong, then solve', async ({ browser }) => {
  const page = await (
    await browser.newContext({ viewport: { width: 375, height: 812 } })
  ).newPage();
  await createLobby(page, 'Wren');
  await page.getByRole('radio', { name: '6×6' }).click();
  await expect(page.getByRole('slider', { name: 'Puzzles' })).toHaveValue('1');
  await page.getByRole('button', { name: 'Start Fandango' }).click();

  const board = page.getByRole('grid', { name: /^Puzzle 1,/ });
  await expect(board).toBeVisible();
  const { puzzle, answer } = await readBoard(board);
  const cells = board.getByRole('button');
  const open = puzzle.given.findIndex((v) => !v);
  const given = puzzle.given.findIndex(Boolean);

  await expect(cells.nth(given)).toBeDisabled();
  await cells.nth(open).click();
  await expect(cells.nth(open)).toHaveAccessibleName(/: sun$/);
  await cells.nth(open).click();
  await expect(cells.nth(open)).toHaveAccessibleName(/: moon$/);
  await cells.nth(open).click();
  await expect(cells.nth(open)).toHaveAccessibleName(/: empty$/);
  await cells.nth(open).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(cells.nth(open)).toHaveAccessibleName(/: empty$/);

  // Every open square the wrong way round: full, but not the answer.
  for (const [i, v] of answer.entries()) {
    if (puzzle.given[i]) continue;
    for (let k = 0; k < 3 - v; k++) await cells.nth(i).click();
  }
  await expect(page.getByText(/^Not quite:/)).toBeVisible();

  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(cells.nth(open)).toHaveAccessibleName(/: empty$/);
  await solveBoard(page, 1);
  await expect(page.getByText(/Solved 1 puzzle in/).first()).toBeVisible();
  await expect(page.getByRole('grid', { name: 'Puzzle 1, solved' })).toBeVisible();
});

test('a race: a bot races, everyone gets the same boards, the finisher watches', async ({
  browser,
}) => {
  const host = await (
    await browser.newContext({ viewport: { width: 1280, height: 800 } })
  ).newPage();
  await createLobby(host, 'Heron');
  const code = host.url().split('/').pop()!;
  await host.getByRole('radio', { name: '4×4' }).click();
  await host.getByRole('button', { name: 'More puzzles' }).click();
  await expect(host.getByRole('slider', { name: 'Puzzles' })).toHaveValue('2');

  const rook = await (
    await browser.newContext({ viewport: { width: 375, height: 812 } })
  ).newPage();
  await rook.goto(`/r/${code}`);
  await rook.getByLabel('Your name').fill('Rook');
  await rook.getByRole('button', { name: 'Take a seat' }).click();
  await expect(rook.getByText('Puzzles: 2')).toBeVisible();
  await host.getByRole('button', { name: 'Add a computer player' }).first().click();
  await host.getByRole('button', { name: 'Start Fandango' }).click();

  const labelsOf = (page: Page) =>
    page
      .getByRole('grid', { name: /^Puzzle 1,/ })
      .getByRole('button')
      .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
  await expect(rook.getByRole('grid', { name: /^Puzzle 1,/ })).toBeVisible();
  expect(await labelsOf(rook)).toEqual(await labelsOf(host));
  await expect(rook.getByRole('list', { name: 'The race' })).toContainText('Heron');

  await solveBoard(host, 1);
  await expect(host.getByText('Puzzle 2 of 2')).toBeVisible();
  await solveBoard(host, 2);
  await expect(host.getByText('Watching the race')).toBeVisible();
  await expect(host.getByRole('article', { name: /^Rook: / })).toBeVisible();
  await expect(rook.getByText(/The race ends in/)).toBeVisible();

  await solveBoard(rook, 1);
  await solveBoard(rook, 2);
  const end = host.getByRole('button', { name: 'End game' });
  if (await end.isVisible()) {
    await end.click();
    await host.getByRole('button', { name: 'Save the rounds so far' }).click();
  }
  const stats = await (await host.request.get(`/api/lobby/${code}/stats`)).json();
  expect(stats.history).toHaveLength(1);
  expect(stats.history[0].summary).toMatch(/2 of 2 solved in/);
});
