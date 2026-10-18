import { vapidKeys } from '@/lib/runtime';

export const dynamic = 'force-dynamic';

/** The key browsers subscribe to notifications with, or 404 when they aren't set up here. */
export function GET() {
  const keys = vapidKeys();
  return keys
    ? Response.json({ publicKey: keys.publicKey })
    : Response.json(
        { error: { code: 'NOT_SET_UP', message: 'No notifications here.' } },
        { status: 404 },
      );
}
