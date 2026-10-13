import { describe, expect, it } from 'vitest';
import { badgeText, unreadCount } from './unread';

const msg = (id: string, playerId: string, at: number) => ({ id, playerId, text: id, at });

describe('unreadCount', () => {
  const chat = [msg('a', 'p1', 10), msg('b', 'p2', 20), msg('c', 'me', 30), msg('d', 'p1', 40)];

  it('counts messages from others after the last one seen', () => {
    expect(unreadCount(chat, 'me', 10)).toBe(2);
  });
  it("doesn't count your own messages", () => {
    expect(unreadCount(chat, 'me', 0)).toBe(3);
  });
  it('is zero once everything has been seen', () => {
    expect(unreadCount(chat, 'me', 40)).toBe(0);
  });
  it("doesn't count system lines", () => {
    const line = { id: 's', system: true as const, text: '{p1} joined.', at: 50 };
    expect(unreadCount([...chat, line], 'me', 40)).toBe(0);
  });
});

describe('badgeText', () => {
  it('caps at 9+', () => {
    expect(badgeText(3)).toBe('3');
    expect(badgeText(9)).toBe('9');
    expect(badgeText(12)).toBe('9+');
  });
});
