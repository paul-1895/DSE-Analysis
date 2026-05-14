/**
 * historyRouter.js
 * ----------------
 * Handles saving daily DSE price snapshots to disk.
 *
 * Files are saved to:  <project-root>/priceHistory/DSE_prices_YYYY-MM-DD.json
 *
 * Endpoints:
 *   POST /api/save-snapshot   – writes priceHistory/DSE_prices_YYYY-MM-DD.json
 *   GET  /api/snapshots       – lists all saved snapshot dates
 *   GET  /api/snapshot/:date  – returns one day's JSON  (date = YYYY-MM-DD)
 */

const express = require('express');
const fs      = require('fs');
const path    = require('path');

const router = express.Router();

// Saves inside <project-root>/priceHistory/
const HISTORY_DIR = path.join(__dirname, 'priceHistory');

if (!fs.existsSync(HISTORY_DIR)) {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns current Bangladesh Standard Time (UTC+6) as a Date object. */
function nowBST() {
  return new Date(Date.now() + 6 * 60 * 60 * 1000);
}

/** Returns today's date in BST as "YYYY-MM-DD". */
function todayBST() {
  return nowBST().toISOString().slice(0, 10);
}

/** Returns current BST datetime as a clean ISO string (no trailing Z). */
function nowBSTString() {
  return nowBST().toISOString().replace('Z', '').slice(0, 19);
}

/**
 * Returns true if the given BST date falls on a DSE weekend.
 * DSE is closed on Friday (5) and Saturday (6).
 * Date.getUTCDay() on a UTC+6-shifted date gives the correct BST weekday.
 */
function isDSEWeekend(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay(); // 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
  return day === 5 || day === 6;
}

function filePathFor(dateStr) {
  return path.join(HISTORY_DIR, `DSE_prices_${dateStr}.json`);
}

// ── POST /api/save-snapshot ──────────────────────────────────────────────────
router.post('/save-snapshot', express.json({ limit: '2mb' }), (req, res) => {
  const { stocks } = req.body;

  if (!Array.isArray(stocks) || stocks.length === 0) {
    return res.status(400).json({ error: 'stocks array is required and must not be empty' });
  }

  const dateStr = todayBST();

  // Skip DSE weekends (Friday & Saturday)
  if (isDSEWeekend(dateStr)) {
    return res.json({ skipped: true, reason: `DSE is closed on weekends (${dateStr} is a Friday or Saturday)` });
  }

  // Skip if all LTPs are 0 — market holiday or no data
  const allZero = stocks.every(s => Number(s.ltp) === 0);
  if (allZero) {
    return res.json({ skipped: true, reason: 'All LTPs are 0 — market likely closed or data unavailable' });
  }

  const payload = {
    date:    dateStr,
    savedAt: nowBSTString(),
    stocks:  stocks.map(s => ({
      code:    s.code || s.TRADING_CODE || '',
      ltp:     Number(s.ltp)  || 0,
      ycp:     Number(s.ycp)  || 0,
      highest: Number(s.high) || 0,
      lowest:  Number(s.low)  || 0,
    })),
  };

  const filePath = filePathFor(dateStr);

  try {
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`[history] Saved ${payload.stocks.length} stocks → priceHistory/DSE_prices_${dateStr}.json`);
    return res.json({
      saved: true,
      date:  dateStr,
      file:  `priceHistory/DSE_prices_${dateStr}.json`,
      count: payload.stocks.length,
    });
  } catch (err) {
    console.error('[history] Failed to write file:', err);
    return res.status(500).json({ error: 'Failed to write snapshot file', detail: err.message });
  }
});

// ── GET /api/snapshots ───────────────────────────────────────────────────────
router.get('/snapshots', (req, res) => {
  try {
    const files = fs.readdirSync(HISTORY_DIR)
      .filter(f => f.startsWith('DSE_prices_') && f.endsWith('.json'))
      .sort()
      .reverse()
      .map(f => ({
        date: f.replace('DSE_prices_', '').replace('.json', ''),
        file: f,
      }));
    return res.json({ snapshots: files, count: files.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/snapshot/:date ──────────────────────────────────────────────────
router.get('/snapshot/:date', (req, res) => {
  const { date } = req.params;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Date must be in YYYY-MM-DD format' });
  }

  const filePath = filePathFor(date);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: `No snapshot found for ${date}` });
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to read snapshot', detail: err.message });
  }
});

module.exports = router;