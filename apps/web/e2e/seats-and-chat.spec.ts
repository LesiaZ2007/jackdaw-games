import { expect, test, type Browser, type Page } from '@playwright/test';

async function newPhone(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  return context.newPage();
}

async function join(page: Page, code: string, name: string) {
  await page.goto(`/r/${code}`);
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Take a seat' }).click();
  await expect(page.getByText('At the table')).toBeVisible();
}

test('seats open your look or the host’s player sheet, and missed chat shows on the chat button', async ({
  browser,
}) => {
  const host = await newPhone(browser);
  await host.goto('/');
  await host.getByLabel('Your name').fill('Wren');
  await host.getByRole('button', { name: 'Create a lobby' }).click();
  await host.waitForURL(/\/r\/[A-Z]{4}$/);
  const code = host.url().split('/').pop()!;

  const bran = await newPhone(browser);
  const cerys = await newPhone(browser);
  await join(bran, code, 'Bran');
  await join(cerys, code, 'Cerys');
  await expect(host.getByText('3 of 15 seats')).toBeVisible();

  // Tapping your own seat opens your name, crest and colour.
  await host.getByRole('button', { name: /^the owner \(you\): change/ }).click();
  await expect(host.getByRole('dialog', { name: 'You at the table' })).toBeVisible();
  await host.keyboard.press('Escape');

  // Only the host can tap someone else's seat.
  await expect(bran.getByRole('button', { name: /^the owner: remove/ })).toHaveCount(0);
  await expect(bran.getByRole('button', { name: /^Bran \(you\): change/ })).toBeVisible();

  // Bran says something; the host's chat button counts it until the chat is opened.
  await bran.getByRole('button', { name: 'Chat', exact: true }).click();
  const talk = bran.getByRole('dialog', { name: 'Table talk' });
  await talk.getByRole('textbox', { name: 'Message' }).fill('Evening all');
  await talk.getByRole('button', { name: 'Send' }).click();
  await expect(talk).toContainText('Evening all');
  await bran.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(host.getByRole('button', { name: 'Chat, 1 unread' })).toBeVisible();
  await expect(host.locator('.lobby-bar__badge')).toHaveText('1');
  // Your own message never counts.
  await expect(bran.getByRole('button', { name: 'Chat', exact: true })).toBeVisible();

  await host.getByRole('button', { name: 'Chat, 1 unread' }).click();
  await expect(host.getByRole('dialog', { name: 'Table talk' })).toContainText('Evening all');
  await host.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(host.getByRole('button', { name: 'Chat', exact: true })).toBeVisible();
  // A refresh doesn't bring it back as unread.
  await host.reload();
  await expect(host.getByText('At the table')).toBeVisible();
  await expect(host.getByRole('button', { name: 'Chat', exact: true })).toBeVisible();

  // The host taps Cerys's seat and removes her.
  await host.getByRole('button', { name: /^Cerys: remove/ }).click();
  const sheet = host.getByRole('dialog', { name: 'Cerys' });
  await sheet.getByRole('button', { name: 'Remove Cerys from the lobby' }).click();
  await expect(sheet).toBeHidden();
  await expect(host.getByText('2 of 15 seats')).toBeVisible();
  await expect(cerys.getByRole('button', { name: 'Take a seat' })).toBeVisible();
});
