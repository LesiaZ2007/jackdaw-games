import type { Metadata } from 'next';
import Link from 'next/link';
import { BirdMark, Lid } from '@jackdaw/ui';

export const metadata: Metadata = { title: 'Page not found' };

/** Any address that isn't a page. Says what happened and what to do, in the home screen's look. */
export default function NotFound() {
  return (
    <main className="state-page">
      <Lid className="state-page__lid">
        <BirdMark width={96} height={96} />
        <h1 className="jd-h1">Page not found</h1>
        <p>That page isn&rsquo;t here. Check the address, or head home.</p>
        <div className="state-page__actions">
          <Link href="/" className="jd-plaque jd-plaque--go">
            Back home
          </Link>
          <Link href="/demo" className="jd-plaque jd-plaque--small">
            Try solo demo
          </Link>
          <a href="https://lastivka.dev/guide/jackdaw/" className="jd-link" rel="noopener">
            Back to Lastivka ↗
          </a>
        </div>
      </Lid>
    </main>
  );
}
