import { expect, test, type APIRequestContext, type Browser } from '@playwright/test';

// Poker and Letterhoard on real phones, set up through the lobby API: a hand folded and the next
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
  const keys = [token('wren'), token('rook')];
  const { code } = await call(req, '/api/lobby', keys[0]!, { name: 'Wren', gameId });
  await call(req, `/api/lobby/${code}`, keys[1]!, { type: 'join', name: 'Rook' });
  await call(req, `/api/lobby/${code}`, keys[0]!, { type: 'start', look: 'light' });
  const byId: Record<string, string> = {};
  for (const k of keys) byId[(await call(req, `/api/lobby/${code}`, k)).me] = k;
  return { code: code as string, byId };
}

async function phone(browser: Browser, key: string, code: string, blockServiceWorker = false) {
  // Requests a service worker makes aren't routed, so a test that mocks one blocks the worker.
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: blockServiceWorker ? 'block' : 'allow',
  });
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

test('wordhoard: the waiting player rearranges their rack, which stays put, and sees what a word means', async ({
  browser,
  request,
}) => {
  test.setTimeout(180_000);
  const { code, byId } = await table(request, 'wordhoard');
  const first = (await call(request, `/api/lobby/${code}`, null)).tableView.turn as string;
  const waiting = Object.keys(byId).find((id) => id !== first)!;
  const page = await phone(browser, byId[waiting]!, code, true);
  // The meaning comes from outside dictionaries; here it's fixed, so the test never leaves home.
  await page.route(/\/api\/words\/define\?/, (route) => {
    const w = new URL(route.request().url()).searchParams.get('w')!.split(',');
    return route.fulfill({
      json: { words: w.map((word) => ({ word, senses: [{ part: 'noun', text: `A ${word}.` }] })) },
    });
  });
  await expect(page.getByText('Plan your next word while you wait')).toBeVisible({
    timeout: 60_000,
  });

  // Not your turn, but the first tile dragged onto the fourth slot moves there.
  const slots = page.getByRole('group', { name: 'Your rack' }).getByRole('button');
  const labels = () => slots.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  const before = await labels();
  const a = (await slots.nth(0).boundingBox())!;
  const b = (await slots.nth(3).boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2, a.y - 20, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  const moved = [before[1], before[2], before[3], before[0], ...before.slice(4)];
  await expect.poll(labels).toEqual(moved);

  // The other player plays any two-letter word their rack makes (or passes and the turn comes
  // back round); the waiting phone says what it means, and its rack keeps the new order.
  const TWO =
    'AA AB AD AE AG AH AI AL AM AN AR AS AT AW AX AY BA BE BI BO BY DE DO ED EF EH EL EM EN ER ES ET EX FA GO HA HE HI HM HO ID IF IN IS IT JO KA LA LI LO MA ME MI MM MO MU MY NA NE NO NU OD OE OF OH OM ON OP OR OS OW OX OY PA PE PI RE SH SI SO TA TI TO UH UM UN UP US UT WE WO XI XU YA YE YO'.split(
      ' ',
    );
  let played: string | null = null;
  for (let turn = 0; turn < 6 && !played; turn++) {
    const snap = await call(request, `/api/lobby/${code}`, byId[first]!);
    const v = snap.view;
    const action = (a: unknown) => ({
      type: 'action',
      sessionId: snap.session.id,
      seq: snap.session.seq,
      action: a,
    });
    if (v.turn !== v.side) break;
    const word = TWO.find((w) => {
      const rack = [...v.rack];
      return [...w].every((l) => {
        const k = rack.indexOf(l);
        return k >= 0 && rack.splice(k, 1).length === 1;
      });
    });
    if (word) {
      const tiles = [...word].map((letter, i) => ({ row: 7, col: 7 + i, letter }));
      await call(request, `/api/lobby/${code}`, byId[first]!, action({ type: 'play', tiles }));
      played = word;
    } else {
      await call(request, `/api/lobby/${code}`, byId[first]!, action({ type: 'pass' }));
      break;
    }
  }
  test.skip(!played, 'The first rack made no two-letter word');
  const card = page.getByRole('status').filter({ hasText: `played ${played}` });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText(`A ${played}.`);
  await expect.poll(labels).toEqual(moved);
  await card.getByRole('button', { name: 'Close' }).click();
  await expect(card).toBeHidden();
});
