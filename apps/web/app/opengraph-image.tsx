import { ImageResponse } from 'next/og';

export const alt = 'Jackdaw Games: a compendium of games';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// An image can't read CSS custom properties, so these mirror the day look in
// packages/ui/src/tokens.css (--table, --ink, --ink-2).
const TABLE = '#cfcecb';
const INK = '#1d1d1c';
const INK_2 = '#4a4947';

/** The link preview: the wordmark and tagline on the table, inside a double ink frame. */
export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        background: TABLE,
        padding: 36,
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          border: `6px solid ${INK}`,
          padding: 14,
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            border: `2px solid ${INK}`,
            color: INK,
            fontFamily: 'Georgia, serif',
          }}
        >
          <div style={{ fontSize: 200, fontWeight: 800, lineHeight: 1 }}>Jackdaw</div>
          <div
            style={{
              marginTop: 24,
              fontSize: 48,
              letterSpacing: 6,
              textTransform: 'uppercase',
              color: INK_2,
            }}
          >
            A compendium of games
          </div>
        </div>
      </div>
    </div>,
    size,
  );
}
