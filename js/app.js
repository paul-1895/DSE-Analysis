import { initTheme, toggleTheme } from '../theme/theme.js';
// ─── STATE ────────────────────────────────────────────────────────────────────
let allStocks = [];
let filteredStocks = [];
let currentFilter = 'all';
let currentSort = { key: 'code', dir: 'asc' };



// ─── MARKET STATUS ────────────────────────────────────────────────────────────
function setMarketStatus() {
  const now = new Date();
  const bst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }));
  const day = bst.getDay(); // 0=Sun … 6=Sat
  const mins = bst.getHours() * 60 + bst.getMinutes();
  const isWeekday = day >= 0 && day <= 4; // DSE: Sun–Thu
  const inSession = mins >= 600 && mins <= 870; // 10:00–14:30
  const el = document.getElementById('market-status');
  if (isWeekday && inSession) {
    el.textContent = '● OPEN';
    el.style.color = 'var(--gain)';
  } else {
    el.textContent = '○ CLOSED';
    el.style.color = 'var(--loss)';
  }
}

// ─── LOAD DATA ────────────────────────────────────────────────────────────────
async function loadData() {
  document.getElementById('loading-state').classList.remove('hidden');
  document.getElementById('error-state').classList.add('hidden');
  document.getElementById('stocks-table').classList.add('hidden');
  document.getElementById('refresh-btn').disabled = true;

  try {
    const res = await fetch('http://localhost:3000/api/stocks');
    if (!res.ok) throw new Error(`Server responded ${res.status}`);
    const { stocks, timestamp } = await res.json();

    allStocks = stocks;
    allStocksData = stocks; // expose to watchlist code in index.html

    document.getElementById('last-updated').textContent =
      new Date(timestamp).toLocaleTimeString('en-BD');
    document.getElementById('total-count').textContent = stocks.length.toLocaleString();

    buildTicker(stocks);
    updateSummary(stocks);
    applyFilterAndSort();

    document.getElementById('loading-state').classList.add('hidden');
    document.getElementById('stocks-table').classList.remove('hidden');
  } catch (err) {
    document.getElementById('loading-state').classList.add('hidden');
    document.getElementById('error-state').classList.remove('hidden');
    document.getElementById('error-msg').textContent = 'Error: ' + err.message;
  } finally {
    document.getElementById('refresh-btn').disabled = false;
  }
}

// ─── TICKER ───────────────────────────────────────────────────────────────────
function buildTicker(stocks) {
  const track = document.getElementById('ticker-track');
  const notable = stocks.filter(s => Math.abs(s.change) > 0).slice(0, 40);
  if (!notable.length) { track.textContent = 'No market movement data'; return; }

  const items = notable.map(s => {
    const dir = s.change > 0 ? 'up' : 'dn';
    const sign = s.change > 0 ? '▲' : '▼';
    return `<span class="ticker-item ${dir}"><strong>${s.code}</strong> ৳${s.ltp.toFixed(1)} <em>${sign}${Math.abs(s.change).toFixed(1)}</em></span>`;
  }).join('');

  track.innerHTML = items + items; // duplicate for seamless loop
}

// ─── SUMMARY ──────────────────────────────────────────────────────────────────
function updateSummary(stocks) {
  const gainers = stocks.filter(s => s.change > 0).length;
  const losers  = stocks.filter(s => s.change < 0).length;
  const neutral = stocks.filter(s => s.change === 0).length;
  const prices  = stocks.map(s => s.ltp).filter(Boolean);
  const highest = Math.max(...prices);
  const lowest  = Math.min(...prices);

  document.getElementById('sc-gainers').textContent   = gainers;
  document.getElementById('sc-losers').textContent    = losers;
  document.getElementById('sc-unchanged').textContent = neutral;
  document.getElementById('sc-highest').textContent   = highest ? '৳' + highest.toFixed(1) : '—';
  document.getElementById('sc-lowest').textContent    = lowest  ? '৳' + lowest.toFixed(1)  : '—';
}

// ─── FILTER ───────────────────────────────────────────────────────────────────
function setFilter(filter, btn) {
  currentFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  applyFilterAndSort();
}

function filterTable() {
  applyFilterAndSort();
}

function applyFilterAndSort() {
  const query = (document.getElementById('search-input').value || '').toLowerCase();

  filteredStocks = allStocks.filter(s => {
    const matchSearch = !query || s.code.toLowerCase().includes(query) || s.name.toLowerCase().includes(query);
    const matchFilter =
      currentFilter === 'all'     ? true :
      currentFilter === 'gainer'  ? s.change > 0 :
      currentFilter === 'loser'   ? s.change < 0 :
      currentFilter === 'neutral' ? s.change === 0 : true;
    return matchSearch && matchFilter;
  });

  sortStocks(filteredStocks);
  renderTable(filteredStocks);
}

// ─── SORT ─────────────────────────────────────────────────────────────────────
function toggleSort(key) {
  if (currentSort.key === key) {
    currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    currentSort.key = key;
    currentSort.dir = 'asc';
  }
  updateSortArrows();
  applyFilterAndSort();
}

function sortTable() {
  const val = document.getElementById('sort-select').value;
  const [key, dir] = val.split('-');
  currentSort = { key, dir };
  applyFilterAndSort();
}

function sortStocks(arr) {
  const { key, dir } = currentSort;
  arr.sort((a, b) => {
    let av = a[key], bv = b[key];
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ? 1 : -1;
    return 0;
  });
}

function updateSortArrows() {
  ['code','name','ltp','high','low','close','ycp','change','volume'].forEach(k => {
    const el = document.getElementById('sort-' + k);
    if (!el) return;
    el.textContent = currentSort.key === k ? (currentSort.dir === 'asc' ? '↑' : '↓') : '';
  });
}

// ─── RENDER TABLE ─────────────────────────────────────────────────────────────
function fmt(n) {
  return n ? n.toLocaleString('en-BD', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) : '—';
}
function fmtVol(n) {
  if (!n) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

function renderTable(stocks) {
  const tbody = document.getElementById('stocks-tbody');
  const footer = document.getElementById('table-footer');

  if (!stocks.length) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:40px;color:var(--text-muted);font-family:var(--mono);font-size:12px;">No results found</td></tr>`;
    footer.textContent = '';
    return;
  }

  tbody.innerHTML = stocks.map((s, i) => {
    const dir = s.change > 0 ? 'up' : s.change < 0 ? 'dn' : '';
    const sign = s.change > 0 ? '+' : '';
    const pct = s.ycp ? ((s.change / s.ycp) * 100).toFixed(2) : '0.00';
    // NOTE: no fav-cell td here — injectFavCells() adds it after render
    return `<tr data-code="${s.code}" data-name="${escAttrApp(s.name)}" onclick="goToCompany(event,'${escAttrApp(s.code)}')" style="cursor:pointer">
      <td class="th-rank">${i + 1}</td>
      <td class="th-code"><strong>${s.code}</strong></td>
      <td>${s.name}</td>
      <td class="th-num">৳${fmt(s.ltp)}</td>
      <td class="th-num">${s.high ? '৳' + fmt(s.high) : '—'}</td>
      <td class="th-num">${s.low ? '৳' + fmt(s.low) : '—'}</td>
      <td class="th-num">${s.close ? '৳' + fmt(s.close) : '—'}</td>
      <td class="th-num">${s.ycp ? '৳' + fmt(s.ycp) : '—'}</td>
      <td class="th-num ${dir}">${sign}${fmt(s.change)} <small>(${sign}${pct}%)</small></td>
      <td class="th-num">${fmtVol(s.volume)}</td>
    </tr>`;
  }).join('');

  // Inject fav buttons (defined in index.html inline script)
  if (typeof injectFavCells === 'function') injectFavCells();

  footer.textContent = `Showing ${stocks.length} of ${allStocks.length} securities`;
}

function goToCompany(event, code) {
  // Don't navigate if click was on fav cell
  if (event.target.closest('.fav-cell')) return;
  window.location.href = `/company.html?code=${encodeURIComponent(code)}`;
}

function escAttrApp(s) {
  return String(s).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  document
    .getElementById('theme-toggle-btn')
    .addEventListener('click', toggleTheme);
  setMarketStatus();
  loadData();

  // Auto-refresh every 5 minutes
  setInterval(() => {
    loadData();
    setMarketStatus();
  }, 5 * 60 * 1000);
});