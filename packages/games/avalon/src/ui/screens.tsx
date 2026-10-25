'use client';

import { useEffect, useState } from 'react';
import { useGameLook, type GameUi } from '@jackdaw/ui';
import { seatUrl, tvUrl, type AvalonPlayerView, type AvalonTableView } from '../rules';
import { ShieldMark } from './art';
import './avalon-copied.css';
import './avalon-lobby.css';

/**
 * While Avalon runs, phones are in the Avalon app. Each phone is sent to its own seat once, as
 * soon as the game starts; if a player comes back to Jackdaw mid-game, this screen offers the
 * way back instead of bouncing them straight out again. Keyed by the Avalon room and the seat, so
 * a tab that changes hands (or a reused room code) still sends the new seat across.
 */
const wentKey = (code: string, seat: string) => `jackdaw:avalon-went:${code}:${seat}`;

function alreadyWent(code: string, seat: string): boolean {
  try {
    return sessionStorage.getItem(wentKey(code, seat)) === '1';
  } catch {
    return false;
  }
}

function markWent(code: string, seat: string) {
  try {
    sessionStorage.setItem(wentKey(code, seat), '1');
  } catch {
    // Private mode: we just send them every time.
  }
}

function Away({ title, children }: { title: string; children: React.ReactNode }) {
  const look = useGameLook('avalon', 'light');
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
  const seat = v.seat?.playerId ?? '';
  const [leaving] = useState(() => Boolean(v.seat) && !alreadyWent(v.avalonCode, seat));

  useEffect(() => {
    if (!leaving) return;
    markWent(v.avalonCode, seat);
    window.location.assign(url);
  }, [leaving, v.avalonCode, seat, url]);

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
