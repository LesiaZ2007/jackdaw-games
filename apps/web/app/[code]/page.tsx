import { notFound, redirect } from 'next/navigation';
import { LobbyCode } from '@jackdaw/engine';

/** Short room links: /QGYR (any case) opens lobby QGYR. Anything else is a missing page. */
export default async function ShortLink({ params }: { params: Promise<{ code: string }> }) {
  const code = LobbyCode.safeParse((await params).code);
  if (!code.success) notFound();
  redirect(`/r/${code.data}`);
}
