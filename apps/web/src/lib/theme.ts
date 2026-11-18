export const THEME_STORAGE_KEY = 'futuria-theme';
export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

/** Dark is the brand look; light is one tap away in the header. */
export const DEFAULT_THEME: Theme = 'dark';

/**
 * Runs in <head> before first paint: applies the saved theme (dark by default) so there is no
 * flash of the wrong theme, and marks the page as scripted (`data-js`) so scroll reveals may
 * hide content until it is in view. A value saved by the older three-way toggle ("system")
 * still follows the system setting. Keep it tiny and dependency-free; it is inlined as a string.
 */
export const THEME_SCRIPT = `(function(){var h=document.documentElement;h.setAttribute("data-js","");try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var l=t==="light"||(t==="system"&&window.matchMedia("(prefers-color-scheme: light)").matches);h.setAttribute("data-theme",l?"light":"dark")}catch(e){h.setAttribute("data-theme","${DEFAULT_THEME}")}})()`;

/** The theme on screen right now (set by the inline script or the toggle). */
export function currentTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  // Colours cross-fade briefly instead of snapping (skipped under reduced motion).
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    root.setAttribute('data-theme-switching', '');
    window.setTimeout(() => root.removeAttribute('data-theme-switching'), 400);
  }
  root.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage blocked (private mode): the theme still applies for this page view.
  }
}
