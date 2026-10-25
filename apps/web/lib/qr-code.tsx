'use client';

import { useMemo } from 'react';
import { qrPath } from './qr';

/** A scannable QR code, always dark on light (phones can't read inverted codes reliably). */
export function QrCode({
  text,
  size = 190,
  label = 'QR code',
}: {
  text: string;
  size?: number;
  label?: string;
}) {
  const { size: n, d } = useMemo(() => qrPath(text), [text]);
  return (
    <svg
      viewBox={`-2 -2 ${n + 4} ${n + 4}`}
      width={size}
      height={size}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      style={{ background: 'var(--qr-bg)', display: 'block' }}
    >
      <path d={d} fill="var(--qr-ink)" />
    </svg>
  );
}
