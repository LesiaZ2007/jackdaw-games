'use client';

import { useEffect, useState } from 'react';
import { useTheme, type GameUi } from '@jackdaw/ui';
import { seatUrl, tvUrl, type AvalonPlayerView, type AvalonTableView } from '../rules';
import { ShieldMark } from './art';
import './avalon-copied.css';
import './avalon-lobby.css';

/**
 * While Avalon runs, phones are in the Avalon app. Each phone is sent to its own seat once, as
 * soon as the game starts; if a player comes back to Jackdaw mid-game, this screen offers the
 * way back instead of bouncing them straight out again.
 */
const wentKey = (code: string) => `jackdaw:avalon-went:${code}`;

function alreadyWent(code: string): boolean {
  try {
    return sessionStorage.getItem(wentKey(code)) === '1';
  } catch {
    return false;
  }
}

function markWent(code: string) {
  try {
    sessionStorage.setItem(wentKey(code), '1');
  } catch {
    // Private mode: we just send them every time.
  }
}

function Away({ title, children }: { title: string; children: React.ReactNode }) {
  const look = useTheme();
  return (
    <div className="avalon av-away" data-printed={look === 'light' ? '' : undefined}>
      <span className="av-away__crest">
        <ShieldMark size={48} />
      </span>
      <h2 className="av-away__title">{title}</h2>
      {children}
    </div>
  );
}

export const PlayerScreen: GameUi['PlayerScreen'] = ({ view }) => {
  const v = view as AvalonPlayerView;
  const url = seatUrl(v);
  // Decided once, on the first render: the lobby only draws game screens in the browser.
  const [leaving] = useState(() => Boolean(v.seat) && !alreadyWent(v.avalonCode));

  useEffect(() => {
    if (!leaving) return;
    markWent(v.avalonCode);
    window.location.assign(url);
  }, [leaving, v.avalonCode, url]);

  return (
    <Away title={leaving ? 'Taking you to your seat…' : 'Avalon is underway'}>
      <p className="hand-text">
        {leaving
          ? 'The roles are dealt. Your seat at the Round Table is waiting in Avalon.'
          : 'The game is being played in Avalon. When it ends, everyone comes back here for the results.'}
      </p>
      <a className="btn btn-primary btn-lg" href={url}>
        Go to your seat
      </a>
    </Away>
  );
};

/**
 * The TV (and anyone who joined after Start, watching from a phone) shows Avalon's own table
 * inside Jackdaw's frame, so it is still here for the results when the game ends.
 */
export const TvScreen: GameUi['TvScreen'] = ({ tableView }) => {
  const v = tableView as AvalonTableView;
  return (
    <div className="av-tv">
      <iframe className="av-tv__frame" src={tvUrl(v)} title="Avalon, on the table" />
      <a className="av-tv__open" href={tvUrl(v)} target="_blank" rel="noreferrer">
        Open Avalon&rsquo;s table
      </a>
    </div>
  );
};
