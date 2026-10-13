'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BirdMark, CodeInput, Lid, Plaque } from '@jackdaw/ui';

/** A TV (or any big screen) types a lobby code here to show that lobby's table. */
export default function TvEntry() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  function show() {
    if (code.length !== 4) return setError('Lobby codes are 4 letters.');
    router.push(`/tv/${code}`);
  }

  return (
    <main className="tv-entry">
      <Lid className="tv-entry__lid">
        <BirdMark width={120} height={120} />
        <h1 className="jd-display tv-entry__title">Show a lobby on this screen</h1>
        <p className="tv-entry__note">
          Type the four letters from any phone in the lobby. This screen shows the table for
          everyone; it takes no seat and never sees anyone&apos;s secrets.
        </p>
        <CodeInput value={code} onChange={setCode} onEnter={show} size="min(84px, 18vw)" />
        {error && (
          <p role="alert" className="tv-entry__error">
            {error}
          </p>
        )}
        <Plaque go onClick={show} className="tv-entry__go">
          Show lobby
        </Plaque>
      </Lid>
      <Link href="/" className="tv-entry__home">
        Back to Jackdaw
      </Link>
    </main>
  );
}
