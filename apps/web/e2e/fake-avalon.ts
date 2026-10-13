import { createServer, type Server } from 'node:http';

/**
 * A stand-in for the live Avalon app's side of the link (docs/avalon/LINK.md), so the hand-off
 * can be tested without the real app: the two link endpoints, plus `/j/` and `/tv/` pages that
 * show what they were given.
 */

/** Where the fake listens; playwright.config.ts points Jackdaw's AVALON_URL at it. */
export const FAKE_AVALON_PORT = Number(
  process.env.E2E_AVALON_PORT ?? Number(process.env.E2E_PORT ?? 3041) + 20,
);
export const FAKE_LINK_SECRET = 'e2e-link-secret';

export interface CreatedRoom {
  code: string;
  body: {
    jackdawCode: string;
    returnUrl: string;
    hostId: string;
    players: { id: string; name: string; avatar: { icon: string | null; tint: number } }[];
    settings: {
      mode: string;
      custom: Record<string, boolean>;
      lady: boolean;
      timers: { talk: number; vote: number };
      theme: string;
    };
  };
  seats: Record<string, { playerId: string; token: string }>;
  status: Record<string, unknown>;
}

export interface FakeAvalon {
  url: string;
  rooms: CreatedRoom[];
  /** Every status check Jackdaw made. */
  checks: string[];
  close: () => Promise<void>;
}

const page = (title: string, body: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;

export async function startFakeAvalon(port: number, secret: string): Promise<FakeAvalon> {
  const rooms: CreatedRoom[] = [];
  const checks: string[] = [];
  let next = 0;

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if (url.pathname.startsWith('/api/jackdaw/')) {
      if (req.headers.authorization !== `Bearer ${secret}`)
        return json(401, { error: 'Not allowed.' });
      if (url.pathname === '/api/jackdaw/rooms' && req.method === 'POST') {
        let raw = '';
        req.on('data', (c) => (raw += c));
        req.on('end', () => {
          const body = JSON.parse(raw) as CreatedRoom['body'];
          if (body.players.length < 5)
            return json(400, { error: 'Avalon needs at least 5 players.' });
          const code = ['WXYZ', 'QRST', 'MNOP'][next++ % 3]!;
          const seats = Object.fromEntries(
            body.players.map((p, i) => [
              p.id,
              { playerId: `av${i}`, token: `seat-token-${p.name.toLowerCase()}-${next}` },
            ]),
          );
          rooms.push({ code, body, seats, status: { phase: 'team', over: false } });
          json(200, { code, seats });
        });
        return;
      }
      const m = url.pathname.match(/^\/api\/jackdaw\/rooms\/([A-Z]{4})$/);
      const room = m && [...rooms].reverse().find((r) => r.code === m[1]);
      if (m) checks.push(m[1]!);
      if (!room) return json(404, { error: 'No such room.' });
      return json(200, room.status);
    }

    const entry = url.pathname.match(/^\/j\/([A-Z]{4})$/);
    if (entry) {
      // The real page reads the seat from the fragment, which never reaches a server.
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end(
        page(
          'Avalon seat',
          `<h1>Avalon room ${entry[1]}</h1><p id="seat"></p><script>document.getElementById('seat').textContent=location.hash</script>`,
        ),
      );
    }
    const tv = url.pathname.match(/^\/tv\/([A-Z]{4})$/);
    if (tv) {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end(page('Avalon TV', `<h1>Avalon table ${tv[1]}</h1>`));
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(port, resolve));
  return {
    url: `http://localhost:${port}`,
    rooms,
    checks,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
