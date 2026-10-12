'use client';

import { useEffect, useState } from 'react';

type Echo = { message: string; at: number; storage: string };

/** Phase 0 smoke test: sends a message to a room on the server and shows what came back. */
export function EchoCheck() {
  const [echo, setEcho] = useState<Echo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const message = `Hello from ${navigator.userAgent.includes('Mobile') ? 'a phone' : 'a browser'}`;
    fetch('/api/echo/ECHO', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((body: { echo: Echo }) => setEcho(body.echo))
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <p className="rounded border border-[var(--ink-2)]/30 px-4 py-3 text-sm" data-testid="echo">
      {error
        ? `Room server unreachable: ${error}`
        : echo
          ? `Room server echoed “${echo.message}” (${echo.storage} storage)`
          : 'Contacting room server…'}
    </p>
  );
}
