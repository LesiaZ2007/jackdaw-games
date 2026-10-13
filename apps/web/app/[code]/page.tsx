import { notFound, redirect } from 'next/navigation';
import { CODE_ALPHABET } from '@jackdaw/engine';

const LOBBY_CODE = new RegExp(`^[${CODE_ALPHABET}]{4}$`);

/** Short room links: /QGYR (any case) opens lobby QGYR. Anything else is a missing page. */
export default async function ShortLink({ params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.toUpperCase();
  if (!LOBBY_CODE.test(code)) notFound();
  redirect(`/r/${code}`);
}
