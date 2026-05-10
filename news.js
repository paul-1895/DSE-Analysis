/* ================================================================
   news.js  —  News & Articles section for the Company Profile page
   Depends on: currentStockCode (set by company.js after profile loads)
   ================================================================ */

'use strict';

/* ----------------------------------------------------------------
   STATUS BANNER
---------------------------------------------------------------- */
function showNewsStatus(msg, type) {
  // type: 'error' | 'success' | 'loading' | ''
  const el = document.getElementById('news-status');
  el.textContent = msg;
  el.className   = 'news-status ' + (type || '');
  if (type === 'success') {
    setTimeout(() => { el.className = 'news-status'; }, 3000);
  }
}

/* ----------------------------------------------------------------
   LOAD & RENDER
---------------------------------------------------------------- */
async function loadNewsLinks(code) {
  try {
    const res  = await fetch(`http://localhost:3000/api/news/${code}`);
    const data = await res.json();
    renderNewsList(data.items || [], code);
  } catch {
    // Server may not have news routes yet — silently show empty state
    renderNewsList([], code);
  }
}

function renderNewsList(items, code) {
  const list  = document.getElementById('news-list');
  const empty = document.getElementById('news-empty');
  const badge = document.getElementById('news-count');

  badge.textContent = items.length;

  // Remove previously rendered items (keep the empty placeholder element)
  list.querySelectorAll('.news-item').forEach(el => el.remove());

  if (items.length === 0) {
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';
  items.forEach(item => list.appendChild(buildNewsItem(item, code)));
}

/* ----------------------------------------------------------------
   BUILD A SINGLE NEWS CARD
---------------------------------------------------------------- */
function buildNewsItem(item, code) {
  const li = document.createElement('li');
  li.className  = 'news-item';
  li.dataset.id = item.id;

  // --- Thumbnail ---
  const thumb = document.createElement('div');
  thumb.className = 'news-thumb';
  if (item.image) {
    const img = document.createElement('img');
    img.src   = item.image;
    img.alt   = '';
    img.onerror = () => img.replaceWith(makePlaceholderThumb());
    thumb.appendChild(img);
  } else {
    thumb.appendChild(makePlaceholderThumb());
  }

  // --- Content ---
  const content = document.createElement('div');
  content.className = 'news-content';

  const site = document.createElement('div');
  site.className = 'news-site';
  try {
    site.textContent = item.siteName || new URL(item.url).hostname.replace('www.', '');
  } catch { site.textContent = ''; }

  const title = document.createElement('div');
  title.className   = 'news-title';
  title.textContent = item.title || item.url;

  const desc = document.createElement('div');
  desc.className   = 'news-desc';
  desc.textContent = item.description || '';
  if (!item.description) desc.style.display = 'none';

  const meta     = document.createElement('div');
  meta.className = 'news-meta-row';

  const urlLabel = document.createElement('span');
  urlLabel.className   = 'news-url-label';
  urlLabel.textContent = item.url;

  const dateLabel = document.createElement('span');
  dateLabel.className = 'news-date';
  try {
    dateLabel.textContent = new Date(item.addedAt).toLocaleDateString('en-BD', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch { dateLabel.textContent = ''; }

  meta.appendChild(urlLabel);
  meta.appendChild(dateLabel);
  content.append(site, title, desc, meta);

  // --- Action buttons ---
  const actions = document.createElement('div');
  actions.className = 'news-item-actions';

  const openBtn = document.createElement('button');
  openBtn.className = 'news-open-btn';
  openBtn.title     = 'Open link';
  openBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
      <polyline points="15 3 21 3 21 9"/>
      <line x1="10" y1="14" x2="21" y2="3"/>
    </svg>`;
  openBtn.addEventListener('click', () => window.open(item.url, '_blank', 'noopener'));

  const delBtn = document.createElement('button');
  delBtn.className = 'news-del-btn';
  delBtn.title     = 'Remove link';
  delBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
    </svg>`;
  delBtn.addEventListener('click', () => deleteNewsLink(code, item.id, li));

  actions.appendChild(openBtn);
  actions.appendChild(delBtn);

  li.appendChild(thumb);
  li.appendChild(content);
  li.appendChild(actions);
  return li;
}

function makePlaceholderThumb() {
  const div = document.createElement('div');
  div.className = 'news-thumb-placeholder';
  div.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>`;
  return div;
}

/* ----------------------------------------------------------------
   ADD A LINK
---------------------------------------------------------------- */
async function addNewsLink() {
  const input = document.getElementById('news-url-input');
  const btn   = document.getElementById('news-add-btn');
  const url   = input.value.trim();

  if (!url) {
    showNewsStatus('Please paste a URL first.', 'error');
    input.focus();
    return;
  }
  if (!/^https?:\/\//i.test(url)) {
    showNewsStatus('URL must start with http:// or https://', 'error');
    return;
  }

  btn.disabled = true;
  showNewsStatus('Fetching link preview…', 'loading');

  try {
    const res  = await fetch(`http://localhost:3000/api/news/${currentStockCode}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ url }),
    });
    const data = await res.json();

    if (!res.ok) {
      showNewsStatus(data.error || 'Failed to add link.', 'error');
      return;
    }

    input.value = '';
    showNewsStatus('Link saved!', 'success');
    await loadNewsLinks(currentStockCode);

  } catch (err) {
    showNewsStatus('Network error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

/* ----------------------------------------------------------------
   DELETE A LINK
---------------------------------------------------------------- */
async function deleteNewsLink(code, id, li) {
  if (!confirm('Remove this news link?')) return;
  try {
    await fetch(`http://localhost:3000/api/news/${code}/${id}`, { method: 'DELETE' });

    li.style.opacity    = '0';
    li.style.transition = 'opacity 0.25s';
    setTimeout(() => {
      li.remove();
      const remaining = document.querySelectorAll('.news-item').length;
      document.getElementById('news-count').textContent = remaining;
      if (remaining === 0) document.getElementById('news-empty').style.display = 'flex';
    }, 250);

  } catch (err) {
    alert('Failed to delete: ' + err.message);
  }
}

/* ----------------------------------------------------------------
   WIRE UP INPUT — Enter key support
   (DOMContentLoaded already fired by the time company.js runs,
    but this script loads after it so we attach directly.)
---------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('news-url-input');
  if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') addNewsLink(); });
});
