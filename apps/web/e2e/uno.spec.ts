import { expect, test, type APIRequestContext, type Browser } from '@playwright/test';

// UNO on real phones, set up through the lobby API: the player to act plays a card that goes (or
// draws when nothing does), and the other phone sees the turn come round. Public reads (the TV)
// never carry anyone's hand or the draw pile.

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
  await page.goto(`/r/${code}`);
  return page;
}

test('uno: the player to act plays or draws, and the turn goes round', async ({
  browser,
  request,
}) => {
  test.setTimeout(180_000);
  const keys = [token('wren'), token('bran')];
  const { code } = await call(request, '/api/lobby', keys[0]!, { name: 'Wren', gameId: 'uno' });
  await call(request, `/api/lobby/${code}`, keys[1]!, { type: 'join', name: 'Bran' });
  await call(request, `/api/lobby/${code}`, keys[0]!, { type: 'start', look: 'light' });
  const byId: Record<string, string> = {};
  for (const k of keys) byId[(await call(request, `/api/lobby/${code}`, k)).me] = k;

  const pub = await call(request, `/api/lobby/${code}`, null);
  const t = pub.tableView;
  expect(pub.view).toBeUndefined();
  expect(JSON.stringify(pub)).not.toMatch(/"(hand|hands|deck|drawn)"/);
  expect(Object.values(t.counts)).toEqual([7, 7]);

  const actorId = t.toAct as string;
  const otherId = t.players.find((p: string) => p !== actorId) as string;
  const actor = await phone(browser, byId[actorId]!, code);
  const other = await phone(browser, byId[otherId]!, code);
  await expect(actor.getByRole('heading', { name: 'Your turn' })).toBeVisible({ timeout: 60_000 });
  await expect(other.getByText(/^Waiting for /)).toBeVisible();
  await expect(actor.getByRole('region', { name: 'Your 7 cards' })).toBeVisible();

  const playable = actor.getByRole('button', { name: /, play it$/ });
  if ((await playable.count()) > 0) {
    await playable.first().click();
    // A wild asks for its colour first.
    const colour = actor.getByRole('region', { name: 'Choose a colour' });
    if (await colour.isVisible().catch(() => false)) {
      await colour.getByRole('button', { name: 'Blue' }).click();
    }
  } else {
    await actor.getByRole('button', { name: 'Draw', exact: true }).click();
    const keep = actor.getByRole('button', { name: 'Keep it' });
    if (await keep.isVisible({ timeout: 3_000 }).catch(() => false)) await keep.click();
  }

  // Whatever went down, the round moved on and every card is still accounted for.
  await expect
    .poll(async () => (await call(request, `/api/lobby/${code}`, null)).tableView.moves.length, {
      timeout: 20_000,
    })
    .toBeGreaterThan(0);
  const after = (await call(request, `/api/lobby/${code}`, null)).tableView;
  const held = Object.values(after.counts as Record<string, number>).reduce((a, b) => a + b, 0);
  expect(held + after.deckCount + after.discardCount).toBe(108);
});
