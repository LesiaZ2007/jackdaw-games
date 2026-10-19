'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Icon } from '@jackdaw/ui';
import { catalogEntry } from '@/lib/catalog';
import { GameDetail, StartLobby } from '../detail';

/** One game's details as a full page (phones, and anyone following a shared link). */
export function GamePage({ id }: { id: string }) {
  const router = useRouter();
  const entry = catalogEntry(id);

  useEffect(() => {
    if (entry) document.title = `${entry.meta.name} · Jackdaw Games`;
  }, [entry]);

  function back() {
    // Return to the filtered shelf the player came from, or the whole catalog from a shared link.
    if (document.referrer.startsWith(window.location.origin)) router.back();
    else router.push('/games');
  }

  return (
    <div className="cat-page">
      {entry ? (
        <>
          <div className="cat-page__body">
            <GameDetail
              entry={entry}
              back={
                <button
                  type="button"
                  className="jd-iconbtn"
                  onClick={back}
                  aria-label="Back to the games"
                >
                  <Icon.back />
                </button>
              }
            />
          </div>
          <StartLobby entry={entry} autoHide />
        </>
      ) : (
        <div className="cat-page__missing">
          <button
            type="button"
            className="jd-iconbtn"
            onClick={back}
            aria-label="Back to the games"
          >
            <Icon.back />
          </button>
          <h1 className="jd-display">No such game</h1>
          <p>That game isn&apos;t in the compendium.</p>
          <Link href="/games" className="jd-plaque jd-plaque--small">
            See all the games
          </Link>
        </div>
      )}
    </div>
  );
}
