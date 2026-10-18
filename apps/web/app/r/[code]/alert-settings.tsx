'use client';

import { useEffect, useState } from 'react';
import { Plaque } from '@jackdaw/ui';
import {
  chime,
  pushState,
  setAlertPrefs,
  turnOffPush,
  turnOnPush,
  useAlertPrefs,
  type PushState,
} from '@/lib/alerts';

const PUSH_NOTE: Record<PushState, string> = {
  unsupported: 'This browser can’t show notifications from Jackdaw.',
  'needs-install':
    'On an iPhone or iPad, add Jackdaw to your Home Screen first (Share, then Add to Home Screen), and open it from there.',
  blocked: 'Notifications are blocked for Jackdaw. Allow them in your browser’s site settings.',
  off: 'Get a notification when it’s your move, even with your phone locked.',
  on: 'You’ll get a notification when it’s your move, even with your phone locked.',
};

/** One setting: what it is, and a plaque showing whether it's on. */
function Toggle({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="menu__toggle">
      <span>{label}</span>
      <Plaque small aria-pressed={on} onClick={() => onChange(!on)}>
        {on ? 'On' : 'Off'}
      </Plaque>
    </div>
  );
}

/** Your move: a chime, a buzz and notifications, set per device. */
export function AlertSettings({ code }: { code: string }) {
  const prefs = useAlertPrefs();
  const [push, setPush] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const canBuzz = typeof navigator !== 'undefined' && 'vibrate' in navigator;

  useEffect(() => {
    let live = true;
    void pushState(code).then((s) => live && setPush(s));
    return () => {
      live = false;
    };
  }, [code]);

  return (
    <section className="menu__block">
      <h3 className="jd-label">When it&rsquo;s your move</h3>
      <Toggle
        label="Play a chime"
        on={prefs.sound}
        onChange={(sound) => {
          setAlertPrefs({ sound });
          if (sound) chime();
        }}
      />
      {canBuzz && (
        <Toggle
          label="Buzz the phone"
          on={prefs.buzz}
          onChange={(buzz) => {
            setAlertPrefs({ buzz });
            if (buzz) navigator.vibrate(90);
          }}
        />
      )}
      {push && push !== 'unsupported' && (
        <>
          {(push === 'on' || push === 'off') && (
            <Toggle
              label="Notifications"
              on={push === 'on'}
              onChange={async (on) => {
                if (busy) return;
                setBusy(true);
                try {
                  setPush(await (on ? turnOnPush(code) : turnOffPush(code)));
                } catch {
                  setPush('off');
                } finally {
                  setBusy(false);
                }
              }}
            />
          )}
          <p>{PUSH_NOTE[push]}</p>
        </>
      )}
    </section>
  );
}
