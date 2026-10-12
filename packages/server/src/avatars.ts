import type { Avatar } from '@jackdaw/engine';

/**
 * Avatar ids, carried over from Avalon's crests and tints. The art for each id lives in
 * packages/ui; the server only needs the ids to hand out unique defaults.
 */
export const CREST_IDS = [
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

export const TINT_IDS = [
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

/** Default avatars handed out in order when a player hasn't picked one (or theirs is taken). */
export const DEFAULT_AVATARS: Avatar[] = TINT_IDS.map((tint, i) => ({
  crest: CREST_IDS[i]!,
  tint,
}));

export function isKnownAvatar(a: Avatar): boolean {
  return (
    (CREST_IDS as readonly string[]).includes(a.crest) &&
    (TINT_IDS as readonly string[]).includes(a.tint)
  );
}
