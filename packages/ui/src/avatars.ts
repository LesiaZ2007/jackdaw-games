/**
 * Avatar ids the player can choose from, in the same order as the server's defaults
 * (packages/server/src/avatars.ts). Crest art is in crests.tsx; tints are `--tint-<id>` tokens.
 */
export const CREST_CHOICES = [
  'helm',
  'crown',
  'swords',
  'shield',
  'tower',
  'key',
  'rose',
  'sun',
  'moon',
  'fleur',
  'oak',
  'owl',
  'wolf',
  'fox',
  'stag',
  'raven',
] as const;

export const TINT_CHOICES = [
  'slate',
  'plum',
  'moss',
  'umber',
  'teal',
  'mauve',
  'indigo',
  'olive',
  'pewter',
  'rust',
  'ochre',
  'pine',
  'violet',
  'orchid',
  'lagoon',
] as const;
