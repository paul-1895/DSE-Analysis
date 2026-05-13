// ═══════════════════════════════════════════════════════════
// WATCHLIST STATE & API
// ═══════════════════════════════════════════════════════════
let watchlists = [];        // [{id, name, stocks:[{code,name}]}]
let allStocksData = [];     // current full stock list (for live prices)

const API = 'http://localhost:3000';

async function fetchWatchlists() {
  try {
    const r = await fetch(`${API}/api/watchlists`);
    const d = await r.json();
    watchlists = d.watchlists || [];
    renderWatchlistPanel();
    updateFavButtons();
    updateWatchlistBadge();
  } catch (e) {
    console.error('Watchlist fetch failed', e);
  }
}

async function createWatchlist(name) {
  const r = await fetch(`${API}/api/watchlists`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  const wl = await r.json();
  watchlists.push(wl);
  renderWatchlistPanel();
  updateFavButtons();
  updateWatchlistBadge();
  return wl;
}

async function renameWatchlist(id, name) {
  await fetch(`${API}/api/watchlists/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  const wl = watchlists.find(w => w.id === id);
  if (wl) wl.name = name;
  renderWatchlistPanel();
}

async function deleteWatchlist(id) {
  if (!confirm('Delete this watchlist?')) return;
  await fetch(`${API}/api/watchlists/${id}`, { method: 'DELETE' });
  watchlists = watchlists.filter(w => w.id !== id);
  renderWatchlistPanel();
  updateFavButtons();
  updateWatchlistBadge();
}

async function addStockToWatchlist(wlId, code, name) {
  await fetch(`${API}/api/watchlists/${wlId}/stocks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, name })
  });
  const wl = watchlists.find(w => w.id === wlId);
  if (wl && !wl.stocks.find(s => s.code === code)) {
    wl.stocks.push({ code, name });
  }
  renderWatchlistPanel();
  updateFavButtons();
}

async function removeStockFromWatchlist(wlId, code) {
  await fetch(`${API}/api/watchlists/${wlId}/stocks/${code}`, { method: 'DELETE' });
  const wl = watchlists.find(w => w.id === wlId);
  if (wl) wl.stocks = wl.stocks.filter(s => s.code !== code);
  renderWatchlistPanel();
  updateFavButtons();
}

// ═══════════════════════════════════════════════════════════
// PANEL OPEN / CLOSE
// ═══════════════════════════════════════════════════════════
function openWatchlistPanel() {
  document.getElementById('wl-panel').classList.add('open');
  document.getElementById('wl-overlay').classList.add('open');
}
function closeWatchlistPanel() {
  document.getElementById('wl-panel').classList.remove('open');
  document.getElementById('wl-overlay').classList.remove('open');
}

// ═══════════════════════════════════════════════════════════
// CREATE INPUT
// ═══════════════════════════════════════════════════════════
function showCreateInput() {
  document.getElementById('wl-create-input').style.display = 'flex';
  document.getElementById('wl-new-btn').style.display = 'none';
  document.getElementById('wl-create-name').value = '';
  document.getElementById('wl-create-name').focus();
}
function hideCreateInput() {
  document.getElementById('wl-create-input').style.display = 'none';
  document.getElementById('wl-new-btn').style.display = 'flex';
}
async function confirmCreate() {
  const name = document.getElementById('wl-create-name').value.trim();
  if (!name) return;
  await createWatchlist(name);
  hideCreateInput();
}

// ═══════════════════════════════════════════════════════════
// RENDER WATCHLIST PANEL
// ═══════════════════════════════════════════════════════════
function renderWatchlistPanel() {
  const container = document.getElementById('wl-lists');

  if (watchlists.length === 0) {
    container.innerHTML = '<div class="wl-empty-msg">No watchlists yet. Create one above!</div>';
    return;
  }

  // Preserve expanded state before wiping DOM
  const expanded = new Set();
  container.querySelectorAll('.wl-card.expanded').forEach(el => expanded.add(el.dataset.id));

  container.innerHTML = '';

  watchlists.forEach(wl => {
    const card = document.createElement('div');
    card.className = 'wl-card' + (expanded.has(wl.id) ? ' expanded' : '');
    card.dataset.id = wl.id;

    // Build stock items HTML
    let stocksHTML = '';
    if (wl.stocks.length === 0) {
      stocksHTML = `<div class="wl-empty-msg">No stocks yet. Use ⭐ on any row.</div>`;
    } else {
      wl.stocks.forEach(s => {
        const live = allStocksData.find(x => x.code === s.code);
        let priceHtml = '—';
        if (live) {
          const dir = live.change > 0 ? 'up' : live.change < 0 ? 'dn' : '';
          const sign = live.change > 0 ? '+' : '';
          priceHtml = `<span class="wl-stock-price ${dir}">৳${live.ltp.toFixed(1)} <small>${sign}${live.change.toFixed(1)}</small></span>`;
        }
        stocksHTML += `
          <div class="wl-stock-item">
            <div class="wl-stock-info">
              <div class="wl-stock-code"><a href="/company.html?code=${encodeURIComponent(s.code)}" style="color:inherit;text-decoration:none;">${s.code}</a></div>
              <div class="wl-stock-name">${s.name}</div>
            </div>
            ${priceHtml}
            <button class="wl-remove-stock" title="Remove" onclick="removeStockFromWatchlist('${wl.id}','${s.code}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>`;
      });
    }

    card.innerHTML = `
      <div class="wl-card-header" onclick="toggleWlCard(this)">
        <div class="wl-card-left">
          <span class="wl-chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg></span>
          <span class="wl-card-name">${escHtml(wl.name)}</span>
          <span class="wl-stock-count">${wl.stocks.length} stock${wl.stocks.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="wl-card-actions">
          <button class="wl-action-btn" title="Rename" onclick="event.stopPropagation();showRename('${wl.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
          </button>
          <button class="wl-action-btn danger" title="Delete" onclick="event.stopPropagation();deleteWatchlist('${wl.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      </div>
      <div class="wl-rename-wrap" id="wl-rename-${wl.id}">
        <input type="text" value="${escHtml(wl.name)}" placeholder="New name…" onkeydown="if(event.key==='Enter')confirmRename('${wl.id}',this.value)" />
        <button onclick="confirmRename('${wl.id}',document.querySelector('#wl-rename-${wl.id} input').value)">Save</button>
      </div>
      <div class="wl-stocks-body">${stocksHTML}</div>`;

    container.appendChild(card);
  });
}

function toggleWlCard(header) {
  header.closest('.wl-card').classList.toggle('expanded');
}

function showRename(id) {
  const el = document.getElementById(`wl-rename-${id}`);
  el.classList.toggle('show');
  if (el.classList.contains('show')) el.querySelector('input').focus();
}

async function confirmRename(id, name) {
  name = name.trim();
  if (!name) return;
  await renameWatchlist(id, name);
  const el = document.getElementById(`wl-rename-${id}`);
  if (el) el.classList.remove('show');
}

// ═══════════════════════════════════════════════════════════
// WATCHLIST BADGE (header count)
// ═══════════════════════════════════════════════════════════
function updateWatchlistBadge() {
  document.getElementById('wl-count-badge').textContent = watchlists.length;
}

// ═══════════════════════════════════════════════════════════
// FAV BUTTONS IN TABLE
// ═══════════════════════════════════════════════════════════

// Returns true if stock is in ANY watchlist
function stockInAnyWatchlist(code) {
  return watchlists.some(wl => wl.stocks.find(s => s.code === code));
}

function updateFavButtons() {
  document.querySelectorAll('.fav-btn[data-code]').forEach(btn => {
    const code = btn.dataset.code;
    if (stockInAnyWatchlist(code)) {
      btn.classList.add('active');
      btn.title = 'In watchlist';
    } else {
      btn.classList.remove('active');
      btn.title = 'Add to watchlist';
    }
  });
}

// Open / close fav dropdown
let openDropdownCode = null;

function toggleFavDropdown(btn, code, name) {
  // Close any other open dropdown first
  if (openDropdownCode && openDropdownCode !== code) {
    closeFavDropdown(openDropdownCode);
  }

  const dd = document.getElementById(`fav-dd-${code}`);
  if (!dd) return;

  if (dd.classList.contains('open')) {
    closeFavDropdown(code);
  } else {
    openFavDropdown(code, name, dd);
  }
}

function openFavDropdown(code, name, dd) {
  renderFavDropdown(code, name, dd);
  dd.classList.add('open');
  openDropdownCode = code;
}

function closeFavDropdown(code) {
  const dd = document.getElementById(`fav-dd-${code}`);
  if (dd) dd.classList.remove('open');
  if (openDropdownCode === code) openDropdownCode = null;
}

function renderFavDropdown(code, name, dd) {
  dd.innerHTML = '';

  // Header
  const header = document.createElement('div');
  header.className = 'fav-dropdown-header';
  header.textContent = 'Add to Watchlist';
  dd.appendChild(header);

  if (watchlists.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'fav-dropdown-empty';
    empty.textContent = 'No watchlists yet.';
    dd.appendChild(empty);
  } else {
    const list = document.createElement('div');
    list.className = 'fav-dropdown-list';

    watchlists.forEach(wl => {
      const inList = !!wl.stocks.find(s => s.code === code);
      const item = document.createElement('div');
      item.className = 'fav-dropdown-item' + (inList ? ' in-list' : '');
      item.innerHTML = `
        <svg class="fav-item-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          ${inList ? '<polyline points="20 6 9 17 4 12"/>' : '<rect x="3" y="3" width="18" height="18" rx="3" ry="3"/>'}
        </svg>
        <span class="fav-item-name">${escHtml(wl.name)}</span>
        <small style="font-family:var(--mono);font-size:9px;color:var(--text-muted)">${wl.stocks.length}</small>`;
      item.addEventListener('click', async () => {
        if (inList) {
          await removeStockFromWatchlist(wl.id, code);
        } else {
          await addStockToWatchlist(wl.id, code, name);
        }
        if (dd.classList.contains('open')) renderFavDropdown(code, name, dd);
      });
      list.appendChild(item);
    });

    dd.appendChild(list);
  }

  // Footer
  const footer = document.createElement('div');
  footer.className = 'fav-dropdown-footer';
  const createBtn = document.createElement('button');
  createBtn.className = 'fav-dropdown-create';
  createBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg> New Watchlist & Add`;
  createBtn.addEventListener('click', async () => {
    const wlName = prompt('New watchlist name:');
    if (!wlName || !wlName.trim()) return;
    const wl = await createWatchlist(wlName.trim());
    await addStockToWatchlist(wl.id, code, name);
    closeFavDropdown(code);
  });
  footer.appendChild(createBtn);
  dd.appendChild(footer);
}

// Close dropdown on outside click
document.addEventListener('click', e => {
  if (!e.target.closest('.fav-cell')) {
    if (openDropdownCode) closeFavDropdown(openDropdownCode);
  }
});

// ═══════════════════════════════════════════════════════════
// HOOK INTO app.js TABLE RENDERING
// (intercept after rows are rendered to inject fav cells)
// ═══════════════════════════════════════════════════════════
// stockMeta: safe code→name lookup, avoids broken inline onclick strings
const stockMeta = {};

function injectFavCells() {
  // Populate meta from live data
  (allStocksData || []).forEach(s => { stockMeta[s.code] = s.name; });

  document.querySelectorAll('#stocks-tbody tr[data-code]').forEach(row => {
    if (row.querySelector('.fav-cell')) return; // already injected this render
    const code = row.dataset.code;
    const name = stockMeta[code] || code;
    const isActive = stockInAnyWatchlist(code);

    const td = document.createElement('td');
    td.className = 'fav-cell';

    const btn = document.createElement('button');
    btn.className = 'fav-btn' + (isActive ? ' active' : '');
    btn.dataset.code = code;
    btn.title = 'Add to watchlist';
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="${isActive ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
    btn.addEventListener('click', e => {
      e.stopPropagation();
      toggleFavDropdown(btn, code, name);
    });

    const dd = document.createElement('div');
    dd.className = 'fav-dropdown';
    dd.id = 'fav-dd-' + code;

    td.appendChild(btn);
    td.appendChild(dd);
    row.insertBefore(td, row.firstChild);
  });
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(s) {
  return String(s).replace(/'/g,"\\'");
}

// ═══════════════════════════════════════════════════════════
// INIT — run after app.js loads
// ═══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  fetchWatchlists();
});

// Poll watchlist prices every 60s to keep panel fresh
setInterval(() => {
  if (watchlists.length > 0) renderWatchlistPanel();
}, 60000);

window.openWatchlistPanel = openWatchlistPanel;
window.closeWatchlistPanel = closeWatchlistPanel;
window.showCreateInput = showCreateInput;
window.hideCreateInput = hideCreateInput;
window.confirmCreate = confirmCreate;
window.toggleWlCard = toggleWlCard;
window.showRename = showRename;
window.confirmRename = confirmRename;
window.deleteWatchlist = deleteWatchlist;
window.removeStockFromWatchlist = removeStockFromWatchlist;