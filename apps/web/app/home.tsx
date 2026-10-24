'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { Avatar } from '@jackdaw/engine';
import {
  AvatarButton,
  AvatarPicker,
  BirdMark,
  CodeInput,
  GameCover,
  Glyph,
  Icon,
  Lid,
  Plaque,
  Sheet,
  Token,
} from '@jackdaw/ui';
import { catalog, CATEGORY_LABEL, unfitReason } from '@/lib/catalog';
import { rememberAvatar, rememberedAvatar, rememberedName, rememberName } from '@/lib/identity';
import { createLobby } from '@/lib/use-lobby';
import { FilterBar } from './games/filter-bar';
import { hasFilters, matches, NO_FILTERS, type Filters } from './games/filters';
import { InstallButton } from './pwa';
import { ThemeButton } from './theme-toggle';

const FALLBACK_AVATAR: Avatar = { crest: 'raven', tint: 'slate' };

/** Whether the page has been scrolled at all, so the "more below" arrow can bow out. */
function useScrolled(): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const check = () => setScrolled(window.scrollY > 48);
    check();
    window.addEventListener('scroll', check, { passive: true });
    return () => window.removeEventListener('scroll', check);
  }, []);
  return scrolled;
}

export function Home() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<Avatar>(FALLBACK_AVATAR);
  const [picking, setPicking] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Returning friends skip typing their name again (device storage is only readable after hydration).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(rememberedName() ?? '');
    setAvatar(rememberedAvatar() ?? FALLBACK_AVATAR);
  }, []);

  // Stable, so the sheet doesn't re-run its focus handling on every pick.
  const closePicker = useCallback(() => setPicking(false), []);

  function chooseAvatar(next: Avatar) {
    setAvatar(next);
    rememberAvatar(next);
  }

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) return setError('Type your name first, so friends know who opened the lobby.');
    setBusy(true);
    setError(null);
    try {
      rememberName(trimmed);
      rememberAvatar(avatar);
      const lobby = await createLobby({ name: trimmed, avatar });
      router.push(`/r/${lobby}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  function join() {
    if (code.length !== 4) return setError('Lobby codes are 4 letters.');
    if (name.trim()) rememberName(name.trim());
    router.push(`/r/${code}`);
  }

  function browse() {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('games')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
  }

  const fan = catalog.slice(0, 5);
  const scrolled = useScrolled();

  return (
    <>
      <main className="home-hero">
        <ThemeButton className="home-corner" />
        <div className="home-hero__inner">
          <div className="grid gap-5">
            <Lid className="grid justify-items-center gap-1 px-5 pb-5 pt-6 text-center">
              <BirdMark width={132} height={132} weight={2.2} />
              <h1
                className="jd-display"
                style={{ fontSize: 'var(--step-5)', lineHeight: 0.86, marginTop: 6 }}
              >
                Jackdaw
              </h1>
              <p
                className="jd-label"
                style={{ fontSize: 15, letterSpacing: '.1em', marginTop: 16 }}
              >
                A compendium of games for 2 to 15
              </p>
              <p className="max-w-[30ch]" style={{ margin: '8px 0 0', color: 'var(--ink-2)' }}>
                Everyone plays on their own phone. Put the table on a TV if you have one.
              </p>
            </Lid>
            <div className="home-fan" aria-hidden="true">
              {fan.map((g, i) => (
                <span
                  key={g.meta.id}
                  className={`home-fan__lid jd-field-${g.art.field}`}
                  style={
                    {
                      '--band': `var(--${g.art.band})`,
                      '--x': `calc(${i - (fan.length - 1) / 2} * min(62px, 15.5vw))`,
                      '--r': `${(i - (fan.length - 1) / 2) * 7.5}deg`,
                    } as React.CSSProperties
                  }
                >
                  <Glyph id={g.art.glyph} size={36} />
                </span>
              ))}
            </div>
          </div>

          <section className="home-start" aria-label="Start playing">
            <div className="home-who">
              <label className="jd-label" htmlFor="home-name">
                Your name
              </label>
              <div className="home-who__row">
                <AvatarButton avatar={avatar} size={48} onClick={() => setPicking(true)} />
                <input
                  id="home-name"
                  className="jd-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={20}
                  placeholder="e.g. Jackdaw"
                  autoComplete="nickname"
                  onKeyDown={(e) => e.key === 'Enter' && create()}
                />
              </div>
            </div>
            <Plaque go onClick={create} disabled={busy}>
              {busy ? 'Opening a lobby…' : 'Create a lobby'}
            </Plaque>
            <div className="jd-or">or join one</div>
            <div className="home-join">
              <CodeInput value={code} onChange={setCode} onEnter={join} size="min(70px, 15vw)" />
              <Plaque small onClick={join}>
                Join
              </Plaque>
            </div>
            {error && (
              <p role="alert" style={{ margin: 0, color: 'var(--danger)', fontWeight: 700 }}>
                {error}
              </p>
            )}
            <nav className="home-nav" aria-label="More">
              <button type="button" className="home-link home-nav__browse" onClick={browse}>
                Browse the games
                <Icon.down />
              </button>
              <Link href="/tv" className="home-link">
                Show a lobby on a TV
              </Link>
              <InstallButton />
            </nav>
          </section>
        </div>
        {/* The games are below the fold: say so until the page moves (Lesia, 2026-10-24). */}
        <button
          type="button"
          className={scrolled ? 'home-more is-gone' : 'home-more'}
          onClick={browse}
          aria-label="Scroll down to the games"
          tabIndex={scrolled ? -1 : 0}
        >
          <span className="home-more__label" aria-hidden="true">
            The games
          </span>
          <span className="home-more__ring" aria-hidden="true">
            <Icon.down />
          </span>
        </button>
      </main>

      <section id="games" className="home-shelves" aria-labelledby="home-shelves-title">
        <header className="home-shelves__head">
          <h2 id="home-shelves-title" className="jd-display">
            The games
          </h2>
          <Link href="/games" className="jd-plaque jd-plaque--small">
            See all games
          </Link>
        </header>
        <GameGrid />
      </section>

      <Sheet open={picking} onClose={closePicker} title="Your token">
        <div className="home-token">
          <Token avatar={avatar} size={88} />
          <p>
            Friends see this beside your name. If someone in a lobby already has your crest or
            colour, you&rsquo;ll pick another when you join.
          </p>
        </div>
        <AvatarPicker value={avatar} onChange={chooseAvatar} />
        <Plaque go onClick={closePicker}>
          Done
        </Plaque>
      </Sheet>
    </>
  );
}

/**
 * Every game in one grid, loosely by kind (playable first), with the filters along the top.
 * Each cover opens the game's page.
 */
function GameGrid() {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const shown = catalog.filter((e) => matches(e.meta, filters));
  return (
    <div className="home-games">
      <FilterBar filters={filters} onChange={setFilters} />
      <div className="cat-count">
        <span>
          {shown.length === 1 ? '1 game' : `${shown.length} games`}
          {filters.players ? ` for ${filters.players} players` : ''}
        </span>
        {hasFilters(filters) && (
          <button type="button" className="cat-linkbtn" onClick={() => setFilters(NO_FILTERS)}>
            Clear filters
          </button>
        )}
      </div>
      {shown.length === 0 ? (
        <p className="cat-empty">
          No games match those filters.{' '}
          <button type="button" className="cat-linkbtn" onClick={() => setFilters(NO_FILTERS)}>
            Show every game
          </button>
        </p>
      ) : (
        <ul className="cat-grid">
          {shown.map((e) => (
            <li key={e.meta.id}>
              <GameCover
                name={e.meta.name}
                art={e.art}
                players={[e.meta.minPlayers, e.meta.maxPlayers]}
                minutes={e.meta.minutes}
                tagline={e.meta.tagline}
                kind={CATEGORY_LABEL[e.meta.category]}
                soon={!e.playable}
                unfit={filters.players ? unfitReason(e.meta, filters.players) : null}
                href={`/games/${e.meta.id}`}
                link={Link}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
