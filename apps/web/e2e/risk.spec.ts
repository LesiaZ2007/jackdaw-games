import { expect, test, type APIRequestContext, type Browser } from '@playwright/test';

// Risk on real phones, set up through the lobby API: the player to move places their armies,
// rolls one attack, stops and ends the turn; the other phone and the TV see the turn pass. Public
// reads (the TV) never carry anyone's cards or mission.

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
  await expect(page.locator('.rk-dock')).toBeVisible();
  // The game opens with your orders under a seal: break it, read the mission, go to battle.
  const orders = page.getByRole('dialog');
  await expect(orders.getByText('Secret orders')).toBeVisible();
  await orders.getByRole('button', { name: 'Break the seal and read your orders' }).click();
  await expect(orders.getByRole('heading', { name: 'Your mission' })).toBeVisible();
  await orders.getByRole('button', { name: 'To battle' }).click();
  await expect(orders).toBeHidden();
  return page;
}

test('risk: a whole turn on the phone, seen by the other phone and the TV', async ({
  browser,
  request,
}) => {
  test.setTimeout(180_000);
  const keys = [token('lesia'), token('bran')];
  const { code } = await call(request, '/api/lobby', keys[0]!, { name: 'Lesia', gameId: 'risk' });
  await call(request, `/api/lobby/${code}`, keys[1]!, { type: 'join', name: 'Bran' });

  // The lobby: each seat a banner in the colour its armies will be, and every option explained.
  const host = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await host.addInitScript((t) => localStorage.setItem('jackdaw:token', t), keys[0]!);
  const lobby = await host.newPage();
  await lobby.goto(`/r/${code}`);
  await expect(lobby.getByLabel('Lesia (you), host, Red armies')).toBeVisible();
  await expect(lobby.getByLabel('Bran, Blue armies')).toBeVisible();
  await lobby.getByRole('button', { name: 'Show options and rules' }).click();
  await expect(lobby.getByText(/Everyone gets a hidden goal/)).toBeVisible();
  await host.close();

  await call(request, `/api/lobby/${code}`, keys[0]!, { type: 'start', look: 'light' });

  // Hidden things stay hidden: the TV's read has no cards or missions; each phone has its own.
  const pub = await call(request, `/api/lobby/${code}`, null);
  expect(pub.view).toBeUndefined();
  expect(pub.tableView.missions).toBeNull();
  expect(JSON.stringify(pub)).not.toMatch(/"(hands|deck|discard|drafts|mission)"/);
  const byId: Record<string, string> = {};
  for (const k of keys) {
    const s = await call(request, `/api/lobby/${code}`, k);
    byId[s.me] = k;
    expect(s.view.mission).toBeTruthy();
    expect(s.view.hand).toEqual([]);
  }
  const t = pub.tableView;
  const moverId = t.turn as string;
  const otherId = Object.keys(byId).find((id) => id !== moverId)!;
  const mine = Object.keys(t.owner).filter((x) => t.owner[x] === moverId);

  const mover = await phone(browser, byId[moverId]!, code);
  const other = await phone(browser, byId[otherId]!, code);
  const tv = await (
    await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  ).newPage();
  await tv.goto(`/tv/${code}`);
  await expect(tv.locator('.rk--tv')).toBeVisible();

  // Reinforce: every army on one territory, then send them.
  await expect(mover.getByText('Your turn')).toBeVisible();
  await expect(other.getByText(/is playing/)).toBeVisible();
  for (let i = 0; i < t.toPlace; i++)
    await mover.locator(`[data-roundel="${mine[0]}"]`).dispatchEvent('click');
  await expect(mover.getByText('All placed')).toBeVisible();
  await mover.getByRole('button', { name: 'Place them' }).click();

  // Attack: find a territory of ours with an enemy next door, pick a target, roll once.
  await expect(mover.getByText('Tap one of your territories with 2 or more armies')).toBeVisible();
  const after = (await call(request, `/api/lobby/${code}`, null)).tableView;
  let target: string | null = null;
  for (const from of mine.filter((x) => after.armies[x] >= 2)) {
    await mover.locator(`[data-roundel="${from}"]`).dispatchEvent('click');
    const targets = await mover.$$eval('.rk-terr.is-target', (els) =>
      els.map((e) => e.getAttribute('data-t')),
    );
    if (targets.length) {
      target = targets[0]!;
      break;
    }
  }
  expect(target).not.toBeNull();
  await mover.locator(`[data-roundel="${target}"]`).dispatchEvent('click');
  await mover.getByRole('button', { name: 'Roll' }).click();
  await expect(mover.locator('.rk-dice')).toBeVisible();
  await expect(tv.locator('.rk-dice')).toBeVisible();

  // Finish: move in if we took it, stop attacking, and end the turn.
  const move = mover.getByRole('button', { name: /^Move \d+$/ });
  if (await move.isVisible()) await move.click();
  await mover.getByRole('button', { name: /^Stop( attacking)?$/ }).click();
  await mover.getByRole('button', { name: 'End turn' }).click();

  await expect(other.getByText('Your turn')).toBeVisible();
  await expect(other.getByText('Tap your territories to add one at a time.')).toBeVisible();
  await expect(tv.getByText('Bran’s turn').or(tv.getByText('Lesia’s turn'))).toBeVisible();
  expect((await call(request, `/api/lobby/${code}`, null)).tableView.turn).toBe(otherId);

  // Nothing scrolls sideways, at any width, by day or by night.
  for (const scheme of ['light', 'dark'] as const) {
    await other.emulateMedia({ colorScheme: scheme });
    for (const width of [375, 768, 1280, 1920]) {
      await other.setViewportSize({ width, height: width > 1000 ? 900 : 812 });
      await expect(other.locator('.rk--phone')).toBeVisible();
      const wide = await other.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(wide, `${scheme} at ${width}px`).toBe(false);
    }
  }
});
