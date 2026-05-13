/* ═══════════════════════════════════════════════════════════
   screener.js  —  Built-in S/R Screener Lists
   
   Two read-only lists:
     • Hitting Support    → LTP ≈ any support level
     • Hitting Resistance → LTP ≈ any resistance level

   Tolerance: ±0.5% of the level price (configurable below)
═══════════════════════════════════════════════════════════ */
'use strict';

const SCREENER_TOLERANCE_PCT = 0.5; // % within which LTP is considered "at" a level
const API = 'http://localhost:3000';

// ──────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────
let screenerStocksData  = [];   // injected from app.js via window.allStocksData
let screenerSRData      = {};   // { CODE: { support:[...], resistance:[...] } }
let screenerResults     = { support: [], resistance: [] };
let screenerLastScan    = null;
let screenerLoading     = false;
let screenerView        = 'list'; // 'list' | 'detail'
let screenerActiveList  = null;   // 'support' | 'resistance'

// ──────────────────────────────────────────────────────────
// OPEN / CLOSE
// ──────────────────────────────────────────────────────────
function openScreener() {
  document.getElementById('screener-overlay').classList.add('open');
  runScreenerScan();
}
function closeScreener() {
  document.getElementById('screener-overlay').classList.remove('open');
  screenerView = 'list';
  renderScreenerModal();
}

// ──────────────────────────────────────────────────────────
// FETCH ALL S/R LEVELS (batched)
// ──────────────────────────────────────────────────────────
async function fetchAllSRLevels() {
  try {
    const r = await fetch(`${API}/api/sr-levels`);
    if (!r.ok) throw new Error('Failed');
    const d = await r.json();
    // Expected: { levels: { CODE: { support:[...], resistance:[...] } } }
    screenerSRData = d.levels || {};
  } catch (e) {
    // Fallback: try fetching per-stock for stocks currently loaded
    screenerSRData = {};
    console.warn('Bulk S/R fetch failed, using empty levels', e);
  }
}

// ──────────────────────────────────────────────────────────
// FETCH S/R FOR INDIVIDUAL STOCK (used as fallback)
// ──────────────────────────────────────────────────────────
async function fetchSRForStock(code) {
  try {
    const r = await fetch(`${API}/api/sr-levels/${encodeURIComponent(code)}`);
    if (!r.ok) return null;
    const d = await r.json();
    return d; // { support: [...], resistance: [...] }
  } catch { return null; }
}

// ──────────────────────────────────────────────────────────
// MAIN SCAN
// ──────────────────────────────────────────────────────────
async function runScreenerScan() {
  if (screenerLoading) return;
  screenerLoading = true;
  updateScreenerScanBtn(true);
  renderScreenerModal(); // show spinner

  // Pull live prices from app.js global
  screenerStocksData = (window.allStocksData || []);

  // Fetch all S/R data
  await fetchAllSRLevels();

  // If bulk endpoint not available, fetch individually for visible stocks
  if (Object.keys(screenerSRData).length === 0 && screenerStocksData.length > 0) {
    // Limit to first 50 stocks to avoid hammering the API
    const sample = screenerStocksData.slice(0, 50);
    await Promise.all(sample.map(async s => {
      const data = await fetchSRForStock(s.code);
      if (data) screenerSRData[s.code] = data;
    }));
  }

  // Classify
  const tol = SCREENER_TOLERANCE_PCT / 100;
  const hitting = { support: [], resistance: [] };

  screenerStocksData.forEach(stock => {
    const sr = screenerSRData[stock.code];
    if (!sr) return;

    // Check support
    (sr.support || []).forEach(level => {
      const levelPrice = typeof level === 'object' ? (level.price ?? level.value ?? level) : level;
      if (!levelPrice) return;
      const diff = Math.abs(stock.ltp - levelPrice) / levelPrice;
      if (diff <= tol) {
        hitting.support.push({ stock, level: levelPrice, type: 'support' });
      }
    });

    // Check resistance
    (sr.resistance || []).forEach(level => {
      const levelPrice = typeof level === 'object' ? (level.price ?? level.value ?? level) : level;
      if (!levelPrice) return;
      const diff = Math.abs(stock.ltp - levelPrice) / levelPrice;
      if (diff <= tol) {
        hitting.resistance.push({ stock, level: levelPrice, type: 'resistance' });
      }
    });
  });

  // Deduplicate by stock code (keep closest match)
  ['support', 'resistance'].forEach(type => {
    const map = {};
    hitting[type].forEach(entry => {
      const code = entry.stock.code;
      if (!map[code]) {
        map[code] = entry;
      } else {
        const existingDiff = Math.abs(map[code].stock.ltp - map[code].level) / map[code].level;
        const newDiff      = Math.abs(entry.stock.ltp - entry.level) / entry.level;
        if (newDiff < existingDiff) map[code] = entry;
      }
    });
    hitting[type] = Object.values(map);
  });

  screenerResults  = hitting;
  screenerLastScan = new Date();
  screenerLoading  = false;
  updateScreenerScanBtn(false);
  renderScreenerModal();
}

// ──────────────────────────────────────────────────────────
// RENDER — main router
// ──────────────────────────────────────────────────────────
function renderScreenerModal() {
  const overlay = document.getElementById('screener-overlay');
  if (!overlay) return;

  if (screenerView === 'detail') {
    overlay.innerHTML = buildDetailModal();
  } else {
    overlay.innerHTML = buildListModal();
  }

  // Re-bind close on overlay click
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeScreener();
  });
}

// ──────────────────────────────────────────────────────────
// BUILD — List chooser modal
// ──────────────────────────────────────────────────────────
function buildListModal() {
  const lastScanText = screenerLastScan
    ? screenerLastScan.toLocaleTimeString('en-BD', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';

  const supCount = screenerResults.support.length;
  const resCount = screenerResults.resistance.length;

  const listsHTML = screenerLoading
    ? `<div class="screener-scanning">
        <div class="screener-scanning-spinner"></div>
        <span>Scanning market for S/R hits…</span>
       </div>`
    : `
      <!-- Hitting Support -->
      <div class="screener-list-card support" onclick="screenerOpenDetail('support')">
        <div class="screener-list-card-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
            <polyline points="17 6 23 6 23 12"/>
          </svg>
        </div>
        <div class="screener-list-card-name">Hitting Support</div>
        <div class="screener-list-card-desc">Stocks where LTP is within ±${SCREENER_TOLERANCE_PCT}% of a known support level</div>
        <div class="screener-list-card-count-row">
          <div>
            <div class="screener-list-card-count">${supCount}</div>
            <div class="screener-list-card-count-label">stock${supCount !== 1 ? 's' : ''}</div>
          </div>
          <div class="screener-list-card-arrow">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
          </div>
        </div>
      </div>

      <!-- Hitting Resistance -->
      <div class="screener-list-card resistance" onclick="screenerOpenDetail('resistance')">
        <div class="screener-list-card-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/>
            <polyline points="17 18 23 18 23 12"/>
          </svg>
        </div>
        <div class="screener-list-card-name">Hitting Resistance</div>
        <div class="screener-list-card-desc">Stocks where LTP is within ±${SCREENER_TOLERANCE_PCT}% of a known resistance level</div>
        <div class="screener-list-card-count-row">
          <div>
            <div class="screener-list-card-count">${resCount}</div>
            <div class="screener-list-card-count-label">stock${resCount !== 1 ? 's' : ''}</div>
          </div>
          <div class="screener-list-card-arrow">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
          </div>
        </div>
      </div>`;

  return `
    <div class="screener-modal" onclick="event.stopPropagation()">
      <div class="screener-modal-header">
        <div class="screener-modal-title">
          <div class="screener-modal-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              <path d="M11 8v6M8 11h6"/>
            </svg>
          </div>
          <div>
            <div class="screener-modal-heading">Screener</div>
            <div class="screener-modal-sub">Built-in technical screening lists</div>
          </div>
        </div>
        <button class="screener-modal-close" onclick="closeScreener()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>

      <div class="screener-refresh-row">
        <div class="screener-last-scan">
          <span class="screener-live-dot"></span>&nbsp;&nbsp;
          Last scan: <span>${lastScanText}</span>
          · ${screenerStocksData.length} stocks · ${Object.keys(screenerSRData).length} with S/R data
        </div>
        <button class="screener-rescan-btn" id="screener-rescan-btn" onclick="runScreenerScan()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
          Rescan
        </button>
      </div>

      <div class="screener-lists-grid">${listsHTML}</div>
    </div>`;
}

// ──────────────────────────────────────────────────────────
// BUILD — Detail modal for a specific list
// ──────────────────────────────────────────────────────────
function buildDetailModal() {
  const list  = screenerResults[screenerActiveList] || [];
  const isSupp = screenerActiveList === 'support';
  const typeClass = isSupp ? 'support' : 'resistance';
  const title = isSupp ? 'Hitting Support' : 'Hitting Resistance';

  const pillIcon = isSupp
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/></svg>`;

  let bodyHTML = '';
  if (list.length === 0) {
    bodyHTML = `
      <div class="screener-detail-empty">
        <div class="screener-detail-empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <path d="M8 12h8M12 8v8"/>
          </svg>
        </div>
        <h3>No Stocks Found</h3>
        <p>No stocks are currently ${isSupp ? 'at a support' : 'at a resistance'} level within ±${SCREENER_TOLERANCE_PCT}% tolerance. Try rescanning after prices update.</p>
      </div>`;
  } else {
    const rows = list.map(entry => {
      const s    = entry.stock;
      const dir  = s.change > 0 ? 'up' : s.change < 0 ? 'dn' : 'fl';
      const sign = s.change > 0 ? '+' : '';
      const pct  = s.ycp ? ((s.change / s.ycp) * 100).toFixed(1) : '0.0';
      return `
        <div class="screener-stock-row" onclick="window.location='/company.html?code=${encodeURIComponent(s.code)}'">
          <div class="screener-stock-identity">
            <div class="screener-stock-code">${escHtmlS(s.code)}</div>
            <div class="screener-stock-level">
              <span class="screener-stock-level-badge ${typeClass}">
                ${isSupp ? '▲ SUP' : '▼ RES'} ৳${entry.level.toFixed(1)}
              </span>
            </div>
          </div>
          <div class="screener-stock-ltp">৳${s.ltp.toFixed(1)}</div>
          <div class="screener-stock-change ${dir}">${sign}${s.change.toFixed(1)}<br><small>${sign}${pct}%</small></div>
          <div class="screener-stock-level-price ${typeClass}">৳${entry.level.toFixed(1)}</div>
        </div>`;
    }).join('');

    bodyHTML = `
      <div class="screener-table-header">
        <div class="screener-th">Stock</div>
        <div class="screener-th">LTP</div>
        <div class="screener-th">Change</div>
        <div class="screener-th">Level</div>
      </div>
      <div class="screener-tolerance-note">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
        Showing stocks within ±${SCREENER_TOLERANCE_PCT}% of their ${isSupp ? 'support' : 'resistance'} levels · ${list.length} match${list.length !== 1 ? 'es' : ''}
      </div>
      ${rows}`;
  }

  return `
    <div class="screener-detail-modal" onclick="event.stopPropagation()">
      <div class="screener-detail-header">
        <div class="screener-detail-header-left">
          <button class="screener-detail-back" onclick="screenerBackToList()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </button>
          <div class="screener-detail-title-wrap">
            <div class="screener-detail-title">${title}</div>
            <div class="screener-detail-meta">Screener · Read-only · Auto-updated</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span class="screener-detail-pill ${typeClass}">
            ${pillIcon}
            ${list.length} stock${list.length !== 1 ? 's' : ''}
          </span>
          <button class="screener-modal-close" onclick="closeScreener()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>
      <div class="screener-detail-body">${bodyHTML}</div>
    </div>`;
}

// ──────────────────────────────────────────────────────────
// NAVIGATION
// ──────────────────────────────────────────────────────────
function screenerOpenDetail(type) {
  screenerActiveList = type;
  screenerView = 'detail';
  renderScreenerModal();
}
function screenerBackToList() {
  screenerActiveList = null;
  screenerView = 'list';
  renderScreenerModal();
}

// ──────────────────────────────────────────────────────────
// UPDATE BADGE
// ──────────────────────────────────────────────────────────
function updateScreenerBadge() {
  const badge = document.getElementById('screener-badge');
  if (!badge) return;
  const total = screenerResults.support.length + screenerResults.resistance.length;
  badge.textContent = total;
}

function updateScreenerScanBtn(spinning) {
  const btn = document.getElementById('screener-rescan-btn');
  if (!btn) return;
  btn.classList.toggle('spinning', spinning);
}

// ──────────────────────────────────────────────────────────
// HOOK INTO app.js DATA UPDATES
// Whenever live data is refreshed, re-run the scan
// ──────────────────────────────────────────────────────────
const _screenerOrigInjectFavCells = window.injectFavCells;
window._screenerDataUpdated = function () {
  screenerStocksData = window.allStocksData || [];
  // Auto-rescan silently every data refresh
  if (Object.keys(screenerSRData).length > 0) {
    const tol = SCREENER_TOLERANCE_PCT / 100;
    const hitting = { support: [], resistance: [] };
    screenerStocksData.forEach(stock => {
      const sr = screenerSRData[stock.code];
      if (!sr) return;
      ['support', 'resistance'].forEach(type => {
        (sr[type] || []).forEach(level => {
          const lp = typeof level === 'object' ? (level.price ?? level.value ?? level) : level;
          if (!lp) return;
          if (Math.abs(stock.ltp - lp) / lp <= tol) {
            hitting[type].push({ stock, level: lp, type });
          }
        });
      });
    });
    ['support', 'resistance'].forEach(type => {
      const map = {};
      hitting[type].forEach(e => {
        const code = e.stock.code;
        if (!map[code] || Math.abs(e.stock.ltp - e.level) / e.level < Math.abs(map[code].stock.ltp - map[code].level) / map[code].level) {
          map[code] = e;
        }
      });
      hitting[type] = Object.values(map);
    });
    screenerResults = hitting;
    screenerLastScan = new Date();
    updateScreenerBadge();
    if (document.getElementById('screener-overlay')?.classList.contains('open')) {
      renderScreenerModal();
    }
  }
};

// ──────────────────────────────────────────────────────────
// HELPER
// ──────────────────────────────────────────────────────────
function escHtmlS(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ──────────────────────────────────────────────────────────
// INIT
// ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Inject the overlay container into the body
  if (!document.getElementById('screener-overlay')) {
    const overlay = document.createElement('div');
    overlay.className = 'screener-overlay';
    overlay.id = 'screener-overlay';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeScreener();
    });
  }
});

// Expose globals
window.openScreener        = openScreener;
window.closeScreener       = closeScreener;
window.runScreenerScan     = runScreenerScan;
window.screenerOpenDetail  = screenerOpenDetail;
window.screenerBackToList  = screenerBackToList;
