import type { MetadataRoute } from 'next';

// Colours mirror the dark look's table and ink in packages/ui/src/tokens.css (the icon's own
// colours); a manifest can't read CSS custom properties.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Jackdaw Games',
    short_name: 'Jackdaw',
    description:
      'One lobby for the whole game night. Everyone plays on their own phone; a TV can show the table.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#1c1e20',
    theme_color: '#1c1e20',
    categories: ['games', 'entertainment'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
    shortcuts: [
      {
        name: 'Show a lobby on a TV',
        short_name: 'TV',
        url: '/tv',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
    ],
  };
}
