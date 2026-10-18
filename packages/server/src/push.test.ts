import { describe, expect, it } from 'vitest';
import { b64urlDecode, b64urlEncode, encryptPush, sendPush, vapidAuth } from './push';

// RFC 8291, Appendix A: the example message, keys and salt, and the body they must produce.
const rfc = {
  plaintext: 'V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24',
  asPublic:
    'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic:
    'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  header:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  cipher: '8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ',
};

async function vapidPair() {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return {
    keys: { publicKey: b64urlEncode(pub), privateKey: jwk.d!, subject: 'mailto:test@example.com' },
    verifyKey: pair.publicKey,
  };
}

describe('web push', () => {
  it('encrypts exactly as RFC 8291’s worked example', async () => {
    const body = await encryptPush(
      { endpoint: 'https://push.example.net/x', keys: { p256dh: rfc.uaPublic, auth: rfc.auth } },
      b64urlDecode(rfc.plaintext),
      { serverPublic: rfc.asPublic, serverPrivate: rfc.asPrivate, salt: rfc.salt },
    );
    expect(b64urlEncode(body)).toBe(
      b64urlEncode(new Uint8Array([...b64urlDecode(rfc.header), ...b64urlDecode(rfc.cipher)])),
    );
  });

  it('signs a VAPID token for the push service that the public key verifies', async () => {
    const { keys, verifyKey } = await vapidPair();
    const auth = await vapidAuth(
      'https://fcm.googleapis.com/fcm/send/abc',
      keys,
      1_700_000_000_000,
    );
    const [, token, k] = /^vapid t=([^,]+), k=(.+)$/.exec(auth)!;
    expect(k).toBe(keys.publicKey);
    const [h, c, sig] = token!.split('.');
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(c!)));
    expect(claims).toMatchObject({ aud: 'https://fcm.googleapis.com', sub: keys.subject });
    expect(claims.exp).toBe(1_700_000_000 + 12 * 3600);
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      verifyKey,
      b64urlDecode(sig!),
      new TextEncoder().encode(`${h}.${c}`),
    );
    expect(ok).toBe(true);
  });

  it('posts the encrypted message and reports a subscription that has gone', async () => {
    const { keys } = await vapidPair();
    const sub = {
      endpoint: 'https://push.example.net/x',
      keys: { p256dh: rfc.uaPublic, auth: rfc.auth },
    };
    const msg = { title: 'Your turn', body: 'Poker', url: '/r/ABCD', tag: 'ABCD' };
    const seen: RequestInit[] = [];
    const ok = await sendPush(sub, msg, keys, {
      fetch: async (_u, init) => (seen.push(init!), new Response(null, { status: 201 })),
    });
    expect(ok).toBe('ok');
    const headers = seen[0]!.headers as Record<string, string>;
    expect(headers['content-encoding']).toBe('aes128gcm');
    expect(headers.authorization).toMatch(/^vapid t=/);
    expect(
      await sendPush(sub, msg, keys, { fetch: async () => new Response(null, { status: 410 }) }),
    ).toBe('gone');
  });
});
