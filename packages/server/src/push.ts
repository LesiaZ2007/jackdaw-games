/**
 * Web Push with web-standard crypto only (so it runs on Vercel or a Worker): the message is
 * encrypted for the browser's subscription (RFC 8291, aes128gcm from RFC 8188) and the request is
 * signed with the server's VAPID key (RFC 8292). No push service account is needed; the keys are
 * a P-256 pair in the VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY environment variables.
 */

/** A browser's push subscription, as `PushSubscription.toJSON()` gives it. */
export interface PushSubscriptionData {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface VapidKeys {
  /** Uncompressed P-256 public key (65 bytes), base64url. Browsers subscribe with it. */
  publicKey: string;
  /** The private scalar (32 bytes), base64url. */
  privateKey: string;
  /** Who runs this server, for push services to get in touch: "mailto:…" or an https URL. */
  subject: string;
}

const enc = new TextEncoder();

export function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}

async function hmac(key: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

/** A P-256 key as JWK, from the uncompressed public point and (optionally) the private scalar. */
function p256Jwk(publicKey: Uint8Array, d?: string): JsonWebKey {
  return {
    kty: 'EC',
    crv: 'P-256',
    x: b64urlEncode(publicKey.slice(1, 33)),
    y: b64urlEncode(publicKey.slice(33, 65)),
    ...(d ? { d } : {}),
    ext: true,
  };
}

/** For tests: a fixed server key pair and salt instead of fresh random ones. */
export interface EncryptFixture {
  serverPublic: string;
  serverPrivate: string;
  salt: string;
}

/** The encrypted body for one subscription (RFC 8291 §3.4: one aes128gcm record). */
export async function encryptPush(
  sub: PushSubscriptionData,
  plaintext: Uint8Array,
  fixture?: EncryptFixture,
): Promise<Uint8Array<ArrayBuffer>> {
  const uaPublic = b64urlDecode(sub.keys.p256dh);
  const auth = b64urlDecode(sub.keys.auth);
  let asPrivate: CryptoKey;
  let asPublic: Uint8Array<ArrayBuffer>;
  if (fixture) {
    asPublic = b64urlDecode(fixture.serverPublic);
    asPrivate = await crypto.subtle.importKey(
      'jwk',
      p256Jwk(asPublic, fixture.serverPrivate),
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits'],
    );
  } else {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair;
    asPrivate = pair.privateKey;
    asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  }
  const uaKey = await crypto.subtle.importKey(
    'raw',
    uaPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const ecdh = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asPrivate, 256),
  );
  const salt = fixture ? b64urlDecode(fixture.salt) : crypto.getRandomValues(new Uint8Array(16));

  const prkKey = await hmac(auth, ecdh);
  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1]));
  const ikm = await hmac(prkKey, keyInfo);
  const prk = await hmac(salt, ikm);
  const cek = (
    await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))
  ).slice(0, 16);
  const nonce = (
    await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))
  ).slice(0, 12);

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const padded = concat(plaintext, new Uint8Array([2]));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, padded),
  );
  const rs = new Uint8Array([0, 0, 0x10, 0]); // record size 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

/** The VAPID Authorization header for a push service's origin (RFC 8292). */
export async function vapidAuth(endpoint: string, vapid: VapidKeys, nowMs: number) {
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64urlEncode(
    enc.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(nowMs / 1000) + 12 * 60 * 60,
        sub: vapid.subject,
      }),
    ),
  );
  const key = await crypto.subtle.importKey(
    'jwk',
    p256Jwk(b64urlDecode(vapid.publicKey), vapid.privateKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      enc.encode(`${header}.${claims}`),
    ),
  );
  return `vapid t=${header}.${claims}.${b64urlEncode(signature)}, k=${vapid.publicKey}`;
}

/** What a notification says; the service worker shows it. */
export interface PushMessage {
  title: string;
  body: string;
  /** Where tapping it goes, e.g. "/r/ABCD". */
  url: string;
  /** Notifications with the same tag replace each other (one per lobby). */
  tag: string;
}

/**
 * Sends one push. Resolves to 'gone' when the subscription has expired or been revoked (forget
 * it), 'ok' when the push service took it, and 'failed' otherwise.
 */
export async function sendPush(
  sub: PushSubscriptionData,
  message: PushMessage,
  vapid: VapidKeys,
  opts: { fetch?: typeof fetch; now?: number; ttlSeconds?: number } = {},
): Promise<'ok' | 'gone' | 'failed'> {
  const doFetch = opts.fetch ?? fetch;
  try {
    const body = await encryptPush(sub, enc.encode(JSON.stringify(message)));
    const res = await doFetch(sub.endpoint, {
      method: 'POST',
      headers: {
        authorization: await vapidAuth(sub.endpoint, vapid, opts.now ?? Date.now()),
        'content-encoding': 'aes128gcm',
        'content-type': 'application/octet-stream',
        ttl: String(opts.ttlSeconds ?? 120),
        urgency: 'high',
        topic: message.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || 'jackdaw',
      },
      body,
    });
    if (res.status === 404 || res.status === 410) return 'gone';
    return res.ok ? 'ok' : 'failed';
  } catch (e) {
    console.error('[jackdaw] push failed', e);
    return 'failed';
  }
}

/** Whether a value looks like a browser push subscription worth storing. */
export function isPushSubscription(v: unknown): v is PushSubscriptionData {
  const s = v as PushSubscriptionData;
  return (
    typeof s === 'object' &&
    s !== null &&
    typeof s.endpoint === 'string' &&
    s.endpoint.startsWith('https://') &&
    s.endpoint.length < 1000 &&
    typeof s.keys?.p256dh === 'string' &&
    s.keys.p256dh.length < 200 &&
    typeof s.keys.auth === 'string' &&
    s.keys.auth.length < 100
  );
}
