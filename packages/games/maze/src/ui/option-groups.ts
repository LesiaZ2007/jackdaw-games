import type { OptionGroup } from '@jackdaw/ui';
import { ATTACK_POWERS, POWER_KINDS } from '../sim/powers';
import { printed } from './render/printed';

/** The eight power-up switches as one grid of toggles, each chip with its power's color. */
export const POWER_GROUP: OptionGroup = {
  label: 'Power-ups',
  layout: 'grid',
  keys: [...POWER_KINDS],
  short: Object.fromEntries(POWER_KINDS.map((k) => [k, k[0]!.toUpperCase() + k.slice(1)])),
  dots: { ...printed.power },
  // Classic hands out Hunt only, so the switches mean nothing; Solo has no one to attack.
  hidden: (o) => o.powerUps === 'Classic',
  disabled: (k, o) => o.mode === 'Solo' && (ATTACK_POWERS as readonly string[]).includes(k),
};
