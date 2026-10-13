import { TvLobby } from './tv-lobby';

export default async function TvPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <TvLobby code={code.toUpperCase()} />;
}
