const express = require('express');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const financialsRouter = require('./routes/financials');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use('/api/financials', financialsRouter);
app.use(express.json());
app.use(express.static('.'));

// ─── WATCHLIST FILE ───────────────────────────────────────────────────────────
const WATCHLIST_FILE = path.join(__dirname, 'watchlist/watchlist.json');

function readWatchlists() {
  try {
    if (!fs.existsSync(WATCHLIST_FILE)) {
      fs.writeFileSync(WATCHLIST_FILE, JSON.stringify({ watchlists: [] }, null, 2));
    }
    const raw = fs.readFileSync(WATCHLIST_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return { watchlists: [] };
  }
}

function saveWatchlists(data) {
  fs.writeFileSync(WATCHLIST_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// GET all watchlists
app.get('/api/watchlists', (req, res) => {
  res.json(readWatchlists());
});

// POST create new watchlist
app.post('/api/watchlists', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  const data = readWatchlists();
  const newList = {
    id: Date.now().toString(),
    name: name.trim(),
    stocks: [],
    createdAt: new Date().toISOString()
  };
  data.watchlists.push(newList);
  saveWatchlists(data);
  res.json(newList);
});

// PATCH rename watchlist
app.patch('/api/watchlists/:id', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  const data = readWatchlists();
  const wl = data.watchlists.find(w => w.id === req.params.id);
  if (!wl) return res.status(404).json({ error: 'Not found' });
  wl.name = name.trim();
  saveWatchlists(data);
  res.json(wl);
});

// DELETE watchlist
app.delete('/api/watchlists/:id', (req, res) => {
  const data = readWatchlists();
  const idx = data.watchlists.findIndex(w => w.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  data.watchlists.splice(idx, 1);
  saveWatchlists(data);
  res.json({ ok: true });
});

// POST add stock to watchlist
app.post('/api/watchlists/:id/stocks', (req, res) => {
  const { code, name } = req.body;
  if (!code) return res.status(400).json({ error: 'Code required' });
  const data = readWatchlists();
  const wl = data.watchlists.find(w => w.id === req.params.id);
  if (!wl) return res.status(404).json({ error: 'Not found' });
  if (!wl.stocks.find(s => s.code === code)) {
    wl.stocks.push({ code, name: name || code, addedAt: new Date().toISOString() });
    saveWatchlists(data);
  }
  res.json(wl);
});

// DELETE stock from watchlist
app.delete('/api/watchlists/:id/stocks/:code', (req, res) => {
  const data = readWatchlists();
  const wl = data.watchlists.find(w => w.id === req.params.id);
  if (!wl) return res.status(404).json({ error: 'Not found' });
  wl.stocks = wl.stocks.filter(s => s.code !== req.params.code);
  saveWatchlists(data);
  res.json(wl);
});

// ─── PORTFOLIO FILE ───────────────────────────────────────────────────────────
const PORTFOLIO_FILE = path.join(__dirname, 'portfolios.json');

function readPortfolios() {
  try {
    if (!fs.existsSync(PORTFOLIO_FILE)) {
      fs.writeFileSync(PORTFOLIO_FILE, JSON.stringify({ portfolios: [] }, null, 2));
    }
    const raw = fs.readFileSync(PORTFOLIO_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return { portfolios: [] };
  }
}

function savePortfolios(data) {
  fs.writeFileSync(PORTFOLIO_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// GET all portfolios
app.get('/api/portfolios', (req, res) => {
  res.json(readPortfolios());
});

// POST create portfolio
app.post('/api/portfolios', (req, res) => {
  const { name, code, type, broker } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  const data = readPortfolios();
  const pf = {
    id:        Date.now().toString(),
    name:      name.trim(),
    code:      (code || '').trim(),
    type:      type || 'CASH',
    broker:    (broker || '').trim(),
    stocks:    [],
    dividends: [],
    createdAt: new Date().toISOString()
  };
  data.portfolios.push(pf);
  savePortfolios(data);
  res.json(pf);
});

// PATCH update portfolio meta
app.patch('/api/portfolios/:id', (req, res) => {
  const { name, code, type, broker } = req.body;
  const data = readPortfolios();
  const pf = data.portfolios.find(p => p.id === req.params.id);
  if (!pf) return res.status(404).json({ error: 'Not found' });
  if (name && name.trim()) pf.name   = name.trim();
  if (code  !== undefined)  pf.code   = code.trim();
  if (type  !== undefined)  pf.type   = type;
  if (broker !== undefined) pf.broker = broker.trim();
  savePortfolios(data);
  res.json(pf);
});

// DELETE portfolio
app.delete('/api/portfolios/:id', (req, res) => {
  const data = readPortfolios();
  const idx = data.portfolios.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  data.portfolios.splice(idx, 1);
  savePortfolios(data);
  res.json({ ok: true });
});

// POST add stock to portfolio
app.post('/api/portfolios/:id/stocks', (req, res) => {
  const { code, company, qty, saleQty, cost, mktPrice, sector, lock } = req.body;
  if (!code || !company) return res.status(400).json({ error: 'code and company required' });
  if (qty === undefined || cost === undefined || mktPrice === undefined)
    return res.status(400).json({ error: 'qty, cost and mktPrice required' });
  const data = readPortfolios();
  const pf = data.portfolios.find(p => p.id === req.params.id);
  if (!pf) return res.status(404).json({ error: 'Not found' });
  const stock = {
    id:       Date.now().toString(),
    code:     code.toUpperCase().trim(),
    company:  company.trim(),
    qty:      parseFloat(qty)      || 0,
    saleQty:  parseFloat(saleQty)  || 0,
    cost:     parseFloat(cost)     || 0,
    mktPrice: parseFloat(mktPrice) || 0,
    sector:   (sector || '').trim(),
    lock:     parseFloat(lock)     || 0,
    addedAt:  new Date().toISOString()
  };
  pf.stocks.push(stock);
  savePortfolios(data);
  res.json(stock);
});

// PATCH update a stock inside a portfolio
app.patch('/api/portfolios/:id/stocks/:stockId', (req, res) => {
  const { code, company, qty, saleQty, cost, mktPrice, sector, lock } = req.body;
  const data = readPortfolios();
  const pf = data.portfolios.find(p => p.id === req.params.id);
  if (!pf) return res.status(404).json({ error: 'Portfolio not found' });
  const st = pf.stocks.find(s => s.id === req.params.stockId);
  if (!st) return res.status(404).json({ error: 'Stock not found' });
  if (code     !== undefined) st.code     = code.toUpperCase().trim();
  if (company  !== undefined) st.company  = company.trim();
  if (qty      !== undefined) st.qty      = parseFloat(qty)      || 0;
  if (saleQty  !== undefined) st.saleQty  = parseFloat(saleQty)  || 0;
  if (cost     !== undefined) st.cost     = parseFloat(cost)     || 0;
  if (mktPrice !== undefined) st.mktPrice = parseFloat(mktPrice) || 0;
  if (sector   !== undefined) st.sector   = sector.trim();
  if (lock     !== undefined) st.lock     = parseFloat(lock)     || 0;
  savePortfolios(data);
  res.json(st);
});

// DELETE stock from portfolio
app.delete('/api/portfolios/:id/stocks/:stockId', (req, res) => {
  const data = readPortfolios();
  const pf = data.portfolios.find(p => p.id === req.params.id);
  if (!pf) return res.status(404).json({ error: 'Not found' });
  const before = pf.stocks.length;
  pf.stocks = pf.stocks.filter(s => s.id !== req.params.stockId);
  if (pf.stocks.length === before) return res.status(404).json({ error: 'Stock not found' });
  savePortfolios(data);
  res.json({ ok: true });
});

// POST add dividend to portfolio
app.post('/api/portfolios/:id/dividends', (req, res) => {
  const { company, type, holdings, rate, date } = req.body;
  if (!company || holdings === undefined || rate === undefined)
    return res.status(400).json({ error: 'company, holdings and rate required' });
  const data = readPortfolios();
  const pf = data.portfolios.find(p => p.id === req.params.id);
  if (!pf) return res.status(404).json({ error: 'Not found' });
  if (!pf.dividends) pf.dividends = [];
  const div = {
    id:       Date.now().toString(),
    company:  company.trim(),
    type:     type || 'CASH',
    holdings: parseFloat(holdings) || 0,
    rate:     parseFloat(rate)     || 0,
    date:     date || '',
    addedAt:  new Date().toISOString()
  };
  pf.dividends.push(div);
  savePortfolios(data);
  res.json(div);
});

// PATCH update a dividend
app.patch('/api/portfolios/:id/dividends/:divId', (req, res) => {
  const { company, type, holdings, rate, date } = req.body;
  const data = readPortfolios();
  const pf = data.portfolios.find(p => p.id === req.params.id);
  if (!pf) return res.status(404).json({ error: 'Portfolio not found' });
  const dv = (pf.dividends || []).find(d => d.id === req.params.divId);
  if (!dv) return res.status(404).json({ error: 'Dividend not found' });
  if (company  !== undefined) dv.company  = company.trim();
  if (type     !== undefined) dv.type     = type;
  if (holdings !== undefined) dv.holdings = parseFloat(holdings) || 0;
  if (rate     !== undefined) dv.rate     = parseFloat(rate)     || 0;
  if (date     !== undefined) dv.date     = date;
  savePortfolios(data);
  res.json(dv);
});

// DELETE dividend
app.delete('/api/portfolios/:id/dividends/:divId', (req, res) => {
  const data = readPortfolios();
  const pf = data.portfolios.find(p => p.id === req.params.id);
  if (!pf) return res.status(404).json({ error: 'Not found' });
  const before = (pf.dividends || []).length;
  pf.dividends = (pf.dividends || []).filter(d => d.id !== req.params.divId);
  if (pf.dividends.length === before) return res.status(404).json({ error: 'Dividend not found' });
  savePortfolios(data);
  res.json({ ok: true });
});

// ─── DSE SCRAPER ─────────────────────────────────────────────────────────────
let cache = null;
let cacheTime = 0;
const CACHE_TTL = 60 * 1000;

async function scrapeStocks() {
  const url = 'https://www.dsebd.org/latest_share_price_scroll_l.php';
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'text/html'
    }
  });
  const html = await res.text();
  const $ = cheerio.load(html);
  const stocks = [];

  let debugDone = false;

  $('table.table tr').each((i, row) => {
    if (i === 0) return;
    const cells = $(row).find('td');
    if (!debugDone) {
      cells.each((j, td) => console.log(`cell[${j}]: "${$(td).text().trim()}"`));
      debugDone = true;
    }
    if (cells.length < 9) return;
    const text = (idx) => $(cells[idx]).text().trim();
    const num  = (idx) => parseFloat(text(idx).replace(/,/g, '')) || 0;

    const codeCell = $(cells[1]);
    const linkEl   = codeCell.find('a').first();
    const code     = linkEl.text().trim() || text(1);
    const name     = codeCell.attr('title')
                  || linkEl.attr('title')
                  || linkEl.attr('data-name')
                  || code;

    stocks.push({
      code,
      name,
      ltp:    num(2),
      high:   num(3),
      low:    num(4),
      close:  num(5),
      ycp:    num(6),
      change: num(7),
      volume: parseInt(text(8).replace(/,/g, '')) || 0
    });
  });

  return stocks;
}

app.get('/api/stocks', async (req, res) => {
  try {
    const now = Date.now();
    if (cache && now - cacheTime < CACHE_TTL) {
      return res.json({ stocks: cache, timestamp: new Date(cacheTime).toISOString(), cached: true });
    }
    const stocks = await scrapeStocks();
    cache = stocks;
    cacheTime = now;
    res.json({ stocks, timestamp: new Date().toISOString(), cached: false });
  } catch (err) {
    console.error(err);
    if (cache) return res.json({ stocks: cache, timestamp: new Date(cacheTime).toISOString(), cached: true, error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─── COMPANY DETAILS SCRAPER ──────────────────────────────────────────────────
const companyDetailCache = new Map();
const DETAIL_CACHE_TTL   = 5 * 60 * 1000; // 5 minutes

/**
 * Scrape rich company detail from dsebd.org/displayCompany.php
 * Returns an object with all available fields (null when not found).
 */
async function scrapeCompanyDetails(code) {
  const url = `https://www.dsebd.org/displayCompany.php?name=${encodeURIComponent(code)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml'
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const $    = cheerio.load(html);

  const details = {
    weekHigh52:        null,
    weekLow52:         null,
    marketCap:         null,
    paidUpCapital:     null,
    authorizedCapital: null,
    nav:               null,
    totalShares:       null,
    cashDividend:      null,
    stockDividend:     null,
    beta:              null,
    shortTermLoan:     null,
    longTermLoan:      null,
    dividendYield:     null,
    eps:               null,
    pe:                null,
  };

  // Generic key-value extractor: scan all table rows, match label in any cell,
  // take the NEXT cell as the value. Handles 2-col and multi-col tables.
  function extract(patterns) {
    let found = null;
    $('table tr').each((_, row) => {
      if (found) return false;
      const cells = $(row).find('td, th');
      cells.each((i, cell) => {
        if (found) return false;
        const label = $(cell).text().trim().toLowerCase()
          .replace(/[:\-_]/g, ' ').replace(/\s+/g, ' ');
        const matched = patterns.some(p => label.includes(p));
        if (matched && i + 1 < cells.length) {
          const raw = $(cells[i + 1]).text().trim().replace(/\s+/g, ' ');
          if (raw && raw !== '—' && raw !== '-' && raw !== 'N/A') {
            found = raw;
          }
        }
      });
    });
    return found;
  }

  details.weekHigh52        = extract(['52 week high', '52w high', '52 wk high', '52week high', 'year high', '52 weeks high']);
  details.weekLow52         = extract(['52 week low',  '52w low',  '52 wk low',  '52week low',  'year low',  '52 weeks low']);
  details.marketCap         = extract(['market cap', 'market capitaliz', 'mkt cap']);
  details.paidUpCapital     = extract(['paid up capital', 'paid-up capital', 'paidup capital', 'paid up cap']);
  details.authorizedCapital = extract(['authorized capital', 'authorised capital', 'authorised cap', 'authorized cap']);
  details.nav               = extract(['nav per share', 'nav/share', 'net asset value per share', 'book value per share', 'nav']);
  details.totalShares        = extract(['total shares', 'shares outstanding', 'no. of shares', 'number of shares', 'outstanding shares', 'total no of share', 'no of share']);
  details.cashDividend      = extract(['cash dividend', 'cash div']);
  details.stockDividend     = extract(['stock dividend', 'bonus share', 'bonus dividend', 'stock div', 'scrip dividend']);
  details.beta              = extract(['beta']);
  details.shortTermLoan     = extract(['short term loan', 'short-term loan', 'short term borrowing', 'st loan', 'short term debt']);
  details.longTermLoan      = extract(['long term loan',  'long-term loan',  'long term borrowing',  'lt loan', 'long term debt']);
  details.dividendYield     = extract(['dividend yield', 'div yield', 'yield %', 'dividend yield %']);
  details.eps               = extract(['eps', 'earnings per share', 'earning per share']);
  details.pe                = extract(['p/e ratio', 'pe ratio', 'price earning ratio', 'price to earning', 'p/e', 'p e ratio']);

  // Log what we found for debugging
  console.log(`[company-details] ${code}:`, JSON.stringify(details));
  return details;
}

app.get('/api/company-details/:code', async (req, res) => {
  const code   = req.params.code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const now    = Date.now();
  const cached = companyDetailCache.get(code);

  if (cached && now - cached.time < DETAIL_CACHE_TTL) {
    return res.json({ ...cached.data, cached: true });
  }

  try {
    const data = await scrapeCompanyDetails(code);
    companyDetailCache.set(code, { data, time: now });
    res.json({ ...data, cached: false });
  } catch (err) {
    console.error(`[company-details] Error scraping ${code}:`, err.message);
    // Return stale cache if available, otherwise empty object
    if (cached) return res.json({ ...cached.data, cached: true, stale: true });
    res.status(500).json({ error: err.message });
  }
});

// ─── NEWS ─────────────────────────────────────────────────────────────────────
const NEWS_DIR = path.join(__dirname, 'news');
if (!fs.existsSync(NEWS_DIR)) fs.mkdirSync(NEWS_DIR);

function newsFilePath(code) {
  const safe = code.replace(/[^A-Za-z0-9_-]/g, '').toUpperCase();
  return path.join(NEWS_DIR, `${safe}.json`);
}

function readNews(code) {
  const fp = newsFilePath(code);
  if (!fs.existsSync(fp)) return [];
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); }
  catch { return []; }
}

function writeNews(code, items) {
  fs.writeFileSync(newsFilePath(code), JSON.stringify(items, null, 2), 'utf8');
}

const https = require('https');
const http  = require('http');

function fetchPreview(url) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 8000);
    const client = url.startsWith('https') ? https : http;
    client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (DSE-Analysis link-preview bot)' } }, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        clearTimeout(timeout);
        return fetchPreview(res.headers.location).then(resolve);
      }
      let html = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { html += chunk; if (html.length > 200_000) res.destroy(); });
      res.on('end', () => {
        clearTimeout(timeout);
        const extract = (pattern) => { const m = html.match(pattern); return m ? m[1].trim() : null; };
        const title =
          extract(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
          extract(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i) ||
          extract(/<title[^>]*>([^<]+)<\/title>/i) || null;
        const description =
          extract(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
          extract(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i) ||
          extract(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
          extract(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i) || null;
        const image =
          extract(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
          extract(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) || null;
        const siteName =
          extract(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i) ||
          extract(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i) || null;
        resolve({ title, description, image, siteName });
      });
      res.on('error', () => { clearTimeout(timeout); resolve(null); });
    }).on('error', () => { clearTimeout(timeout); resolve(null); });
  });
}

app.get('/api/news/:code', (req, res) => {
  res.json({ items: readNews(req.params.code) });
});

app.post('/api/news/:code', express.json(), async (req, res) => {
  const { code } = req.params;
  const { url }  = req.body || {};
  if (!url || !/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'Invalid URL' });
  const items = readNews(code);
  if (items.some(i => i.url === url)) return res.status(409).json({ error: 'URL already saved' });
  const preview = await fetchPreview(url);
  const item = {
    id:          Date.now().toString(),
    url,
    addedAt:     new Date().toISOString(),
    title:       preview?.title       || null,
    description: preview?.description || null,
    image:       preview?.image       || null,
    siteName:    preview?.siteName    || null,
  };
  items.unshift(item);
  writeNews(code, items);
  res.json({ item });
});

app.delete('/api/news/:code/:id', (req, res) => {
  const { code, id } = req.params;
  let items = readNews(code);
  const before = items.length;
  items = items.filter(i => i.id !== id);
  if (items.length === before) return res.status(404).json({ error: 'Not found' });
  writeNews(code, items);
  res.json({ ok: true });
});

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`DSE server running on http://localhost:${PORT}`);
  console.log(`Watchlist stored at:  ${WATCHLIST_FILE}`);
  console.log(`Portfolios stored at: ${PORTFOLIO_FILE}`);
});