/**
 * routes/financials.js
 * -------------------
 * Express router for manually-entered company financials.
 * Stores data in a local JSON file (data/financials.json).
 *
 * Mount in server.js:
 *   const financialsRouter = require('./routes/financials');
 *   app.use('/api/financials', financialsRouter);
 */

const express  = require('express');
const fs       = require('fs');
const path     = require('path');

const router   = express.Router();
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE  = path.join(DATA_DIR, 'financials.json');

// ── helpers ────────────────────────────────────────────────────────────────

function readDB() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE))  fs.writeFileSync(DB_FILE, JSON.stringify({}));
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return {}; }
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ── GET /api/financials/:code ───────────────────────────────────────────────
// Returns all financial entries for a company code.
router.get('/:code', (req, res) => {
  const code = req.params.code.toUpperCase();
  const db   = readDB();
  res.json(db[code] || { eps: [], dividend: [], nocfps: [], revenue: [], nav: [] });
});

// ── POST /api/financials/:code/:type ───────────────────────────────────────
// Adds or updates one entry.
//
// Body for eps / nocfps / revenue / nav:
//   { value: 1.23, quarter: "Q1", year: 2024 }
//
// Body for dividend:
//   { cashDividend: 10.5, stockDividend: 5.0, year: 2024 }
//
router.post('/:code/:type', (req, res) => {
  const code = req.params.code.toUpperCase();
  const type = req.params.type.toLowerCase();

  const allowed = ['eps', 'dividend', 'nocfps', 'revenue', 'nav'];
  if (!allowed.includes(type)) {
    return res.status(400).json({ error: `Unknown type "${type}". Allowed: ${allowed.join(', ')}` });
  }

  const db = readDB();
  if (!db[code]) db[code] = { eps: [], dividend: [], nocfps: [], revenue: [], nav: [] };

  const body = req.body;

  if (type === 'dividend') {
    const { cashDividend, stockDividend, year } = body;
    if (cashDividend === undefined || stockDividend === undefined || !year) {
      return res.status(400).json({ error: 'dividend requires cashDividend, stockDividend, year' });
    }
    // Replace existing entry for same year, or push new
    const idx = db[code].dividend.findIndex(e => e.year === Number(year));
    const entry = { cashDividend: parseFloat(cashDividend), stockDividend: parseFloat(stockDividend), year: Number(year), updatedAt: new Date().toISOString() };
    if (idx >= 0) db[code].dividend[idx] = entry; else db[code].dividend.push(entry);

  } else {
    const { value, quarter, year } = body;
    if (value === undefined || !quarter || !year) {
      return res.status(400).json({ error: `${type} requires value, quarter, year` });
    }
    const idx = db[code][type].findIndex(e => e.quarter === quarter && e.year === Number(year));
    const entry = { value: parseFloat(value), quarter, year: Number(year), updatedAt: new Date().toISOString() };
    if (idx >= 0) db[code][type][idx] = entry; else db[code][type].push(entry);
  }

  writeDB(db);
  res.json({ success: true, data: db[code] });
});

// ── DELETE /api/financials/:code/:type ─────────────────────────────────────
// Body for eps / nocfps / revenue / nav: { quarter, year }
// Body for dividend:                     { year }
router.delete('/:code/:type', (req, res) => {
  const code = req.params.code.toUpperCase();
  const type = req.params.type.toLowerCase();
  const db   = readDB();

  if (!db[code]) return res.json({ success: true });

  const { quarter, year } = req.body;

  if (type === 'dividend') {
    db[code].dividend = db[code].dividend.filter(e => e.year !== Number(year));
  } else {
    db[code][type] = db[code][type].filter(
      e => !(e.quarter === quarter && e.year === Number(year))
    );
  }

  writeDB(db);
  res.json({ success: true, data: db[code] });
});

module.exports = router;
