'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Sheet } from '@jackdaw/ui';

/** Registers the service worker (production only, so dev never serves stale assets). */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch(() => {});
  }, []);
  return null;
}

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const noSubscribe = () => () => {};
const installed = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
const iosSafari = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);

/**
 * "Install the app" on the home page: the browser's own install prompt where there is one
 * (Chrome, Edge, Android), and the Add to Home Screen steps on an iPhone or iPad. Hidden once
 * Jackdaw is running as an installed app.
 */
export function InstallButton({ className = 'home-link' }: { className?: string }) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [howTo, setHowTo] = useState(false);
  const isInstalled = useSyncExternalStore(noSubscribe, installed, () => true);
  const isIos = useSyncExternalStore(noSubscribe, iosSafari, () => false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => setPrompt(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (isInstalled || (!prompt && !isIos)) return null;

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={async () => {
          if (!prompt) return setHowTo(true);
          await prompt.prompt();
          await prompt.userChoice;
          setPrompt(null);
        }}
      >
        Install the app
      </button>
      <Sheet open={howTo} onClose={() => setHowTo(false)} title="Install Jackdaw">
        <ol className="install-steps">
          <li>
            Tap <b>Share</b> at the bottom of Safari (the square with an arrow).
          </li>
          <li>
            Scroll down and tap <b>Add to Home Screen</b>.
          </li>
          <li>
            Tap <b>Add</b>. Jackdaw opens full screen from your home screen, like an app.
          </li>
        </ol>
      </Sheet>
    </>
  );
}
