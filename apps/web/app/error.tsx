'use client';

import Link from 'next/link';
import { BirdMark, Lid, Plaque } from '@jackdaw/ui';

/** A page that threw while drawing. The rest of the app (and the lobby behind it) is untouched. */
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="state-page">
      <Lid className="state-page__lid">
        <BirdMark width={96} height={96} />
        <h1 className="jd-h1">Something went wrong</h1>
        <p>That didn&rsquo;t load. Try again, or head home and pick up from there.</p>
        <div className="state-page__actions">
          <Plaque go onClick={reset}>
            Try again
          </Plaque>
          <Link href="/" className="jd-plaque">
            Back home
          </Link>
        </div>
      </Lid>
    </main>
  );
}
