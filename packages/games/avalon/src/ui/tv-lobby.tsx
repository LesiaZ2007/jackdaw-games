'use client';

import { useTheme, type GameTvLobbyProps } from '@jackdaw/ui';
import { MAX_PLAYERS, MIN_PLAYERS, MODES, ROLES, lineup } from '../lineup';
import { defaultOptions, lineupSettings, optionsSchema, type AvalonOptions } from '../rules';
import { Fan, RoundTable } from './lobby';
import './avalon-copied.css';
import './avalon-lobby.css';

/**
 * The TV's lobby once Avalon is chosen: the round table with everyone's shield, big, and beside
 * it how to join and the deal for the current count. Public facts only; nobody can act here.
 */
export function AvalonTvLobby({
  code,
  players,
  hostId,
  options: raw,
  reactions,
  join,
  status,
}: GameTvLobbyProps) {
  const look = useTheme();
  const parsed = optionsSchema.safeParse({ ...defaultOptions(), ...raw });
  const s: AvalonOptions = parsed.success ? parsed.data : defaultOptions();
  const count = players.length;
  const needed = Math.max(0, MIN_PLAYERS - count);
  const deal = lineup(lineupSettings(s), count);

  return (
    <div className="avalon av-tvlobby" data-printed={look === 'light' ? '' : undefined}>
      <div className="av-ground" aria-hidden="true">
        <span className="print-layer print-far" />
        <span className="print-layer print-near" />
      </div>
      <div className="av-tvlobby__table av-frame">
        <RoundTable
          players={players}
          me={null}
          hostId={hostId}
          canInspect={() => false}
          inspectLabel={(p) => p.name}
          onInspect={() => {}}
          reactions={reactions}
          center={
            <>
              <span className="center-kicker">Room</span>
              <span className="center-code">{code}</span>
              <span className="center-line">
                {count} of {MAX_PLAYERS} seated · {needed ? `${needed} more needed` : 'ready'}
              </span>
            </>
          }
        />
      </div>
      <aside className="av-tvlobby__side">
        <div className="av-tvlobby__join">{join}</div>
        <section className="hand" aria-label="Avalon">
          <div className="hand-inner">
            <p className="eyebrow">Gathering at the Round Table</p>
            <h2 className="hand-title">
              {needed
                ? `Waiting for ${needed} more ${needed === 1 ? 'knight' : 'knights'}`
                : status}
            </h2>
            <Fan
              roles={[...deal.good, ...deal.evil]}
              label={`Roles dealt for ${Math.max(count, MIN_PLAYERS)} players`}
            />
            <p className="hand-text">
              {MODES[s.mode].label}: <span className="good-text">{deal.good.length} loyal</span>{' '}
              against <span className="evil-text">{deal.evil.length} evil</span>
              {s.lady ? ', with the Lady of the Lake' : ''}.
              {deal.dropped.length > 0 &&
                ` Not enough evil seats for ${deal.dropped.map((r) => ROLES[r].name).join(' and ')} yet.`}
            </p>
          </div>
        </section>
      </aside>
    </div>
  );
}
