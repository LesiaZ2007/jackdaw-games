'use client';

import { useEffect, useState, type ReactNode } from 'react';

/** secret-hitler.online's status-bar/StatusBar.js: the text fades out, then the new text fades in. */
export default function StatusBar({ children }: { children: ReactNode }) {
  const [text, setText] = useState<ReactNode>(children);
  useEffect(() => {
    if (children === text) return;
    const t = setTimeout(() => setText(children), 250);
    return () => clearTimeout(t);
  }, [children, text]);
  return (
    <div id="status-bar" role="status">
      <p id="status-bar-text" className={text !== children ? 'hide-statusbar' : ''}>
        {text}
      </p>
    </div>
  );
}
