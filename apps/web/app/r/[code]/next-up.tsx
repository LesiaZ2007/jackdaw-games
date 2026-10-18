'use client';

import { useState } from 'react';
import type { ZodType } from 'zod';
import { GameCover, GameTile, Icon } from '@jackdaw/ui';
import { catalog, CATEGORY_LABEL, unfitReason, type CatalogEntry } from '@/lib/catalog';
import { games } from '@/lib/registry';
import { OptionsPanel } from './options-panel';
import '../next-up.css';

const range = ([a, b]: [number, number]) => (a === b ? `${a}` : `${a}–${b}`);

/** "roundsToWin" → "Rounds to win". */
function words(key: string) {
  const w = key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return w.charAt(0).toUpperCase() + w.slice(1);
}

/** The chosen options in one line, e.g. "Rounds: 3". Mirrors what OptionsPanel shows. */
export function optionsSummary(schema: ZodType, options: Record<string, unknown>): string {
  const shape = (schema as unknown as { shape?: Record<string, { description?: string }> }).shape;
  if (!shape) return '';
  return Object.entries(shape)
    .map(([key, field]) => {
      const v = options[key];
      const shown =
        typeof v === 'boolean' ? (v ? 'on' : 'off') : typeof v === 'string' ? words(v) : String(v);
      return `${field.description ?? words(key)}: ${shown}`;
    })
    .join(', ');
}

/** The host's shelf of games to choose from, as box covers. */
export function GamePicker({
  selectedId,
  count,
  isHost,
  onChoose,
}: {
  selectedId: string | null;
  count: number;
  isHost: boolean;
  onChoose: (id: string) => void;
}) {
  return (
    <div className="picker">
      <ul className="picker__grid">
        {catalog.map((g) => (
          <li key={g.meta.id}>
            <GameCover
              name={g.meta.name}
              art={g.art}
              players={[g.meta.minPlayers, g.meta.maxPlayers]}
              minutes={g.meta.minutes}
              tagline={g.meta.tagline}
              kind={CATEGORY_LABEL[g.meta.category]}
              soon={!g.playable}
              unfit={g.playable ? unfitReason(g.meta, count) : null}
              selected={g.meta.id === selectedId}
              onClick={isHost && g.playable ? () => onChoose(g.meta.id) : undefined}
            />
          </li>
        ))}
      </ul>
      {!isHost && <p className="picker__hint">Only the host can choose the game.</p>}
    </div>
  );
}

/**
 * The chosen game. Small by default (one row: emblem, name, sizes, options at a glance); opens
 * to show the box, the full options and how a round goes.
 */
export function NextUp({
  entry,
  count,
  isHost,
  options,
  onOptions,
  onChange,
}: {
  entry: CatalogEntry;
  count: number;
  isHost: boolean;
  options: Record<string, unknown>;
  onOptions: (o: Record<string, unknown>) => unknown;
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { meta, art, about } = entry;
  const schema = games[meta.id]?.optionsSchema;
  const summary = schema ? optionsSummary(schema, options) : '';
  const unfit = unfitReason(meta, count);
  const bodyId = `next-up-${meta.id}`;

  return (
    <div className={`next-up${open ? ' next-up--open' : ''}`}>
      <div
        className="next-up__row"
        style={{ '--band': `var(--${art.band})` } as React.CSSProperties}
      >
        <GameTile art={art} size={60} />
        <div className="next-up__what">
          <span className="jd-display next-up__name">{meta.name}</span>
          <span className="next-up__facts">
            <span>
              <Icon.people />
              {range([meta.minPlayers, meta.maxPlayers])}
            </span>
            <span>
              <Icon.clock />
              {range(meta.minutes)} min
            </span>
          </span>
          {summary && <span className="next-up__summary">{summary}</span>}
          {unfit && <span className="next-up__why">{unfit}</span>}
        </div>
        <button
          type="button"
          className="jd-iconbtn next-up__toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={open ? 'Show less' : isHost ? 'Show options and rules' : 'Show rules'}
          onClick={() => setOpen(!open)}
        >
          <Icon.down />
        </button>
      </div>

      {open && (
        <div id={bodyId} className="next-up__body">
          <div className="next-up__cover">
            <GameCover
              name={meta.name}
              art={art}
              players={[meta.minPlayers, meta.maxPlayers]}
              minutes={meta.minutes}
              tagline={meta.tagline}
              kind={CATEGORY_LABEL[meta.category]}
            />
          </div>
          <p className="next-up__blurb">{about.description}</p>
          <div className="next-up__more">
            {schema && (
              <OptionsPanel
                schema={schema}
                options={options}
                editable={isHost}
                onChange={onOptions}
                help={entry.ui?.optionHelp}
              />
            )}
            <div className="next-up__how">
              <h3 className="jd-label">How a round goes</h3>
              <ol>
                {about.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              <a href={`/games/${meta.id}`} target="_blank" rel="noreferrer" className="home-link">
                Full rules and pictures
              </a>
            </div>
          </div>
        </div>
      )}

      {isHost && (
        <button type="button" className="home-link next-up__change" onClick={onChange}>
          Change game
        </button>
      )}
    </div>
  );
}
