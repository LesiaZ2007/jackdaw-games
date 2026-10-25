import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { knownGame } from '@/lib/upcoming';
import { GamePage } from './game-page';
import '../catalog.css';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const meta = knownGame((await params).id);
  return meta ? { title: meta.name, description: meta.tagline } : {};
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  if (!knownGame(id)) notFound();
  return <GamePage id={id} />;
}
