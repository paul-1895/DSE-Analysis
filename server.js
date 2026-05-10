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

app.listen(PORT, () => {
  console.log(`DSE server running on http://localhost:${PORT}`);
  console.log(`Watchlist stored at: ${WATCHLIST_FILE}`);
});