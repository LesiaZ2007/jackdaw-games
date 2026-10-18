'use client';

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * react-textfit 1.1.1 in "multi" mode, as secret-hitler.online uses it for names on the player
 * tiles: the largest whole font size (1 to 100px) at which the text fits the box's height, then
 * its width. Same markup (a box and an inner wrapper). It measures synchronously instead of over
 * several renders, and refits when the box changes size (the tile's height comes from an image).
 */
export function Textfit({
  id,
  className,
  children,
  min = 1,
  max = 100,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
  min?: number;
  max?: number;
}) {
  const parent = useRef<HTMLDivElement>(null);
  const child = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  const fit = useCallback(() => {
    const el = parent.current;
    const wrapper = child.current;
    if (!el || !wrapper) return;
    const cs = getComputedStyle(el);
    const width = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const height = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (!(width > 0) || !(height > 0)) return;
    const fitsHeight = () => wrapper.scrollHeight - 1 <= height;
    const fitsWidth = () => wrapper.scrollWidth - 1 <= width;
    const was = { size: el.style.fontSize, display: wrapper.style.display };
    wrapper.style.display = 'inline-block';
    const tryAt = (size: number) => (el.style.fontSize = `${size}px`);

    let low = min;
    let high = max;
    let mid = min;
    while (low <= high) {
      mid = Math.floor((low + high) / 2);
      tryAt(mid);
      if (fitsHeight()) low = mid + 1;
      else high = mid - 1;
    }
    if (!fitsWidth()) {
      low = min;
      high = mid;
      while (low < high) {
        mid = Math.floor((low + high) / 2);
        tryAt(mid);
        if (fitsWidth()) low = mid + 1;
        else high = mid - 1;
      }
    }
    mid = Math.max(0, Math.min(Math.max(Math.min(low, high), min), max));
    el.style.fontSize = was.size;
    wrapper.style.display = was.display;
    setFontSize(mid);
    setReady(true);
  }, [min, max]);

  useLayoutEffect(() => {
    fit();
  }, [children, fit]);

  useLayoutEffect(() => {
    const el = parent.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let last = '';
    const ro = new ResizeObserver(() => {
      const size = `${el.clientWidth}x${el.clientHeight}`;
      if (size !== last) {
        last = size;
        fit();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  return (
    <div
      ref={parent}
      id={id}
      className={className}
      style={fontSize === null ? undefined : { fontSize }}
    >
      <div ref={child} style={{ display: ready ? 'block' : 'inline-block' }}>
        {children}
      </div>
    </div>
  );
}
