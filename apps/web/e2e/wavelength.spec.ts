import { expect, test, type APIRequestContext, type Browser } from '@playwright/test';

// Wavelength on real phones, set up through the lobby API (two players play Together): the psychic
// writes a clue, the guesser drags the dial and locks in, and both phones get the reveal. Public
// reads (the TV) and the guesser's phone never carry the target before then.

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

test('wavelength: a clue, the dial dragged and locked, and the reveal', async ({
  browser,
  request,
}) => {
  test.setTimeout(180_000);
  const keys = [token('lesia'), token('bran')];
  const { code } = await call(request, '/api/lobby', keys[0]!, {
    name: 'Lesia',
    gameId: 'wavelength',
  });
  await call(request, `/api/lobby/${code}`, keys[1]!, { type: 'join', name: 'Bran' });
  await call(request, `/api/lobby/${code}`, keys[0]!, { type: 'start', look: 'light' });
  const byId: Record<string, string> = {};
  for (const k of keys) byId[(await call(request, `/api/lobby/${code}`, k)).me] = k;

  const pub = await call(request, `/api/lobby/${code}`, null);
  const t = pub.tableView;
  expect(pub.view).toBeUndefined();
  expect(t.mode).toBe('together');
  expect(t.round.target).toBeNull();
  expect(JSON.stringify(pub)).not.toMatch(/"dials"/);

  const psychicId = t.round.psychic as string;
  const guesserId = t.players.find((p: string) => p !== psychicId) as string;
  const seen = await call(request, `/api/lobby/${code}`, byId[psychicId]!);
  expect(typeof seen.view.target).toBe('number');
  const blind = await call(request, `/api/lobby/${code}`, byId[guesserId]!);
  expect(blind.view.target).toBeNull();

  const psychic = await phone(browser, byId[psychicId]!, code);
  const guesser = await phone(browser, byId[guesserId]!, code);
  await expect(psychic.getByRole('heading', { name: 'You’re the psychic' })).toBeVisible({
    timeout: 60_000,
  });
  await psychic.getByRole('textbox').fill('Lukewarm tea');
  await psychic.getByRole('button', { name: 'Give the clue' }).click();

  await expect(guesser.getByRole('heading', { name: 'Lukewarm tea' })).toBeVisible({
    timeout: 20_000,
  });
  // Drag the needle well over to the left.
  const dial = guesser.getByRole('slider');
  const box = (await dial.boundingBox())!;
  await guesser.mouse.move(box.x + box.width / 2, box.y + box.height * 0.2);
  await guesser.mouse.down();
  await guesser.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.4, { steps: 8 });
  await guesser.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.8, { steps: 8 });
  await guesser.mouse.up();
  await expect
    .poll(async () => (await call(request, `/api/lobby/${code}`, null)).tableView.round.dial, {
      timeout: 15_000,
    })
    .toBeLessThan(30);

  await guesser.getByRole('button', { name: 'Lock in' }).click();
  await expect
    .poll(async () => (await call(request, `/api/lobby/${code}`, null)).tableView.phase, {
      timeout: 15_000,
    })
    .toBe('reveal');
  const done = (await call(request, `/api/lobby/${code}`, null)).tableView;
  expect(done.round.target).toBe(seen.view.target);
  expect(done.history[0].guess).toBeLessThan(30);
  for (const page of [psychic, guesser]) {
    await expect(page.getByRole('region', { name: 'Next round' })).toBeVisible({
      timeout: 20_000,
    });
  }
});
