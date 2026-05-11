import { initTheme, toggleTheme } from '../theme/theme.js';
/* ================================================================
   company.js  —  Theme, market status, profile data & chart
   ================================================================ */

'use strict';

// Shared state — also consumed by news.js
let currentStockCode = null;

// /* ----------------------------------------------------------------
//    THEME
// ---------------------------------------------------------------- */
// function toggleTheme() {
//   const html     = document.documentElement;
//   const isLight  = html.getAttribute('data-theme') === 'light';
//   const newTheme = isLight ? 'dark' : 'light';
//   html.setAttribute('data-theme', newTheme);
//   localStorage.setItem('dse-theme', newTheme);
//   updateThemeButton(newTheme);
//   if (currentStockCode) loadTradingViewChart(currentStockCode);
// }

// function updateThemeButton(theme) {
//   const icon  = document.getElementById('theme-icon');
//   const label = document.getElementById('theme-label');
//   if (theme === 'light') { icon.textContent = '🌙'; label.textContent = 'Dark';  }
//   else                   { icon.textContent = '☀️'; label.textContent = 'Light'; }
// }

// function initTheme() {
//   const saved       = localStorage.getItem('dse-theme');
//   const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
//   const theme       = saved || (prefersDark ? 'dark' : 'light');
//   document.documentElement.setAttribute('data-theme', theme);
//   updateThemeButton(theme);
// }

/* ----------------------------------------------------------------
   LOAD PROFILE
---------------------------------------------------------------- */
async function loadProfile() {
  const params = new URLSearchParams(window.location.search);
  const code   = params.get('code');

  if (!code) {
    document.getElementById('profile-loading').innerHTML =
      '<p style="color:var(--loss)">No company code specified. <a href="/" style="color:var(--accent)">Go back</a></p>';
    return;
  }

  document.title = `${code} — DSE Company Profile`;

  try {
    const res = await fetch('http://localhost:3000/api/stocks');
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    const { stocks } = await res.json();
    const s = stocks.find(x => x.code === code.toUpperCase());

    if (!s) {
      document.getElementById('profile-loading').innerHTML =
        `<p style="color:var(--loss)">Company "<strong>${code}</strong>" not found.
         <a href="/" style="color:var(--accent)">Go back</a></p>`;
      return;
    }

    populateProfile(s);
    document.getElementById('profile-loading').style.display = 'none';
    document.getElementById('profile-body').style.display    = 'block';
    loadNewsLinks(s.code);   // defined in news.js

  } catch (err) {
    document.getElementById('profile-loading').innerHTML =
      `<p style="color:var(--loss)">Failed to load data: ${err.message}<br><br>
       <a href="/" style="color:var(--accent)">← Go back to Market</a></p>`;
  }
}

/* ----------------------------------------------------------------
   POPULATE PROFILE DOM
---------------------------------------------------------------- */
function populateProfile(s) {
  const fmt    = n => n.toLocaleString('en-BD', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  const fmtVol = n => n >= 1_000_000 ? (n / 1_000_000).toFixed(2) + 'M'
                    : n >= 1_000      ? (n / 1_000).toFixed(1)     + 'K'
                    : n.toLocaleString();

  const dir  = s.change > 0 ? 'up' : s.change < 0 ? 'dn' : 'fl';
  const sign = s.change > 0 ? '+' : '';
  const pct  = s.ycp ? ((s.change / s.ycp) * 100).toFixed(2) : '0.00';

  // Hero
  document.getElementById('p-code').textContent  = s.code;
  document.getElementById('p-code2').textContent = s.code;
  document.getElementById('p-name').textContent  = s.name;
  document.getElementById('p-ltp').textContent   = '৳ ' + fmt(s.ltp);
  const chgEl = document.getElementById('p-change');
  chgEl.textContent = `${sign}${fmt(s.change)} (${sign}${pct}%)`;
  chgEl.className   = `price-change-big ${dir}`;

  // Stats
  document.getElementById('p-high').textContent   = s.high  ? '৳ ' + fmt(s.high)  : '—';
  document.getElementById('p-low').textContent    = s.low   ? '৳ ' + fmt(s.low)   : '—';
  document.getElementById('p-close').textContent  = s.close ? '৳ ' + fmt(s.close) : '—';
  document.getElementById('p-volume').textContent = fmtVol(s.volume);

  // Range bar
  if (s.high && s.low && s.high !== s.low) {
    const p = ((s.ltp - s.low) / (s.high - s.low)) * 100;
    document.getElementById('p-range-low').textContent  = '৳ ' + fmt(s.low);
    document.getElementById('p-range-high').textContent = '৳ ' + fmt(s.high);
    setTimeout(() => {
      document.getElementById('p-range-fill').style.width = p + '%';
      document.getElementById('p-range-dot').style.left   = p + '%';
    }, 100);
  }

  // DSE external link
  document.getElementById('p-dse-link').href =
    `https://www.dsebd.org/displayCompany.php?name=${encodeURIComponent(s.code)}`;

  // Detail table
  document.getElementById('d-code').textContent   = s.code;
  document.getElementById('d-name').textContent   = s.name;
  document.getElementById('d-ltp').textContent    = '৳ ' + fmt(s.ltp);
  document.getElementById('d-ycp').textContent    = s.ycp   ? '৳ ' + fmt(s.ycp)   : '—';
  document.getElementById('d-high').textContent   = s.high  ? '৳ ' + fmt(s.high)  : '—';
  document.getElementById('d-low').textContent    = s.low   ? '৳ ' + fmt(s.low)   : '—';
  document.getElementById('d-close').textContent  = s.close ? '৳ ' + fmt(s.close) : '—';
  document.getElementById('d-volume').textContent = fmtVol(s.volume);
  const dChg = document.getElementById('d-change');
  dChg.textContent = `${sign}${fmt(s.change)} (${sign}${pct}%)`;
  dChg.style.color = dir === 'up' ? 'var(--gain)' : dir === 'dn' ? 'var(--loss)' : 'var(--neutral)';

  // Chart
  currentStockCode = s.code;
  loadTradingViewChart(s.code);
  if (window.initFinancials) window.initFinancials(s.code);
}

/* ----------------------------------------------------------------
   TRADINGVIEW CHART
---------------------------------------------------------------- */
function loadTradingViewChart(code) {
  const theme     = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  const symbol    = `DSEBD:${code}`;
  const container = document.getElementById('tv-chart-container');

  document.getElementById('tv-symbol-label').textContent = symbol;

  const config = {
    autosize: true,
    symbol,
    interval: 'D',
    timezone: 'Asia/Dhaka',
    theme,
    style: '1',
    locale: 'en',
    backgroundColor: theme === 'dark' ? '#161b24' : '#ffffff',
    gridColor:       theme === 'dark' ? 'rgba(31,39,53,0.6)' : 'rgba(208,217,230,0.5)',
    withdateranges:     true,
    range:              '12M',
    hide_side_toolbar:  false,
    allow_symbol_change: false,
    save_image:  false,
    calendar:    false,
    studies: ['MASimple@tv-basicstudies', 'Volume@tv-basicstudies'],
    support_host: 'https://www.tradingview.com',
  };

  container.innerHTML = `
    <div class="tradingview-widget-container" style="height:100%;width:100%">
      <div class="tradingview-widget-container__widget" style="height:calc(100% - 32px);width:100%"></div>
      <div class="tradingview-widget-copyright">
        <a href="https://www.tradingview.com/" rel="noopener nofollow" target="_blank">
          <span style="font-family:monospace;font-size:10px;color:var(--text-muted)">
            Track all markets on TradingView
          </span>
        </a>
      </div>
    </div>`;

  const script = document.createElement('script');
  script.type  = 'text/javascript';
  script.src   = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
  script.async = true;
  script.textContent = JSON.stringify(config);
  container.querySelector('.tradingview-widget-container').appendChild(script);
}

/* ----------------------------------------------------------------
   INIT
---------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  document
  .getElementById('theme-toggle-btn')
  .addEventListener('click', () => {
    toggleTheme(() => {
      if (currentStockCode) {
        loadTradingViewChart(currentStockCode);
      }
    });
  });
  loadProfile();
});
