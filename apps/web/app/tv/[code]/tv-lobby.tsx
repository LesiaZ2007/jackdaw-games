'use client';

import Link from 'next/link';
import { useState, useSyncExternalStore } from 'react';
import { BirdMark, BoxLid, Chits, SeatTrack, type Seat } from '@jackdaw/ui';
import { catalogEntry, gameUis } from '@/lib/catalog';
import { optionsSummary, screenPlayers } from '@/lib/lobby-view';
import { QrCode } from '@/lib/qr-code';
import { games } from '@/lib/registry';
import { serverClock } from '@/lib/clock';
import { siteUrl } from '@/lib/qr';
import { useLobby } from '@/lib/use-lobby';
import { NightHint, TvNight } from './tv-night';
import { TvResults } from './tv-results';
import { TvStage, useWakeLock } from './tv-stage';

const clock = serverClock;

const noSubscribe = () => () => {};
const serverSiteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '');

/** The public address, read after hydration so server and browser agree. */
function useSiteUrl() {
  return useSyncExternalStore(noSubscribe, siteUrl, serverSiteUrl);
}

/**
 * Remembers which players were already seated, so only new arrivals get the landing animation
 * (not everyone on first load, and not again on every poll).
 */
function useArrivals(ids: string[]): Set<string> {
  const key = ids.join(',');
  const [seen, setSeen] = useState<{
    key: string;
    known: Set<string> | null;
    landing: Set<string>;
  }>({
    key: '',
    known: null,
    landing: new Set(),
  });
  if (seen.key !== key) {
    // Adjusting state while rendering, when the inputs change (React's documented pattern).
    setSeen({
      key,
      known: new Set(ids),
      landing: seen.known ? new Set(ids.filter((id) => !seen.known!.has(id))) : new Set(),
    });
  }
  return seen.landing;
}

export function TvLobby({ code }: { code: string }) {
  useWakeLock();
  const { snapshot, missing } = useLobby(code, 'display');
  const site = useSiteUrl();
  // The short link (/QGYR) redirects to the lobby, and makes a smaller QR code.
  const joinUrl = `${site}/${code}`;
  const host = site.replace(/^https?:\/\//, '');
  const arrivals = useArrivals(snapshot?.players.map((p) => p.id) ?? []);

  if (missing) {
    return (
      <TvStage>
        <div className="tv-closed">
          <BirdMark width={180} height={180} />
          <h1 className="jd-display">That lobby has closed</h1>
          <p>
            Lobby {code} isn&apos;t open any more. Lobbies close after a day without games. Start a
            new one on a phone, then show its code here.
          </p>
          <Link href="/tv" className="jd-plaque">
            Show another lobby
          </Link>
        </div>
      </TvStage>
    );
  }

  if (!snapshot) {
    return (
      <TvStage>
        <div className="tv-closed">
          <BirdMark width={180} height={180} />
          <p className="tv-closed__finding">Finding lobby {code}…</p>
        </div>
      </TvStage>
    );
  }

  const hostName = snapshot.players.find((p) => p.id === snapshot.hostId)?.name ?? 'the host';
  const players = screenPlayers(snapshot);

  if (snapshot.status === 'results' && snapshot.results) {
    return (
      <TvStage>
        <TvResults snapshot={snapshot} players={players} hostName={hostName} />
      </TvStage>
    );
  }

  if (snapshot.status === 'in_game' && snapshot.session) {
    const ui = gameUis[snapshot.session.gameId];
    const name = catalogEntry(snapshot.session.gameId)?.meta.name ?? 'The game';
    if (ui?.fullTv) {
      return (
        <TvStage>
          <div className="tv-game tv-game--full">
            <ui.TvScreen
              tableView={snapshot.tableView}
              players={players}
              now={clock}
              reactions={snapshot.reactions}
            />
          </div>
        </TvStage>
      );
    }
    return (
      <TvStage>
        <div className="tv-game">
          <header className="tv-strip">
            <BirdMark width={64} height={64} weight={3} />
            <span className="tv-strip__game jd-display">{name}</span>
            <span className="tv-strip__join">
              <span className="jd-label">Join at</span>
              <b>{host}</b>
            </span>
            <Chits code={snapshot.code} size={58} />
            <QrCode text={joinUrl} size={104} label={`QR code to join lobby ${snapshot.code}`} />
          </header>
          <div className="tv-game__table">
            {ui ? (
              <ui.TvScreen
                tableView={snapshot.tableView}
                players={players}
                now={clock}
                reactions={snapshot.reactions}
              />
            ) : (
              <p className="tv-closed__finding">This game has no TV screen yet.</p>
            )}
          </div>
        </div>
      </TvStage>
    );
  }

  const seats: Seat[] = snapshot.players.map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    host: p.id === snapshot.hostId,
    away: !p.online,
    landing: arrivals.has(p.id),
  }));
  const next = catalogEntry(snapshot.selectedGameId);
  const schema = next ? games[next.meta.id]?.optionsSchema : undefined;
  const summary = schema ? optionsSummary(schema, snapshot.gameOptions) : '';
  const count = snapshot.players.length;
  const join = (
    <div className="tv-join-panel">
      <span className="jd-label tv-join__label">Join at</span>
      <span className="tv-join__url">{host}</span>
      <Chits code={snapshot.code} size={next?.ui?.TvLobby ? 120 : 190} flip />
      <div className="tv-join__qr">
        <QrCode text={joinUrl} size={196} label={`QR code to join lobby ${snapshot.code}`} />
        <p>Scan to join, or type the four letters on your phone.</p>
      </div>
    </div>
  );

  // A game with its own TV lobby (Avalon's round table) takes the first screen.
  const OwnTvLobby = next?.ui?.TvLobby;
  if (OwnTvLobby) {
    return (
      <TvStage below={<TvNight code={code} snapshot={snapshot} />}>
        <div className="tv-own-lobby">
          <OwnTvLobby
            code={snapshot.code}
            players={players}
            hostId={snapshot.hostId}
            options={snapshot.gameOptions}
            reactions={snapshot.reactions}
            join={join}
            status={`Waiting for ${hostName} to start`}
          />
          {snapshot.historyCount > 0 && <NightHint />}
        </div>
      </TvStage>
    );
  }

  return (
    <TvStage below={<TvNight code={code} snapshot={snapshot} />}>
      <div className="tv-lobby">
        <header className="tv-lobby__top">
          <div className="tv-brand">
            <BirdMark width={104} height={104} weight={2.6} />
            <span className="jd-display tv-brand__name">Jackdaw</span>
          </div>
          <span className="tv-count">{count} at the table</span>
        </header>

        <section className="tv-join" aria-label="How to join">
          {join}
        </section>

        <section className="tv-next" aria-label="Next game">
          <span className="jd-label tv-join__label">Next up</span>
          {next ? (
            <>
              <BoxLid
                name={next.meta.name}
                art={next.art}
                players={[next.meta.minPlayers, next.meta.maxPlayers]}
                minutes={next.meta.minutes}
                tagline={next.meta.tagline}
                artWidth={150}
              />
              {summary && <p className="tv-options">{summary}</p>}
              <p className="tv-waiting">Waiting for {hostName} to start</p>
            </>
          ) : (
            <p className="tv-waiting">{hostName} is choosing a game</p>
          )}
        </section>

        <SeatTrack seats={seats} cols={15} className="tv-track" reactions={snapshot.reactions} />
        {snapshot.historyCount > 0 && <NightHint />}
      </div>
    </TvStage>
  );
}
