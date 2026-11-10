import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LobbyCode } from '@jackdaw/engine';
import { LobbyRoom } from './lobby-room';

/** The lobby code from the URL (any case), or a missing page for anything that isn't one. */
async function codeFrom(params: Promise<{ code: string }>): Promise<string> {
  const code = LobbyCode.safeParse((await params).code);
  if (!code.success) notFound();
  return code.data;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  return { title: `Lobby ${await codeFrom(params)}` };
}

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  return <LobbyRoom code={await codeFrom(params)} />;
}
