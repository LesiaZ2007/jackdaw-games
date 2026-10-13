'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BirdMark, CodeInput, Glyph, Lid, Plaque, Token } from '@jackdaw/ui';
import { catalog } from '@/lib/catalog';
import { rememberedAvatar, rememberedName, rememberName } from '@/lib/identity';
import { createLobby } from '@/lib/use-lobby';
import { ThemeToggle } from './theme-toggle';

const FALLBACK_AVATAR = { crest: 'raven', tint: 'slate' };

export function Home() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(FALLBACK_AVATAR);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Returning friends skip typing their name again (device storage is only readable after hydration).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(rememberedName() ?? '');
    setAvatar(rememberedAvatar() ?? FALLBACK_AVATAR);
  }, []);

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) return setError('Type your name first, so friends know who opened the lobby.');
    setBusy(true);
    setError(null);
    try {
      rememberName(trimmed);
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

  const fan = catalog.slice(0, 5);

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-[1180px] items-center gap-6 px-4 py-5 md:grid-cols-[1.1fr_1fr] md:gap-12 md:px-8">
      <div className="grid gap-5">
        <Lid className="grid justify-items-center gap-1 px-5 pb-5 pt-6 text-center">
          <BirdMark width={132} height={132} weight={2.2} />
          <h1
            className="jd-display"
            style={{ fontSize: 'var(--step-5)', lineHeight: 0.86, marginTop: 6 }}
          >
            Jackdaw
          </h1>
          <p className="jd-label" style={{ fontSize: 15, letterSpacing: '.1em', marginTop: 16 }}>
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
                  '--x': `${(i - (fan.length - 1) / 2) * 62}px`,
                  '--r': `${(i - (fan.length - 1) / 2) * 7.5}deg`,
                } as React.CSSProperties
              }
            >
              <Glyph id={g.art.glyph} size={36} />
            </span>
          ))}
        </div>
      </div>

      <section className="grid gap-3 md:max-w-[440px]" aria-label="Start playing">
        <div className="flex items-center gap-4">
          <Token avatar={avatar} />
          <label className="grid flex-1 gap-1.5">
            <span className="jd-label">Your name</span>
            <input
              className="jd-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              placeholder="e.g. the owner"
              autoComplete="nickname"
              onKeyDown={(e) => e.key === 'Enter' && create()}
            />
          </label>
        </div>
        <Plaque go onClick={create} disabled={busy}>
          {busy ? 'Opening a lobby…' : 'Create a lobby'}
        </Plaque>
        <div className="jd-or">or join one</div>
        <div className="flex items-center justify-between gap-3">
          <CodeInput value={code} onChange={setCode} onEnter={join} />
          <Plaque small onClick={join}>
            Join
          </Plaque>
        </div>
        {error && (
          <p role="alert" style={{ margin: 0, color: 'var(--danger)', fontWeight: 700 }}>
            {error}
          </p>
        )}
        <nav
          className="mt-2 flex flex-wrap items-center justify-center gap-x-6 gap-y-2"
          style={{ fontWeight: 700 }}
        >
          <Link href="/games" className="home-link">
            Browse the games
          </Link>
          <Link href="/tv" className="home-link">
            Show a lobby on a TV
          </Link>
          <Link href="/about" className="home-link">
            About
          </Link>
          <ThemeToggle />
        </nav>
      </section>
    </main>
  );
}
