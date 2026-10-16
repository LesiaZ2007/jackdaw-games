import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { copyFileSync, mkdirSync } from 'node:fs';
import { join as pathJoin } from 'node:path';

// Codenames: the host splits the table into Red and Blue in the game's own lobby, a spymaster
// gives a clue and an operative guesses on real phones, then the rest of the game is driven
// through the lobby API to a win. Operatives and the TV must never receive an unrevealed colour.
// SHOTS=1 also screenshots every screen at 375, 768, 1280 and 1920 in day and dark.

type Card = 'red' | 'blue' | 'bystander' | 'assassin';
type Team = 'red' | 'blue';
interface View {
  teams: Record<string, Team>;
  spymasters: Record<Team, string>;
  words: string[];
  revealed: (Card | null)[];
  turn: Team;
  phase: 'clue' | 'guess' | 'over';
  key: Card[] | null;
  myTeam: Team | null;
  spymaster: boolean;
}
interface Snapshot {
  status: string;
  me: string | null;
  hostId: string;
  players: { id: string; name: string }[];
  session: { id: string } | null;
  view?: View;
  tableView?: Omit<View, 'key' | 'myTeam' | 'spymaster'>;
  results?: { summary: string } | null;
}

const SHOTS_DIR = 'test-results/codenames-shots';

async function open(
  browser: Browser,
  width = 390,
  height = 844,
  scheme: 'light' | 'dark' = 'light',
  token?: string,
) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme });
  if (token) await context.addInitScript((t) => localStorage.setItem('jackdaw:token', t), token);
  return context.newPage();
}

async function hostCodenames(page: Page, name = 'Wren'): Promise<string> {
  await page.goto('/');
  // A name typed before the page has loaded can be lost, so try again until the lobby opens.
  const inLobby = /\/r\/[A-Z]{4}$/;
  await expect(async () => {
    if (!inLobby.test(page.url())) {
      await page.getByLabel('Your name').fill(name);
      await page.getByRole('button', { name: 'Create a lobby' }).click();
    }
    await expect(page).toHaveURL(inLobby, { timeout: 10_000 });
  }).toPass({ timeout: 90_000 });
  await page
    .getByRole('button', { name: /Codenames/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'Codenames' })).toBeVisible();
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

const tokenOf = (page: Page) => page.evaluate(() => localStorage.getItem('jackdaw:token')!);

async function read(req: APIRequestContext, code: string, token?: string): Promise<Snapshot> {
  const res = await req.get(`/api/lobby/${code}`, {
    headers: token ? { 'x-player-token': token } : {},
  });
  return res.json();
}

async function post(req: APIRequestContext, code: string, token: string, data: unknown) {
  const res = await req.post(`/api/lobby/${code}`, { headers: { 'x-player-token': token }, data });
  expect(res.ok(), await res.text()).toBe(true);
  return (await res.json()) as Snapshot;
}

/** The player's own view must carry no colour for a word that's still hidden (unless spymaster). */
function expectNoHiddenColours(
  view: Omit<View, 'key' | 'myTeam' | 'spymaster'> & Partial<View>,
  key: Card[],
) {
  expect(view.key ?? null).toBeNull();
  view.revealed.forEach((c, i) => {
    if (c !== null) expect(c).toBe(key[i]);
  });
  expect(JSON.stringify(view)).not.toContain('"key":[');
}

/** Play the rest through the API: each spymaster says "unlimited", operatives find their own words. */
async function playToWin(req: APIRequestContext, code: string, tokens: Record<string, string>) {
  for (let guard = 0; guard < 60; guard++) {
    const anyone = await read(req, code, Object.values(tokens)[0]);
    if (anyone.status !== 'in_game') return;
    const sessionId = anyone.session!.id;
    const t = anyone.view!;
    const spy = t.spymasters[t.turn];
    const spyView = (await read(req, code, tokens[spy])).view!;
    const act = (who: string, action: unknown) =>
      post(req, code, tokens[who]!, { type: 'action', sessionId, seq: 0, action });
    if (t.phase === 'clue') {
      await act(spy, { type: 'clue', word: 'secret', count: null });
      continue;
    }
    const op = Object.keys(t.teams).find((id) => t.teams[id] === t.turn && id !== spy)!;
    const next = spyView.key!.findIndex((c, i) => c === t.turn && !t.revealed[i]);
    await act(op, { type: 'guess', index: next });
  }
}

test('a 4-player game: teams in the lobby, a real clue and guess, then to a win', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const names = ['Wren', 'Bran', 'Cerys', 'Dafydd'];
  const host = await open(browser);
  const code = await hostCodenames(host);
  const phones: Page[] = [host];
  for (const name of names.slice(1)) {
    const p = await open(browser);
    await join(p, code, name);
    phones.push(p);
  }
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  for (const [i, p] of phones.entries()) {
    const token = await tokenOf(p);
    const snap = await read(p.request, code, token);
    tokens[snap.me!] = token;
    ids[names[i]!] = snap.me!;
  }

  // Everyone starts in the tray. The host taps each player, then where they play.
  await expect(host.getByRole('region', { name: 'Not on a team yet' })).toBeVisible();
  const place = async (who: string, where: string) => {
    await host
      .getByRole('button', { name: new RegExp(`^${who}( \\(you\\))?: choose where they play`) })
      .click();
    await host.getByRole('button', { name: where, exact: true }).click();
  };
  await place('Wren', 'Red spymaster');
  await place('Bran', 'Red operative');
  await place('Cerys', 'Blue spymaster');
  await place('Dafydd', 'Blue operative');
  await expect(host.getByRole('region', { name: 'Not on a team yet' })).toHaveCount(0);
  const red = host.getByRole('region', { name: 'Red team' });
  await expect(red).toContainText('Wren');
  await expect(red).toContainText('Spymaster');
  await expect(host.getByRole('region', { name: 'Blue team' })).toContainText('Dafydd');
  // Other phones see the same split, and can't move anyone.
  const bran = phones[1]!;
  await expect(bran.getByRole('region', { name: 'Blue team' })).toContainText('Cerys');
  await expect(bran.getByRole('button', { name: 'Shuffle teams' })).toHaveCount(0);

  await host.getByRole('button', { name: 'Start Codenames' }).click();
  for (const p of phones) await expect(p.getByRole('list', { name: 'The 25 words' })).toBeVisible();

  const first = (await read(host.request, code, tokens[ids.the owner!]!)).view!;
  expect(first.spymaster).toBe(true);
  expect(first.key).toHaveLength(25);
  const key = first.key!;
  const team = first.turn;
  const spyName = team === 'red' ? 'Wren' : 'Cerys';
  const opName = team === 'red' ? 'Bran' : 'Dafydd';
  const spyPage = phones[names.indexOf(spyName)]!;
  const opPage = phones[names.indexOf(opName)]!;

  // Operatives and the TV get no colours before anything is uncovered.
  const opView = (await read(opPage.request, code, tokens[ids[opName]!]!)).view!;
  expectNoHiddenColours(opView, key);
  const tv = await open(browser, 1280, 800);
  await tv.goto(`/tv/${code}`);
  await expect(tv.getByRole('list', { name: 'The 25 words' })).toBeVisible();
  const tvRead = await read(tv.request, code);
  expect(tvRead.view).toBeUndefined();
  expectNoHiddenColours(tvRead.tableView!, key);

  // The real UI: the spymaster gives a clue, the lone operative's tap is the whole team's say.
  // (SEASIDE isn't in the word list, so it can't be a card on the board.) Once the clue is in,
  // the spymaster's form goes away, so a retry here can't give a second clue.
  await expect(async () => {
    const field = spyPage.getByLabel('Your clue');
    if (await field.isVisible()) {
      await field.fill('seaside');
      await spyPage.getByLabel('Number').selectOption('1');
      await spyPage.getByRole('button', { name: 'Give clue' }).click();
    }
    await expect(opPage.getByRole('status').getByText(/is guessing/)).toBeVisible({
      timeout: 10_000,
    });
  }).toPass({ timeout: 60_000 });
  const target = key.findIndex((c) => c === team);
  const word = first.words[target]!;
  await opPage.getByRole('button', { name: new RegExp(`^${word}(,|$)`) }).click();
  await expect(opPage.getByRole('status').getByText(/is one of ours/)).toBeVisible();
  await expect(tv.getByRole('img', { name: new RegExp(`^${word}, uncovered`) })).toBeVisible();
  // After a guess the TV still knows only what's been uncovered.
  expectNoHiddenColours((await read(tv.request, code)).tableView!, key);

  await playToWin(host.request, code, tokens);
  for (const p of phones)
    await expect(p.getByText(/wins:/).first()).toBeVisible({ timeout: 20_000 });
  const done = await read(host.request, code, tokens[ids.the owner!]!);
  expect(done.status).toBe('results');
  await expect(host.getByRole('region', { name: 'The whole key' })).toBeVisible();
  await expect(host.getByRole('region', { name: 'Clues so far' })).toContainText('SEASIDE');
});

const WIDTHS = [
  [375, 812],
  [768, 1024],
  [1280, 800],
  [1920, 1080],
] as const;

for (const scheme of ['light', 'dark'] as const) {
  test(`screenshots (${scheme})`, async ({ browser }, info) => {
    test.skip(!process.env.SHOTS, 'Set SHOTS=1 for screenshots');
    test.setTimeout(300_000);
    mkdirSync(SHOTS_DIR, { recursive: true });
    const shot = async (page: Page, name: string, full = false) => {
      const path = info.outputPath(`${name}.png`);
      await page.screenshot({ path, fullPage: full });
      copyFileSync(path, pathJoin(SHOTS_DIR, `${name}.png`));
    };

    const host = await open(browser, 375, 812, scheme);
    const code = await hostCodenames(host);
    const tokens: Record<string, string> = {
      [(await read(host.request, code, await tokenOf(host))).me!]: await tokenOf(host),
    };
    for (const [i, name] of ['Bran', 'Cerys', 'Dafydd', 'Elin', 'Ffion'].entries()) {
      const token = `e2e-cn-${scheme}-${i}-0123456789`;
      const snap = await post(host.request, code, token, { type: 'join', name });
      tokens[snap.me!] = token;
    }
    const ids = Object.keys(tokens);
    // Host arranges: three a side, one left in the tray to show it.
    const hostToken = tokens[ids[0]!]!;
    await post(host.request, code, hostToken, {
      type: 'setOptions',
      options: {
        teams: {
          [ids[0]!]: 'red',
          [ids[1]!]: 'red',
          [ids[2]!]: 'blue',
          [ids[3]!]: 'blue',
          [ids[4]!]: 'red',
        },
        spymasters: { red: ids[0], blue: ids[2] },
        balance: true,
        newSpymasters: false,
      },
    });
    await host.reload();
    await expect(host.getByRole('region', { name: 'Not on a team yet' })).toBeVisible();
    for (const [w, h] of WIDTHS) {
      await host.setViewportSize({ width: w, height: h });
      await host.waitForTimeout(500);
      await shot(host, `lobby-${w}-${scheme}`);
    }
    const tvLobby = await open(browser, 1920, 1080, scheme);
    await tvLobby.goto(`/tv/${code}`);
    await expect(tvLobby.getByRole('region', { name: 'Red team' })).toBeVisible();
    await tvLobby.waitForTimeout(800);
    await shot(tvLobby, `tv-lobby-1920-${scheme}`);
    await tvLobby.setViewportSize({ width: 1280, height: 800 });
    await tvLobby.waitForTimeout(500);
    await shot(tvLobby, `tv-lobby-1280-${scheme}`);
    await tvLobby.close();
    await post(host.request, code, hostToken, {
      type: 'setOptions',
      options: {
        teams: {
          [ids[0]!]: 'red',
          [ids[1]!]: 'red',
          [ids[2]!]: 'blue',
          [ids[3]!]: 'blue',
          [ids[4]!]: 'red',
          [ids[5]!]: 'blue',
        },
        spymasters: { red: ids[0], blue: ids[2] },
        balance: true,
        newSpymasters: false,
      },
    });
    await post(host.request, code, hostToken, { type: 'start', look: scheme });

    // A few moves so the board has stamps and the log has clues.
    const snap = await read(host.request, code, hostToken);
    const sessionId = snap.session!.id;
    const key = snap.view!.key!;
    const act = (who: string, action: unknown) =>
      post(host.request, code, tokens[who]!, { type: 'action', sessionId, seq: 0, action });
    let t = snap.view!;
    const spyOf = (team: Team) => t.spymasters[team];
    const opOf = (team: Team) =>
      ids.find((id) => t.teams[id] === team && id !== t.spymasters[team])!;
    await act(spyOf(t.turn), { type: 'clue', word: 'river', count: 2 });
    await act(opOf(t.turn), { type: 'guess', index: key.findIndex((c) => c === t.turn) });
    await act(opOf(t.turn), { type: 'guess', index: key.findIndex((c) => c === 'bystander') });
    t = (await read(host.request, code, hostToken)).view!;
    await act(spyOf(t.turn), { type: 'clue', word: 'castle', count: 3 });
    const second = ids.filter((id) => t.teams[id] === t.turn && id !== t.spymasters[t.turn]);
    await act(second[0]!, { type: 'guess', index: key.findIndex((c) => c === t.turn) });
    const hidden = (await read(host.request, code, hostToken)).view!.revealed.findIndex(
      (c) => c === null,
    );
    await act(second[0]!, { type: 'suggest', index: hidden });

    const spyPage = await open(browser, 375, 812, scheme, tokens[t.spymasters[t.turn]]);
    const opPage = await open(browser, 375, 812, scheme, tokens[second[1] ?? second[0]!]);
    const tv = await open(browser, 1920, 1080, scheme);
    await spyPage.goto(`/r/${code}`);
    await opPage.goto(`/r/${code}`);
    await tv.goto(`/tv/${code}`);
    for (const p of [spyPage, opPage, tv])
      await expect(p.getByRole('list', { name: 'The 25 words' })).toBeVisible();
    for (const [w, h] of WIDTHS) {
      for (const [page, name] of [
        [spyPage, 'spymaster'],
        [opPage, 'operative'],
        [tv, 'tv'],
      ] as const) {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForTimeout(400);
        await shot(page, `${name}-${w}-${scheme}`, name !== 'tv');
      }
    }

    // The other spymaster's turn to type a clue.
    const other = t.turn === 'red' ? 'blue' : 'red';
    await act(second[0]!, { type: 'pass' });
    const clueGiver = await open(browser, 375, 812, scheme, tokens[t.spymasters[other]]);
    await clueGiver.goto(`/r/${code}`);
    await clueGiver.getByLabel('Your clue').fill(snap.view!.words[3]!);
    await clueGiver.waitForTimeout(300);
    await shot(clueGiver, `clue-entry-375-${scheme}`, true);

    await playToWin(host.request, code, tokens);
    await host.reload();
    await expect(host.getByRole('region', { name: 'The whole key' })).toBeVisible();
    for (const [w, h] of WIDTHS) {
      await host.setViewportSize({ width: w, height: h });
      await host.waitForTimeout(1500);
      await shot(host, `results-${w}-${scheme}`, true);
    }
    await tv.reload();
    await tv.waitForTimeout(2500);
    await shot(tv, `tv-results-1920-${scheme}`);
  });
}
