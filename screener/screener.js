/* ═══════════════════════════════════════════════════════════
   screener.js  —  Built-in S/R + Candlestick Pattern Screener

   Lists:
     • Hitting Support       → LTP ≈ any support level
     • Hitting Resistance    → LTP ≈ any resistance level
     • Bullish Hammer        → Small body at top, long lower wick (reversal ↑)
     • Bearish Hammer        → Small body at bottom, long upper wick (reversal ↓)
       (also called Shooting Star / Inverted Hammer)
     • Bullish Marubozu      → Full green body, no wicks (strong buying)
     • Bearish Marubozu      → Full red body, no wicks (strong selling)

   All thresholds are tunable via constants below.
═══════════════════════════════════════════════════════════ */
'use strict';

const API = 'http://localhost:3000';

// ── S/R tolerance ──────────────────────────────────────────
const SCREENER_TOLERANCE_PCT = 0.5;   // ±% from level price

// ── Shared candle guard ────────────────────────────────────
const CANDLE_MIN_RANGE_PCT   = 0.3;   // ignore candles with <0.3% total range

// ── Hammer / Shooting Star thresholds ─────────────────────
const HAMMER_MIN_WICK_RATIO  = 2.0;   // dominant wick ≥ 2× body
const HAMMER_MAX_OPP_RATIO   = 0.1;   // opposite wick ≤ 10% of range
const HAMMER_MAX_BODY_RATIO  = 0.35;  // body ≤ 35% of range

// ── Marubozu thresholds ────────────────────────────────────
const MARUBOZU_MIN_BODY_RATIO = 0.85; // body ≥ 85% of total range
const MARUBOZU_MAX_WICK_RATIO = 0.05; // each wick ≤ 5% of range

// ──────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────
let screenerStocksData = [];
let screenerSRData     = {};
let screenerResults    = {
  support: [], resistance: [],
  bullishHammer: [], bearishHammer: [],
  bullishMarubozu: [], bearishMarubozu: []
};
let screenerLastScan   = null;
let screenerLoading    = false;
let screenerView       = 'list';
let screenerActiveList = null;

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
// CANDLE HELPERS
// open ≈ YCP  |  close = LTP  (DSE opens at prev close)
// ──────────────────────────────────────────────────────────
function candleParts(stock) {
  const open      = stock.ycp;
  const close     = stock.ltp;
  const high      = stock.high;
  const low       = stock.low;
  const range     = high - low;
  const body      = Math.abs(close - open);
  const lowerWick = Math.min(open, close) - low;
  const upperWick = high - Math.max(open, close);
  const rangePct  = range > 0 ? (range / low) * 100 : 0;
  return { open, close, high, low, range, body, lowerWick, upperWick, rangePct };
}

function candleValid(stock) {
  const { ltp, high, low, ycp } = stock;
  return ltp > 0 && high > 0 && low > 0 && ycp > 0;
}

// ── Bullish Hammer ─────────────────────────────────────────
// Small body near TOP of range, long LOWER wick, tiny upper wick
function isBullishHammer(stock) {
  if (!candleValid(stock)) return false;
  const { range, body, lowerWick, upperWick, rangePct } = candleParts(stock);
  if (range <= 0 || rangePct < CANDLE_MIN_RANGE_PCT) return false;
  if (body <= 0)                                     return false;
  if (body / range > HAMMER_MAX_BODY_RATIO)          return false;
  if (lowerWick <= 0)                                return false;
  if (lowerWick < HAMMER_MIN_WICK_RATIO * body)      return false;
  if (upperWick / range > HAMMER_MAX_OPP_RATIO)      return false;
  return true;
}

// ── Bearish Hammer (Shooting Star / Inverted Hammer) ───────
// Small body near BOTTOM of range, long UPPER wick, tiny lower wick
function isBearishHammer(stock) {
  if (!candleValid(stock)) return false;
  const { range, body, lowerWick, upperWick, rangePct } = candleParts(stock);
  if (range <= 0 || rangePct < CANDLE_MIN_RANGE_PCT) return false;
  if (body <= 0)                                     return false;
  if (body / range > HAMMER_MAX_BODY_RATIO)          return false;
  if (upperWick <= 0)                                return false;
  if (upperWick < HAMMER_MIN_WICK_RATIO * body)      return false;
  if (lowerWick / range > HAMMER_MAX_OPP_RATIO)      return false;
  return true;
}

// ── Bullish Marubozu ───────────────────────────────────────
// Green candle, body ≥ 85% of range, near-zero wicks
function isBullishMarubozu(stock) {
  if (!candleValid(stock)) return false;
  const { open, close, range, body, lowerWick, upperWick, rangePct } = candleParts(stock);
  if (range <= 0 || rangePct < CANDLE_MIN_RANGE_PCT) return false;
  if (close <= open)                                 return false;
  if (body / range < MARUBOZU_MIN_BODY_RATIO)        return false;
  if (upperWick / range > MARUBOZU_MAX_WICK_RATIO)   return false;
  if (lowerWick / range > MARUBOZU_MAX_WICK_RATIO)   return false;
  return true;
}

// ── Bearish Marubozu ───────────────────────────────────────
// Red candle, body ≥ 85% of range, near-zero wicks
function isBearishMarubozu(stock) {
  if (!candleValid(stock)) return false;
  const { open, close, range, body, lowerWick, upperWick, rangePct } = candleParts(stock);
  if (range <= 0 || rangePct < CANDLE_MIN_RANGE_PCT) return false;
  if (close >= open)                                 return false;
  if (body / range < MARUBOZU_MIN_BODY_RATIO)        return false;
  if (upperWick / range > MARUBOZU_MAX_WICK_RATIO)   return false;
  if (lowerWick / range > MARUBOZU_MAX_WICK_RATIO)   return false;
  return true;
}

// ── Scoring helpers ────────────────────────────────────────
function hammerScore(stock, wickKey) {
  const parts = candleParts(stock);
  return (parts[wickKey]) / (parts.body || 0.001);
}
function marubozuScore(stock) {
  const { body, range } = candleParts(stock);
  return range > 0 ? body / range : 0;
}

// ──────────────────────────────────────────────────────────
// FETCH ALL S/R LEVELS
// ──────────────────────────────────────────────────────────
async function fetchAllSRLevels() {
  try {
    const r = await fetch(`${API}/api/sr-levels`);
    if (!r.ok) throw new Error('Failed');
    screenerSRData = (await r.json()).levels || {};
  } catch (e) {
    screenerSRData = {};
    console.warn('Bulk S/R fetch failed', e);
  }
}

async function fetchSRForStock(code) {
  try {
    const r = await fetch(`${API}/api/sr-levels/${encodeURIComponent(code)}`);
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

// ──────────────────────────────────────────────────────────
// MAIN SCAN
// ──────────────────────────────────────────────────────────
async function runScreenerScan() {
  if (screenerLoading) return;
  screenerLoading = true;
  updateScreenerScanBtn(true);
  renderScreenerModal();

  screenerStocksData = window.allStocksData || [];
  await fetchAllSRLevels();

  if (Object.keys(screenerSRData).length === 0 && screenerStocksData.length > 0) {
    await Promise.all(screenerStocksData.slice(0, 50).map(async s => {
      const data = await fetchSRForStock(s.code);
      if (data) screenerSRData[s.code] = data;
    }));
  }

  screenerResults  = classifyStocks(screenerStocksData);
  screenerLastScan = new Date();
  screenerLoading  = false;
  updateScreenerScanBtn(false);
  updateScreenerBadge();
  renderScreenerModal();
}

// ──────────────────────────────────────────────────────────
// CLASSIFY
// ──────────────────────────────────────────────────────────
function classifyStocks(stocks) {
  const tol = SCREENER_TOLERANCE_PCT / 100;
  const out = {
    support: [], resistance: [],
    bullishHammer: [], bearishHammer: [],
    bullishMarubozu: [], bearishMarubozu: []
  };

  stocks.forEach(stock => {
    // ── S/R ──────────────────────────────────────────────
    const sr = screenerSRData[stock.code];
    if (sr) {
      (sr.support || []).forEach(level => {
        const lp = typeof level === 'object' ? (level.price ?? level.value ?? level) : level;
        if (lp && Math.abs(stock.ltp - lp) / lp <= tol)
          out.support.push({ stock, level: lp });
      });
      (sr.resistance || []).forEach(level => {
        const lp = typeof level === 'object' ? (level.price ?? level.value ?? level) : level;
        if (lp && Math.abs(stock.ltp - lp) / lp <= tol)
          out.resistance.push({ stock, level: lp });
      });
    }

    // ── Candlestick patterns ───────────────────────────────
    if (!candleValid(stock)) return;
    const parts = candleParts(stock);

    if (isBullishHammer(stock))
      out.bullishHammer.push({ stock, score: hammerScore(stock, 'lowerWick'), ...parts });

    if (isBearishHammer(stock))
      out.bearishHammer.push({ stock, score: hammerScore(stock, 'upperWick'), ...parts });

    if (isBullishMarubozu(stock))
      out.bullishMarubozu.push({ stock, score: marubozuScore(stock), ...parts });

    if (isBearishMarubozu(stock))
      out.bearishMarubozu.push({ stock, score: marubozuScore(stock), ...parts });
  });

  // Deduplicate S/R (keep closest match per stock)
  ['support','resistance'].forEach(type => {
    const map = {};
    out[type].forEach(e => {
      const c = e.stock.code;
      if (!map[c] || Math.abs(e.stock.ltp - e.level) / e.level
                   < Math.abs(map[c].stock.ltp - map[c].level) / map[c].level)
        map[c] = e;
    });
    out[type] = Object.values(map);
  });

  // Sort candlestick lists: strongest signal first
  ['bullishHammer','bearishHammer','bullishMarubozu','bearishMarubozu']
    .forEach(k => out[k].sort((a, b) => b.score - a.score));

  return out;
}

// ──────────────────────────────────────────────────────────
// PATTERN METADATA  (single source of truth for UI)
// ──────────────────────────────────────────────────────────
const PATTERNS = {
  support: {
    key: 'support', label: 'Hitting Support', color: 'support',
    desc: `LTP within ±${SCREENER_TOLERANCE_PCT}% of a known support level`,
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
    badge: '▲ SUP', isSR: true,
  },
  resistance: {
    key: 'resistance', label: 'Hitting Resistance', color: 'resistance',
    desc: `LTP within ±${SCREENER_TOLERANCE_PCT}% of a known resistance level`,
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>`,
    badge: '▼ RES', isSR: true,
  },
  bullishHammer: {
    key: 'bullishHammer', label: 'Bullish Hammer', color: 'bullish-hammer',
    desc: 'Small body near top · long lower wick ≥ 2× body · tiny upper wick — buyers rejected lows',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="4" width="6" height="5" rx="1"/><line x1="12" y1="9" x2="12" y2="21"/><line x1="12" y1="2" x2="12" y2="4"/></svg>`,
    badge: '🔨 B·HAMMER', wickKey: 'lowerWick', scoreLabel: 'wick/body', isSR: false,
    emptyMsg: 'No stocks are forming a bullish hammer today. Patterns appear after meaningful price rejection at the lows.',
    legend: {
      candle: 'bullish-hammer',
      items: [
        { color:'var(--text-muted)', text:'Tiny upper wick (≤ 10% of range)' },
        { color:'#22c55e',           text:'Small body near top (≤ 35% of range)' },
        { color:'#f59e0b',           text:'Long lower wick (≥ 2× body) — buyers pushed price back up' },
      ]
    }
  },
  bearishHammer: {
    key: 'bearishHammer', label: 'Bearish Hammer', color: 'bearish-hammer',
    desc: 'Small body near bottom · long upper wick ≥ 2× body · tiny lower wick — sellers rejected highs',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="15" width="6" height="5" rx="1"/><line x1="12" y1="3" x2="12" y2="15"/><line x1="12" y1="20" x2="12" y2="22"/></svg>`,
    badge: '🔻 S·STAR', wickKey: 'upperWick', scoreLabel: 'wick/body', isSR: false,
    emptyMsg: 'No stocks are forming a bearish hammer (shooting star) today. Patterns appear after price rejection at the highs.',
    legend: {
      candle: 'bearish-hammer',
      items: [
        { color:'#ef4444',           text:'Long upper wick (≥ 2× body) — sellers pushed price back down' },
        { color:'#ef4444',           text:'Small body near bottom (≤ 35% of range)' },
        { color:'var(--text-muted)', text:'Tiny lower wick (≤ 10% of range)' },
      ]
    }
  },
  bullishMarubozu: {
    key: 'bullishMarubozu', label: 'Bullish Marubozu', color: 'bullish-marubozu',
    desc: 'Green candle · body ≥ 85% of range · near-zero wicks — uninterrupted buying from open to close',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="3" width="8" height="18" rx="1" fill="rgba(34,197,94,0.2)"/></svg>`,
    badge: '📗 MARUBOZU', scoreLabel: 'body%', isSR: false,
    emptyMsg: 'No bullish marubozu candles today. These appear when buyers dominate the full session with almost no wick.',
    legend: {
      candle: 'bullish-marubozu',
      items: [
        { color:'#22c55e', text:'Closes at / near the high (upper wick ≤ 5%)' },
        { color:'#22c55e', text:'Large green body covering ≥ 85% of the day\'s range' },
        { color:'#22c55e', text:'Opens at / near the low (lower wick ≤ 5%)' },
      ]
    }
  },
  bearishMarubozu: {
    key: 'bearishMarubozu', label: 'Bearish Marubozu', color: 'bearish-marubozu',
    desc: 'Red candle · body ≥ 85% of range · near-zero wicks — uninterrupted selling from open to close',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="3" width="8" height="18" rx="1" fill="rgba(239,68,68,0.2)"/></svg>`,
    badge: '📕 MARUBOZU', scoreLabel: 'body%', isSR: false,
    emptyMsg: 'No bearish marubozu candles today. These appear when sellers dominate the full session with almost no wick.',
    legend: {
      candle: 'bearish-marubozu',
      items: [
        { color:'#ef4444', text:'Opens at / near the high (upper wick ≤ 5%)' },
        { color:'#ef4444', text:'Large red body covering ≥ 85% of the day\'s range' },
        { color:'#ef4444', text:'Closes at / near the low (lower wick ≤ 5%)' },
      ]
    }
  },
};

// ──────────────────────────────────────────────────────────
// RENDER ROUTER
// ──────────────────────────────────────────────────────────
function renderScreenerModal() {
  const overlay = document.getElementById('screener-overlay');
  if (!overlay) return;
  overlay.innerHTML = screenerView === 'detail'
    ? buildDetailModal(screenerActiveList)
    : buildListModal();
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeScreener();
  });
}

// ──────────────────────────────────────────────────────────
// BUILD — List chooser modal
// ──────────────────────────────────────────────────────────
function buildListModal() {
  const lastScanText = screenerLastScan
    ? screenerLastScan.toLocaleTimeString('en-BD', { hour:'2-digit', minute:'2-digit', second:'2-digit' })
    : '—';

  const cardsHTML = screenerLoading
    ? `<div class="screener-scanning">
        <div class="screener-scanning-spinner"></div>
        <span>Scanning ${screenerStocksData.length} stocks for patterns…</span>
       </div>`
    : Object.values(PATTERNS).map(p => {
        const n = (screenerResults[p.key] || []).length;
        return `
          <div class="screener-list-card ${p.color}" onclick="screenerOpenDetail('${p.key}')">
            <div class="screener-list-card-icon">${p.icon}</div>
            <div class="screener-list-card-body">
              <div class="screener-list-card-name">${p.label}</div>
              <div class="screener-list-card-desc">${p.desc}</div>
            </div>
            <div class="screener-list-card-count-col">
              <div class="screener-list-card-count">${n}</div>
              <div class="screener-list-card-count-label">stock${n !== 1 ? 's' : ''}</div>
              <div class="screener-list-card-arrow">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
              </div>
            </div>
          </div>`;
      }).join('');

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
            <div class="screener-modal-sub">6 built-in S/R &amp; candlestick pattern lists</div>
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

      <div class="screener-lists-grid">${cardsHTML}</div>
    </div>`;
}

// ──────────────────────────────────────────────────────────
// BUILD — Generic detail modal (handles all 6 lists)
// ──────────────────────────────────────────────────────────
function buildDetailModal(key) {
  const p    = PATTERNS[key];
  const list = screenerResults[key] || [];

  // ── Empty state ──────────────────────────────────────────
  let bodyHTML = '';
  if (list.length === 0) {
    bodyHTML = `
      <div class="screener-detail-empty">
        <div class="screener-detail-empty-icon">${p.icon}</div>
        <h3>No Stocks Found</h3>
        <p>${p.emptyMsg || 'No stocks matched the criteria. Rescan after prices update.'}</p>
      </div>`;

  } else if (p.isSR) {
    // ── S/R rows ─────────────────────────────────────────────
    bodyHTML = `
      <div class="screener-table-header">
        <div class="screener-th">Stock</div>
        <div class="screener-th">LTP</div>
        <div class="screener-th">Change</div>
        <div class="screener-th">Level</div>
      </div>
      <div class="screener-tolerance-note">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
        Stocks within ±${SCREENER_TOLERANCE_PCT}% of their ${key} levels · ${list.length} match${list.length !== 1 ? 'es' : ''}
      </div>
      ${list.map(entry => {
        const s   = entry.stock;
        const dir = s.change > 0 ? 'up' : s.change < 0 ? 'dn' : 'fl';
        const sgn = s.change > 0 ? '+' : '';
        const pct = s.ycp ? ((s.change / s.ycp) * 100).toFixed(1) : '0.0';
        return `
          <div class="screener-stock-row" onclick="window.location='/company.html?code=${encodeURIComponent(s.code)}'">
            <div class="screener-stock-identity">
              <div class="screener-stock-code">${escHtmlS(s.code)}</div>
              <div class="screener-stock-level">
                <span class="screener-stock-level-badge ${p.color}">${p.badge} ৳${entry.level.toFixed(1)}</span>
              </div>
            </div>
            <div class="screener-stock-ltp">৳${s.ltp.toFixed(1)}</div>
            <div class="screener-stock-change ${dir}">${sgn}${s.change.toFixed(1)}<br><small>${sgn}${pct}%</small></div>
            <div class="screener-stock-level-price ${p.color}">৳${entry.level.toFixed(1)}</div>
          </div>`;
      }).join('')}`;

  } else {
    // ── Candlestick rows ──────────────────────────────────────
    const isHammer   = key === 'bullishHammer' || key === 'bearishHammer';
    const wickKey    = p.wickKey || 'body';
    const scoreHdr   = p.scoreLabel || 'Signal';

    bodyHTML = `
      <div class="screener-table-header candle-header">
        <div class="screener-th">Stock</div>
        <div class="screener-th">LTP</div>
        <div class="screener-th">Change</div>
        <div class="screener-th">${scoreHdr}</div>
      </div>
      <div class="screener-tolerance-note">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
        Sorted by signal strength · open ≈ YCP · ${list.length} pattern${list.length !== 1 ? 's' : ''} detected today
      </div>
      ${list.map(entry => {
        const s   = entry.stock;
        const dir = s.change > 0 ? 'up' : s.change < 0 ? 'dn' : 'fl';
        const sgn = s.change > 0 ? '+' : '';
        const pct = s.ycp ? ((s.change / s.ycp) * 100).toFixed(1) : '0.0';

        const metricVal = isHammer
          ? entry.score.toFixed(1) + '×'
          : Math.round((entry.body / (entry.range || 1)) * 100) + '%';
        const barPct = isHammer
          ? Math.min(100, Math.round((entry[wickKey] / (entry.range || 1)) * 100))
          : Math.round((entry.body / (entry.range || 1)) * 100);

        return `
          <div class="screener-stock-row candle-row" onclick="window.location='/company.html?code=${encodeURIComponent(s.code)}'">
            <div class="screener-stock-identity">
              <div class="screener-stock-code">${escHtmlS(s.code)}</div>
              <div class="screener-stock-level">
                <span class="screener-stock-level-badge ${p.color}">${p.badge}</span>
              </div>
            </div>
            <div class="screener-stock-ltp">৳${s.ltp.toFixed(1)}</div>
            <div class="screener-stock-change ${dir}">${sgn}${s.change.toFixed(1)}<br><small>${sgn}${pct}%</small></div>
            <div class="screener-hammer-meta">
              <div class="screener-hammer-ratio">
                <span class="screener-hammer-ratio-val ${p.color}">${metricVal}</span>
                <span class="screener-hammer-ratio-label">${p.scoreLabel}</span>
              </div>
              <div class="screener-hammer-wick-bar">
                <div class="screener-hammer-wick-fill ${p.color}" style="width:${barPct}%"></div>
              </div>
            </div>
          </div>`;
      }).join('')}`;
  }

  // ── Pattern legend (candlestick only) ──────────────────────
  const legendHTML = (!p.isSR && p.legend) ? `
    <div class="screener-pattern-legend">
      ${buildLegendCandle(p.legend.candle)}
      <div class="screener-legend-labels">
        ${p.legend.items.map(item => `
          <div class="screener-legend-row">
            <span class="screener-legend-dot" style="background:${item.color}"></span>
            <span>${item.text}</span>
          </div>`).join('')}
      </div>
    </div>` : '';

  return `
    <div class="screener-detail-modal" onclick="event.stopPropagation()">
      <div class="screener-detail-header">
        <div class="screener-detail-header-left">
          <button class="screener-detail-back" onclick="screenerBackToList()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </button>
          <div class="screener-detail-title-wrap">
            <div class="screener-detail-title">${p.label}</div>
            <div class="screener-detail-meta">${p.isSR ? 'S/R Level Screener' : 'Candlestick Pattern'} · Read-only · Auto-updated</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span class="screener-detail-pill ${p.color}">
            ${p.icon}
            ${list.length} stock${list.length !== 1 ? 's' : ''}
          </span>
          <button class="screener-modal-close" onclick="closeScreener()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>
      ${legendHTML}
      <div class="screener-detail-body">${bodyHTML}</div>
    </div>`;
}

// ──────────────────────────────────────────────────────────
// BUILD — Mini illustrated candle for legend
// ──────────────────────────────────────────────────────────
function buildLegendCandle(type) {
  const shapes = {
    'bullish-hammer': `
      <div class="slc-wick" style="height:4px;background:var(--text-muted);opacity:.6"></div>
      <div class="slc-body" style="height:12px;background:#22c55e;box-shadow:0 0 8px rgba(34,197,94,.4)"></div>
      <div class="slc-wick" style="height:40px;background:linear-gradient(180deg,#f59e0b,#fbbf24);box-shadow:0 0 8px rgba(245,158,11,.3)"></div>`,
    'bearish-hammer': `
      <div class="slc-wick" style="height:40px;background:linear-gradient(180deg,#fbbf24,#f59e0b);box-shadow:0 0 8px rgba(245,158,11,.3)"></div>
      <div class="slc-body" style="height:12px;background:#ef4444;box-shadow:0 0 8px rgba(239,68,68,.4)"></div>
      <div class="slc-wick" style="height:4px;background:var(--text-muted);opacity:.6"></div>`,
    'bullish-marubozu': `
      <div class="slc-wick" style="height:2px;background:transparent"></div>
      <div class="slc-body" style="height:56px;background:linear-gradient(180deg,#16a34a,#22c55e);box-shadow:0 0 14px rgba(34,197,94,.45)"></div>
      <div class="slc-wick" style="height:2px;background:transparent"></div>`,
    'bearish-marubozu': `
      <div class="slc-wick" style="height:2px;background:transparent"></div>
      <div class="slc-body" style="height:56px;background:linear-gradient(180deg,#ef4444,#b91c1c);box-shadow:0 0 14px rgba(239,68,68,.45)"></div>
      <div class="slc-wick" style="height:2px;background:transparent"></div>`,
  };
  return `<div class="screener-legend-candle">${shapes[type] || ''}</div>`;
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
// BADGE — total hits across all lists
// ──────────────────────────────────────────────────────────
function updateScreenerBadge() {
  const badge = document.getElementById('screener-badge');
  if (!badge) return;
  badge.textContent = Object.values(screenerResults).reduce((s, a) => s + a.length, 0);
}

function updateScreenerScanBtn(spinning) {
  const btn = document.getElementById('screener-rescan-btn');
  if (btn) btn.classList.toggle('spinning', spinning);
}

// ──────────────────────────────────────────────────────────
// HOOK INTO app.js DATA UPDATES
// ──────────────────────────────────────────────────────────
window._screenerDataUpdated = function () {
  screenerStocksData = window.allStocksData || [];
  screenerResults    = classifyStocks(screenerStocksData);
  screenerLastScan   = new Date();
  updateScreenerBadge();
  if (document.getElementById('screener-overlay')?.classList.contains('open'))
    renderScreenerModal();
};

// ──────────────────────────────────────────────────────────
// HELPER
// ──────────────────────────────────────────────────────────
function escHtmlS(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ──────────────────────────────────────────────────────────
// INIT
// ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (!document.getElementById('screener-overlay')) {
    const el = document.createElement('div');
    el.className = 'screener-overlay';
    el.id = 'screener-overlay';
    document.body.appendChild(el);
    el.addEventListener('click', e => { if (e.target === el) closeScreener(); });
  }
});

window.openScreener       = openScreener;
window.closeScreener      = closeScreener;
window.runScreenerScan    = runScreenerScan;
window.screenerOpenDetail = screenerOpenDetail;
window.screenerBackToList = screenerBackToList;