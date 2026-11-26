// SPIKE (docs/maze/LIVE-PLAN-1.md): the feel-check page's browser entry, bundled by
// scripts/live-spike.mjs into worker/.spike.
import '@jackdaw/ui/tokens.css';
import { LiveSpike } from '@jackdaw/game-maze/live-spike';
import { createRoot } from 'react-dom/client';

createRoot(document.getElementById('root')!).render(
  <main style={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
    <LiveSpike />
  </main>,
);
