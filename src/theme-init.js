try {
  const t = localStorage.getItem('traehop-theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch {
  /* ignore */
}
