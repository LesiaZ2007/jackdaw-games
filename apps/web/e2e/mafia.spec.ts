import { expect, test, type APIRequestContext, type Browser } from '@playwright/test';

// Mafia on real phones, set up through the lobby API: five players see their cards, the night is
// played (the Mafia agree on a victim, everyone else picks), and the morning's front page reaches
// a phone. Public reads (the TV) never carry a living player's card or anyone's night pick.

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
  return page;
}

const ROLE_WORDS = /"(mafia|angel|sheriff|civilian)"/;

test('mafia: the deal, a night and the morning, with nothing leaked', async ({
  browser,
  request,
}) => {
  test.setTimeout(180_000);
  const names = ['Wren', 'Rook', 'Magpie', 'Robin', 'Finch'];
  const keys = names.map((n) => token(n.toLowerCase()));
  const { code } = await call(request, '/api/lobby', keys[0]!, { name: 'Wren', gameId: 'mafia' });
  for (let i = 1; i < names.length; i++)
    await call(request, `/api/lobby/${code}`, keys[i]!, { type: 'join', name: names[i] });
  await call(request, `/api/lobby/${code}`, keys[0]!, { type: 'start', look: 'light' });

  const byId: Record<string, string> = {};
  for (const k of keys) byId[(await call(request, `/api/lobby/${code}`, k)).me] = k;
  const send = async (id: string, action: unknown) => {
    const s = await call(request, `/api/lobby/${code}`, byId[id]!);
    return call(request, `/api/lobby/${code}`, byId[id]!, {
      type: 'action',
      sessionId: s.session.id,
      seq: s.session.seq,
      action,
    });
  };
  const publicRead = async () => {
    const pub = await call(request, `/api/lobby/${code}`, null);
    expect(pub.view).toBeUndefined();
    const text = JSON.stringify(pub.tableView.players ? { ...pub.tableView, cast: [] } : pub);
    // Cards only ever show for the dead.
    for (const d of pub.tableView.deaths) expect(pub.tableView.alive).not.toContain(d.id);
    expect(text.replace(/"role":"\w+"/g, '')).not.toMatch(ROLE_WORDS);
    expect(text).not.toMatch(/"picks"|"known"|"checks"|"victim"/);
    return pub.tableView;
  };

  let t = await publicRead();
  expect(t.phase).toBe('deal');
  const deal = await phone(browser, keys[0]!, code);
  await expect(deal.getByRole('button', { name: /Your card, face down/ })).toBeVisible({
    timeout: 60_000,
  });

  for (const id of Object.keys(byId)) await send(id, { type: 'ready', on: true });
  t = await publicRead();
  expect(t.phase).toBe('night');

  // The Mafia pick one target together; everyone else picks someone.
  const views: Record<string, Snap> = {};
  for (const id of Object.keys(byId))
    views[id] = (await call(request, `/api/lobby/${code}`, byId[id]!)).view;
  const mafia = Object.keys(byId).filter((id) => views[id].role === 'mafia');
  expect(mafia).toHaveLength(1);
  const victim = views[mafia[0]!].prompt.targets[0];
  for (const id of Object.keys(byId)) {
    const p = views[id].prompt;
    const target = id === mafia[0] ? victim : p.targets.find((x: string) => x !== id);
    await send(id, { type: 'pick', target });
    if (id !== Object.keys(byId).at(-1)) expect((await publicRead()).phase).toBe('night');
  }

  t = await publicRead();
  expect(t.phase).toBe('dawn');
  const watcher = Object.keys(byId).find((id) => !t.dawn.includes(id))!;
  const page = await phone(browser, byId[watcher]!, code);
  await expect(page.getByRole('heading', { name: /Slain in the night|Quiet night/i })).toBeVisible({
    timeout: 30_000,
  });
  if (t.dawn.length) await expect(page.getByText(/was found dead/)).toBeVisible();
});
