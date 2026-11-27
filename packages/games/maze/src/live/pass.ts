import type { MazeRef } from '../sim/generate';
import type { PowerKind } from '../sim/powers';

/**
 * What a live (Contact) round needs to start, taken from the lobby's game state when a pass is
 * issued (docs/maze/LIVE.md, "How it fits together"). Everything here is public.
 */
export interface LiveSetup {
  round: number;
  seed: number;
  layouts: MazeRef[];
  powers: PowerKind[];
  mixed: boolean;
  /** Server ms when play starts (after the countdown) and when the bell rings. */
  startAt: number;
  endAt: number;
  /** Seated players in seat order (seat i starts at the maze's start i). */
  seats: { id: string; name: string; bot?: boolean }[];
}

/** A signed ticket to one live round: whose phone (or the TV) and the round's setup. */
export interface LivePass {
  code: string;
  session: string;
  /** A lobby player id, or 'tv'. */
  who: string;
  /** Server ms after which it's refused. */
  exp: number;
  setup: LiveSetup;
}

const enc = new TextEncoder();

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function toB64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** HMAC-SHA256 of `body`, base64url. */
export async function signBody(body: string, secret: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await key(secret), enc.encode(body));
  return toB64url(new Uint8Array(sig));
}

/** Whether `sig` is `body`'s HMAC under `secret` (compared in constant time by Web Crypto). */
export async function verifyBody(body: string, sig: string, secret: string): Promise<boolean> {
  const raw = fromB64url(sig);
  if (!raw) return false;
  return crypto.subtle.verify('HMAC', await key(secret), raw, enc.encode(body));
}

/** `<base64url JSON>.<base64url HMAC>`. */
export async function signPass(pass: LivePass, secret: string): Promise<string> {
  const body = toB64url(enc.encode(JSON.stringify(pass)));
  return `${body}.${await signBody(body, secret)}`;
}

/** The pass, if it's signed with `secret` and not expired at `now`; null otherwise. */
export async function verifyPass(
  token: string,
  secret: string,
  now: number,
): Promise<LivePass | null> {
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return null;
  if (!(await verifyBody(body, sig, secret))) return null;
  const raw = fromB64url(body);
  if (!raw) return null;
  try {
    const pass = JSON.parse(new TextDecoder().decode(raw)) as LivePass;
    return typeof pass.exp === 'number' && now <= pass.exp ? pass : null;
  } catch {
    return null;
  }
}
