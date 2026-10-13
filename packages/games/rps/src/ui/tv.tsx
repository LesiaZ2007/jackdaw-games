'use client';

import type { GameUi } from '@jackdaw/ui';

/** Rock Paper Scissors on the TV. Placeholder until the Phase 1 TV work lands. */
export const TvScreen: GameUi['TvScreen'] = ({ tableView }) => (
  <pre>{JSON.stringify(tableView, null, 2)}</pre>
);
