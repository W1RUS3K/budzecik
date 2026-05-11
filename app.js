'use strict';

// =================================================================
// Budżet PWA — main app logic
// All data lives in localStorage under STORAGE_KEY.
// State changes call save() and render().
// =================================================================

const STORAGE_KEY = 'budget-pwa-v1';

const DEFAULT_CATEGORIES = [
  { id: 'cat-food',     name: 'Jedzenie',         type: 'expense', color: '#e07a5f', limit: 0 },
  { id: 'cat-trans',    name: 'Transport / paliwo', type: 'expense', color: '#81b29a', limit: 0 },
  { id: 'cat-house',    name: 'Mieszkanie',       type: 'expense', color: '#a78bfa', limit: 0 },
  { id: 'cat-bills',    name: 'Rachunki',         type: 'expense', color: '#fbbf24', limit: 0 },
  { id: 'cat-fun',      name: 'Rozrywka',         type: 'expense', color: '#f472b6', limit: 0 },
  { id: 'cat-health',   name: 'Zdrowie',          type: 'expense', color: '#60a5fa', limit: 0 },
  { id: 'cat-shop',     name: 'Zakupy',           type: 'expense', color: '#fb923c', limit: 0 },
  { id: 'cat-car',      name: 'Auto',             type: 'expense', color: '#dc2626', limit: 0 },
  { id: 'cat-other-e',  name: 'Inne (wydatek)',   type: 'expense', color: '#9ca3af', limit: 0 },
  { id: 'cat-salary',   name: 'Wynagrodzenie',    type: 'income',  color: '#10b981', limit: 0 },
  { id: 'cat-sale',     name: 'Sprzedaż',         type: 'income',  color: '#06b6d4', limit: 0 },
  { id: 'cat-bonus',    name: 'Premia',           type: 'income',  color: '#84cc16', limit: 0 },
  { id: 'cat-other-i',  name: 'Inne (przychód)',  type: 'income',  color: '#94a3b8', limit: 0 },
];

const NEW_CAT_COLORS = [
  '#e07a5f', '#81b29a', '#a78bfa', '#fbbf24', '#f472b6',
  '#60a5fa', '#fb923c', '#dc2626', '#10b981', '#06b6d4'
];

const MONTH_NAMES = [
  'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'
];

// ----- State -----
const state = {
  transactions: [],
  categories: [],
  settings: { currency: 'zł', theme: 'dark' },
  view: 'dashboard',           // dashboard | list | reports | settings
  selectedDate: new Date(),    // anchor for month/year navigation
  reportMode: 'month',         // month | year (only in reports view)
};

// ----- Utilities -----
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function escapeHtml(s) {
  return String(s).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
}

function formatMoney(amount, withSign = false) {
  const abs = Math.abs(amount);
  const str = abs.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = withSign ? (amount < 0 ? '−' : amount > 0 ? '+' : '') : '';
  return `${sign}${str} ${state.settings.currency}`;
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', weekday: 'long' });
}

function getPeriodKey(date, mode) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return mode === 'year' ? `${y}` : `${y}-${m}`;
}

function getCategory(id) {
  return state.categories.find(c => c.id === id);
}

function getTxnsInPeriod(date, mode) {
  const key = getPeriodKey(date, mode);
  return state.transactions.filter(t => {
    const tk = mode === 'year' ? t.date.slice(0, 4) : t.date.slice(0, 7);
    return tk === key;
  });
}

function toast(msg) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2400);
}

// ----- Persistence -----
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      state.transactions = Array.isArray(data.transactions) ? data.transactions : [];
      state.categories   = Array.isArray(data.categories)   ? data.categories   : [];
      state.settings     = Object.assign({}, state.settings, data.settings || {});
    }
  } catch (e) {
    console.error('load failed', e);
  }
  if (state.categories.length === 0) {
    state.categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      transactions: state.transactions,
      categories: state.categories,
      settings: state.settings,
    }));
  } catch (e) {
    console.error('save failed', e);
    toast('Błąd zapisu danych');
  }
}

// =================================================================
// RENDER
// =================================================================
function render() {
  // Header label
  const headerEl = document.getElementById('current-period');
  if (state.view === 'reports' && state.reportMode === 'year') {
    headerEl.textContent = `${state.selectedDate.getFullYear()}`;
  } else if (state.view === 'settings') {
    headerEl.textContent = 'Ustawienia';
  } else {
    headerEl.textContent = `${MONTH_NAMES[state.selectedDate.getMonth()]} ${state.selectedDate.getFullYear()}`;
  }

  // Nav buttons active state
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === state.view);
  });

  // Show/hide period nav arrows on settings
  const monthNav = document.querySelector('.month-nav');
  const isSettings = state.view === 'settings';
  document.getElementById('prev-month').style.visibility = isSettings ? 'hidden' : 'visible';
  document.getElementById('next-month').style.visibility = isSettings ? 'hidden' : 'visible';

  // Show/hide FAB on settings
  document.getElementById('fab').style.display = isSettings ? 'none' : 'flex';

  const main = document.getElementById('app-main');
  main.innerHTML = '';
  main.scrollTop = 0;

  switch (state.view) {
    case 'dashboard': renderDashboard(main); break;
    case 'list':      renderList(main);      break;
    case 'reports':   renderReports(main);   break;
    case 'settings':  renderSettings(main);  break;
  }
}

function renderDashboard(main) {
  const txns = getTxnsInPeriod(state.selectedDate, 'month');
  const expenses = txns.filter(t => t.type === 'expense');
  const incomes  = txns.filter(t => t.type === 'income');
  const totalExp = expenses.reduce((s, t) => s + t.amount, 0);
  const totalInc = incomes.reduce((s, t) => s + t.amount, 0);
  const net = totalInc - totalExp;

  // Top: income / expense summary
  const grid = document.createElement('div');
  grid.className = 'summary-grid';
  grid.innerHTML = `
    <div class="summary-card">
      <div class="summary-label">Przychód</div>
      <div class="summary-amount income">${formatMoney(totalInc)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Wydatki</div>
      <div class="summary-amount expense">${formatMoney(totalExp)}</div>
    </div>
  `;
  main.appendChild(grid);

  const netCard = document.createElement('div');
  netCard.className = 'summary-card';
  const netClass = net > 0 ? 'positive' : net < 0 ? 'negative' : '';
  netCard.innerHTML = `
    <div class="summary-label">Saldo miesiąca</div>
    <div class="summary-amount net ${netClass}">${formatMoney(net, true)}</div>
  `;
  main.appendChild(netCard);

  // Empty state when nothing in the month at all
  if (txns.length === 0) {
    const limitsExist = state.categories.some(c => c.type === 'expense' && c.limit > 0);
    if (!limitsExist) {
      main.appendChild(emptyState('Brak transakcji', 'Dotknij + na dole, żeby dodać pierwszą.'));
      return;
    }
  }

  // Budget bars (only categories with limit > 0)
  const catsWithLimit = state.categories.filter(c => c.type === 'expense' && c.limit > 0);
  if (catsWithLimit.length > 0) {
    const title = document.createElement('h2');
    title.className = 'section-title';
    title.textContent = 'Limity budżetowe';
    main.appendChild(title);

    catsWithLimit.forEach(cat => {
      const spent = expenses.filter(t => t.categoryId === cat.id).reduce((s, t) => s + t.amount, 0);
      const pct = Math.min(100, (spent / cat.limit) * 100);
      const isOver = spent > cat.limit;
      const isWarning = !isOver && pct >= 80;
      const cls = isOver ? 'over' : isWarning ? 'warning' : '';

      const row = document.createElement('div');
      row.className = 'budget-row';
      row.innerHTML = `
        <div class="budget-row-header">
          <span class="budget-name">
            <span class="cat-bullet" style="background:${cat.color}"></span>
            <span class="budget-name-text">${escapeHtml(cat.name)}</span>
          </span>
          <span class="budget-amounts"><strong>${formatMoney(spent)}</strong> / ${formatMoney(cat.limit)}</span>
        </div>
        <div class="budget-bar-track">
          <div class="budget-bar-fill ${cls}" style="width: ${pct}%"></div>
        </div>
      `;
      main.appendChild(row);
    });
  }

  // Top expense categories (when there are expenses)
  if (expenses.length > 0) {
    const byCat = {};
    expenses.forEach(t => { byCat[t.categoryId] = (byCat[t.categoryId] || 0) + t.amount; });
    const sorted = Object.entries(byCat)
      .map(([id, amt]) => ({ cat: getCategory(id), amt }))
      .filter(x => x.cat)
      .sort((a, b) => b.amt - a.amt)
      .slice(0, 6);

    if (sorted.length > 0) {
      const title = document.createElement('h2');
      title.className = 'section-title';
      title.textContent = 'Wydatki według kategorii';
      main.appendChild(title);

      sorted.forEach(({ cat, amt }) => {
        const pct = (amt / totalExp) * 100;
        const row = document.createElement('div');
        row.className = 'budget-row';
        row.innerHTML = `
          <div class="budget-row-header">
            <span class="budget-name">
              <span class="cat-bullet" style="background:${cat.color}"></span>
              <span class="budget-name-text">${escapeHtml(cat.name)}</span>
            </span>
            <span class="budget-amounts"><strong>${formatMoney(amt)}</strong></span>
          </div>
          <div class="budget-bar-track">
            <div class="budget-bar-fill" style="width: ${pct}%; background: ${cat.color}"></div>
          </div>
        `;
        main.appendChild(row);
      });
    }
  }
}

function renderList(main) {
  const txns = getTxnsInPeriod(state.selectedDate, 'month')
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  if (txns.length === 0) {
    main.appendChild(emptyState('Brak transakcji', 'W tym miesiącu jeszcze nic nie dodałeś.'));
    return;
  }

  const grouped = {};
  txns.forEach(t => {
    if (!grouped[t.date]) grouped[t.date] = [];
    grouped[t.date].push(t);
  });

  Object.keys(grouped).sort((a, b) => b.localeCompare(a)).forEach(date => {
    const dayTxns = grouped[date];
    const dayNet = dayTxns.reduce((s, t) => s + (t.type === 'expense' ? -t.amount : t.amount), 0);

    const group = document.createElement('div');
    group.className = 'day-group';
    group.innerHTML = `
      <div class="day-header">
        <span class="day-date">${formatDate(date)}</span>
        <span class="day-total">${formatMoney(dayNet, true)}</span>
      </div>
    `;

    dayTxns.forEach(t => {
      const cat = getCategory(t.categoryId);
      const row = document.createElement('div');
      row.className = 'txn-row';
      row.innerHTML = `
        <div class="txn-left">
          <span class="txn-category">
            <span class="cat-bullet" style="background:${cat ? cat.color : '#666'}"></span>
            <span class="txn-category-text">${cat ? escapeHtml(cat.name) : '(brak kategorii)'}</span>
          </span>
          ${t.note ? `<span class="txn-note">${escapeHtml(t.note)}</span>` : ''}
        </div>
        <span class="txn-amount ${t.type}">${t.type === 'expense' ? '−' : '+'}${formatMoney(t.amount).replace(/^[+−]/, '')}</span>
      `;
      row.addEventListener('click', () => openTransactionModal(t));
      group.appendChild(row);
    });

    main.appendChild(group);
  });
}

function renderReports(main) {
  // Month / Year toggle
  const toggle = document.createElement('div');
  toggle.className = 'tab-toggle';
  toggle.innerHTML = `
    <button class="${state.reportMode === 'month' ? 'active' : ''}" data-mode="month">Miesiąc</button>
    <button class="${state.reportMode === 'year'  ? 'active' : ''}" data-mode="year">Rok</button>
  `;
  toggle.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    state.reportMode = btn.dataset.mode;
    render();
  });
  main.appendChild(toggle);

  const txns = getTxnsInPeriod(state.selectedDate, state.reportMode);
  if (txns.length === 0) {
    main.appendChild(emptyState('Brak danych', 'W tym okresie nie ma transakcji.'));
    return;
  }

  const expenses = txns.filter(t => t.type === 'expense');
  const incomes  = txns.filter(t => t.type === 'income');

  if (expenses.length > 0) renderReportSection(main, expenses, 'expense', 'Wydatki');
  if (incomes.length  > 0) renderReportSection(main, incomes,  'income',  'Przychody');

  // Year mode: monthly bar chart
  if (state.reportMode === 'year') {
    renderYearMonthlyChart(main, txns);
  }
}

function renderReportSection(main, txns, type, label) {
  const total = txns.reduce((s, t) => s + t.amount, 0);
  const byCat = {};
  txns.forEach(t => { byCat[t.categoryId] = (byCat[t.categoryId] || 0) + t.amount; });
  const data = Object.entries(byCat)
    .map(([id, amt]) => ({ cat: getCategory(id), amt }))
    .filter(x => x.cat)
    .sort((a, b) => b.amt - a.amt);

  const title = document.createElement('h2');
  title.className = 'section-title';
  title.textContent = `${label} — ${formatMoney(total)}`;
  main.appendChild(title);

  const chartCard = document.createElement('div');
  chartCard.className = 'chart-container';
  const canvasId = `chart-${type}-${Date.now()}`;
  chartCard.innerHTML = `<div class="chart-wrap"><canvas id="${canvasId}"></canvas></div>`;
  main.appendChild(chartCard);

  const breakdown = document.createElement('div');
  breakdown.className = 'category-breakdown';
  data.forEach(({ cat, amt }) => {
    const pct = ((amt / total) * 100).toFixed(1);
    const row = document.createElement('div');
    row.className = 'breakdown-row';
    row.innerHTML = `
      <div class="breakdown-color" style="background:${cat.color}"></div>
      <div class="breakdown-name">${escapeHtml(cat.name)}</div>
      <div class="breakdown-amount">${formatMoney(amt)}</div>
      <div class="breakdown-pct">${pct}%</div>
    `;
    breakdown.appendChild(row);
  });
  main.appendChild(breakdown);

  // Render chart after DOM is in
  requestAnimationFrame(() => {
    const ctx = document.getElementById(canvasId);
    if (!ctx || typeof Chart === 'undefined') return;
    new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: data.map(d => d.cat.name),
        datasets: [{
          data: data.map(d => d.amt),
          backgroundColor: data.map(d => d.cat.color),
          borderColor: '#1c1a18',
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#24211e',
            titleColor: '#f0ebe2',
            bodyColor: '#f0ebe2',
            borderColor: '#38332e',
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: ctx => ` ${ctx.label}: ${formatMoney(ctx.parsed)}`
            }
          }
        }
      }
    });
  });
}

function renderYearMonthlyChart(main, yearTxns) {
  const title = document.createElement('h2');
  title.className = 'section-title';
  title.textContent = 'Miesiące tego roku';
  main.appendChild(title);

  const card = document.createElement('div');
  card.className = 'chart-container';
  const id = `chart-year-${Date.now()}`;
  card.innerHTML = `<div class="chart-wrap"><canvas id="${id}"></canvas></div>`;
  main.appendChild(card);

  // Build 12 monthly buckets
  const expByMonth = new Array(12).fill(0);
  const incByMonth = new Array(12).fill(0);
  yearTxns.forEach(t => {
    const month = parseInt(t.date.slice(5, 7), 10) - 1;
    if (t.type === 'expense') expByMonth[month] += t.amount;
    else                      incByMonth[month] += t.amount;
  });

  requestAnimationFrame(() => {
    const ctx = document.getElementById(id);
    if (!ctx || typeof Chart === 'undefined') return;
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'],
        datasets: [
          { label: 'Przychód', data: incByMonth, backgroundColor: '#6b9b6e' },
          { label: 'Wydatki',  data: expByMonth, backgroundColor: '#c4544b' },
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#908a7f', font: { size: 11 } } },
          tooltip: {
            backgroundColor: '#24211e',
            titleColor: '#f0ebe2',
            bodyColor: '#f0ebe2',
            borderColor: '#38332e',
            borderWidth: 1,
            callbacks: { label: ctx => ` ${ctx.dataset.label}: ${formatMoney(ctx.parsed.y)}` }
          }
        },
        scales: {
          x: { ticks: { color: '#908a7f', font: { size: 10 } }, grid: { display: false } },
          y: { ticks: { color: '#908a7f', font: { size: 10 } }, grid: { color: '#38332e' } }
        }
      }
    });
  });
}

function renderSettings(main) {
  // ----- General -----
  const generalTitle = document.createElement('h2');
  generalTitle.className = 'section-title';
  generalTitle.style.marginTop = '0';
  generalTitle.textContent = 'Ogólne';
  main.appendChild(generalTitle);

  const currencyRow = document.createElement('div');
  currencyRow.className = 'setting-row';
  currencyRow.innerHTML = `
    <label for="currency-select">Waluta</label>
    <select id="currency-select">
      <option value="zł" ${state.settings.currency === 'zł' ? 'selected' : ''}>zł (PLN)</option>
      <option value="€"  ${state.settings.currency === '€'  ? 'selected' : ''}>€ (EUR)</option>
      <option value="$"  ${state.settings.currency === '$'  ? 'selected' : ''}>$ (USD)</option>
      <option value="£"  ${state.settings.currency === '£'  ? 'selected' : ''}>£ (GBP)</option>
    </select>
  `;
  currencyRow.querySelector('select').addEventListener('change', e => {
    state.settings.currency = e.target.value;
    save();
    render();
  });
  main.appendChild(currencyRow);

  // ----- Categories -----
  const renderCategoryList = (type, label) => {
    const cats = state.categories.filter(c => c.type === type);

    const title = document.createElement('h2');
    title.className = 'section-title';
    title.textContent = label;
    main.appendChild(title);

    cats.forEach(cat => {
      const row = document.createElement('div');
      row.className = 'category-edit-row';
      const limitField = type === 'expense'
        ? `<input type="number" inputmode="decimal" min="0" step="0.01" value="${cat.limit || ''}" placeholder="limit" data-id="${cat.id}" data-field="limit" aria-label="limit miesięczny">`
        : '<span></span>';
      row.innerHTML = `
        <input type="color" value="${cat.color}" data-id="${cat.id}" data-field="color" aria-label="kolor">
        <input type="text" value="${escapeHtml(cat.name)}" data-id="${cat.id}" data-field="name" aria-label="nazwa">
        ${limitField}
        <button class="delete-icon" data-id="${cat.id}" aria-label="usuń kategorię">×</button>
      `;
      row.querySelectorAll('input').forEach(inp => {
        inp.addEventListener('change', e => {
          const id = e.target.dataset.id;
          const field = e.target.dataset.field;
          const c = getCategory(id);
          if (!c) return;
          if (field === 'limit') c.limit = parseFloat(String(e.target.value).replace(',', '.')) || 0;
          else c[field] = e.target.value;
          save();
        });
      });
      row.querySelector('.delete-icon').addEventListener('click', () => {
        if (!confirm(`Usunąć kategorię "${cat.name}"?\nTransakcje pozostaną, ale stracą przypisaną kategorię.`)) return;
        state.categories = state.categories.filter(c => c.id !== cat.id);
        save();
        render();
      });
      main.appendChild(row);
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'btn secondary btn-full';
    addBtn.style.marginTop = '6px';
    addBtn.textContent = '+ Dodaj kategorię';
    addBtn.addEventListener('click', () => {
      const name = prompt('Nazwa nowej kategorii:');
      if (!name || !name.trim()) return;
      state.categories.push({
        id: uid(),
        name: name.trim(),
        type,
        color: NEW_CAT_COLORS[Math.floor(Math.random() * NEW_CAT_COLORS.length)],
        limit: 0,
      });
      save();
      render();
    });
    main.appendChild(addBtn);
  };

  renderCategoryList('expense', 'Kategorie wydatków');
  renderCategoryList('income',  'Kategorie przychodów');

  // ----- Data -----
  const dataTitle = document.createElement('h2');
  dataTitle.className = 'section-title';
  dataTitle.textContent = 'Dane';
  main.appendChild(dataTitle);

  const dataWrap = document.createElement('div');
  dataWrap.style.cssText = 'display:flex; flex-direction:column; gap:6px;';
  dataWrap.innerHTML = `
    <button class="btn secondary btn-full" id="export-btn">Eksportuj dane (JSON)</button>
    <label class="btn secondary btn-full" style="cursor:pointer">
      Importuj dane (JSON)
      <input type="file" accept=".json,application/json" id="import-input" style="display:none">
    </label>
    <button class="btn danger btn-full" id="reset-btn" style="margin-top:8px">Wyczyść wszystkie dane</button>
  `;
  main.appendChild(dataWrap);

  document.getElementById('export-btn').addEventListener('click', exportData);
  document.getElementById('import-input').addEventListener('change', importData);
  document.getElementById('reset-btn').addEventListener('click', () => {
    if (!confirm('Na pewno usunąć WSZYSTKIE dane?\nTej operacji nie cofniesz.')) return;
    if (!confirm('Ostatnia szansa. Naprawdę usuwamy wszystko?')) return;
    localStorage.removeItem(STORAGE_KEY);
    state.transactions = [];
    state.categories = [];
    load();
    render();
    toast('Dane wyczyszczone');
  });

  // Footer
  const info = document.createElement('div');
  info.style.cssText = 'text-align:center; color: var(--text-dim); font-size: 11px; margin-top: 28px; padding: 8px 0 20px; font-family: var(--font-mono); letter-spacing: 0.05em;';
  info.textContent = `BUDŻET · ${state.transactions.length} TXN · ${state.categories.length} KAT`;
  main.appendChild(info);
}

function emptyState(title, msg) {
  const el = document.createElement('div');
  el.className = 'empty-state';
  el.innerHTML = `<div class="big">∅</div><p><strong>${escapeHtml(title)}</strong></p><p>${escapeHtml(msg)}</p>`;
  return el;
}

// =================================================================
// MODAL: add / edit transaction
// =================================================================
function openTransactionModal(existing) {
  const overlay = document.getElementById('modal-overlay');
  overlay.hidden = false;

  // Working copy of transaction
  const draft = existing ? { ...existing } : {
    id: null,
    type: 'expense',
    amount: '',
    categoryId: '',
    date: new Date().toISOString().slice(0, 10),
    note: '',
  };

  const renderModal = () => {
    const cats = state.categories.filter(c => c.type === draft.type);
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-header">
          <h2 class="modal-title">${existing ? 'Edytuj transakcję' : 'Nowa transakcja'}</h2>
          <button class="close-btn" id="modal-close" aria-label="zamknij">×</button>
        </div>

        <div class="type-toggle" role="tablist">
          <button data-type="expense" class="${draft.type === 'expense' ? 'active' : ''}">Wydatek</button>
          <button data-type="income"  class="${draft.type === 'income'  ? 'active' : ''}">Przychód</button>
        </div>

        <div class="field">
          <label class="field-label" for="amount-input">Kwota</label>
          <input type="text" inputmode="decimal" id="amount-input" class="amount-input" placeholder="0,00" value="${draft.amount}" autocomplete="off">
        </div>

        <div class="field">
          <label class="field-label">Kategoria</label>
          <div class="category-grid" id="cat-grid">
            ${cats.map(c => `
              <button class="cat-chip ${draft.categoryId === c.id ? 'selected' : ''}" data-id="${c.id}">
                <span class="cat-bullet" style="background:${c.color}"></span>
                <span class="cat-chip-text">${escapeHtml(c.name)}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <div class="field">
          <label class="field-label" for="date-input">Data</label>
          <input type="date" id="date-input" value="${draft.date}">
        </div>

        <div class="field">
          <label class="field-label" for="note-input">Notatka (opcjonalna)</label>
          <input type="text" id="note-input" placeholder="np. Biedronka, paliwo, kawa..." value="${escapeHtml(draft.note)}" autocomplete="off">
        </div>

        <div class="btn-group">
          ${existing ? '<button class="btn danger" id="delete-btn">Usuń</button>' : ''}
          <button class="btn" id="save-btn">${existing ? 'Zapisz' : 'Dodaj'}</button>
        </div>
      </div>
    `;

    // Wire up
    overlay.querySelector('#modal-close').addEventListener('click', closeModal);

    overlay.querySelector('.type-toggle').addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      draft.type = btn.dataset.type;
      draft.categoryId = '';
      renderModal();
    });

    overlay.querySelector('#amount-input').addEventListener('input', e => { draft.amount = e.target.value; });
    overlay.querySelector('#date-input').addEventListener('input', e => { draft.date = e.target.value; });
    overlay.querySelector('#note-input').addEventListener('input', e => { draft.note = e.target.value; });

    overlay.querySelector('#cat-grid').addEventListener('click', e => {
      const chip = e.target.closest('.cat-chip');
      if (!chip) return;
      draft.categoryId = chip.dataset.id;
      overlay.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
    });

    overlay.querySelector('#save-btn').addEventListener('click', () => {
      const amount = parseFloat(String(draft.amount).replace(',', '.'));
      if (!amount || amount <= 0 || Number.isNaN(amount)) { toast('Wpisz kwotę większą od 0'); return; }
      if (!draft.categoryId) { toast('Wybierz kategorię'); return; }
      if (!draft.date) { toast('Wybierz datę'); return; }

      if (existing) {
        const idx = state.transactions.findIndex(t => t.id === existing.id);
        if (idx >= 0) {
          state.transactions[idx] = {
            id: existing.id,
            type: draft.type,
            amount: Math.round(amount * 100) / 100,
            categoryId: draft.categoryId,
            date: draft.date,
            note: (draft.note || '').trim(),
          };
        }
        toast('Zapisano');
      } else {
        state.transactions.push({
          id: uid(),
          type: draft.type,
          amount: Math.round(amount * 100) / 100,
          categoryId: draft.categoryId,
          date: draft.date,
          note: (draft.note || '').trim(),
        });
        toast('Dodano');
      }
      save();
      closeModal();
      render();
    });

    if (existing) {
      overlay.querySelector('#delete-btn').addEventListener('click', () => {
        if (!confirm('Usunąć tę transakcję?')) return;
        state.transactions = state.transactions.filter(t => t.id !== existing.id);
        save();
        closeModal();
        render();
        toast('Usunięto');
      });
    }

    // Auto-focus amount when adding new
    if (!existing) {
      setTimeout(() => {
        const inp = overlay.querySelector('#amount-input');
        if (inp) inp.focus();
      }, 80);
    }
  };

  renderModal();

  // Close on backdrop click
  overlay.onclick = e => {
    if (e.target === overlay) closeModal();
  };
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay.hidden = true;
  overlay.innerHTML = '';
  overlay.onclick = null;
}

// =================================================================
// Export / Import
// =================================================================
function exportData() {
  const data = {
    app: 'budzet-pwa',
    version: 1,
    exportedAt: new Date().toISOString(),
    transactions: state.transactions,
    categories: state.categories,
    settings: state.settings,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `budzet-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Wyeksportowano plik JSON');
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.transactions) || !Array.isArray(data.categories)) {
        throw new Error('Niepoprawny format pliku');
      }
      if (!confirm(`Zaimportować ${data.transactions.length} transakcji i ${data.categories.length} kategorii?\nTo zastąpi obecne dane na tym urządzeniu.`)) {
        e.target.value = '';
        return;
      }
      state.transactions = data.transactions;
      state.categories   = data.categories;
      if (data.settings) state.settings = Object.assign({}, state.settings, data.settings);
      save();
      render();
      toast('Zaimportowano');
    } catch (err) {
      toast('Błąd: ' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// =================================================================
// Init
// =================================================================
function init() {
  load();

  // Bottom nav
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.view = btn.dataset.view;
      render();
    });
  });

  // Period navigation
  document.getElementById('prev-month').addEventListener('click', () => {
    const yearMode = state.view === 'reports' && state.reportMode === 'year';
    const d = new Date(state.selectedDate);
    if (yearMode) d.setFullYear(d.getFullYear() - 1);
    else d.setMonth(d.getMonth() - 1);
    state.selectedDate = d;
    render();
  });
  document.getElementById('next-month').addEventListener('click', () => {
    const yearMode = state.view === 'reports' && state.reportMode === 'year';
    const d = new Date(state.selectedDate);
    if (yearMode) d.setFullYear(d.getFullYear() + 1);
    else d.setMonth(d.getMonth() + 1);
    state.selectedDate = d;
    render();
  });

  // FAB
  document.getElementById('fab').addEventListener('click', () => openTransactionModal());

  render();
}

document.addEventListener('DOMContentLoaded', init);
