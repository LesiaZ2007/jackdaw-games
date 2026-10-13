import { expect, test } from '@playwright/test';

// Every page must fit at the four design widths: no sideways scrolling. Screenshots are
// attached to the report so layout changes can be reviewed by eye.
const WIDTHS = [
  [375, 812],
  [768, 1024],
  [1280, 800],
  [1920, 1080],
] as const;
const ROUTES = ['/', '/games', '/games/rps', '/about', '/tv'];

for (const route of ROUTES) {
  for (const [width, height] of WIDTHS) {
    for (const scheme of ['light', 'dark'] as const) {
      test(`${route} fits at ${width}px (${scheme})`, async ({ page }, info) => {
        await page.emulateMedia({ colorScheme: scheme });
        await page.setViewportSize({ width, height });
        await page.goto(route);
        await page.waitForLoadState('networkidle');
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(overflow, 'page scrolls sideways').toBeLessThanOrEqual(0);
        await info.attach(`${route}-${width}-${scheme}`, {
          body: await page.screenshot(),
          contentType: 'image/png',
        });
      });
    }
  }
}
