'use client';
import type { CSSProperties } from 'react';
import type { CrosswordView } from '../rules';
import type { Clue } from '../grid';
export function Board({
  view,
  active,
  selected,
  letters,
  onSelect,
}: {
  view: CrosswordView;
  active?: Clue;
  selected?: number;
  letters?: string[];
  onSelect?: (cell: number) => void;
}) {
  const numbers = new Map(view.clues.map((c) => [c.cells[0], c.number]));
  return (
    <div
      className="cw-board"
      role="group"
      aria-label="Crossword grid"
      style={{ '--cw-columns': view.width } as CSSProperties}
    >
      {view.blocks.map((blocked, i) =>
        blocked ? (
          <span className="cw-block" key={i} aria-hidden="true" />
        ) : (
          <button
            type="button"
            key={i}
            className={[
              'cw-cell',
              active?.cells.includes(i) && 'cw-cell--word',
              selected === i && 'cw-cell--selected',
              view.errors.includes(i) && 'cw-cell--error',
              view.revealed.includes(i) && 'cw-cell--revealed',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-label={
              'Row ' +
              (Math.floor(i / view.width) + 1) +
              ', column ' +
              ((i % view.width) + 1) +
              ': ' +
              ((letters ?? view.letters)[i] || 'empty') +
              (view.errors.includes(i) ? ', incorrect' : '') +
              (view.revealed.includes(i) ? ', revealed' : '')
            }
            data-cell={i}
            aria-pressed={onSelect ? selected === i : undefined}
            onClick={onSelect ? () => onSelect(i) : undefined}
            tabIndex={onSelect ? 0 : -1}
          >
            {numbers.has(i) && <span className="cw-number">{numbers.get(i)}</span>}
            <span className="cw-letter">{(letters ?? view.letters)[i]}</span>
            {view.errors.includes(i) && (
              <span className="cw-error" aria-hidden="true">
                ×
              </span>
            )}
          </button>
        ),
      )}
    </div>
  );
}
