'use client';

import Link from 'next/link';
import { BirdMark, Lid } from '@jackdaw/ui';
import { catalog } from '@/lib/catalog';

/** About Jackdaw, with the credits its licences ask for. */
export function About() {
  return (
    <main className="cat-about">
      <Lid className="cat-about__lid">
        <BirdMark width={96} height={96} />
        <h1 className="jd-display">About Jackdaw</h1>
        <p>
          Jackdaw is a private compendium of games for friends in one room. Everyone plays on their
          own phone, and a TV can show the table. No accounts: open a lobby, share the four letters,
          play.
        </p>
      </Lid>

      <section className="cat-about__section" aria-labelledby="credits">
        <h2 id="credits" className="jd-display">
          Credits
        </h2>
        <ul className="cat-credits">
          <li>
            <b>Bird mark:</b> “Black bird” by{' '}
            <a href="https://openmoji.org" rel="noreferrer">
              OpenMoji
            </a>
            , the open-source emoji project, used under{' '}
            <a href="https://creativecommons.org/licenses/by-sa/4.0/" rel="noreferrer">
              CC BY-SA 4.0
            </a>
            .
          </li>
          <li>
            <b>Type:</b> Grenze Gotisch, Grenze, Big Shoulders and Alegreya Sans, from{' '}
            <a href="https://fonts.google.com" rel="noreferrer">
              Google Fonts
            </a>{' '}
            under the SIL Open Font License.
          </li>
          <li>
            <b>Player crests:</b> drawn for Avalon and carried over, so your crest matches in both.
          </li>
        </ul>
      </section>

      <section className="cat-about__section" aria-labelledby="games">
        <h2 id="games" className="jd-display">
          The games
        </h2>
        <ul className="cat-credits">
          {catalog.map((e) => (
            <li key={e.meta.id}>
              <b>{e.meta.name}:</b> {e.about.credit ?? 'Made for Jackdaw.'}
            </li>
          ))}
        </ul>
        <p className="cat-credit">
          Game names and rules belong to their creators. Where a game&rsquo;s credit above names
          someone else&rsquo;s word list or art, it&rsquo;s used under the licence given there;
          everything else was made for Jackdaw.
        </p>
      </section>

      <nav className="cat-about__nav">
        <Link href="/" className="jd-plaque jd-plaque--small">
          Back home
        </Link>
        <Link href="/games" className="home-link">
          Browse the games
        </Link>
      </nav>
    </main>
  );
}
