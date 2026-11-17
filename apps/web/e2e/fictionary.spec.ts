import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { copyFileSync, mkdirSync } from 'node:fs';
import { join as pathJoin } from 'node:path';

// Fictionary: the game's own lobby (the book's title page) with its compilers, specimen entry and
// edition, then Start; on a laptop the play screen opens into a two-page spread that fills the
// screen. SHOTS=1 also screenshots the lobby and each phase at phone, tablet and laptop sizes.

interface Snapshot {
  status: string;
  me: string | null;
  session: { id: string } | null;
  view?: {
    phase: 'choose' | 'write' | 'pick' | 'reveal';
    play: { chooser: string | null; offer: string[]; entries: { id: string }[] };
    mine: string[];
  };
}

const SHOTS_DIR = 'test-results/fictionary-shots';

async function open(browser: Browser, width: number, height: number, scheme: 'light' | 'dark') {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme });
  return context.newPage();
}

async function hostFictionary(page: Page, name = 'Wren'): Promise<string> {
  await page.goto('/');
  const inLobby = /\/r\/[A-Z]{4}$/;
  await expect(async () => {
    if (!inLobby.test(page.url())) {
      await page.getByLabel('Your name').fill(name);
      await page.getByRole('button', { name: 'Create a lobby' }).click();
    }
    await expect(page).toHaveURL(inLobby, { timeout: 10_000 });
  }).toPass({ timeout: 90_000 });
  await page
    .getByRole('button', { name: /Fictionary/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'The Dictionary of Fibs' })).toBeVisible();
  return page.url().split('/').pop()!;
}

const tokenOf = (page: Page) => page.evaluate(() => localStorage.getItem('jackdaw:token')!);

async function read(req: APIRequestContext, code: string, token: string): Promise<Snapshot> {
  const res = await req.get(`/api/lobby/${code}`, { headers: { 'x-player-token': token } });
  return res.json();
}

async function post(req: APIRequestContext, code: string, token: string, data: unknown) {
  const res = await req.post(`/api/lobby/${code}`, { headers: { 'x-player-token': token }, data });
  expect(res.ok(), await res.text()).toBe(true);
  return (await res.json()) as Snapshot;
}

async function act(req: APIRequestContext, code: string, token: string, action: unknown) {
  const s = await read(req, code, token);
  return post(req, code, token, { type: 'action', sessionId: s.session!.id, seq: 0, action });
}

/** Seat the host plus three birds by API; returns everyone's tokens, host first. */
async function table(host: Page, code: string, tag: string): Promise<string[]> {
  const tokens = [await tokenOf(host)];
  for (const [i, name] of ['Rook', 'Magpie', 'Robin'].entries()) {
    const token = `e2e-fic-${tag}-${i}-0123456789`;
    await post(host.request, code, token, { type: 'join', name });
    tokens.push(token);
  }
  return tokens;
}

/** Whoever chooses picks the first tab on offer. */
async function choose(req: APIRequestContext, code: string, tokens: string[]) {
  for (const t of tokens) {
    const s = await read(req, code, t);
    if (s.view?.phase === 'choose' && s.view.play.chooser === s.me)
      await act(req, code, t, { type: 'choose', tab: s.view.play.offer[0] });
  }
}

test('the lobby is the title page, and the host opens the book', async ({ browser }) => {
  const host = await open(browser, 390, 844, 'light');
  const code = await hostFictionary(host);
  await table(host, code, 'flow');
  await expect(host.getByRole('button', { name: /^Rook/ })).toBeVisible();
  await expect(host.getByText('Specimen entry')).toBeVisible();
  // The host's edition: a choice sticks and its line follows.
  await host.getByRole('radio', { name: 'Words' }).click();
  await expect(host.getByRole('radio', { name: 'Words' })).toHaveAttribute('aria-checked', 'true');
  await expect(host.getByText(/real words nobody knows/)).toBeVisible();
  await host.getByRole('button', { name: 'Open the book' }).click();
  await expect(host.locator('.fic-page')).toBeVisible();
});

test('on a laptop the play screen fills the screen as an open book', async ({ browser }) => {
  const host = await open(browser, 1440, 900, 'light');
  const code = await hostFictionary(host);
  const tokens = await table(host, code, 'wide');
  await host.getByRole('button', { name: 'Open the book' }).click();
  await choose(host.request, code, tokens);
  const page = host.locator('.fic-page');
  await expect(page.locator('.fic-side--r .fic-input')).toBeVisible();
  const box = (await page.boundingBox())!;
  expect(box.width).toBeGreaterThan(1000);
  expect(box.height).toBeGreaterThan(600);
  await expect(host.locator('.fic-margin')).toBeVisible();
});

const WIDTHS = [
  [375, 812],
  [768, 1024],
  [1280, 800],
  [1440, 900],
  [1920, 1080],
] as const;

for (const scheme of ['light', 'dark'] as const) {
  test(`screenshots (${scheme})`, async ({ browser }, info) => {
    test.skip(!process.env.SHOTS, 'Set SHOTS=1 for screenshots');
    test.setTimeout(300_000);
    mkdirSync(SHOTS_DIR, { recursive: true });
    const shot = async (page: Page, name: string) => {
      const path = info.outputPath(`${name}.png`);
      await page.screenshot({ path });
      copyFileSync(path, pathJoin(SHOTS_DIR, `${name}.png`));
    };
    const sizes = async (page: Page, name: string) => {
      for (const [w, h] of WIDTHS) {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForTimeout(700);
        await shot(page, `${name}-${w}-${scheme}`);
      }
    };

    const host = await open(browser, 375, 812, scheme);
    const code = await hostFictionary(host);
    const tokens = await table(host, code, scheme);
    await sizes(host, 'lobby');
    const guest = await open(browser, 1440, 900, scheme);
    await guest.addInitScript((t) => localStorage.setItem('jackdaw:token', t), tokens[1]!);
    await guest.goto(`/r/${code}`);
    await expect(guest.getByText(/Waiting for Wren/)).toBeVisible();
    await guest.waitForTimeout(3500);
    await shot(guest, `lobby-guest-1440-${scheme}`);

    await post(host.request, code, tokens[0]!, {
      type: 'setOptions',
      options: { deck: 'Mixed', length: 'Short', timer: 'Off', tabs: 'Chooser picks' },
    });
    await post(host.request, code, tokens[0]!, { type: 'start', look: scheme });
    await expect(host.locator('.fic-page')).toBeVisible();
    // Make the host the chooser's audience or chooser, whichever it is.
    await sizes(host, 'choose');
    await choose(host.request, code, tokens);
    await expect(host.locator('.fic-input')).toBeVisible();
    await host.locator('.fic-input').fill('a tiny brass trumpet');
    await sizes(host, 'write');
    await host.getByRole('button', { name: 'Write it in' }).click();
    const lies = ['seven', 'a lighthouse', 'purple'];
    for (const [i, t] of tokens.slice(1).entries())
      await act(host.request, code, t, { type: 'write', text: lies[i] });
    await expect(host.locator('.fic-answers')).toBeVisible();
    await sizes(host, 'pick');
    // Everyone picks someone else's lie, so the reveal has lies to stamp.
    for (const t of tokens) {
      const s = await read(host.request, code, t);
      const other = s.view!.play.entries.find((e) => !s.view!.mine.includes(e.id))!;
      await act(host.request, code, t, { type: 'pick', id: other.id });
    }
    await expect(host.locator('.fic-slip')).toBeVisible();
    await host.setViewportSize({ width: 1440, height: 900 });
    await host.waitForTimeout(1800);
    await shot(host, `reveal-1440-${scheme}`);
    await host.waitForTimeout(9000);
    await shot(host, `reveal-late-1440-${scheme}`);
  });
}
