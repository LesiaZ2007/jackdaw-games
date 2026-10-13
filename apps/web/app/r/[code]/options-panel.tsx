'use client';

import type { ZodType } from 'zod';
import { useOptionsDraft } from '@/lib/use-options-draft';

interface FieldDef {
  type: string;
  minValue?: number | null;
  maxValue?: number | null;
  options?: readonly string[];
  description?: string;
}

/** Turn "roundsToWin" into "Rounds to win". */
function label(key: string) {
  const words = key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * A game's options, drawn from its Zod schema: numbers become steppers, booleans toggles,
 * enums a row of choices. Hosts change them; everyone else sees them read-only.
 */
export function OptionsPanel({
  schema,
  options,
  editable,
  onChange,
}: {
  schema: ZodType;
  options: Record<string, unknown>;
  editable: boolean;
  /** Sends the new options; may return the save's promise. */
  onChange: (next: Record<string, unknown>) => unknown;
}) {
  const [current, save] = useOptionsDraft(options, onChange);

  const shape = (schema as unknown as { shape?: Record<string, ZodType> }).shape;
  if (!shape || Object.keys(shape).length === 0) return null;

  return (
    <dl className="options">
      {Object.entries(shape).map(([key, field]) => {
        const f = field as unknown as FieldDef & { def: { type: string } };
        const type = f.def.type;
        const value = current[key];
        const set = (v: unknown) => save({ ...current, [key]: v });
        return (
          <div key={key} className="options__row">
            <dt>{f.description ?? label(key)}</dt>
            <dd>
              {type === 'number' && typeof value === 'number' ? (
                editable ? (
                  <span className="options__stepper">
                    <button
                      type="button"
                      aria-label={`Fewer ${label(key).toLowerCase()}`}
                      disabled={f.minValue != null && value <= f.minValue}
                      onClick={() => set(value - 1)}
                    >
                      −
                    </button>
                    <b aria-live="polite">{value}</b>
                    <button
                      type="button"
                      aria-label={`More ${label(key).toLowerCase()}`}
                      disabled={f.maxValue != null && value >= f.maxValue}
                      onClick={() => set(value + 1)}
                    >
                      +
                    </button>
                  </span>
                ) : (
                  <b>{value}</b>
                )
              ) : type === 'boolean' ? (
                editable ? (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(value)}
                    className="options__toggle"
                    onClick={() => set(!value)}
                  >
                    <span>{value ? 'On' : 'Off'}</span>
                  </button>
                ) : (
                  <b>{value ? 'On' : 'Off'}</b>
                )
              ) : type === 'enum' && f.options ? (
                editable ? (
                  <span className="options__choices" role="radiogroup">
                    {f.options.map((o) => (
                      <button
                        key={o}
                        type="button"
                        role="radio"
                        aria-checked={value === o}
                        onClick={() => set(o)}
                      >
                        {label(o)}
                      </button>
                    ))}
                  </span>
                ) : (
                  <b>{label(String(value))}</b>
                )
              ) : (
                <b>{String(value ?? '')}</b>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
