/**
 * Server time on this device, for countdowns. Every poll reports the server's clock; the reading
 * from the quickest round trip so far is the most trustworthy, so the offset follows that one
 * (and is re-learned now and then, in case this device's clock is changed).
 */
let offset = 0;
let bestRtt = Infinity;
let learnedAt = 0;

export function observeServerTime(serverNow: number, sentAt: number, receivedAt: number) {
  const rtt = receivedAt - sentAt;
  if (rtt < 0) return;
  // Forget an old best reading after a while, so a changed device clock is picked up.
  if (receivedAt - learnedAt > 5 * 60_000) bestRtt = Infinity;
  if (rtt > bestRtt) return;
  bestRtt = rtt;
  learnedAt = receivedAt;
  offset = serverNow + rtt / 2 - receivedAt;
}

/** Now, in server time (ms). */
export function serverClock(): number {
  return Date.now() + offset;
}
