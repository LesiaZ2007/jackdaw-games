import type { Metadata } from 'next';
import { LobbyRoom } from './lobby-room';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const code = (await params).code.toUpperCase();
  return { title: `Lobby ${code}` };
}

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.toUpperCase();
  return <LobbyRoom code={code} />;
}
