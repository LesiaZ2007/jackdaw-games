'use client';

import { useState } from 'react';

/** secret-hitler.online's event-bar/EventBar.js: the black band across the screen. */
export default function EventBar({
  message = 'CHANCELLOR NOMINATION',
  show = true,
}: {
  message?: string;
  show?: boolean;
}) {
  const [inStartingState, setInStartingState] = useState(true);
  if (show && inStartingState) setInStartingState(false);
  const cls = inStartingState ? 'start-eventbar' : show ? 'appear-eventbar' : 'disappear-eventbar';
  return (
    <div id="event-bar" className={cls} aria-hidden={!show}>
      <div id="bar-background" className={cls} />
      <h1 id="event-bar-text" className={cls}>
        {message}
      </h1>
    </div>
  );
}
