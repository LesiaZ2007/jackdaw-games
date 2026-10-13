import type { ChatMessage } from '@jackdaw/engine';

/**
 * Messages from other people that arrived after `seenAt` (a message timestamp). System lines
 * ("Bran joined.") don't count.
 */
export function unreadCount(chat: ChatMessage[], me: string | null, seenAt: number): number {
  let n = 0;
  for (const m of chat) if (m.at > seenAt && !m.system && m.playerId !== me) n++;
  return n;
}

/** How the chat button shows a count: up to 9, then "9+". */
export function badgeText(n: number): string {
  return n > 9 ? '9+' : String(n);
}

const key = (code: string) => `jackdaw:chat-seen:${code}`;

/** When this tab last saw the chat, so a refresh doesn't bring old messages back as unread. */
export function readSeen(code: string): number | null {
  try {
    const v = globalThis.sessionStorage?.getItem(key(code));
    return v == null ? null : Number(v) || 0;
  } catch {
    return null;
  }
}

export function writeSeen(code: string, at: number): void {
  try {
    globalThis.sessionStorage?.setItem(key(code), String(at));
  } catch {
    // Storage blocked: the count just starts over on refresh.
  }
}
