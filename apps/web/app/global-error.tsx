'use client';

import { BirdMark, Lid, Plaque } from '@jackdaw/ui';
import '@jackdaw/ui/tokens.css';
import '@jackdaw/ui/kit.css';
import './globals.css';

/**
 * The last resort: the root layout itself failed, so this draws its own <html> and <body>. It
 * uses plain links, since the router may be what broke, and the fonts fall back to the tokens'
 * system stacks.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="jd-table">
        <main className="state-page">
          <Lid className="state-page__lid">
            <BirdMark width={96} height={96} />
            <h1 className="jd-h1">Something went wrong</h1>
            <p>Jackdaw couldn&rsquo;t start. Try again, or reload the page.</p>
            <div className="state-page__actions">
              <Plaque go onClick={reset}>
                Try again
              </Plaque>
              <a href="/" className="jd-plaque">
                Back home
              </a>
            </div>
          </Lid>
        </main>
      </body>
    </html>
  );
}
