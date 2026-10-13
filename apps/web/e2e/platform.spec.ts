import { expect, test, type Browser, type Page } from '@playwright/test';

async function newPhone(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  return context.newPage();
}

test('names are unique, joins show in chat, reactions reach other phones, and the host can end a game', async ({
  browser,
}) => {
  const host = await newPhone(browser);
  await host.goto('/');
  await host.getByLabel('Your name').fill('Lesia');
  await host.getByRole('button', { name: 'Create a lobby' }).click();
  await host.waitForURL(/\/r\/[A-Z]{4}$/);
  const code = host.url().split('/').pop()!;

  // Someone else can't take "lesia", in any case.
  const bran = await newPhone(browser);
  await bran.goto(`/r/${code}`);
  await bran.getByLabel('Your name').fill('lesia');
  await bran.getByRole('button', { name: 'Take a seat' }).click();
  await expect(bran.locator('.join-card__error')).toContainText(
    'Someone at the table is already called Lesia.',
  );
  await bran.getByLabel('Your name').fill('Bran');
  await bran.getByRole('button', { name: 'Take a seat' }).click();
  await expect(bran.getByText('At the table')).toBeVisible();

  // The join is a quiet system line in chat, and it doesn't count as unread.
  await expect(host.getByRole('button', { name: 'Chat', exact: true })).toBeVisible();
  await host.getByRole('button', { name: 'Chat', exact: true }).click();
  const talk = host.getByRole('dialog', { name: 'Table talk' });
  await expect(talk.locator('.chat__system', { hasText: 'Bran joined.' })).toBeVisible();
  await host.getByRole('button', { name: 'Close', exact: true }).click();

  // Renaming to a taken name is refused in your sheet too.
  await bran.getByRole('button', { name: /^Bran \(you\): change/ }).click();
  const mine = bran.getByRole('dialog', { name: 'You at the table' });
  await mine.getByLabel('Your name').fill('LESIA');
  await mine.getByRole('button', { name: 'Save' }).click();
  await expect(mine.getByRole('alert')).toContainText('already called Lesia');
  await bran.keyboard.press('Escape');

  // A reaction from Bran pops over Bran's seat on the host's phone.
  await bran
    .getByRole('group', { name: 'React to the table' })
    .getByRole('button', { name: 'Laughing' })
    .click();
  await expect(host.getByRole('img', { name: 'Bran: Laughing' })).toBeAttached();

  // The host starts a game and ends it early with two taps; nothing is scored.
  await host
    .getByRole('button', { name: /Rock Paper Scissors/ })
    .first()
    .click();
  await host.getByRole('button', { name: 'Start Rock Paper Scissors' }).click();
  await expect(bran.getByText(/Round 1 of/)).toBeVisible();
  await host.getByRole('button', { name: 'Lobby menu' }).click();
  await host.getByRole('button', { name: 'End this game' }).click();
  await host.getByRole('button', { name: 'Tap again to end the game for everyone' }).click();
  // Back in Rock Paper Scissors' lobby, the chalk ring.
  await expect(host.getByRole('group', { name: 'Rounds' })).toBeVisible();
  await expect(bran.getByText('The host ended the game. It won’t be scored.')).toBeVisible();
  await expect(bran.getByRole('group', { name: 'Rounds' })).toBeVisible();
  const stats = await (await host.request.get(`/api/lobby/${code}/stats`)).json();
  expect(stats.history).toHaveLength(0);
});
