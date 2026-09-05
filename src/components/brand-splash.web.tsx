/**
 * Nothing on web.
 *
 * There is no native splash to hand off from — the browser has already painted
 * — so an overlay here would be a brand screen the reader did not need to see.
 */
export function AnimatedSplashOverlay() {
  return null;
}

export const SPLASH_BACKGROUND = { light: '#F7F4EA', dark: '#171A17' };
export const SPLASH_IMAGE_WIDTH = 124;
