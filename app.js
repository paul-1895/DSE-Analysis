/* ============================================
   DSE LIVE MARKET TRACKER — APP.JS
   Fetches live data from DSE (dsebd.org)
   via CORS proxies with fallback chain
   ============================================ */

// ---- STATE ----
let allStocks   = [];
let filtered    = [];
let currentSort = { key: 'code', dir: 'asc' };
let activeFilter = 'all';

// ---- DSE API (local backend) ----
const API_URL = 'http://localhost:3000/api/stocks';

// ---- LOAD DATA ----
async function loadData() {
  setLoading(true);
  setError(null);
  setRefreshSpinning(true);

  try {
    const res = await fetch(API_URL);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server returned HTTP ${res.status}`);
    }

    const { stocks, count, timestamp, cached, stale } = await res.json();

    if (!stocks || !stocks.length) throw new Error('No stock data returned from server.');

    allStocks = stocks;
    filtered  = [...stocks];

    applyFilterAndSort();
    buildTicker(stocks);
    updateSummary(stocks);
    updateMeta(count, timestamp, cached, stale);

  } catch (err) {
    console.error(err);
    if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
      setError('Cannot reach the local server. Make sure you ran "node server.js" in your terminal first, then refresh this page.');
    } else {
      setError(err.message);
    }
  } finally {
    setLoading(false);
    setRefreshSpinning(false);
  }
}




// ---- FILTER & SORT PIPELINE ----
function applyFilterAndSort() {
  const q = (document.getElementById('search-input').value || '').toLowerCase();

  // 1. Filter by active category
  let base = allStocks.filter(s => {
    if (activeFilter === 'gainer')  return s.change > 0;
    if (activeFilter === 'loser')   return s.change < 0;
    if (activeFilter === 'neutral') return s.change === 0;
    return true;
  });

  // 2. Search filter
  if (q) {
    base = base.filter(s =>
      s.code.toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q)
    );
  }

  filtered = base;
  sortFiltered();
  renderTable();
}

function filterTable()  { applyFilterAndSort(); }
function setFilter(f, btn) {
  activeFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  applyFilterAndSort();
}

function sortTable() {
  const val = document.getElementById('sort-select').value;
  const [key, dir] = val.split('-');
  currentSort = { key, dir };
  sortFiltered();
  renderTable();
}

// Column header click sort toggle
function toggleSort(key) {
  if (currentSort.key === key) {
    currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    currentSort = { key, dir: 'asc' };
  }
  updateSortArrows();
  sortFiltered();
  renderTable();
}

function updateSortArrows() {
  const cols = ['code','name','ltp','high','low','close','ycp','change','volume'];
  cols.forEach(c => {
    const el = document.getElementById('sort-' + c);
    if (!el) return;
    if (currentSort.key === c) {
      el.textContent = currentSort.dir === 'asc' ? ' ↑' : ' ↓';
    } else {
      el.textContent = '';
    }
  });
}

function sortFiltered() {
  const { key, dir } = currentSort;
  const mult = dir === 'asc' ? 1 : -1;

  filtered.sort((a, b) => {
    let av = a[key] ?? '', bv = b[key] ?? '';
    if (typeof av === 'string') return mult * av.localeCompare(bv);
    return mult * (av - bv);
  });

  updateSortArrows();
}

// ---- RENDER TABLE ----
function renderTable() {
  const tbody = document.getElementById('stocks-tbody');
  const table = document.getElementById('stocks-table');
  const footer = document.getElementById('table-footer');

  table.classList.remove('hidden');

  const fmt = n => n.toLocaleString('en-BD', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  const fmtVol = n => {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
    return n.toString();
  };

  const rows = filtered.map((s, i) => {
    const chgDir = s.change > 0 ? 'up' : s.change < 0 ? 'dn' : 'fl';
    const chgSign = s.change > 0 ? '+' : '';
    const pct = s.ycp ? ((s.change / s.ycp) * 100).toFixed(2) : '0.00';
    const pctSign = s.change > 0 ? '+' : '';

    return `
      <tr>
        <td class="td-rank">${i + 1}</td>
        <td class="td-code">${escHtml(s.code)}</td>
        <td class="td-name" title="${escHtml(s.name)}">${escHtml(s.name)}</td>
        <td class="td-ltp td-num">৳ ${fmt(s.ltp)}</td>
        <td class="td-num">${s.high  ? fmt(s.high)  : '—'}</td>
        <td class="td-num">${s.low   ? fmt(s.low)   : '—'}</td>
        <td class="td-num">${s.close ? fmt(s.close) : '—'}</td>
        <td class="td-num">${s.ycp   ? fmt(s.ycp)   : '—'}</td>
        <td class="td-change ${chgDir}">
          <span class="change-pill ${chgDir}">
            ${chgSign}${fmt(s.change)} (${pctSign}${pct}%)
          </span>
        </td>
        <td class="td-num">${fmtVol(s.volume)}</td>
      </tr>`;
  }).join('');

  tbody.innerHTML = rows || '<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--text-muted);font-family:var(--mono)">No results found</td></tr>';

  footer.textContent = `Showing ${filtered.length} of ${allStocks.length} securities`;
}

// ---- TICKER TAPE ----
function buildTicker(stocks) {
  const track = document.getElementById('ticker-track');
  // Pick a representative sample (all, sorted by volume desc → most active first)
  const sorted = [...stocks].sort((a, b) => b.volume - a.volume);
  const items  = [...sorted, ...sorted]; // duplicate for seamless loop

  track.innerHTML = items.map(s => {
    const dir   = s.change > 0 ? 'up' : s.change < 0 ? 'dn' : 'fl';
    const sign  = s.change > 0 ? '+' : '';
    const pct   = s.ycp ? ((s.change / s.ycp) * 100).toFixed(2) : '0.00';
    return `
      <span class="ticker-item">
        <span class="ticker-code">${escHtml(s.code)}</span>
        <span class="ticker-price">৳${s.ltp.toFixed(1)}</span>
        <span class="ticker-chg ${dir}">${sign}${s.change.toFixed(1)} (${sign}${pct}%)</span>
      </span>`;
  }).join('');

  // Reset animation so it restarts cleanly
  track.style.animation = 'none';
  void track.offsetWidth;
  track.style.animation = '';
}

// ---- SUMMARY CARDS ----
function updateSummary(stocks) {
  const gainers  = stocks.filter(s => s.change > 0);
  const losers   = stocks.filter(s => s.change < 0);
  const neutral  = stocks.filter(s => s.change === 0);
  const sorted   = [...stocks].sort((a, b) => b.ltp - a.ltp);
  const highest  = sorted[0];
  const lowest   = sorted[sorted.length - 1];

  document.getElementById('sc-gainers').textContent  = gainers.length;
  document.getElementById('sc-losers').textContent   = losers.length;
  document.getElementById('sc-unchanged').textContent = neutral.length;
  document.getElementById('sc-highest').textContent  = highest ? `${highest.code} ৳${highest.ltp.toLocaleString()}` : '—';
  document.getElementById('sc-lowest').textContent   = lowest  ? `${lowest.code} ৳${lowest.ltp.toFixed(1)}` : '—';
}

// ---- METADATA ----
function updateMeta(count, timestamp, cached, stale) {
  document.getElementById('total-count').textContent = count;

  const ts = timestamp ? new Date(timestamp) : new Date();
  let timeStr = ts.toLocaleTimeString('en-BD', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  if (stale)  timeStr += ' (stale)';
  if (cached) timeStr += ' ✓';
  document.getElementById('last-updated').textContent = timeStr;

  // Determine market status (DSE: Sun–Thu 10:00–14:30 BST)
  const bst = new Date(ts.toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }));
  const day = bst.getDay(); // 0=Sun,1=Mon,...,6=Sat
  const mins = bst.getHours() * 60 + bst.getMinutes();
  const isWeekday = day >= 0 && day <= 4; // Sun(0) - Thu(4)
  const inSession = mins >= 600 && mins <= 870; // 10:00–14:30

  const statusEl = document.getElementById('market-status');
  if (isWeekday && inSession) {
    statusEl.textContent = '● OPEN';
    statusEl.style.color = 'var(--gain)';
  } else {
    statusEl.textContent = '○ CLOSED';
    statusEl.style.color = 'var(--loss)';
  }
}

// ---- UI HELPERS ----
function setLoading(on) {
  document.getElementById('loading-state').classList.toggle('hidden', !on);
  if (!on && document.getElementById('error-state').classList.contains('hidden')) {
    document.getElementById('stocks-table').classList.remove('hidden');
  }
}

function setError(msg) {
  const el  = document.getElementById('error-state');
  const msgEl = document.getElementById('error-msg');
  if (msg) {
    el.classList.remove('hidden');
    document.getElementById('stocks-table').classList.add('hidden');
    msgEl.textContent = msg;
  } else {
    el.classList.add('hidden');
  }
}

function setRefreshSpinning(on) {
  document.getElementById('refresh-btn').classList.toggle('spinning', on);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---- THEME TOGGLE ----
function toggleTheme() {
  const html = document.documentElement;
  const isLight = html.getAttribute('data-theme') === 'light';
  const newTheme = isLight ? 'dark' : 'light';
  html.setAttribute('data-theme', newTheme);
  localStorage.setItem('dse-theme', newTheme);
  updateThemeButton(newTheme);
}

function updateThemeButton(theme) {
  const icon  = document.getElementById('theme-icon');
  const label = document.getElementById('theme-label');
  if (theme === 'light') {
    icon.textContent  = '🌙';
    label.textContent = 'Dark';
  } else {
    icon.textContent  = '☀️';
    label.textContent = 'Light';
  }
}

function initTheme() {
  const saved = localStorage.getItem('dse-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeButton(theme);
}

// ---- INIT ----
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadData();
});