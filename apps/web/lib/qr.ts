import QRCode from 'qrcode';

/** A QR code as one SVG path (1 unit per module) plus its size, for drawing in any colour. */
export function qrPath(text: string): { size: number; d: string } {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  let d = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) if (qr.modules.get(x, y)) d += `M${x} ${y}h1v1h-1z`;
  }
  return { size, d };
}

/** The public address to show and encode: NEXT_PUBLIC_SITE_URL, or this page's origin. */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, '');
  return typeof window === 'undefined' ? '' : window.location.origin;
}

/** The address people type, without the scheme: "jackdaw.games". */
export function siteHost(): string {
  return siteUrl().replace(/^https?:\/\//, '');
}
