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
  onEdit,
}: {
  view: CrosswordView;
  active?: Clue;
  selected?: number;
  letters?: string[];
  onSelect?: (cell: number) => void;
  onEdit?: (cell: number, letter: string) => void;
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
          <div
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
          >
            {numbers.has(i) && (
              <span className="cw-number" aria-hidden="true">
                {numbers.get(i)}
              </span>
            )}
            {onEdit ? (
              <input
                className="cw-letter cw-input"
                data-cell={i}
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
                inputMode="text"
                autoCapitalize="characters"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                maxLength={1}
                value={(letters ?? view.letters)[i]}
                readOnly={view.revealed.includes(i)}
                onFocus={(event) => {
                  event.currentTarget.select();
                  onSelect?.(i);
                }}
                onClick={(event) => event.currentTarget.select()}
                onChange={(event) => {
                  const value = event.currentTarget.value.toUpperCase();
                  if (/^[A-Z]?$/.test(value)) onEdit(i, value);
                }}
              />
            ) : (
              <>
                <span className="cw-letter">{(letters ?? view.letters)[i]}</span>
                {onSelect && (
                  <button
                    type="button"
                    className="cw-overview-hit"
                    aria-label={
                      'Select row ' +
                      (Math.floor(i / view.width) + 1) +
                      ', column ' +
                      ((i % view.width) + 1)
                    }
                    onClick={() => onSelect(i)}
                  />
                )}
              </>
            )}
            {view.errors.includes(i) && (
              <span className="cw-error" aria-hidden="true">
                ×
              </span>
            )}
          </div>
        ),
      )}
    </div>
  );
}
