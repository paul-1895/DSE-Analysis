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

  // Debug: log first data row to verify indices (remove after confirming)
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

    // The code cell (index 1) contains an <a> with the ticker;
    // the company name is in the link text or a title attribute.
    const codeCell = $(cells[1]);
    const linkEl   = codeCell.find('a').first();
    const code     = linkEl.text().trim() || text(1);
    const name     = codeCell.attr('title')
                  || linkEl.attr('title')
                  || linkEl.attr('data-name')
                  || code; // fallback: use ticker if no name found

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

// ─── SUPPORT / RESISTANCE ROUTES ─────────────────────────────────────────────
// Add this block to server.js (before app.listen)

const SR_DIR = path.join(__dirname, 'sr_levels');
if (!fs.existsSync(SR_DIR)) fs.mkdirSync(SR_DIR);

function srFilePath(code) {
  const safe = code.replace(/[^A-Za-z0-9_-]/g, '').toUpperCase();
  return path.join(SR_DIR, `${safe}.json`);
}

function readSR(code) {
  const fp = srFilePath(code);
  if (!fs.existsSync(fp)) return { support: [], resistance: [] };
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); }
  catch { return { support: [], resistance: [] }; }
}

function writeSR(code, data) {
  fs.writeFileSync(srFilePath(code), JSON.stringify(data, null, 2), 'utf8');
}

// GET all S/R levels for a stock
app.get('/api/sr/:code', (req, res) => {
  res.json(readSR(req.params.code));
});

// POST add a level  { type: 'support'|'resistance', price: number, note?: string }
app.post('/api/sr/:code', express.json(), (req, res) => {
  const { type, price, note } = req.body || {};
  if (!['support', 'resistance'].includes(type)) return res.status(400).json({ error: 'type must be support or resistance' });
  const p = parseFloat(price);
  if (!p || p <= 0) return res.status(400).json({ error: 'Invalid price' });
  const data = readSR(req.params.code);
  const entry = { id: Date.now().toString(), price: p, note: (note || '').trim(), createdAt: new Date().toISOString() };
  data[type].push(entry);
  // Keep ascending
  data[type].sort((a, b) => a.price - b.price);
  writeSR(req.params.code, data);
  res.json(entry);
});

// PATCH update a level  { price?, note? }
app.patch('/api/sr/:code/:type/:id', express.json(), (req, res) => {
  const { type, id } = req.params;
  if (!['support', 'resistance'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
  const data = readSR(req.params.code);
  const entry = data[type].find(e => e.id === id);
  if (!entry) return res.status(404).json({ error: 'Not found' });
  if (req.body.price !== undefined) {
    const p = parseFloat(req.body.price);
    if (!p || p <= 0) return res.status(400).json({ error: 'Invalid price' });
    entry.price = p;
  }
  if (req.body.note !== undefined) entry.note = req.body.note.trim();
  data[type].sort((a, b) => a.price - b.price);
  writeSR(req.params.code, data);
  res.json(entry);
});

// DELETE a level
app.delete('/api/sr/:code/:type/:id', (req, res) => {
  const { type, id } = req.params;
  if (!['support', 'resistance'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
  const data = readSR(req.params.code);
  const before = data[type].length;
  data[type] = data[type].filter(e => e.id !== id);
  if (data[type].length === before) return res.status(404).json({ error: 'Not found' });
  writeSR(req.params.code, data);
  res.json({ ok: true });
});

const { loadProjectContext } = require('./chat-context');

app.post('/api/chat/context', async (req, res) => {
  const { filePath } = req.body;

  const data = await loadProjectContext(filePath);

  if (!data) {
    return res.status(404).json({
      error: 'File not found'
    });
  }

  res.json(data);
});

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`DSE server running on http://localhost:${PORT}`);
  console.log(`Watchlist stored at:  ${WATCHLIST_FILE}`);
  console.log(`Portfolios stored at: ${PORTFOLIO_FILE}`);
});

