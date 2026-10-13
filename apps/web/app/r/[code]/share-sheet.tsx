'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Chits, Icon, Plaque, Sheet } from '@jackdaw/ui';
import { QrCode } from '@/lib/qr-code';
import { siteHost, siteUrl } from '@/lib/qr';

/** Invite people in the room: the code in large chits, a QR code, a link to copy, and the TV. */
export function ShareSheet({
  open,
  onClose,
  code,
}: {
  open: boolean;
  onClose: () => void;
  code: string;
}) {
  const [copied, setCopied] = useState(false);
  // The short link (/QGYR) redirects to the lobby, and makes a smaller QR code.
  const link = `${siteUrl()}/${code}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Invite people">
      <div className="share">
        <Chits code={code} size={64} />
        <p className="share__how">
          Open <b>{siteHost()}</b> and type the four letters, or scan this.
        </p>
        <div className="share__qr">
          <QrCode text={link} size={200} label={`QR code for lobby ${code}`} />
        </div>
        <div className="share__row">
          <Plaque small onClick={copy}>
            <Icon.copy />
            {copied ? 'Link copied' : 'Copy link'}
          </Plaque>
          <Link className="jd-plaque jd-plaque--small" href={`/tv/${code}`} target="_blank">
            <Icon.tv />
            Show on TV
          </Link>
        </div>
        <p className="share__link">{link}</p>
      </div>
    </Sheet>
  );
}
