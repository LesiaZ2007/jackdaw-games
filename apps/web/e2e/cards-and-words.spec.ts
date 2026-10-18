import { expect, test, type APIRequestContext, type Browser } from '@playwright/test';

// Poker and Wordhoard on real phones, set up through the lobby API: a hand folded and the next
// one dealt, a tile placed and a turn passed. Public reads (the TV) never carry anyone's hole
// cards or rack.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Snap = any;

const token = (name: string) => `e2e-${name}-${Date.now().toString(36)}-abcdefghijklmnop`;

async function call(req: APIRequestContext, path: string, key: string | null, data?: unknown) {
  for (let attempt = 0; ; attempt++) {
    const headers = key ? { 'x-player-token': key } : undefined;
    const res = data ? await req.post(path, { headers, data }) : await req.get(path, { headers });
    if (res.status() === 429 && attempt < 20) {
      await new Promise((r) => setTimeout(r, 400 + attempt * 200));
      continue;
    }
    const body = await res.json();
    expect(res.ok(), JSON.stringify(body)).toBe(true);
    return body as Snap;
  }
}

/** A lobby with two players in the given game, started. Returns the code and tokens by id. */
async function table(req: APIRequestContext, gameId: string) {
  const keys = [token('lesia'), token('bran')];
  const { code } = await call(req, '/api/lobby', keys[0]!, { name: 'Lesia', gameId });
  await call(req, `/api/lobby/${code}`, keys[1]!, { type: 'join', name: 'Bran' });
  await call(req, `/api/lobby/${code}`, keys[0]!, { type: 'start', look: 'light' });
  const byId: Record<string, string> = {};
  for (const k of keys) byId[(await call(req, `/api/lobby/${code}`, k)).me] = k;
  return { code: code as string, byId };
}

async function phone(browser: Browser, key: string, code: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript((t) => localStorage.setItem('jackdaw:token', t), key);
  const page = await context.newPage();
  await page.goto(`/r/${code}`);
  return page;
}

test('poker: the player to act folds, the hand is settled, and the next deals itself', async ({
  browser,
  request,
}) => {
  test.setTimeout(180_000);
  const { code, byId } = await table(request, 'poker');
  const pub = await call(request, `/api/lobby/${code}`, null);
  const t = pub.tableView;
  expect(pub.view).toBeUndefined();
  expect(JSON.stringify(pub)).not.toMatch(/"(hole|deck)"/);
  for (const [id, key] of Object.entries(byId)) {
    const mine = (await call(request, `/api/lobby/${code}`, key)).view;
    expect(mine.hole).toHaveLength(2);
    for (const c of mine.hole) expect(JSON.stringify(pub)).not.toContain(`"${c}"`);
    expect(mine.me).toBe(id);
  }

  const actor = await phone(browser, byId[t.toAct]!, code);
  const other = await phone(browser, byId[t.players.find((p: string) => p !== t.toAct)]!, code);
  await expect(actor.getByRole('region', { name: 'Your move' })).toBeVisible({ timeout: 60_000 });
  await expect(other.getByText(/^Waiting for /)).toBeVisible();
  await actor.getByRole('button', { name: 'Fold', exact: true }).click();

  // The other player won the blinds: their moment, a countdown, then the next hand on its own.
  await expect(other.getByText(/^You won /)).toBeVisible({ timeout: 20_000 });
  await expect(other.getByText(/^Next hand in /)).toBeVisible();
  await expect(other.getByText(/^Hand 2 of 30/)).toBeVisible({ timeout: 30_000 });
  const after = await call(request, `/api/lobby/${code}`, null);
  expect(after.tableView.hand).toBe(2);
});

test('wordhoard: a tile placed shows why it is not a play yet, then the turn is passed', async ({
  browser,
  request,
}) => {
  test.setTimeout(180_000);
  const { code, byId } = await table(request, 'wordhoard');
  const pub = await call(request, `/api/lobby/${code}`, null);
  expect(JSON.stringify(pub)).not.toMatch(/"(rack|racks|bag)"/);
  expect(pub.tableView.rackCounts).toEqual(
    Object.fromEntries(Object.keys(byId).map((id) => [id, 7])),
  );

  const turn = pub.tableView.turn as string;
  const page = await phone(browser, byId[turn]!, code);
  await expect(page.getByRole('heading', { name: 'Your turn' })).toBeVisible({ timeout: 60_000 });
  const rack = page.getByRole('group', { name: 'Your rack' }).getByRole('button');
  await expect(rack).toHaveCount(7);
  // A letter (not a blank, which would ask which letter it is) on the star alone isn't a word.
  await page.locator('.wh-rack__slot:not([aria-label="Blank tile"])').first().click();
  await page.getByRole('button', { name: /^Row 8, column 8:/ }).click();
  await expect(page.locator('.wh-dock__status')).toContainText('at least two letters');
  await page.getByRole('button', { name: 'Undo' }).click();

  // Drag two tiles onto the board instead: the phone asks the word list before Play.
  const drag = async (from: string, to: string) => {
    const a = (await page.locator(from).first().boundingBox())!;
    const b = (await page.getByRole('button', { name: new RegExp(`^${to}:`) }).boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2 + 20, a.y, { steps: 4 });
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
    await page.mouse.up();
  };
  const letters = page.locator('.wh-rack__slot:not(.is-used):not([aria-label="Blank tile"])');
  const first = (await letters.first().getAttribute('aria-label'))!;
  await drag('.wh-rack__slot:not(.is-used):not([aria-label="Blank tile"])', 'Row 8, column 8');
  const second = (await letters.first().getAttribute('aria-label'))!;
  await drag('.wh-rack__slot:not(.is-used):not([aria-label="Blank tile"])', 'Row 8, column 9');
  const { unknown } = await (await request.get(`/api/words?w=${first}${second}`)).json();
  await expect(page.locator('.wh-dock__status')).toContainText(
    unknown.length ? 'isn’t in the word list' : 'points',
  );
  await expect(page.getByRole('button', { name: /^Play/ })).toBeEnabled({
    enabled: unknown.length === 0,
  });
  // A placed tile can be dragged to another square.
  await drag('.wh-tile--pending', 'Row 1, column 1');
  await expect(
    page.getByRole('button', { name: /^Row 1, column 1: .*placed this turn/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('button', { name: 'Pass', exact: true }).click();
  await expect(page.getByRole('heading', { name: /’s turn$/ })).toBeVisible({ timeout: 20_000 });
  const after = await call(request, `/api/lobby/${code}`, null);
  expect(after.tableView.moves).toEqual([{ player: turn, kind: 'pass', score: 0 }]);
});
