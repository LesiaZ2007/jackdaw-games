import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';

// Catan on real phones, set up through the lobby API: the ships in the lobby, the whole opening
// placed by tapping the board, a roll, a trade offered and turned down, and the turn passing; the
// TV follows. Public reads never carry anyone's cards.

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

async function phone(browser: Browser, key: string, code: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript((t) => localStorage.setItem('jackdaw:token', t), key);
  const page = await context.newPage();
  await page.goto(`/r/${code}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.ctn--phone')).toBeVisible();
  return page;
}

/** Taps the first ringed spot on the board, then confirms the ghost. */
async function placeOne(page: Page) {
  await page.locator('.ctn-board [data-spot]').first().click({ force: true });
  await page.getByRole('button', { name: 'Place it here' }).click();
}

test('catan: the opening, a roll, a trade and a turn, on phones and the TV', async ({
  browser,
  request,
}) => {
  test.setTimeout(240_000);
  const keys = [token('wren'), token('rook'), token('finch')];
  const { code } = await call(request, '/api/lobby', keys[0]!, { name: 'Wren', gameId: 'catan' });
  await call(request, `/api/lobby/${code}`, keys[1]!, { type: 'join', name: 'Rook' });
  await call(request, `/api/lobby/${code}`, keys[2]!, { type: 'join', name: 'Finch' });

  // The lobby: each player a ship, its sail in the colour they'll build in.
  const host = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await host.addInitScript((t) => localStorage.setItem('jackdaw:token', t), keys[0]!);
  const lobby = await host.newPage();
  await lobby.goto(`/r/${code}`, { waitUntil: 'domcontentloaded' });
  await expect(lobby.getByText('Bound for Catan')).toBeVisible();
  await expect(lobby.getByLabel('Wren (you), host, builds in red')).toBeVisible();
  await expect(lobby.getByLabel('Rook, builds in blue')).toBeVisible();
  await host.close();

  await call(request, `/api/lobby/${code}`, keys[0]!, { type: 'start', look: 'light' });

  // Hidden things stay hidden: the TV's read has counts, never cards.
  const pub = await call(request, `/api/lobby/${code}`, null);
  expect(pub.view).toBeUndefined();
  expect(JSON.stringify(pub)).not.toMatch(/"(hands|dev|deck|resource)"/);
  const byId: Record<string, string> = {};
  for (const k of keys) {
    const s = await call(request, `/api/lobby/${code}`, k);
    byId[s.me] = k;
    expect(s.view.hand).toEqual({ lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 });
  }

  const order: string[] = pub.tableView.setup.order;
  const pages: Record<string, Page> = {};
  for (const id of Object.keys(byId)) pages[id] = await phone(browser, byId[id]!, code);
  const tv = await (
    await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  ).newPage();
  await tv.goto(`/tv/${code}`, { waitUntil: 'domcontentloaded' });
  await expect(tv.locator('.ctn--tv')).toBeVisible();

  // The opening: round and back, a settlement then a road each time, all by tapping the board.
  for (const id of order) {
    const page = pages[id]!;
    await expect(page.getByText('Your placement')).toBeVisible();
    await placeOne(page);
    await expect(page.getByText('Now a road beside it.')).toBeVisible();
    await placeOne(page);
  }
  const after = (await call(request, `/api/lobby/${code}`, null)).tableView;
  expect(after.phase).toBe('roll');
  expect(Object.keys(after.buildings)).toHaveLength(6);
  expect(Object.keys(after.roads)).toHaveLength(6);

  // A roll.
  const moverId = after.turn as string;
  const mover = pages[moverId]!;
  await expect(mover.getByText('Your turn')).toBeVisible();
  await mover.getByRole('button', { name: 'Roll the dice' }).click();
  await expect(tv.locator('.ctn-dice')).toBeVisible();
  let now = (await call(request, `/api/lobby/${code}`, null)).tableView;
  if (now.phase === 'robber') {
    // A 7: move the robber to the first tile offered and rob whoever's asked.
    await mover
      .getByRole('button', { name: /^Move the robber to/ })
      .first()
      .click({ force: true });
    const pick = mover.locator('.ctn-victims button').first();
    if (await pick.isVisible()) await pick.click();
    await mover.getByRole('button', { name: 'Move the robber', exact: true }).click();
  }
  await expect(mover.getByRole('button', { name: 'Trade' })).toBeVisible();

  // A trade: offer one card to everyone; another player turns it down.
  now = (await call(request, `/api/lobby/${code}`, byId[moverId]!)).view;
  const res = (Object.keys(now.hand) as string[]).find((r) => now.hand[r] > 0)!;
  const wantRes = ['lumber', 'brick', 'wool', 'grain', 'ore'].find((r) => r !== res)!;
  await mover.getByRole('button', { name: 'Trade' }).click();
  const sheet = mover.getByRole('dialog', { name: 'Trade' });
  await sheet
    .getByRole('group', { name: 'You give' })
    .getByRole('button', { name: new RegExp(`^Add ${res}`, 'i') })
    .click();
  await sheet
    .getByRole('group', { name: 'You want' })
    .getByRole('button', { name: new RegExp(`^Add ${wantRes}`, 'i') })
    .click();
  await sheet.getByRole('button', { name: 'Make the offer' }).click();
  await expect(sheet.getByText('Your offers')).toBeVisible();
  const otherId = Object.keys(byId).find((id) => id !== moverId)!;
  const other = pages[otherId]!;
  await expect(other.getByText(/offers/)).toBeVisible();
  await other.getByRole('button', { name: 'No', exact: true }).click();
  await expect(sheet.getByText('No', { exact: true })).toBeVisible();
  await expect(tv.locator('.ctn-tv__offer')).toBeVisible();
  await sheet.getByRole('button', { name: 'Close' }).click();

  // A proposal to the player on their turn shows up on their phone without opening Trade.
  const os = await call(request, `/api/lobby/${code}`, byId[otherId]!);
  const give = (Object.keys(os.view.hand) as string[]).find((r) => os.view.hand[r] > 0);
  if (give) {
    const want = ['lumber', 'brick', 'wool', 'grain', 'ore'].find((r) => r !== give)!;
    await call(request, `/api/lobby/${code}`, byId[otherId]!, {
      type: 'action',
      sessionId: os.session.id,
      seq: os.session.seq,
      action: { type: 'propose', give: { [give]: 1 }, want: { [want]: 1 } },
    });
    await expect(mover.getByLabel('A trade waiting for you')).toBeVisible();
  }

  // End the turn: the next seat rolls, the TV says so.
  await mover.getByRole('button', { name: 'End', exact: true }).click();
  const next = (await call(request, `/api/lobby/${code}`, null)).tableView;
  expect(next.turn).not.toBe(moverId);
  await expect(pages[next.turn]!.getByRole('button', { name: 'Roll the dice' })).toBeVisible();

  // Nothing scrolls sideways, at any width, by day or by night.
  const look = pages[next.turn]!;
  for (const scheme of ['light', 'dark'] as const) {
    await look.emulateMedia({ colorScheme: scheme });
    for (const width of [375, 768, 1280, 1920]) {
      await look.setViewportSize({ width, height: width > 1000 ? 900 : 812 });
      await expect(look.locator('.ctn--phone')).toBeVisible();
      const wide = await look.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(wide, `${scheme} at ${width}px`).toBe(false);
    }
  }
});
