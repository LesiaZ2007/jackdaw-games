import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';
import {
  FAKE_AVALON_PORT,
  FAKE_LINK_SECRET,
  startFakeAvalon,
  type FakeAvalon,
} from './fake-avalon';

// Avalon is linked, not ported (docs/avalon/LINK.md): Jackdaw is the lobby and hands the table to
// the Avalon app. These run against a fake Avalon so the hand-off is tested without the real app.

let avalon: FakeAvalon;
test.beforeAll(async () => {
  avalon = await startFakeAvalon(FAKE_AVALON_PORT, FAKE_LINK_SECRET);
});
test.afterAll(async () => {
  await avalon?.close();
});

const NAMES = ['Lesia', 'Bran', 'Cerys', 'Dafydd', 'Elin'];

async function phone(
  browser: Browser,
  width = 390,
  height = 844,
  scheme: 'light' | 'dark' = 'light',
) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme });
  return context.newPage();
}

/** Seated: every lobby labels your own seat "<name> (you): …". */
const mySeat = (page: Page, name: string) =>
  page.getByRole('button', { name: `${name} (you)` }).first();

async function hostAvalon(page: Page, name = 'Lesia'): Promise<string> {
  await page.goto('/');
  // A name typed before the page has loaded can be lost, so try again until the lobby opens.
  await expect(async () => {
    await page.getByLabel('Your name').fill(name);
    await page.getByRole('button', { name: 'Create a lobby' }).click();
    await page.waitForURL(/\/r\/[A-Z]{4}$/, { timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
  await page
    .getByRole('button', { name: /Avalon/ })
    .first()
    .click();
  await expect(page.getByText('Gathering at the Round Table')).toBeVisible();
  return page.url().split('/').pop()!;
}

async function join(page: Page, code: string, name: string) {
  await page.goto(`/r/${code}`);
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Take a seat' }).click();
  await expect(mySeat(page, name)).toBeVisible();
}

test('five phones gather in Avalon’s lobby, land in their own Avalon seats, and come back scored', async ({
  browser,
}) => {
  // Six phones and a five-second result check: longer than the default.
  test.setTimeout(240_000);
  const host = await phone(browser);
  const code = await hostAvalon(host);
  const others: Page[] = [];
  for (const name of NAMES.slice(1)) {
    const p = await phone(browser);
    await join(p, code, name);
    others.push(p);
  }
  const phones = [host, ...others];

  // Avalon's own lobby: the round table with every shield, the code in the middle.
  await expect(host.getByText('5 of 15 seated · ready')).toBeVisible();
  for (const name of NAMES)
    await expect(host.getByRole('button', { name: new RegExp(`^${name}`) }).first()).toBeVisible();

  // Only the host sets Avalon up; everyone sees the deal change.
  const bran = others[0]!;
  await expect(bran.getByRole('combobox', { name: 'Roles' })).toHaveCount(0);
  await host.getByRole('combobox', { name: 'Roles' }).selectOption('full');
  const deal = bran.getByRole('list', { name: 'Roles dealt for 5 players' });
  await expect(deal).toContainText('Percival');
  await expect(deal).toContainText('Morgana');
  await expect(
    bran.getByText('Not enough evil seats for Mordred and Oberon yet.', { exact: false }),
  ).toBeVisible();

  // The TV's lobby is Avalon's round table too, with the way to join beside it.
  const tvLobby = await phone(browser, 1920, 1080);
  await tvLobby.goto(`/tv/${code}`);
  await expect(tvLobby.getByText('Gathering at the Round Table')).toBeVisible();
  await expect(tvLobby.getByText('5 of 15 seated · ready')).toBeVisible();
  await tvLobby.close();

  // Table talk in Avalon's own style: on phones the bar's chat button opens Avalon's drawer.
  await bran.getByRole('button', { name: /^Chat/ }).click();
  const talk = bran.getByRole('complementary', { name: 'Table talk' });
  await talk.getByLabel('Message').fill('Who wants to be Merlin?');
  await talk.getByRole('button', { name: 'Send' }).click();
  await expect(talk.getByText('Who wants to be Merlin?')).toBeVisible();
  await expect(host.getByRole('button', { name: 'Chat, 1 unread' })).toBeVisible();
  await bran.keyboard.press('Escape');

  // Start: Jackdaw opens the Avalon room, and every phone lands on its own seat.
  await host.getByRole('button', { name: 'Deal the roles: start Avalon' }).click();
  await expect.poll(() => avalon.rooms.length).toBe(1);
  const room = avalon.rooms[0]!;
  expect(room.body.players.map((p) => p.name)).toEqual(NAMES);
  expect(room.body.settings).toMatchObject({ mode: 'full', theme: 'parchment' });
  expect(room.body.returnUrl).toMatch(new RegExp(`/r/${code}$`));

  const seatOf = (name: string) => {
    const player = room.body.players.find((p) => p.name === name)!;
    return room.seats[player.id]!;
  };
  for (const [i, p] of phones.entries()) {
    const name = NAMES[i]!;
    await p.waitForURL(new RegExp(`/j/${room.code}#seat=`));
    const seat = seatOf(name);
    expect(p.url()).toBe(`${avalon.url}/j/${room.code}#seat=${seat.playerId}.${seat.token}`);
    // Nobody else's seat ever reached this phone.
    for (const other of NAMES.filter((n) => n !== name))
      expect(p.url()).not.toContain(seatOf(other).token);
  }

  // Jackdaw itself never shows a seat to anyone but its owner, nor to the TV.
  const tvRead = await (await host.request.get(`/api/lobby/${code}`)).json();
  expect(tvRead.status).toBe('in_game');
  expect(JSON.stringify(tvRead)).not.toContain('seat-token-');
  expect(tvRead.tableView).toEqual({ avalonCode: room.code, avalonUrl: avalon.url });

  // Coming back mid-game offers the way back rather than bouncing straight out again.
  await bran.goto(`/r/${code}`);
  await expect(bran.getByText('Avalon is underway')).toBeVisible();
  await expect(bran.getByRole('link', { name: 'Go to your seat' })).toHaveAttribute(
    'href',
    `${avalon.url}/j/${room.code}#seat=${seatOf('Bran').playerId}.${seatOf('Bran').token}`,
  );

  // A latecomer watches: Avalon's table, with a link to open it.
  const late = await phone(browser);
  await late.goto(`/r/${code}`);
  await late.getByLabel('Your name').fill('Ffion');
  await late.getByRole('button', { name: 'Watch, and play next game' }).click();
  await expect(late.getByRole('link', { name: 'Open Avalon’s table' })).toHaveAttribute(
    'href',
    `${avalon.url}/tv/${room.code}`,
  );
  await expect(late.getByText('Go to your seat')).toHaveCount(0);

  // Avalon reports the game over: good wins, and everyone back in Jackdaw sees it scored.
  const roles = ['merlin', 'servant', 'percival', 'assassin', 'morgana'];
  room.status = {
    phase: 'over',
    over: true,
    endedEarly: false,
    winner: 'good',
    reason: 'Merlin survived the assassination.',
    players: room.body.players.map((p, i) => ({
      id: p.id,
      side: i < 3 ? 'good' : 'evil',
      role: roles[i],
      won: i < 3,
    })),
  };
  for (const p of phones) await p.goto(`/r/${code}`);
  for (const [i, p] of phones.entries()) {
    await expect(p.getByText('Avalon is over')).toBeVisible({ timeout: 20_000 });
    await expect(
      p.getByRole('status').getByText(i < 3 ? 'You share the win' : 'You lost'),
    ).toBeVisible();
  }
  const standings = host.getByRole('region', { name: 'How everyone finished' });
  await expect(standings).toContainText('Good, Merlin');
  await expect(standings).toContainText('Evil, Assassin');
  await expect(standings).not.toContainText('seat-token-');

  const stats = await (await host.request.get(`/api/lobby/${code}/stats`)).json();
  expect(stats.history).toHaveLength(1);
  expect(stats.history[0].summary).toBe('Good wins: Merlin survived the assassination');
  expect(JSON.stringify(stats)).not.toContain('seat-token-');
  const snapshot = await (await host.request.get(`/api/lobby/${code}`)).json();
  const lesia = room.body.players[0]!.id;
  expect(snapshot.scores[lesia]).toEqual({ wins: 1, losses: 0, played: 1 });
  expect(JSON.stringify(snapshot.chat)).not.toContain('seat-token-');
});

test('Avalon waits for five knights before anyone can deal', async ({ browser }) => {
  const host = await phone(browser);
  const code = await hostAvalon(host);
  // Fewer than five: Jackdaw explains before anyone taps, and the button waits.
  await expect(host.getByText('Waiting for 4 more knights')).toBeVisible();
  await expect(host.getByRole('button', { name: 'Deal the roles: start Avalon' })).toBeDisabled();
  const read = await (await host.request.get(`/api/lobby/${code}`)).json();
  expect(read.status).toBe('waiting');
});

// Avalon's lobby in Jackdaw, at phone and laptop width, by day (Parchment) and in the dark
// (Night), for comparing with the real Avalon lobby.
for (const [width, height, scheme] of [
  [375, 812, 'light'],
  [375, 812, 'dark'],
  [1280, 800, 'light'],
  [1280, 800, 'dark'],
] as const) {
  test(`Avalon's lobby at ${width}px (${scheme})`, async ({ browser }, info: TestInfo) => {
    test.setTimeout(150_000);
    const host = await phone(browser, width, height, scheme);
    const code = await hostAvalon(host);
    for (const [i, name] of NAMES.slice(1).entries()) {
      const token = `e2e-${scheme}-${width}-${i}-0123456789`;
      const res = await host.request.post(`/api/lobby/${code}`, {
        headers: { 'x-player-token': token },
        data: { type: 'join', name },
      });
      expect(res.ok()).toBe(true);
    }
    // These four joined through the API, not a phone: read the table fresh.
    await host.reload();
    await expect(host.getByText('5 of 15 seated · ready')).toBeVisible();
    await host.getByRole('combobox', { name: 'Roles' }).selectOption('full');
    await expect(host.getByText('The deal for 5:')).toBeVisible();
    // Let the dealt cards settle.
    await host.waitForTimeout(1200);
    const name = `avalon-lobby-${width}-${scheme === 'light' ? 'parchment' : 'night'}`;
    await host.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
    await host.screenshot({ path: info.outputPath(`${name}-fold.png`) });
  });
}
