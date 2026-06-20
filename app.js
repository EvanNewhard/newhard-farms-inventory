// ── State ─────────────────────────────────────────────────────────────────────
let allItems     = [];
let sortField    = 'stock';
let sortAsc      = true;
let activeFilter = 'all';

// ── Storage helpers ───────────────────────────────────────────────────────────
function save(key, val) { try { localStorage.setItem(key, val); } catch(e){} }
function load(key)      { try { return localStorage.getItem(key); } catch(e){ return null; } }

function clearAll() {
  if (!confirm('This will remove your saved credentials and return to the login screen. Continue?')) return;
  localStorage.clear();
  location.reload();
}

// ── Boot: restore saved creds ─────────────────────────────────────────────────
(function boot() {
  const mid   = load('clover_mid');
  const token = load('clover_token');
  const thold = load('clover_threshold');

  if (mid)   document.getElementById('merchant-id').value = mid;
  if (token) document.getElementById('api-token').value   = token;
  if (thold) document.getElementById('threshold').value   = thold;

  if (mid && token) {
    fetchInventory(mid, token, parseInt(thold) || 5);
  }
})();

// ── Connect button ────────────────────────────────────────────────────────────
function connect() {
  const mid   = document.getElementById('merchant-id').value.trim();
  const token = document.getElementById('api-token').value.trim();
  const thold = parseInt(document.getElementById('threshold').value) || 5;
  const remember = document.getElementById('remember-me').checked;

  clearError('setup-error');

  if (!mid)   return showError('setup-error', 'Please enter your Merchant ID.');
  if (!token) return showError('setup-error', 'Please enter your API token.');

  if (remember) {
    save('clover_mid', mid);
    save('clover_token', token);
    save('clover_threshold', thold);
  }

  fetchInventory(mid, token, thold);
}

// ── Fetch via Netlify proxy ───────────────────────────────────────────────────
async function fetchInventory(mid, token, threshold) {
  showScreen('loading-screen');

  try {
    const resp = await fetch('https://timely-muffin-244f8c.netlify.app/.netlify/functions/clover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchantId: mid, token: token })
    });

    const data = await resp.json();

    if (!resp.ok) {
      let msg = data.error || `Error ${resp.status}.`;
      if (resp.status === 401) msg = 'Invalid token — please check your API token and try again.';
      if (resp.status === 404) msg = 'Merchant ID not found — double-check the ID in your Clover dashboard URL.';
      throw new Error(msg);
    }

    allItems = (data.elements || []).filter(i => !i.hidden);

    renderStats(threshold);
    renderTable(threshold);

    document.getElementById('last-updated').textContent =
      'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    document.getElementById('header-actions').style.display = 'flex';

    showScreen('dashboard-screen');

  } catch (err) {
    showScreen('setup-screen');
    showError('setup-error', err.message || 'Could not connect. Check your credentials and try again.');
  }
}

// ── Refresh ───────────────────────────────────────────────────────────────────
function refreshData() {
  const mid   = load('clover_mid');
  const token = load('clover_token');
  const thold = parseInt(load('clover_threshold')) || 5;
  if (mid && token) fetchInventory(mid, token, thold);
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function renderStats(threshold) {
  const t       = threshold || parseInt(load('clover_threshold')) || 5;
  const tracked = allItems.filter(i => i.itemStock);
  const out     = tracked.filter(i => (i.itemStock.quantity ?? 0) <= 0);
  const low     = tracked.filter(i => (i.itemStock.quantity ?? 0) > 0 && (i.itemStock.quantity ?? 0) <= t);
  const ok      = tracked.filter(i => (i.itemStock.quantity ?? 0) > t);

  document.getElementById('stat-total').textContent   = allItems.length;
  document.getElementById('stat-tracked').textContent = tracked.length;
  document.getElementById('stat-low').textContent     = low.length;
  document.getElementById('stat-out').textContent     = out.length;
  document.getElementById('stat-ok').textContent      = ok.length;
}

// ── Table ─────────────────────────────────────────────────────────────────────
function renderTable(thresholdArg) {
  const threshold = thresholdArg || parseInt(load('clover_threshold')) || 5;
  const search    = (document.getElementById('search-input')?.value || '').toLowerCase();

  let items = [...allItems];

  if (activeFilter === 'out')       items = items.filter(i => i.itemStock && (i.itemStock.quantity ?? 0) <= 0);
  else if (activeFilter === 'low')  items = items.filter(i => i.itemStock && (i.itemStock.quantity ?? 0) > 0 && (i.itemStock.quantity ?? 0) <= threshold);
  else if (activeFilter === 'ok')   items = items.filter(i => i.itemStock && (i.itemStock.quantity ?? 0) > threshold);
  else if (activeFilter === 'untracked') items = items.filter(i => !i.itemStock);

  if (search) items = items.filter(i => i.name.toLowerCase().includes(search));

  items.sort((a, b) => {
    let av, bv;
    if (sortField === 'name') {
      av = a.name.toLowerCase(); bv = b.name.toLowerCase();
    } else if (sortField === 'price') {
      av = a.price || 0; bv = b.price || 0;
    } else {
      av = a.itemStock ? (a.itemStock.quantity ?? 0) : -Infinity;
      bv = b.itemStock ? (b.itemStock.quantity ?? 0) : -Infinity;
    }
    if (av < bv) return sortAsc ? -1 : 1;
    if (av > bv) return sortAsc ? 1 : -1;
    return 0;
  });

  const tbody = document.getElementById('inventory-body');
  const empty = document.getElementById('empty-state');
  tbody.innerHTML = '';

  if (items.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  items.forEach(item => {
    const qty   = item.itemStock ? (item.itemStock.quantity ?? null) : null;
    const price = item.price ? '$' + (item.price / 100).toFixed(2) : '—';
    const reorder = suggestReorder(qty, threshold);

    let badge, stockDisplay;
    if (qty === null) {
      badge        = '<span class="badge badge-none">Not tracked</span>';
      stockDisplay = '—';
    } else if (qty <= 0) {
      badge        = '<span class="badge badge-out">Out of stock</span>';
      stockDisplay = '<span style="color:#dc2626;font-weight:600;">0</span>';
    } else if (qty <= threshold) {
      badge        = '<span class="badge badge-low">Low stock</span>';
      stockDisplay = '<span style="color:#92400e;font-weight:600;">' + Math.round(qty) + '</span>';
    } else {
      badge        = '<span class="badge badge-ok">In stock</span>';
      stockDisplay = Math.round(qty);
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escHtml(item.name)}</td>
      <td class="td-stock">${stockDisplay}</td>
      <td class="td-price">${price}</td>
      <td class="td-status">${badge}</td>
      <td class="td-reorder">${reorder}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ── Reorder suggestion ────────────────────────────────────────────────────────
function suggestReorder(qty, threshold) {
  if (qty === null) return '—';
  if (qty <= 0)     return '<strong>Order now</strong>';
  if (qty <= threshold) {
    const suggest = Math.max(threshold * 3 - Math.round(qty), threshold);
    return 'Order ~' + suggest + ' units';
  }
  return 'Stocked';
}

// ── Sorting ───────────────────────────────────────────────────────────────────
function sortBy(field) {
  if (sortField === field) sortAsc = !sortAsc;
  else { sortField = field; sortAsc = (field === 'name'); }

  ['name','stock','price'].forEach(f => {
    const el = document.getElementById('sort-' + f);
    if (el) el.textContent = f === sortField ? (sortAsc ? '↑' : '↓') : '↕';
  });
  renderTable();
}

// ── Filter tabs ───────────────────────────────────────────────────────────────
function setFilter(filter, btn) {
  activeFilter = filter;
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  renderTable();
}

// ── Export CSV ────────────────────────────────────────────────────────────────
function exportCSV() {
  const threshold = parseInt(load('clover_threshold')) || 5;
  const rows = [['Item', 'In Stock', 'Price', 'Status', 'Suggested Reorder']];

  allItems.forEach(item => {
    const qty   = item.itemStock ? (item.itemStock.quantity ?? null) : null;
    const price = item.price ? (item.price / 100).toFixed(2) : '';
    let status;
    if (qty === null)          status = 'Not tracked';
    else if (qty <= 0)         status = 'Out of stock';
    else if (qty <= threshold) status = 'Low stock';
    else                       status = 'In stock';

    const reorder = qty === null ? '' :
                    qty <= 0    ? 'Order now' :
                    qty <= threshold ? 'Order ~' + Math.max(threshold * 3 - Math.round(qty), threshold) + ' units' :
                    'Stocked';

    rows.push([item.name, qty !== null ? Math.round(qty) : '', price, status, reorder]);
  });

  const csv  = rows.map(r => r.map(v => '"' + String(v).replace(/"/g,'""') + '"').join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'newhard-farms-inventory-' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ── Settings modal ────────────────────────────────────────────────────────────
function showSettings() {
  document.getElementById('s-merchant-id').value = load('clover_mid')        || '';
  document.getElementById('s-api-token').value   = load('clover_token')      || '';
  document.getElementById('s-threshold').value   = load('clover_threshold')  || '5';
  document.getElementById('settings-modal').style.display = 'flex';
}
function closeSettings() { document.getElementById('settings-modal').style.display = 'none'; }
function closeSettingsIfOutside(e) {
  if (e.target === document.getElementById('settings-modal')) closeSettings();
}
function saveSettings() {
  const mid   = document.getElementById('s-merchant-id').value.trim();
  const token = document.getElementById('s-api-token').value.trim();
  const thold = document.getElementById('s-threshold').value;
  save('clover_mid', mid);
  save('clover_token', token);
  save('clover_threshold', thold);
  closeSettings();
  fetchInventory(mid, token, parseInt(thold) || 5);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function showScreen(id) {
  ['setup-screen','loading-screen','dashboard-screen'].forEach(s => {
    document.getElementById(s).style.display = s === id ? '' : 'none';
  });
}
function showError(id, msg) { document.getElementById(id).textContent = msg; }
function clearError(id)     { document.getElementById(id).textContent = ''; }
function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
