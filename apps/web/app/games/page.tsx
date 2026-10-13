import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Catalog } from './catalog';
import './catalog.css';

export const metadata: Metadata = {
  title: 'The games',
  description: 'Browse the games in the Jackdaw compendium by players, kind, length and rules.',
};

export default function GamesPage() {
  // The catalog reads its filters from the URL, which needs a Suspense boundary.
  return (
    <Suspense>
      <Catalog />
    </Suspense>
  );
}
