import { expect, test, type Locator, type Page } from '@playwright/test';
import { solve, type Puzzle } from '@jackdaw/game-zap';

async function createLobby(page: Page, name: string) {
  await page.goto('/');
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Create a lobby' }).click();
  await page.waitForURL(/\/r\/[A-Z]{4}$/);
  await page
    .getByRole('button', { name: /^(Mini game )?Zap 1/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Show options and rules' }).click();
}

/** Reads the numbers and walls from the squares' labels and works out the line. */
async function readBoard(board: Locator): Promise<{ puzzle: Puzzle; answer: number[] }> {
  const labels = await board
    .getByRole('button')
    .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''));
  const size = Math.sqrt(labels.length);
  const dots: number[] = [];
  const walls: [number, number][] = [];
  labels.forEach((l, i) => {
    const n = /number (\d+)/.exec(l);
    if (n) dots[Number(n[1]) - 1] = i;
    if (l.includes('wall right')) walls.push([i, i + 1]);
    if (l.includes('wall below')) walls.push([i, i + size]);
  });
  const puzzle = { size, dots, walls };
  return { puzzle, answer: solve(puzzle, 1, Infinity)![0]! };
}

/** Draws the answer a tap at a time. */
async function solveBoard(page: Page, n: number) {
  const board = page.getByRole('grid', { name: new RegExp(`^Puzzle ${n},`) });
  await expect(board).toBeVisible();
  const { answer } = await readBoard(board);
  const cells = board.getByRole('button');
  for (const cell of answer) await cells.nth(cell).click();
}

test('alone: draw by dragging, back up, then solve by taps', async ({ browser }) => {
  const page = await (
    await browser.newContext({ viewport: { width: 375, height: 812 } })
  ).newPage();
  await createLobby(page, 'Wren');
  await page.getByRole('radio', { name: '5×5' }).click();
  await expect(page.getByRole('slider', { name: 'Puzzles' })).toHaveValue('1');
  await page.getByRole('button', { name: 'Start Zap' }).click();

  const board = page.getByRole('grid', { name: /^Puzzle 1,/ });
  await expect(board).toBeVisible();
  const { answer } = await readBoard(board);
  const cells = board.getByRole('button');
  const centre = async (i: number) => {
    const b = (await cells.nth(i).boundingBox())!;
    return [b.x + b.width / 2, b.y + b.height / 2] as const;
  };

  // A square that isn't 1 can't start the line.
  await cells.nth(answer[1]!).click();
  await expect(cells.nth(answer[1]!)).toHaveAccessibleName(/empty/);

  await page.mouse.move(...(await centre(answer[0]!)));
  await page.mouse.down();
  for (const i of [1, 2, 3]) await page.mouse.move(...(await centre(answer[i]!)), { steps: 4 });
  await expect(cells.nth(answer[3]!)).toHaveAccessibleName(/end of the line/);
  await page.mouse.move(...(await centre(answer[2]!)), { steps: 4 });
  await page.mouse.move(...(await centre(answer[1]!)), { steps: 4 });
  await page.mouse.up();
  await expect(cells.nth(answer[1]!)).toHaveAccessibleName(/end of the line/);
  await expect(cells.nth(answer[3]!)).toHaveAccessibleName(/empty/);

  await page.getByRole('button', { name: 'Clear' }).click();
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
  await host.getByRole('radio', { name: '5×5' }).click();
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
  await host.getByRole('button', { name: 'Start Zap' }).click();

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
