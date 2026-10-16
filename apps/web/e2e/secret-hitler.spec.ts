import { expect, test, type Browser, type Page } from '@playwright/test';

// Secret Hitler: five phones play one round through the real screens (nominate, Ja!, discard,
// enact), then the rest of the game is driven through the lobby API to a win. The TV and every
// public read must never carry a role, a hand or a ballot. SHOTS=1 adds the screens at 375, 768,
// phase by phase at 375 and 1280 in day and dark, plus the TV, saved to the folder named below.

const OUT =
  'test-results/codenames-shots';
const NAMES = ['Wren', 'Bran', 'Cerys', 'Dafydd', 'Elin'];

type Scheme = 'light' | 'dark';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Snap = any;

async function phone(browser: Browser, width = 390, height = 844, scheme: Scheme = 'light') {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme });
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

/** Put a moment away (it also clears itself after a few seconds). */
async function dismiss(page: Page) {
  if (await page.locator('.jd-moment').count()) await page.keyboard.press('Escape');
  await expect(page.locator('.jd-moment')).toHaveCount(0);
}

/** Five seated phones in a Secret Hitler lobby, the host first. */
async function table(browser: Browser, scheme: Scheme = 'light', width = 390, height = 844) {
  const first = await phone(browser, width, height, scheme);
  const code = await host(first);
  const pages = [first];
  for (const name of NAMES.slice(1)) {
    const p = await phone(browser, 390, 844, scheme);
    await join(p, code, name);
    pages.push(p);
  }
  await first
    .getByRole('button', { name: /Secret Hitler/ })
    .first()
    .click();
  await expect(first.getByText('The cabinet is gathering')).toBeVisible();
  const ids: Record<string, Page> = {};
  for (const p of pages) ids[(await read(p, code)).me] = p;
  return { code, pages, byId: ids };
}

/** Plays whatever the table is waiting on through the API until the game is over. */
async function playOut(code: string, byId: Record<string, Page>) {
  const any = Object.values(byId)[0]!;
  for (let step = 0; step < 300; step++) {
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

test('five phones play Secret Hitler: one real round, then on to a win, with nothing leaked', async ({
  browser,
}) => {
  // Five phones and a whole game: alone it takes about a minute, but a loaded machine running the
  // full suite can need several.
  test.setTimeout(480_000);
  const { code, pages, byId } = await table(browser);
  await pages[0]!.getByRole('button', { name: 'Deal the roles: start Secret Hitler' }).click();
  for (const p of pages) await expect(p.getByText('Failed elections')).toBeVisible();

  // Everyone's secret role is face down until they tap it.
  const first = pages[1]!;
  await expect(first.locator('.sh-role__card')).toHaveCount(0);
  await first.getByRole('button', { name: 'Your secret role' }).click();
  await expect(first.locator('.sh-role__name')).toHaveText(/Liberal|Fascist|Hitler/);
  await first.getByRole('button', { name: 'Hide', exact: true }).click();

  // The TV, and a read with no seat, get only the public table.
  const tvRead = await (
    await call(pages[0]!, () => pages[0]!.request.get(`/api/lobby/${code}`))
  ).json();
  expectPublic(tvRead);
  const tv = await phone(browser, 1920, 1080);
  await tv.goto(`/tv/${code}`);
  await expect(tv.getByText('Failed elections')).toBeVisible();
  await expect(tv.locator('.sh-rolechip')).toHaveCount(0);
  // The strip says who the game is waiting on: the president, and nobody else.
  await expect(tv.locator('.sh-pcard.is-busy')).toHaveCount(1);

  // One full round through the screens.
  let s = await read(pages[0]!, code);
  const president = byId[s.tableView.president]!;
  await expect(president.locator('.sh-yourmove')).toContainText('Nominate a chancellor');
  await expect(pages.find((p) => p !== president)!.locator('.sh-yourmove')).toHaveCount(0);
  await president.locator('button.sh-pcard__body').first().click();
  await president.getByRole('button', { name: /^Nominate / }).click();
  // Everyone is busy until they vote; the hourglass leaves each card as its vote comes in.
  await expect(tv.locator('.sh-pcard.is-busy')).toHaveCount(5);
  for (const p of pages) {
    await dismiss(p);
    await p.getByRole('radio', { name: 'Ja!' }).click();
  }
  await expect(pages[3]!.locator('.sh-statusbar__tally')).toContainText('Ja 5 – Nein 0: elected');
  await expect(president.getByRole('radiogroup', { name: 'Your policies' })).toBeVisible();
  await dismiss(president);
  // Only the president holds cards now.
  for (const p of pages.filter((x) => x !== president))
    await expect(p.getByRole('radiogroup', { name: 'Your policies' })).toHaveCount(0);
  await president
    .getByRole('radiogroup', { name: 'Your policies' })
    .getByRole('radio')
    .first()
    .click();
  await president.getByRole('button', { name: /^Discard the/ }).click();
  s = await read(pages[0]!, code);
  const chancellor = byId[s.tableView.nominee]!;
  await dismiss(chancellor);
  await chancellor
    .getByRole('radiogroup', { name: 'Your policies' })
    .getByRole('radio')
    .first()
    .click();
  await chancellor.getByRole('button', { name: /^Enact the/ }).click();
  // Everyone sees the policy go down, in its own colour.
  await expect(pages[2]!.locator('.jd-moment')).toContainText(/policy enacted/);
  expect((await read(pages[0]!, code)).tableView.enactedCount).toBe(1);

  // The rest of the game through the API, checking the public read as it goes.
  expectPublic(
    await (await call(pages[0]!, () => pages[0]!.request.get(`/api/lobby/${code}`))).json(),
  );
  const end = await playOut(code, byId);
  expect(end.status).toBe('results');
  for (const p of pages) {
    await expect(p.getByText('Secret Hitler is over')).toBeVisible({ timeout: 20_000 });
    await expect(
      p
        .getByRole('status')
        .getByText(/You (won|share the win|lost)/)
        .first(),
    ).toBeVisible();
  }
  await expect(pages[0]!.getByText('Who was who')).toBeVisible();
  await expect(pages[0]!.getByText('Every government', { exact: false })).toBeVisible();
  const stats = await (await pages[0]!.request.get(`/api/lobby/${code}/stats`)).json();
  expect(stats.history[0].standings[0].team).toMatch(/Liberal|Fascist/);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`Secret Hitler, phase by phase (${scheme})`, async ({ browser }) => {
    test.skip(!process.env.SHOTS, 'screenshots only');
    test.setTimeout(900_000);
    /** Shoot `page` at each width, then put it back to a phone. */
    const at = async (
      page: Page,
      name: string,
      widths: [number, number][] = [
        [375, 812],
        [1280, 800],
      ],
    ) => {
      for (const [w, h] of widths) {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForTimeout(700);
        await page.screenshot({ path: `${OUT}/${name}-${w}-${scheme}.png` });
      }
      await page.setViewportSize({ width: 375, height: 812 });
    };
    /** Wait until any moment and phase banner have cleared. */
    const settle = async (page: Page) => {
      await expect(async () => {
        if (await page.locator('.jd-moment').count()) await page.keyboard.press('Escape');
        await expect(page.locator('.jd-moment')).toHaveCount(0, { timeout: 500 });
        await expect(page.locator('.sh-banner')).toHaveCount(0, { timeout: 500 });
      }).toPass({ timeout: 20_000 });
    };
    const { code, pages, byId } = await table(browser, scheme, 375, 812);
    const tv = await phone(browser, 1920, 1080, scheme);
    await pages[0]!.getByRole('button', { name: 'Deal the roles: start Secret Hitler' }).click();
    await tv.goto(`/tv/${code}`);
    await expect(tv.getByText('Failed elections')).toBeVisible();

    let s = await read(pages[0]!, code);
    const pres = () => byId[s.tableView.president]!;
    const onlooker = () =>
      byId[
        s.tableView.players.find(
          (id: string) => id !== s.tableView.president && id !== s.tableView.nominee,
        )
      ]!;

    // Nominate: the president's move, and everyone else waiting on them.
    await settle(pres());
    await at(pres(), 'nominate-president');
    await at(onlooker(), 'nominate-other', [[375, 812]]);
    await tv.waitForTimeout(500);
    await tv.screenshot({ path: `${OUT}/tv-nominate-${scheme}.png` });

    // The vote: two have voted; the banner sweeps in on the phone just as it starts.
    await act(pres(), code, { type: 'nominate', chancellor: s.tableView.eligible[0] });
    s = await read(pages[0]!, code);
    const watcher = onlooker();
    await expect(watcher.locator('.sh-banner')).toHaveCount(1, { timeout: 10_000 });
    await watcher.waitForTimeout(450);
    await watcher.screenshot({ path: `${OUT}/banner-375-${scheme}.png` });
    for (const id of s.tableView.players.slice(0, 2))
      await act(byId[id]!, code, { type: 'vote', ja: id !== s.tableView.players[1] });
    await settle(watcher);
    await at(watcher, 'vote');
    await tv.waitForTimeout(1500);
    await tv.screenshot({ path: `${OUT}/tv-vote-${scheme}.png` });

    // The rest vote: the tally, then the president's three cards.
    s = await read(pages[0]!, code);
    for (const id of s.tableView.players.filter((p: string) => !s.tableView.voted.includes(p)))
      await act(byId[id]!, code, { type: 'vote', ja: true });
    s = await read(pages[0]!, code);
    if (s.tableView.phase !== 'president') throw new Error('expected an elected government');
    const chancellor = byId[s.tableView.nominee]!;
    const other = onlooker();
    await expect(other.locator('.jd-moment')).toHaveCount(1, { timeout: 10_000 });
    await other.screenshot({ path: `${OUT}/vote-moment-375-${scheme}.png` });
    await settle(pres());
    await at(pres(), 'legislate-president');
    await settle(other);
    await at(other, 'legislate-other');
    await tv.waitForTimeout(2500);
    await tv.screenshot({ path: `${OUT}/tv-legislate-${scheme}.png` });
    const hand = (await read(pres(), code)).view.hand;
    await act(pres(), code, { type: 'discard', policy: hand[0] });
    await expect(chancellor.locator('.sh-yourmove')).toContainText('Enact', { timeout: 10_000 });
    await settle(chancellor);
    await at(chancellor, 'legislate-chancellor');

    // On to the first presidential power (the peek at the third Fascist policy, at five).
    for (let step = 0; step < 200; step++) {
      s = await read(pages[0]!, code);
      const t = s.tableView;
      if (t.phase === 'power' || s.status !== 'in_game') break;
      if (t.phase === 'nominate')
        await act(byId[t.president]!, code, { type: 'nominate', chancellor: t.eligible[0] });
      else if (t.phase === 'vote') {
        for (const id of t.players.filter(
          (p: string) => !t.dead.includes(p) && !t.voted.includes(p),
        ))
          await act(byId[id]!, code, { type: 'vote', ja: true });
      } else if (t.phase === 'president') {
        const v = (await read(byId[t.president]!, code)).view;
        await act(byId[t.president]!, code, {
          type: 'discard',
          policy: v.hand.includes('liberal') ? 'liberal' : v.hand[0],
        });
      } else if (t.phase === 'chancellor') {
        const v = (await read(byId[t.nominee]!, code)).view;
        await act(byId[t.nominee]!, code, {
          type: 'enact',
          policy: v.hand.includes('fascist') ? 'fascist' : v.hand[0],
        });
      } else if (t.phase === 'veto')
        await act(byId[t.president]!, code, { type: 'vetoReply', accept: false });
    }
    if (s.tableView.phase === 'power') {
      await settle(pres());
      await at(pres(), 'power-president');
      await tv.waitForTimeout(2500);
      await tv.screenshot({ path: `${OUT}/tv-power-${scheme}.png` });
    }

    // Game over.
    await playOut(code, byId);
    const lead = pages[0]!;
    await expect(lead.getByText('Secret Hitler is over')).toBeVisible({ timeout: 20_000 });
    await at(lead, 'over');
    await lead.getByText('Who was who').scrollIntoViewIfNeeded();
    await lead.waitForTimeout(400);
    await lead.screenshot({ path: `${OUT}/recap-375-${scheme}.png` });
  });
}
