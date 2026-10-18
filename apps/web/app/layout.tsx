import type { Metadata, Viewport } from 'next';
import {
  Alegreya_Sans,
  Big_Shoulders,
  Germania_One,
  Grenze,
  Grenze_Gotisch,
  Montserrat,
} from 'next/font/google';
import '@jackdaw/ui/tokens.css';
import '@jackdaw/ui/kit.css';
import './globals.css';
import { ServiceWorker } from './pwa';

const display = Grenze_Gotisch({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--ff-display',
});
const code = Grenze({ subsets: ['latin'], weight: ['700', '800'], variable: '--ff-code' });
const plaque = Big_Shoulders({
  subsets: ['latin'],
  weight: ['600', '700', '800', '900'],
  variable: '--ff-plaque',
});
const body = Alegreya_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '700', '800'],
  variable: '--ff-body',
});

// Secret Hitler's own fonts, as on secret-hitler.online (loaded only where they're used).
const shoHeader = Germania_One({
  subsets: ['latin'],
  weight: '400',
  variable: '--ff-sho-header',
  preload: false,
});
const shoText = Montserrat({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--ff-sho-text',
  preload: false,
});

export const metadata: Metadata = {
  title: { default: 'Jackdaw Games', template: '%s · Jackdaw Games' },
  description:
    'One lobby for the whole game night. Everyone plays on their own phone; a TV can show the table.',
  icons: { icon: '/icon.svg', apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'Jackdaw', statusBarStyle: 'black' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#cfcecb' },
    { media: '(prefers-color-scheme: dark)', color: '#1c1e20' },
  ],
};

// Applies a remembered light/dark choice before first paint, so the page never flashes.
const themeScript = `try{var t=localStorage.getItem('jackdaw:theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${code.variable} ${plaque.variable} ${body.variable} ${shoHeader.variable} ${shoText.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="jd-table">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
