// Detect base path for GitHub Pages (repo served under /Mk-studio/)
const base = document.querySelector('meta[name="base-path"]')?.content || '';

document.getElementById('top').outerHTML = `<header class="top"><a class="logo" href="${base}/"><svg width="26" height="20" fill="#ffb020"><rect y="9" width="5" height="11"/><rect x="7" y="2" width="5" height="18"/><rect x="14" y="6" width="5" height="14"/><rect x="21" y="12" width="5" height="8"/></svg>Studio</a><nav><a href="${base}/mix.html">Mix</a><a href="${base}/download.html">Download</a><a href="${base}/how.html">How it works</a></nav></header>`;
document.querySelectorAll('.top nav a').forEach(a => {
  const aPath = a.pathname.replace(/\.html$/, '');
  const locPath = location.pathname.replace(/\.html$/, '');
  if (aPath === locPath) a.classList.add('on');
});
const f = document.getElementById('foot');
if (f) f.innerHTML = 'Audio stays in your browser. Only download content you own or have permission to save.';
