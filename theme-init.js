/* DTMFusion - MIT (c) 2026 IPUSIRON. */
/*
 * Decide the theme before the first paint. Load synchronously in <head> after style.css.
 * style.css is dark by default and switches to light with data-theme="light" on <html>.
 * A saved choice (localStorage dtmfusion.theme) wins; otherwise follow the OS setting.
 * app.js reads the attribute set here and only keeps the toggle and saving.
 */
(function (global) {
  'use strict';
  let saved = null;
  try { saved = global.localStorage.getItem('dtmfusion.theme'); } catch (_) { /* Private browsing may disable storage. */ }
  const prefersDark = !!(global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches);
  const theme = saved === 'light' || saved === 'dark' ? saved : (prefersDark ? 'dark' : 'light');
  global.document.documentElement.setAttribute('data-theme', theme);
})(typeof window !== 'undefined' ? window : globalThis);
