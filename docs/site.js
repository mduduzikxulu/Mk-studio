// Detect base path for GitHub Pages (repo served under /Mk-studio/)
const base = document.querySelector('meta[name="base-path"]')?.content || '';

document.getElementById('top').outerHTML = `<header class="top"><a class="logo" href="${base}/"><svg width="26" height="20" fill="#ffb020"><rect y="9" width="5" height="11"/><rect x="7" y="2" width="5" height="18"/><rect x="14" y="6" width="5" height="14"/><rect x="21" y="12" width="5" height="8"/></svg>Studio</a><nav><a href="${base}/mix.html">Mix</a><a href="${base}/download.html">Download</a><a href="${base}/how.html">How it works</a></nav></header>`;
document.querySelectorAll('.top nav a').forEach(a => {
  const aPath = a.pathname.replace(/\.html$/, '');
  const locPath = location.pathname.replace(/\.html$/, '');
  if (aPath === locPath) a.classList.add('on');
});

if (location.pathname.endsWith('/mix.html') || location.pathname.endsWith('/mix')) {
  const askBeforeLeave = (target) => {
    if (!window.__studio_dirty) return true;
    const ok = window.confirm('Leaving this page will discard your current mix. Are you sure?');
    if (ok) window.__studio_dirty = false;
    return ok;
  };

  document.querySelectorAll('a[href]').forEach(link => {
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('http')) return;
    link.addEventListener('click', (event) => {
      if (!askBeforeLeave(href)) event.preventDefault();
    });
  });

  window.addEventListener('beforeunload', (event) => {
    if (!window.__studio_dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });
}

const f = document.getElementById('foot');
if (f) f.innerHTML = 'Audio stays in your browser. Only download content you own or have permission to save.';
