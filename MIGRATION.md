# Hosting and migration

Everything runs on Vercel today. This file lists every setting and service the platform needs,
and the steps to move to Cloudflare later without rewriting game or lobby code.

## Environment variables

| Variable                                                | Where             | Required           | What it's for                                                                                                                                              |
| ------------------------------------------------------- | ----------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KV_REST_API_URL` and `KV_REST_API_TOKEN`               | server            | Yes, in production | Upstash Redis REST endpoint and token. These are the names Vercel's Upstash integration creates.                                                           |
| `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` | server            | Alternative        | Upstash's own names. Used only if the `KV_REST_API_*` pair isn't set.                                                                                      |
| `NEXT_PUBLIC_SITE_URL`                                  | client and server | Optional           | The public site address for share links, QR codes and TV links, e.g. `https://jackdaw-games.vercel.app`. Without it the app uses the request's own origin. |
| `VERCEL`                                                | set by Vercel     | Automatic          | When it's `1` and no Redis is configured, the server refuses to start rather than silently using memory.                                                   |

There are no hard-coded domains. Locally, with no Redis variables set, lobbies live in memory, which works
for a single `pnpm dev` process only.

## External services

- **Vercel**: hosts `apps/web`, both the pages and the `/api/lobby` route handlers that run the rooms.
- **Upstash Redis** (free tier): one JSON document per lobby (`jackdaw:lobby:<CODE>`, 24h TTL
  refreshed on every write), a presence hash (`jackdaw:seen:<CODE>`) and short lock keys
  (`jackdaw:lock:<CODE>`). It's reached over HTTPS with `fetch`, so it also works from Cloudflare Workers.
- **GitHub Actions**: CI only.

### Setting up Vercel and Upstash (one time)

1. In Vercel, use **Add New → Project → Import** `LesiaZ2007/jackdaw-games`.
   - Set the Root Directory to `apps/web`. The framework is detected as Next.js.
   - The install command is detected from `pnpm-lock.yaml`. Leave the defaults.
2. Open the project's **Storage** tab and choose **Create Database → Upstash (Redis)** on the free plan.
   Connect it to the project for all environments. This creates `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
3. Optional: set `NEXT_PUBLIC_SITE_URL` to the production URL.
4. Redeploy. Open the home page. The Phase 0 check should say "Room server echoed … (upstash storage)".

## Request budget

Polling costs per lobby are roughly:

- one Redis read per second per server instance, because polls share a 900ms read cache;
- one presence write per player every 25s;
- three to four commands per action: lock, get, set and unlock.

A friend group stays far inside Upstash's free tier.

## Moving to Cloudflare later

The room logic is already host-neutral:

- `packages/server` uses only `fetch`, `crypto.subtle` and `Request`/`Response`.
- Storage sits behind `RoomStorage`, and the browser talks through `RoomTransport` (`apps/web/lib/transport.ts`).

1. **Rooms.** Add `apps/worker`, a Cloudflare Worker with one Durable Object per lobby code.
   - Implement `RoomStorage` on Durable Object storage. Locks become unnecessary, because a Durable Object is single-threaded, so a no-op lock adapter is enough.
   - Mount `createHttpHandlers(createRoomRuntime(...))` from `packages/server` for the same `/api/lobby` routes.
2. **Realtime.** Add a WebSocket endpoint to the Durable Object that pushes each connection its own `snapshotFor(...)` after every change.
   - Add a `WebSocketTransport` implementing `RoomTransport` (same `subscribe`/`send`). Pages don't change.
   - This also unblocks Wavelength's live dial.
3. **Website.** Build `apps/web` with the OpenNext Cloudflare adapter (`@opennextjs/cloudflare`) and deploy it next to the Worker.
4. Buy the domain through Cloudflare Registrar and connect a subdomain. Set `NEXT_PUBLIC_SITE_URL`.
5. Run a full game night on the new address before switching anything off. Keep a tiny Vercel project that
   redirects the old `*.vercel.app` addresses (including play-avalon.vercel.app) to the new domain.

Lobbies in flight are not migrated. They expire after 24h idle anyway, so switch during a quiet time.
