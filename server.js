/**
 * DSE Tracker — Backend Server
 * Fetches live stock data from dsebd.org server-side
 * (avoids CORS and JS-rendering issues that block browser fetches)
 *
 * Run:  node server.js
 * API:  http://localhost:3000/api/stocks
 */

const express  = require('express');
const cors     = require('cors');
const fetch    = require('node-fetch');
const cheerio  = require('cheerio');

const app  = express();
const PORT = 3000;

app.use(cors());
// Disable caching for static files so changes are picked up immediately
app.use(express.static(__dirname, {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  }
}));

// ── Cache to avoid hammering DSE (30-second TTL) ────────────────────────────
let cache = { data: null, ts: 0 };
const CACHE_TTL = 30 * 1000;

const DSE_URL      = 'https://www.dsebd.org/latest_share_price_scroll_l.php';
const DSE_LIST_URL = 'https://www.dsebd.org/company_listing.php';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.dsebd.org/',
};

// ── Fetch helpers ────────────────────────────────────────────────────────────
async function fetchPage(url) {
  const res = await fetch(url, { headers: HEADERS, timeout: 15000 });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.text();
}

// ── Build a code → full company name map from company_listing.php ────────────
async function fetchNameMap() {
  const html = await fetchPage(DSE_LIST_URL);
  const $    = cheerio.load(html);
  const map  = {};

  // company_listing.php columns:
  //  0: Serial No.   1: Company Name   2: Trading Code   3: Listed Shares ...
  $('tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 3) return;

    const name = $(cells[1]).text().trim();
    const code = $(cells[2]).text().trim().toUpperCase().replace(/\s+/g, '');

    if (code && name && code.length >= 2 && code.length <= 20 && /^[A-Z]/.test(code)) {
      map[code] = name;
    }
  });

  console.log(`[DSE] Name map built: ${Object.keys(map).length} companies`);
  if (Object.keys(map).length) {
    const sample = Object.entries(map).slice(0, 3);
    console.log('[DSE] Name map sample:', sample);
  }
  return map;
}

// ── Parse price table, enrich with names from nameMap ───────────────────────
function parseDSE(html, nameMap) {
  const $ = cheerio.load(html);
  const stocks = [];
  const toNum = str => parseFloat((str || '').replace(/,/g, '')) || 0;

  // latest_share_price_scroll_l.php columns:
  //  0: ID/Serial    1: Trading Code   2: LTP   3: High   4: Low
  //  5: CloseP       6: YCP            7: Change 8: Trade  9: Value(mn)  10: Volume
  $('tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 8) return;

    // Try cells[1] as trading code (skipping leading ID in cells[0])
    const raw  = $(cells[1]).text().trim().replace(/\s+/g, '');
    const code = raw.toUpperCase();

    if (!code || code.length < 2 || code.length > 20) return;
    if (!/^[A-Z]/.test(code)) return; // must start with a letter

    const anchor   = $(cells[1]).find('a');
    const fallback = anchor.attr('title')?.trim() || anchor.text().trim() || code;
    const name     = nameMap[code] || fallback;

    stocks.push({
      code,
      name,
      ltp:    toNum($(cells[2]).text()),
      high:   toNum($(cells[3]).text()),
      low:    toNum($(cells[4]).text()),
      close:  toNum($(cells[5]).text()),
      ycp:    toNum($(cells[6]).text()),
      change: toNum($(cells[7]).text()),
      volume: toNum($(cells[10]).text()),
    });
  });

  return stocks;
}

app.get('/favicon.ico', (_, res) => res.status(204).end());

// ── Debug endpoint — shows raw rows from both DSE pages ─────────────────────
app.get('/api/debug', async (req, res) => {
  try {
    const [priceHtml, listHtml] = await Promise.all([
      fetchPage(DSE_URL),
      fetchPage(DSE_LIST_URL),
    ]);

    const extract = (html, maxRows = 5) => {
      const $ = cheerio.load(html);
      const result = [];
      $('tr').each((_, row) => {
        const cells = $(row).find('td');
        if (!cells.length) return;
        const cols = [];
        cells.each((i, c) => cols.push(`[${i}] ${$(c).text().trim().slice(0, 40)}`));
        result.push(cols);
        if (result.length >= maxRows) return false;
      });
      return result;
    };

    res.json({
      priceTable:   extract(priceHtml),
      companyTable: extract(listHtml),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.get('/api/stocks', async (req, res) => {
  if (cache.data && (Date.now() - cache.ts) < CACHE_TTL) {
    return res.json({ ...cache.data, cached: true });
  }

  try {
    console.log('[DSE] Fetching prices + company names in parallel…');

    // Fetch both pages simultaneously
    const [priceHtml, nameMap] = await Promise.all([
      fetchPage(DSE_URL),
      fetchNameMap(),
    ]);

    const stocks = parseDSE(priceHtml, nameMap);

    if (!stocks.length) {
      return res.status(502).json({ error: 'Parsed 0 stocks — DSE page may have changed structure.' });
    }

    console.log(`[DSE] ✓ ${stocks.length} stocks with names`);

    const payload = {
      stocks,
      count:     stocks.length,
      timestamp: new Date().toISOString(),
      cached:    false,
    };

    cache = { data: payload, ts: Date.now() };
    res.json(payload);

  } catch (err) {
    console.error('[DSE] Error:', err.message);
    if (cache.data) {
      console.log('[DSE] Returning stale cache');
      return res.json({ ...cache.data, cached: true, stale: true });
    }
    res.status(502).json({ error: err.message });
  }
});

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ status: 'ok', port: PORT }));

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🟢  DSE Tracker server running`);
  console.log(`    Frontend → http://localhost:${PORT}`);
  console.log(`    API      → http://localhost:${PORT}/api/stocks\n`);
});