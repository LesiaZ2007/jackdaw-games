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
  Glyph,
  Icon,
  Lid,
  Plaque,
  Sheet,
  Token,
} from '@jackdaw/ui';
import { catalog } from '@/lib/catalog';
import { rememberAvatar, rememberedAvatar, rememberedName, rememberName } from '@/lib/identity';
import { shelvesFor } from '@/lib/shelves';
import { createLobby } from '@/lib/use-lobby';
import { ShelfRow } from './shelf-row';
import { InstallButton } from './pwa';
import { ThemeToggle } from './theme-toggle';

const FALLBACK_AVATAR: Avatar = { crest: 'raven', tint: 'slate' };
const shelves = shelvesFor(catalog);

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

  return (
    <>
      <main className="home-hero">
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
              <ThemeToggle />
              <InstallButton />
            </nav>
          </section>
        </div>
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
        {shelves.map((s) => (
          <ShelfRow key={s.id} shelf={s} />
        ))}
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
