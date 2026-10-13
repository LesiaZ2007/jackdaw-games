'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { GameCategory } from '@jackdaw/engine';
import { Glyph, Plaque } from '@jackdaw/ui';
import { COMPLEXITY_LABEL, type CatalogEntry } from '@/lib/catalog';
import { rememberedAvatar, rememberedName, rememberName } from '@/lib/identity';
import { createLobby } from '@/lib/use-lobby';

/** The fourth cell of the spec strip: the kind of game, in two short words. */
const KIND_SPEC: Record<GameCategory, [string, string]> = {
  'social-deduction': ['Roles', 'hidden'],
  word: ['Words', 'and party'],
  card: ['Cards', 'in hand'],
  board: ['Board', 'game'],
};

const range = ([a, b]: [number, number]) => (a === b ? `${a}` : `${a}–${b}`);

/**
 * Everything about one game: banner, facts, pictures, how a round goes, and a button to start a
 * lobby with it. Used as the phone page (/games/[id]) and as the laptop side panel.
 */
export function GameDetail({
  entry,
  headingLevel = 1,
}: {
  entry: CatalogEntry;
  headingLevel?: 1 | 2;
}) {
  const { meta, art, about } = entry;
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  const [kindBig, kindSmall] = KIND_SPEC[meta.category];
  return (
    <article className="cat-detail" aria-labelledby={`game-${meta.id}`}>
      <div
        className={`cat-detail__hero jd-field-${art.field}`}
        style={{ '--band': `var(--${art.band})` } as React.CSSProperties}
      >
        <span className="cat-detail__dev">
          <Glyph id={art.glyph} />
        </span>
      </div>
      <div className="cat-detail__body">
        <div>
          <Heading id={`game-${meta.id}`} className="jd-display cat-detail__name">
            {meta.name}
          </Heading>
          <p className="cat-detail__tag">{meta.tagline}</p>
        </div>
        <dl className="cat-spec">
          <div>
            <dt>players</dt>
            <dd>{range([meta.minPlayers, meta.maxPlayers])}</dd>
          </div>
          <div>
            <dt>minutes</dt>
            <dd>{range(meta.minutes)}</dd>
          </div>
          <div>
            <dt>rules</dt>
            <dd>{COMPLEXITY_LABEL[meta.complexity]}</dd>
          </div>
          <div>
            <dt>{kindSmall}</dt>
            <dd>{kindBig}</dd>
          </div>
        </dl>
        {about.pictures?.length ? (
          <div className="cat-pics" tabIndex={0} aria-label={`Pictures of ${meta.name}`}>
            {about.pictures.map((p) => (
              // Plain img: these are local screenshots of fixed size, shown at a fixed height.
              <img
                key={p.src}
                src={p.src}
                alt={p.alt}
                className={p.wide ? 'is-wide' : undefined}
                loading="lazy"
              />
            ))}
          </div>
        ) : (
          <div className="cat-pics cat-pics--empty">
            <Glyph id={art.glyph} size={40} />
            <p>Pictures arrive once {meta.name} is built.</p>
          </div>
        )}
        <p>{about.description}</p>
        <h3 className="jd-display cat-detail__h3">How a round goes</h3>
        <ol className="cat-steps">
          {about.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        {about.credit && <p className="cat-credit">{about.credit}</p>}
      </div>
    </article>
  );
}

/**
 * The docked button under a game's details. Playable games open a lobby with the game already
 * chosen; it asks for a name first if this device hasn't used one before.
 */
export function StartLobby({ entry }: { entry: CatalogEntry }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [known, setKnown] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const remembered = rememberedName();
    // Device storage is only readable after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(remembered ?? '');
    setKnown(Boolean(remembered));
  }, []);

  if (!entry.playable) {
    return (
      <div className="cat-dock">
        <Plaque disabled aria-disabled="true">
          Coming soon
        </Plaque>
        <p className="cat-dock__note">{entry.meta.name} is still being built.</p>
      </div>
    );
  }

  async function start() {
    const trimmed = name.trim();
    if (!trimmed) {
      setEditing(true);
      return setError('Type your name first, so friends know who opened the lobby.');
    }
    setBusy(true);
    setError(null);
    try {
      rememberName(trimmed);
      const code = await createLobby({
        name: trimmed,
        avatar: rememberedAvatar() ?? undefined,
        gameId: entry.meta.id,
      });
      router.push(`/r/${code}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const askName = !known || editing;
  return (
    <div className="cat-dock">
      {askName ? (
        <label className="cat-dock__name">
          <span className="jd-label">Your name</span>
          <input
            className="jd-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            placeholder="e.g. the owner"
            autoComplete="nickname"
            onKeyDown={(e) => e.key === 'Enter' && start()}
          />
        </label>
      ) : (
        <p className="cat-dock__note">
          Playing as <b>{name}</b>.{' '}
          <button type="button" className="cat-linkbtn" onClick={() => setEditing(true)}>
            Change
          </button>
        </p>
      )}
      <Plaque go onClick={start} disabled={busy}>
        {busy ? 'Opening a lobby…' : `Start a lobby with ${entry.meta.name}`}
      </Plaque>
      {error && (
        <p role="alert" className="cat-error">
          {error}
        </p>
      )}
    </div>
  );
}
