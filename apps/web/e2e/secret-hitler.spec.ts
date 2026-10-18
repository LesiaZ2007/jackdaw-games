import { expect, test, type Browser, type Page } from '@playwright/test';

// Secret Hitler, played as on secret-hitler.online: five phones play one round through its
// screens (role card, nomination, Ja!, discard, enact, End term), then the rest of the game is
// driven through the lobby API to a win, ending on its victory popup. The TV and every public read
// must never carry a role, a hand or a ballot.

const NAMES = ['Wren', 'Bran', 'Cerys', 'Dafydd', 'Elin'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Snap = any;

async function phone(browser: Browser, width = 390, height = 844) {
  const context = await browser.newContext({ viewport: { width, height } });
  return context.newPage();
}

async function host(page: Page): Promise<string> {
  await page.goto('/');
  // A name typed before the page has loaded can be lost, so try again until the lobby opens.
  const inLobby = () => /\/r\/[A-Z]{4}$/.test(page.url());
  await expect(async () => {
    if (inLobby()) return;
    await page.getByLabel('Your name').fill('Wren');
    await page.getByRole('button', { name: 'Create a lobby' }).click();
    await page.waitForURL(/\/r\/[A-Z]{4}$/, { timeout: 15_000 });
  }).toPass({ timeout: 150_000 });
  return page.url().split('/').pop()!;
}

async function join(page: Page, code: string, name: string) {
  await page.goto(`/r/${code}`);
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Take a seat' }).click();
  await expect(
    page.getByRole('button', { name: new RegExp(`^${name} \\(you\\)`) }).first(),
  ).toBeVisible();
}

const token = (page: Page) => page.evaluate(() => localStorage.getItem('jackdaw:token')!);

/**
 * The lobby rate-limits fast clients, so a scripted player backs off and tries again. The dev
 * server also drops idle keep-alive connections now and then, which a retry covers too.
 */
async function call(page: Page, send: () => Promise<{ status(): number; json(): Promise<Snap> }>) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await send();
    } catch (e) {
      if (attempt >= 5 || !/ECONNRESET|socket hang up/.test(String(e))) throw e;
      await page.waitForTimeout(300);
      continue;
    }
    if (res.status() !== 429 || attempt >= 20) return res;
    await page.waitForTimeout(400 + attempt * 200);
  }
}

async function read(page: Page, code: string): Promise<Snap> {
  const key = await token(page);
  const res = await call(page, () =>
    page.request.get(`/api/lobby/${code}`, { headers: { 'x-player-token': key } }),
  );
  const body = await res.json();
  expect(res.status(), JSON.stringify(body)).toBe(200);
  return body;
}

async function act(page: Page, code: string, action: object) {
  const s = await read(page, code);
  const key = await token(page);
  const res = await call(page, () =>
    page.request.post(`/api/lobby/${code}`, {
      headers: { 'x-player-token': key, 'content-type': 'application/json' },
      data: { type: 'action', sessionId: s.session.id, seq: s.session.seq, action },
    }),
  );
  expect(res.status(), JSON.stringify(await res.json())).toBe(200);
}

/** The popup that's showing (secret-hitler.online's CustomAlert). */
const popup = (page: Page) => page.locator('#alert-box.appear-custom-alert');
const popupButton = (page: Page, name: string) =>
  popup(page).getByRole('button', { name, exact: true });

/** Five seated phones in a Secret Hitler lobby, the host first. */
async function table(browser: Browser) {
  const first = await phone(browser);
  const code = await host(first);
  const pages = [first];
  for (const name of NAMES.slice(1)) {
    const p = await phone(browser);
    await join(p, code, name);
    pages.push(p);
  }
  await first
    .getByRole('button', { name: /Secret Hitler/ })
    .first()
    .click();
  for (const p of pages) await expect(p.getByText('LOBBY CODE:')).toBeVisible();
  const ids: Record<string, Page> = {};
  for (const p of pages) ids[(await read(p, code)).me] = p;
  return { code, pages, byId: ids };
}

/** Plays whatever the table is waiting on through the API until the game is over. */
async function playOut(code: string, byId: Record<string, Page>) {
  const any = Object.values(byId)[0]!;
  for (let step = 0; step < 400; step++) {
    const s = await read(any, code);
    if (s.status !== 'in_game') return s;
    const t = s.tableView;
    const pageOf = (id: string) => byId[id]!;
    if (t.phase === 'nominate')
      await act(pageOf(t.president), code, { type: 'nominate', chancellor: t.eligible[0] });
    else if (t.phase === 'vote') {
      for (const id of t.players.filter((p: string) => !t.dead.includes(p) && !t.voted.includes(p)))
        await act(pageOf(id), code, { type: 'vote', ja: true });
    } else if (t.phase === 'president') {
      const v = (await read(pageOf(t.president), code)).view;
      await act(pageOf(t.president), code, { type: 'discard', policy: v.hand[0] });
    } else if (t.phase === 'chancellor') {
      const v = (await read(pageOf(t.nominee), code)).view;
      await act(pageOf(t.nominee), code, { type: 'enact', policy: v.hand[0] });
    } else if (t.phase === 'veto') {
      await act(pageOf(t.president), code, { type: 'vetoReply', accept: false });
    } else if (t.phase === 'post') {
      await act(pageOf(t.president), code, { type: 'endTerm' });
    } else if (t.phase === 'power') {
      const investigated = t.governments
        .filter((g: Snap) => g.power?.kind === 'investigate')
        .map((g: Snap) => g.power.target);
      const target = t.players.find(
        (p: string) => p !== t.president && !t.dead.includes(p) && !investigated.includes(p),
      );
      await act(pageOf(t.president), code, { type: 'power', target });
    }
  }
  throw new Error('The game never ended');
}

/** Nothing secret in a read: no roles mid-game, no hands, no ballots, no investigation results. */
function expectPublic(s: Snap) {
  expect(s.view).toBeUndefined();
  expect(s.tableView.roles).toBeNull();
  expect(JSON.stringify(s)).not.toMatch(
    /"(hand|ballots|drawn|secret|investigations|myRole|known|peek)":|"hitler"/,
  );
}

test('five phones play Secret Hitler as on secret-hitler.online, on to a win, with nothing leaked', async ({
  browser,
}) => {
  // Five phones and a whole game: alone it takes a couple of minutes, but a loaded machine
  // running the full suite can need several.
  test.setTimeout(600_000);
  const { code, pages, byId } = await table(browser);

  // Change icon: the portrait stands for your crest, and someone else's is greyed out.
  const second = pages[1]!;
  await second.getByRole('button', { name: 'CHANGE ICON' }).click();
  await expect(popup(second).getByText('PLAYER LOOK')).toBeVisible();
  await expect(popup(second).locator('#icon.disabled')).toHaveCount(4);
  await popup(second).locator('#icon:not(.disabled):not(.selected)').first().click();
  await expect(popup(second).locator('#icon.selected')).toHaveCount(1);
  await popupButton(second, 'CONFIRM').click();
  await expect(popup(second)).toHaveCount(0);

  // Only the VIP (the host) can start.
  await expect(second.getByText('Only the VIP can start the game.')).toBeVisible();
  await expect(second.getByRole('button', { name: 'START GAME' })).toBeDisabled();
  await pages[0]!.getByRole('button', { name: 'START GAME' }).click();

  // Everyone gets their role card first.
  for (const p of pages) {
    await expect(popup(p).getByText(/YOU ARE: (LIBERAL|FASCIST|HITLER)/)).toBeVisible();
    await popupButton(p, 'OKAY').click();
  }

  // The TV, and a read with no seat, get only the public table.
  const tvRead = await (
    await call(pages[0]!, () => pages[0]!.request.get(`/api/lobby/${code}`))
  ).json();
  expectPublic(tvRead);
  const tv = await phone(browser, 1920, 1080);
  await tv.goto(`/tv/${code}`);
  await expect(tv.locator('.sho-page--tv #player-container')).toHaveCount(5);
  await expect(tv.locator('#player-identity-icon')).toHaveCount(0);

  // One full round through the screens: the president nominates.
  let s = await read(pages[0]!, code);
  const president = byId[s.tableView.president]!;
  await expect(popup(president).getByText('NOMINATION')).toBeVisible({ timeout: 20_000 });
  await popup(president).locator('#player-container.selectable').first().click();
  await popupButton(president, 'CONFIRM').click();

  // Everyone votes Ja!
  for (const p of pages) {
    await expect(popup(p).getByText('VOTING')).toBeVisible({ timeout: 20_000 });
    await popup(p).getByRole('img', { name: 'Ja! (Yes)' }).click();
    await popupButton(p, 'CONFIRM').click();
  }
  await expect(pages[3]!.locator('#status-bar-text')).toHaveText('5 - 0: Vote passed', {
    timeout: 20_000,
  });

  // Only the president holds cards: discard one.
  await expect(popup(president).getByText('Choose a policy to discard.')).toBeVisible({
    timeout: 20_000,
  });
  for (const p of pages.filter((x) => x !== president))
    await expect(p.locator('#legislative-policy')).toHaveCount(0);
  await popup(president).locator('#legislative-policy').first().click();
  await popupButton(president, 'DISCARD').click();

  // The chancellor enacts one of the two left.
  s = await read(pages[0]!, code);
  const chancellor = byId[s.tableView.nominee]!;
  await expect(popup(chancellor).getByText(/Choose a policy to enact/)).toBeVisible({
    timeout: 20_000,
  });
  await expect(popup(chancellor).locator('#legislative-policy')).toHaveCount(2);
  await popup(chancellor).locator('#legislative-policy').first().click();
  await popupButton(chancellor, 'ENACT').click();

  // Everyone sees it come out of the folder; then the president ends the term.
  for (const p of pages) {
    await expect(popup(p).getByText('POLICY ENACTED')).toBeVisible({ timeout: 20_000 });
    await popupButton(p, 'OKAY').click();
  }
  expect((await read(pages[0]!, code)).tableView.phase).toBe('post');
  await expect(pages[2]!.locator('#status-bar-text')).toHaveText(
    'Waiting for the president to end their term.',
    { timeout: 20_000 },
  );
  for (const p of pages.filter((x) => x !== president))
    await expect(p.getByRole('button', { name: 'END TERM' })).toBeDisabled();
  await president.getByRole('button', { name: 'END TERM' }).click();
  await expect.poll(async () => (await read(pages[0]!, code)).tableView.phase).toBe('nominate');

  // The rest of the game through the API, checking the public read as it goes.
  expectPublic(
    await (await call(pages[0]!, () => pages[0]!.request.get(`/api/lobby/${code}`))).json(),
  );
  const end = await playOut(code, byId);
  expect(end.status).toBe('results');

  // The victory popup: the winning side's header, and everyone's role.
  for (const p of pages) {
    await expect(popup(p).locator('#victory-header')).toBeVisible({ timeout: 60_000 });
    await expect(popup(p).getByText(/successfully/)).toBeVisible();
    await expect(popup(p).locator('#player-identity-icon')).toHaveCount(5);
  }
  await expect(
    popup(pages[1]!).getByText('Waiting for the owner to return to the lobby.'),
  ).toBeVisible();
  const stats = await (await pages[0]!.request.get(`/api/lobby/${code}/stats`)).json();
  expect(stats.history[0].standings[0].team).toMatch(/Liberal|Fascist/);

  // Return to lobby takes everyone back.
  await popupButton(pages[0]!, 'RETURN TO LOBBY').click();
  for (const p of pages) await expect(p.getByText('LOBBY CODE:')).toBeVisible({ timeout: 20_000 });
});
