// ─── THEME ────────────────────────────────────────────────────────────────────
export function toggleTheme() {
  const html = document.documentElement;
  const isLight = html.getAttribute('data-theme') === 'light';
  const newTheme = isLight ? 'dark' : 'light';
  html.setAttribute('data-theme', newTheme);
  localStorage.setItem('dse-theme', newTheme);
  updateThemeButton(newTheme);
}

function updateThemeButton(theme) {
  const icon = document.getElementById('theme-icon');
  const label = document.getElementById('theme-label');
  if (theme === 'light') {
    icon.textContent = '🌙';
    label.textContent = 'Dark';
  } else {
    icon.textContent = '☀️';
    label.textContent = 'Light';
  }
}

export function initTheme() {
  const saved = localStorage.getItem('dse-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeButton(theme);
}