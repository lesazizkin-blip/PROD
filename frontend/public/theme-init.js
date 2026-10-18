// Runs before the application and its styles, so a saved dark theme starts dark.
(function () {
  var preference = 'system';
  try {
    var saved = localStorage.getItem('movermate.theme.v1');
    if (saved === 'light' || saved === 'dark') preference = saved;
  } catch { /* Storage may be unavailable. */ }
  var dark = preference === 'dark' || (preference === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#171a17' : '#f4f0e7');
})();
