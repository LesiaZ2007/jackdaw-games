import type { Metadata } from 'next';
import { DemoRoom } from './demo-room';
import { resolveDemoGameId } from './demo-engine';
import { catalogEntry } from '../../lib/catalog';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Solo Demo vs Bots',
  description:
    'Play UNO, Cambio, Battleship, WordHoard, and more against bird bots right in your browser.',
  openGraph: {
    title: 'Solo Demo vs Bots · Jackdaw Games',
    description:
      'Play UNO, Cambio, Battleship, WordHoard, and more against bird bots right in your browser.',
    images: [{ url: '/opengraph-image.png', alt: 'Jackdaw Games: a compendium of games' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Solo Demo vs Bots · Jackdaw Games',
    description:
      'Play UNO, Cambio, Battleship, WordHoard, and more against bird bots right in your browser.',
    images: ['/twitter-image.png'],
  },
};

export default async function DemoPage({
  searchParams,
}: {
  searchParams?: Promise<{ game?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const gameId = resolveDemoGameId(params?.game);
  const name = catalogEntry(gameId)?.meta.name ?? 'UNO';
  return <DemoRoom initialGame={gameId} initialName={name} />;
}
