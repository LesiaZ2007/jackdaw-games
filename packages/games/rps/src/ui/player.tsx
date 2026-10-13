'use client';

import type { GameUi } from '@jackdaw/ui';

/** Rock Paper Scissors on a phone. Placeholder until the Phase 1 lobby work lands. */
export const PlayerScreen: GameUi['PlayerScreen'] = ({ view, tableView }) => (
  <pre>{JSON.stringify({ view, tableView }, null, 2)}</pre>
);
