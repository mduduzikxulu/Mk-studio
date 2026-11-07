/**
 * site.js — shared code that runs on every page
 *
 * Responsibilities
 * ────────────────
 * 1. Inject the navigation header (replaces the placeholder <div id="top">).
 * 2. Highlight the active nav link.
 * 3. On the mix page, warn the user before they navigate away with unsaved work.
 * 4. Inject the footer text.
 */

'use strict';

// ── 1. Inject the header ───────────────────────────────────────────────────
// Links are relative so the site works whether it is served at the root
// (locally via app.py) or under /Mk-studio/ (GitHub Pages).
document.getElementById('top').outerHTML = `
<header class="top">
  <a class="logo" href=".">
    <svg width="26" height="20" fill="#ffb020">
      <rect y="9"   width="5" height="11"/>
      <rect x="7"   y="2"  width="5" height="18"/>
      <rect x="14"  y="6"  width="5" height="14"/>
      <rect x="21"  y="12" width="5" height="8"/>
    </svg>
    Studio
  </a>
  <nav>
    <a href="mix.html">Mix</a>
    <a href="download.html">Download</a>
    <a href="how.html">How it works</a>
  </nav>
</header>`;

// ── 2. Highlight the active nav link ──────────────────────────────────────
// Strip .html suffixes from both sides before comparing so that
// /mix.html and /mix both match the same link.
document.querySelectorAll('.top nav a').forEach(link => {
  const linkPath     = link.pathname.replace(/\.html$/, '');
  const currentPath  = location.pathname.replace(/\.html$/, '');
  if (linkPath === currentPath) link.classList.add('on');
});

// ── 3. Unsaved-work guard (mix page only) ─────────────────────────────────
const isMixPage =
  location.pathname.endsWith('/mix.html') ||
  location.pathname.endsWith('/mix');

if (isMixPage) {
  /**
   * Ask the user to confirm navigation if the mix has been changed.
   * Returns true if navigation should proceed, false if it should be blocked.
   */
  function confirmLeave() {
    if (!window.__studio_dirty) return true;
    const ok = window.confirm('Leaving this page will discard your current mix. Are you sure?');
    if (ok) window.__studio_dirty = false;
    return ok;
  }

  // Intercept clicks on internal links
  document.querySelectorAll('a[href]').forEach(link => {
    const href = link.getAttribute('href');
    // Only intercept relative links — not anchors or external URLs
    if (!href || href.startsWith('#') || href.startsWith('http')) return;
    link.addEventListener('click', (event) => {
      if (!confirmLeave()) event.preventDefault();
    });
  });

  // Browser back/forward / tab close
  window.addEventListener('beforeunload', (event) => {
    if (!window.__studio_dirty) return;
    event.preventDefault();
    event.returnValue = ''; // required for Chrome to show the dialog
  });
}

// ── 4. Inject the footer ───────────────────────────────────────────────────
const footer = document.getElementById('foot');
if (footer) {
  footer.textContent =
    'Audio stays in your browser. Only download content you own or have permission to save.';
}
