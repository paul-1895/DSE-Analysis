import { initTheme, toggleTheme } from '../theme/theme.js';
/* ================================================================
   company.js  —  Theme, market status, profile data & chart
   ================================================================ */

'use strict';

// Shared state — also consumed by news.js
window.currentStockCode = null;

const API     = 'http://localhost:3000';
const FIN_API = `${API}/api/financials`;

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
    const res = await fetch(`${API}/api/stocks`);
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

    // Kick off enriched details in background (non-blocking)
    fetchAndRenderDetails(s.code, s.ltp);

  } catch (err) {
    document.getElementById('profile-loading').innerHTML =
      `<p style="color:var(--loss)">Failed to load data: ${err.message}<br><br>
       <a href="/" style="color:var(--accent)">← Go back to Market</a></p>`;
  }
}

/* ----------------------------------------------------------------
   FETCH ENRICHED DETAILS + RENDER STATS GRID
   Runs in parallel: scraped company page + local EPS data
---------------------------------------------------------------- */
async function fetchAndRenderDetails(code, ltp) {
  // Show loading skeleton on the stats grid
  const grid = document.getElementById('company-detail-stats');
  if (grid) {
    grid.innerHTML = Array(15).fill(0).map(() => `
      <div class="cds-card cds-card--loading">
        <div class="cds-skeleton cds-skeleton--label"></div>
        <div class="cds-skeleton cds-skeleton--value"></div>
      </div>`).join('');
  }

  const [detailsResult, finResult] = await Promise.allSettled([
    fetch(`${API}/api/company-details/${code}`).then(r => r.json()),
    fetch(`${FIN_API}/${code}`).then(r => r.json()),
  ]);

  const d       = detailsResult.status === 'fulfilled' ? detailsResult.value : {};
  const finData = finResult.status    === 'fulfilled' ? finResult.value    : {};

  // ── P/E from last 4 quarters EPS ──────────────────────────────
  const QORDER   = { Q1: 0, Q2: 1, Q3: 2, Q4: 3 };
  const epsArr   = (finData.eps || []).sort(
    (a, b) => b.year - a.year || (QORDER[b.quarter] ?? 0) - (QORDER[a.quarter] ?? 0)
  );
  const last4Eps = epsArr.slice(0, 4);
  const totalEps = last4Eps.reduce((s, e) => s + (parseFloat(e.value) || 0), 0);
  const localPE  = totalEps > 0 ? (ltp / totalEps).toFixed(2) : null;

  // ── Derived values ─────────────────────────────────────────────
  const numOf = str => parseFloat((str || '').toString().replace(/[^0-9.]/g, '')) || null;

  const totalShares = numOf(d.totalShares);
  const marketCap   = totalShares ? totalShares * ltp : null;

  // ── Build stat definitions ─────────────────────────────────────
  const stats = [
    // Row A — Price / valuation
    { label: 'LTP',            value: `৳ ${fmtN(ltp)}`,                         accent: ''       },
    { label: 'P/E RATIO',      value: localPE || d.pe || null,                    accent: ''       },
    { label: 'EPS (4 QTR)',    value: totalEps > 0 ? `৳ ${totalEps.toFixed(2)}` : fmtScraped(d.eps, '৳ '), accent: '' },
    { label: 'MARKET CAP',     value: marketCap ? `৳ ${fmtLarge(marketCap)}` : null, accent: ''  },

    // Row B — 52-week range
    { label: '52W HIGH',       value: d.weekHigh52  ? `৳ ${d.weekHigh52}`  : null, accent: 'gain' },
    { label: '52W LOW',        value: d.weekLow52   ? `৳ ${d.weekLow52}`   : null, accent: 'loss' },
    { label: 'BETA',           value: d.beta || null,                               accent: ''     },
    { label: 'DIVIDEND YIELD', value: d.dividendYield ? `${d.dividendYield}%` : null, accent: ''  },

    // Row C — Dividends / NAV
    { label: 'CASH DIVIDEND',  value: d.cashDividend  ? `${d.cashDividend}%`  : null, accent: 'gain' },
    { label: 'STOCK DIVIDEND', value: d.stockDividend ? `${d.stockDividend}%` : null, accent: 'gain' },
    { label: 'NAV / SHARE',    value: d.nav ? `৳ ${d.nav}` : null,                    accent: ''      },
    { label: 'TOTAL SHARES',   value: totalShares ? fmtLarge(totalShares) : null,     accent: ''      },

    // Row D — Capital structure / debt
    { label: 'PAID UP CAP',    value: d.paidUpCapital     ? `৳ ${fmtLarge(numOf(d.paidUpCapital))}` : null,     accent: '' },
    { label: 'AUTHORIZED CAP', value: d.authorizedCapital ? `৳ ${fmtLarge(numOf(d.authorizedCapital))}` : null, accent: '' },
    { label: 'SHORT TERM LOAN',value: d.shortTermLoan     ? `৳ ${fmtLarge(numOf(d.shortTermLoan))}` : null,     accent: 'loss' },
    { label: 'LONG TERM LOAN', value: d.longTermLoan      ? `৳ ${fmtLarge(numOf(d.longTermLoan))}` : null,      accent: 'loss' },
  ];

  renderStatsGrid(stats);
}

/* ----------------------------------------------------------------
   RENDER — stat grid cards
---------------------------------------------------------------- */
function renderStatsGrid(stats) {
  const grid = document.getElementById('company-detail-stats');
  if (!grid) return;

  grid.innerHTML = stats.map(s => {
    const val = s.value;
    const display = (val !== null && val !== undefined && val !== '' && val !== '0' && val !== '0.00')
      ? val : '—';
    const accentClass = s.accent ? ` cds-val--${s.accent}` : '';
    const emptyClass  = display === '—' ? ' cds-card--empty' : '';
    return `
      <div class="cds-card${emptyClass}">
        <div class="cds-label">${s.label}</div>
        <div class="cds-val${accentClass}">${display}</div>
      </div>`;
  }).join('');
}

/* ----------------------------------------------------------------
   FORMAT HELPERS
---------------------------------------------------------------- */
function fmtN(n, dec = 2) {
  if (n == null || isNaN(n)) return '—';
  return parseFloat(n).toLocaleString('en-BD', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtLarge(n) {
  if (!n || isNaN(n)) return null;
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toFixed(2);
}

function fmtScraped(val, prefix = '') {
  if (!val) return null;
  const n = parseFloat(val.toString().replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? val : `${prefix}${n.toFixed(2)}`;
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
  // Category badge colours: A=green, B=amber, Z=muted
  const catEl = document.getElementById('p-category');
  const cat   = s.category || 'Z';
  catEl.textContent = cat;
  catEl.style.color = cat === 'A' ? 'var(--gain)' : cat === 'B' ? '#d29922' : 'var(--text-muted)';
  document.getElementById('p-ltp').textContent   = '৳ ' + fmt(s.ltp);
  const chgEl = document.getElementById('p-change');
  chgEl.textContent = `${sign}${fmt(s.change)} (${sign}${pct}%)`;
  chgEl.className   = `price-change-big ${dir}`;

  // Top stats (4-card row kept for at-a-glance)
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

  // Detail summary table (compact, below the big grid)
  document.getElementById('d-code').textContent   = s.code;
  document.getElementById('d-category').textContent = s.category || 'Z';
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
  window.currentStockCode = s.code;
  loadTradingViewChart(s.code);
  if (window.initFinancials) window.initFinancials(s.code);
  if (window.initSRLevels)   window.initSRLevels(s.code, s.ltp);
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
        if (window.currentStockCode) loadTradingViewChart(window.currentStockCode);
      });
    });
  loadProfile();
});