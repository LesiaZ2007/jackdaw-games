'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import type { TvScreenProps } from '@jackdaw/engine';
import type { ScreenExtras } from '@jackdaw/ui';
import type { ShTableView } from '../rules';
import { ShFrame } from './frame';
import GamePage from './sho/GamePage';
import { toGameState } from './sho/adapt';

/**
 * On a TV the page can't scroll, so it shrinks as a whole until the boards fit under the tiles
 * (secret-hitler.online's page is made for scrolling). Phones that are watching scroll as usual.
 */
function useFitOnTv() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const host = el?.closest('.sho-frame')?.parentElement;
    if (!el || !host || !el.closest('.tv-game') || typeof ResizeObserver === 'undefined') return;
    // The largest scale that fits: tiles rewrap as the page shrinks, so it's searched for.
    const fits = (zoom: number) => {
      el.style.zoom = String(zoom);
      return el.getBoundingClientRect().height <= host.clientHeight + 1;
    };
    const fit = () => {
      if (host.clientHeight <= 0 || fits(1)) return;
      let lo = 0.25;
      let hi = 1;
      for (let i = 0; i < 9; i++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) lo = mid;
        else hi = mid;
      }
      el.style.zoom = String(lo);
    };
    const ro = new ResizeObserver(fit);
    ro.observe(host);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    fit();
    return () => ro.disconnect();
  }, []);
  return ref;
}

/**
 * The TV, and a phone that isn't seated: secret-hitler.online's game page with no seat, so
 * nobody's role shows and there's nothing to answer. Its popups close themselves.
 */
export function TvScreen({ tableView, players, chat }: TvScreenProps<ShTableView> & ScreenExtras) {
  const next = toGameState(tableView, null, players);
  const key = JSON.stringify(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const gameState = useMemo(() => next, [key]);
  const ref = useFitOnTv();
  return (
    <ShFrame chat={chat} players={players} className="sho-page--tv">
      <div ref={ref}>
        <GamePage gameState={gameState} user={null} />
      </div>
    </ShFrame>
  );
}
