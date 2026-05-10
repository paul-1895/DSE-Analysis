const express = require('express');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// ─── WATCHLIST FILE ───────────────────────────────────────────────────────────
const WATCHLIST_FILE = path.join(__dirname, 'watchlist.json');

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

  $('table.table tr').each((i, row) => {
    if (i === 0) return;
    const cells = $(row).find('td');
    if (cells.length < 10) return;
    const text = (idx) => $(cells[idx]).text().trim();
    const num = (idx) => parseFloat(text(idx).replace(/,/g, '')) || 0;

    stocks.push({
      code: text(1),
      name: text(2),
      ltp: num(3),
      high: num(4),
      low: num(5),
      close: num(6),
      ycp: num(7),
      change: num(8),
      volume: parseInt(text(9).replace(/,/g, '')) || 0
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

// ============================================================
// NEWS API ROUTES — Add these to your server.js
// Place BEFORE your app.listen() call
// ============================================================

// Required: add these requires at the top of server.js
// const path = require('path');
// const fs   = require('fs');

// ---- helpers -----------------------------------------------

const NEWS_DIR = path.join(__dirname, 'news');

// Ensure news directory exists
if (!fs.existsSync(NEWS_DIR)) fs.mkdirSync(NEWS_DIR);

function newsFilePath(code) {
  // Sanitise code so it can safely be a filename
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

// ---- fetch Open-Graph / meta preview -----------------------

const https = require('https');
const http  = require('http');

function fetchPreview(url) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 8000);

    const client = url.startsWith('https') ? https : http;
    client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (DSE-Analysis link-preview bot)' } }, (res) => {
      // Follow one redirect
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        clearTimeout(timeout);
        return fetchPreview(res.headers.location).then(resolve);
      }

      let html = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        html += chunk;
        if (html.length > 200_000) res.destroy(); // don't download megabytes
      });
      res.on('end', () => {
        clearTimeout(timeout);
        const extract = (pattern) => { const m = html.match(pattern); return m ? m[1].trim() : null; };

        const title =
          extract(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
          extract(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i) ||
          extract(/<title[^>]*>([^<]+)<\/title>/i) ||
          null;

        const description =
          extract(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
          extract(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i) ||
          extract(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
          extract(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i) ||
          null;

        const image =
          extract(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
          extract(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
          null;

        const siteName =
          extract(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i) ||
          extract(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i) ||
          null;

        resolve({ title, description, image, siteName });
      });
      res.on('error', () => { clearTimeout(timeout); resolve(null); });
    }).on('error', () => { clearTimeout(timeout); resolve(null); });
  });
}

// ---- routes ------------------------------------------------

// GET  /api/news/:code          → list all news for a stock
app.get('/api/news/:code', (req, res) => {
  const items = readNews(req.params.code);
  res.json({ items });
});

// POST /api/news/:code          → add a news link
// Body: { url: "https://..." }
app.post('/api/news/:code', express.json(), async (req, res) => {
  const { code } = req.params;
  const { url }  = req.body || {};

  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  const items = readNews(code);

  // Duplicate guard
  if (items.some(i => i.url === url)) {
    return res.status(409).json({ error: 'URL already saved' });
  }

  const preview = await fetchPreview(url);

  const item = {
    id:        Date.now().toString(),
    url,
    addedAt:   new Date().toISOString(),
    title:     preview?.title       || null,
    description: preview?.description || null,
    image:     preview?.image       || null,
    siteName:  preview?.siteName    || null,
  };

  items.unshift(item);   // newest first
  writeNews(code, items);
  res.json({ item });
});

// DELETE /api/news/:code/:id    → remove one link by id
app.delete('/api/news/:code/:id', (req, res) => {
  const { code, id } = req.params;
  let items = readNews(code);
  const before = items.length;
  items = items.filter(i => i.id !== id);
  if (items.length === before) return res.status(404).json({ error: 'Not found' });
  writeNews(code, items);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`DSE server running on http://localhost:${PORT}`);
  console.log(`Watchlist stored at: ${WATCHLIST_FILE}`);
});