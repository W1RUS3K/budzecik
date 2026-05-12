'use strict';

// =================================================================
// Budżet PWA v2.2
// Schema v2: dodano tagi w transakcjach, transakcje cykliczne, cele
// =================================================================

const APP_VERSION = '2.2.0';        // widoczne w Ustawieniach
const STORAGE_KEY = 'budget-pwa-v1';   // klucz zostaje, schema migruje w locie
const SCHEMA_VERSION = 2;

const DEFAULT_CATEGORIES = [
  { id: 'cat-food',     name: 'Jedzenie',           type: 'expense', color: '#e07a5f', limit: 0 },
  { id: 'cat-trans',    name: 'Transport / paliwo', type: 'expense', color: '#81b29a', limit: 0 },
  { id: 'cat-house',    name: 'Mieszkanie',         type: 'expense', color: '#a78bfa', limit: 0 },
  { id: 'cat-bills',    name: 'Rachunki',           type: 'expense', color: '#fbbf24', limit: 0 },
  { id: 'cat-fun',      name: 'Rozrywka',           type: 'expense', color: '#f472b6', limit: 0 },
  { id: 'cat-health',   name: 'Zdrowie',            type: 'expense', color: '#60a5fa', limit: 0 },
  { id: 'cat-shop',     name: 'Zakupy',             type: 'expense', color: '#fb923c', limit: 0 },
  { id: 'cat-car',      name: 'Auto',               type: 'expense', color: '#dc2626', limit: 0 },
  { id: 'cat-other-e',  name: 'Inne (wydatek)',     type: 'expense', color: '#9ca3af', limit: 0 },
  { id: 'cat-salary',   name: 'Wynagrodzenie',      type: 'income',  color: '#10b981', limit: 0 },
  { id: 'cat-sale',     name: 'Sprzedaż',           type: 'income',  color: '#06b6d4', limit: 0 },
  { id: 'cat-bonus',    name: 'Premia',             type: 'income',  color: '#84cc16', limit: 0 },
  { id: 'cat-other-i',  name: 'Inne (przychód)',    type: 'income',  color: '#94a3b8', limit: 0 },
];

const NEW_CAT_COLORS = [
  '#e07a5f', '#81b29a', '#a78bfa', '#fbbf24', '#f472b6',
  '#60a5fa', '#fb923c', '#dc2626', '#10b981', '#06b6d4',
];

const GOAL_COLORS = ['#d97757', '#81b29a', '#a78bfa', '#fbbf24', '#60a5fa', '#f472b6'];

const MONTH_NAMES = [
  'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień',
];
const WEEKDAY_SHORT = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];

// ----- State -----
const state = {
  transactions: [],
  categories: [],
  recurring: [],
  goals: [],
  settings: {
    currency: 'zł',
    theme: 'dark',
    lastBackupDate: null,        // YYYY-MM-DD ostatniego udanego eksportu
    txnsSinceBackup: 0,          // licznik akcji od ostatniego backupu
    emptyBannerDismissed: false, // czy user kliknął "to moja pierwsza wizyta"
  },

  view: 'dashboard',
  selectedDate: new Date(),
  reportMode: 'month',
  selectedDay: null,       // YYYY-MM-DD when day expanded in calendar
  tagFilter: null,         // active tag filter in list view
};

// ----- Utilities -----
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

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

function todayISO() { return new Date().toISOString().slice(0, 10); }

function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysInMonth(year, monthIdx) {
  return new Date(year, monthIdx + 1, 0).getDate();
}

function getPeriodKey(date, mode) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return mode === 'year' ? `${y}` : `${y}-${m}`;
}

function getCategory(id) { return state.categories.find(c => c.id === id); }

function getTxnsInPeriod(date, mode) {
  const key = getPeriodKey(date, mode);
  return state.transactions.filter(t => {
    const tk = mode === 'year' ? t.date.slice(0, 4) : t.date.slice(0, 7);
    return tk === key;
  });
}

function getPrevPeriodDate(date, mode) {
  const d = new Date(date);
  if (mode === 'year') d.setFullYear(d.getFullYear() - 1);
  else d.setMonth(d.getMonth() - 1);
  return d;
}

function getPrevPeriodLabel(date, mode) {
  const d = getPrevPeriodDate(date, mode);
  return mode === 'year' ? String(d.getFullYear()) : MONTH_NAMES[d.getMonth()];
}

function allTags() {
  const set = new Set();
  state.transactions.forEach(t => (t.tags || []).forEach(tag => set.add(tag)));
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'pl'));
}

function toast(msg) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2400);
}

// ----- Persistence with migration -----
function migrate(data) {
  // v1 → v2: tags na transakcjach, dodane recurring i goals
  data.transactions = (data.transactions || []).map(t => ({
    ...t,
    tags: Array.isArray(t.tags) ? t.tags : [],
    recurringId: t.recurringId || null,
  }));
  data.recurring = Array.isArray(data.recurring) ? data.recurring : [];
  data.goals = Array.isArray(data.goals) ? data.goals : [];
  data.schemaVersion = SCHEMA_VERSION;
  return data;
}

function load() {
  let needsUpgradeSave = false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const previousVersion = parsed.schemaVersion || 1;
      const data = migrate(parsed);
      state.transactions = data.transactions;
      state.categories   = Array.isArray(data.categories) ? data.categories : [];
      state.recurring    = data.recurring;
      state.goals        = data.goals;
      state.settings     = Object.assign({}, state.settings, data.settings || {});
      // Jeśli przyszło coś starszego niż aktualny schemat — zapisz od razu po upgrade
      if (previousVersion < SCHEMA_VERSION) needsUpgradeSave = true;
    }
  } catch (e) {
    console.error('load failed', e);
  }
  if (state.categories.length === 0) {
    state.categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
  }
  if (needsUpgradeSave) save();
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      transactions: state.transactions,
      categories: state.categories,
      recurring: state.recurring,
      goals: state.goals,
      settings: state.settings,
    }));
  } catch (e) {
    console.error('save failed', e);
    toast('Błąd zapisu danych');
  }
}

// Inkrementuj licznik akcji od ostatniego backupu — wywoływany przy
// każdej mutacji danych przez usera (dodanie, edycja, usunięcie transakcji
// + wygenerowanie cyklicznych). Sygnalizuje "tu są nowe dane, zrób backup".
function markDirty(count = 1) {
  state.settings.txnsSinceBackup = (state.settings.txnsSinceBackup || 0) + count;
}

// =================================================================
// Ochrona danych: persistent storage + monitorowanie backupu
// =================================================================

// Poproś przeglądarkę, żeby nie usuwała danych pod presją pamięci.
// Działa od iOS 16.4+ i nowoczesnych przeglądarek. Best effort, ignoruj błędy.
async function requestPersistentStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      const granted = await navigator.storage.persist();
      console.log('persistent storage:', granted ? 'granted' : 'denied');
    }
  } catch (e) {
    // Ignoruj, to jest nice-to-have, nie krytyczne
  }
}

// Sprawdź czy jest nowa wersja Service Workera i wymusza update.
// User wciska przycisk w Ustawieniach gdy podejrzewa stałą wersję.
async function checkForUpdates() {
  if (!('serviceWorker' in navigator)) {
    toast('Service worker niedostępny');
    return;
  }
  try {
    toast('Sprawdzam aktualizacje...');
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      toast('Brak zarejestrowanego SW');
      return;
    }
    // Wymuś sprawdzenie nowej wersji w sieci
    await reg.update();

    // Jeśli jest nowy SW czekający — aktywuj go natychmiast
    if (reg.waiting) {
      reg.waiting.postMessage('skip-waiting');
      toast('Aktualizacja gotowa, przeładowuję...');
      setTimeout(() => location.reload(), 800);
      return;
    }

    // Jeśli SW akurat się instaluje
    if (reg.installing) {
      reg.installing.addEventListener('statechange', e => {
        if (e.target.state === 'activated') {
          toast('Zainstalowano, przeładowuję...');
          setTimeout(() => location.reload(), 600);
        }
      });
      toast('Pobieram aktualizację...');
      return;
    }

    // Nic nowego — po prostu hard reload na wszelki wypadek
    toast('Już najnowsza. Odświeżam...');
    setTimeout(() => location.reload(), 800);
  } catch (err) {
    console.error('update check failed', err);
    toast('Błąd sprawdzania aktualizacji');
  }
}

// Sprawdź stan zdrowia backupu — używane do kolorowania stopki i bannerów
function checkBackupHealth() {
  const txnCount = state.transactions.length + state.recurring.length + state.goals.length;
  const last = state.settings.lastBackupDate;

  if (txnCount === 0) {
    return { level: 'empty', daysSince: null, txnsSince: 0 };
  }

  const txnsSince = state.settings.txnsSinceBackup || 0;

  if (!last) {
    return { level: 'never', daysSince: null, txnsSince };
  }

  const daysSince = Math.floor((Date.now() - new Date(last + 'T00:00:00').getTime()) / 86400000);
  let level = 'ok';
  if (daysSince >= 14) level = 'danger';
  else if (daysSince >= 7) level = 'warn';

  return { level, daysSince, txnsSince };
}

// Czy apka wygląda na "świeżą instalację" (potencjalnie po utracie danych)?
function isLikelyFreshInstall() {
  if (state.settings.emptyBannerDismissed) return false;
  if (state.transactions.length > 0) return false;
  if (state.recurring.length > 0) return false;
  if (state.goals.length > 0) return false;
  if (state.settings.lastBackupDate) return false;  // wcześniej był backup → user nie jest świeży
  return true;
}

// =================================================================
// Generator transakcji cyklicznych
// Uruchamiany przy starcie, dogania wszystkie wpisy do dziś.
// =================================================================
function nextRecurringDate(rule, fromDate) {
  const d = new Date(fromDate + 'T00:00:00');
  if (rule.frequency === 'monthly') {
    // następny miesiąc, ten sam dzień (lub ostatni dzień miesiąca jeśli brak)
    d.setMonth(d.getMonth() + 1);
    const dom = Math.min(rule.dayOfMonth, daysInMonth(d.getFullYear(), d.getMonth()));
    d.setDate(dom);
  } else if (rule.frequency === 'yearly') {
    d.setFullYear(d.getFullYear() + 1);
    const dom = Math.min(rule.dayOfMonth, daysInMonth(d.getFullYear(), d.getMonth()));
    d.setDate(dom);
  }
  return ymd(d);
}

function firstRecurringDate(rule) {
  // Pierwsza data wygenerowania ≥ startDate, dopasowana do dayOfMonth/monthOfYear
  const start = new Date(rule.startDate + 'T00:00:00');
  if (rule.frequency === 'monthly') {
    const targetDom = Math.min(rule.dayOfMonth, daysInMonth(start.getFullYear(), start.getMonth()));
    if (start.getDate() <= targetDom) {
      start.setDate(targetDom);
    } else {
      start.setMonth(start.getMonth() + 1);
      const dom = Math.min(rule.dayOfMonth, daysInMonth(start.getFullYear(), start.getMonth()));
      start.setDate(dom);
    }
  } else if (rule.frequency === 'yearly') {
    start.setMonth(rule.monthOfYear - 1);
    const dom = Math.min(rule.dayOfMonth, daysInMonth(start.getFullYear(), start.getMonth()));
    start.setDate(dom);
    if (start < new Date(rule.startDate + 'T00:00:00')) {
      start.setFullYear(start.getFullYear() + 1);
      const dom2 = Math.min(rule.dayOfMonth, daysInMonth(start.getFullYear(), start.getMonth()));
      start.setDate(dom2);
    }
  }
  return ymd(start);
}

function generateRecurring() {
  const today = todayISO();
  let generated = 0;

  state.recurring.forEach(rule => {
    if (!rule.active) return;

    let nextDate = rule.lastGeneratedDate
      ? nextRecurringDate(rule, rule.lastGeneratedDate)
      : firstRecurringDate(rule);

    let guard = 0; // safety: max 5 lat wstecz
    while (nextDate <= today && guard < 60) {
      if (rule.endDate && nextDate > rule.endDate) break;

      // pomiń jeśli kategoria została usunięta
      if (getCategory(rule.categoryId)) {
        state.transactions.push({
          id: uid(),
          type: rule.type,
          amount: rule.amount,
          categoryId: rule.categoryId,
          date: nextDate,
          note: rule.note || '',
          tags: [...(rule.tags || [])],
          recurringId: rule.id,
        });
        generated++;
      }
      rule.lastGeneratedDate = nextDate;
      nextDate = nextRecurringDate(rule, nextDate);
      guard++;
    }
  });

  if (generated > 0) {
    markDirty(generated);
    save();
    setTimeout(() => toast(`Dodano ${generated} ${generated === 1 ? 'transakcję cykliczną' : 'transakcje cykliczne'}`), 300);
  }
}

// =================================================================
// RENDER
// =================================================================
function render() {
  const headerEl = document.getElementById('current-period');
  if (state.view === 'reports' && state.reportMode === 'year') {
    headerEl.textContent = `${state.selectedDate.getFullYear()}`;
  } else if (state.view === 'settings') {
    headerEl.textContent = 'Ustawienia';
  } else {
    headerEl.textContent = `${MONTH_NAMES[state.selectedDate.getMonth()]} ${state.selectedDate.getFullYear()}`;
  }

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === state.view);
  });

  const isSettings = state.view === 'settings';
  document.getElementById('prev-month').style.visibility = isSettings ? 'hidden' : 'visible';
  document.getElementById('next-month').style.visibility = isSettings ? 'hidden' : 'visible';
  document.getElementById('fab').style.display = isSettings ? 'none' : 'flex';

  const main = document.getElementById('app-main');
  main.innerHTML = '';
  main.scrollTop = 0;

  switch (state.view) {
    case 'dashboard': renderDashboard(main); break;
    case 'list':      renderList(main);      break;
    case 'calendar':  renderCalendar(main);  break;
    case 'reports':   renderReports(main);   break;
    case 'settings':  renderSettings(main);  break;
  }
}

// ----- Dashboard -----
function renderDashboard(main) {
  // BANNER pustego stanu — pokaż gdy apka wygląda na świeżą instalację
  // i user jeszcze nie odrzucił bannera. To główne zabezpieczenie przed
  // przypadkowym nadpisaniem stanu po reinstalacji.
  if (isLikelyFreshInstall()) {
    const banner = document.createElement('div');
    banner.className = 'alert-banner';
    banner.innerHTML = `
      <div class="alert-icon">⚠</div>
      <div class="alert-body">
        <strong>Apka jest pusta</strong>
        <p>Jeśli to twoja pierwsza wizyta — śmiało dodawaj transakcje.<br>
        Ale jeśli masz <strong>backup z innego urządzenia lub poprzedniej instalacji</strong>, najpierw go zaimportuj, zanim cokolwiek dodasz.</p>
        <div class="alert-actions">
          <label class="btn">
            Importuj backup
            <input type="file" accept=".json,application/json" id="banner-import" style="display:none">
          </label>
          <button class="btn secondary" id="banner-dismiss">To moja pierwsza wizyta</button>
        </div>
      </div>
    `;
    main.appendChild(banner);

    banner.querySelector('#banner-import').addEventListener('change', importData);
    banner.querySelector('#banner-dismiss').addEventListener('click', () => {
      state.settings.emptyBannerDismissed = true;
      save();
      render();
    });
  }

  const txns = getTxnsInPeriod(state.selectedDate, 'month');
  const expenses = txns.filter(t => t.type === 'expense');
  const incomes  = txns.filter(t => t.type === 'income');
  const totalExp = expenses.reduce((s, t) => s + t.amount, 0);
  const totalInc = incomes.reduce((s, t) => s + t.amount, 0);
  const net = totalInc - totalExp;

  // Porównanie do poprzedniego miesiąca
  const prevTxns = getTxnsInPeriod(getPrevPeriodDate(state.selectedDate, 'month'), 'month');
  const prevExp = prevTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const prevInc = prevTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const prevLabel = getPrevPeriodLabel(state.selectedDate, 'month');

  const grid = document.createElement('div');
  grid.className = 'summary-grid';
  grid.innerHTML = `
    <div class="summary-card">
      <div class="summary-label">Przychód</div>
      <div class="summary-amount income">${formatMoney(totalInc)}</div>
      ${renderMomDelta(totalInc, prevInc, prevLabel, 'income')}
    </div>
    <div class="summary-card">
      <div class="summary-label">Wydatki</div>
      <div class="summary-amount expense">${formatMoney(totalExp)}</div>
      ${renderMomDelta(totalExp, prevExp, prevLabel, 'expense')}
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

  // Cele oszczędnościowe (jeśli są)
  if (state.goals.length > 0) {
    const title = document.createElement('h2');
    title.className = 'section-title';
    title.textContent = 'Cele oszczędnościowe';
    main.appendChild(title);

    state.goals.forEach(goal => {
      const pct = Math.min(100, (goal.currentAmount / goal.targetAmount) * 100);
      const remaining = goal.targetAmount - goal.currentAmount;
      let deadlineText = '';
      if (goal.deadline) {
        const days = Math.ceil((new Date(goal.deadline + 'T00:00:00') - new Date(todayISO() + 'T00:00:00')) / 86400000);
        if (days < 0) deadlineText = `${-days} dni po terminie`;
        else if (days === 0) deadlineText = 'dzisiaj';
        else deadlineText = `${days} dni`;
      }

      const row = document.createElement('div');
      row.className = 'budget-row goal-row';
      row.innerHTML = `
        <div class="budget-row-header">
          <span class="budget-name">
            <span class="cat-bullet" style="background:${goal.color}"></span>
            <span class="budget-name-text">${escapeHtml(goal.name)}</span>
          </span>
          <span class="budget-amounts"><strong>${formatMoney(goal.currentAmount)}</strong> / ${formatMoney(goal.targetAmount)}</span>
        </div>
        <div class="budget-bar-track">
          <div class="budget-bar-fill" style="width: ${pct}%; background: ${goal.color}"></div>
        </div>
        <div class="goal-meta">
          <span>${pct.toFixed(0)}% · brakuje ${formatMoney(Math.max(0, remaining))}</span>
          ${deadlineText ? `<span>${escapeHtml(deadlineText)}</span>` : ''}
        </div>
        <div class="goal-actions">
          <button class="btn-mini" data-action="add-money" data-id="${goal.id}">+ Wpłata</button>
          <button class="btn-mini" data-action="edit-goal" data-id="${goal.id}">Edytuj</button>
        </div>
      `;
      row.querySelector('[data-action="add-money"]').addEventListener('click', () => addToGoal(goal));
      row.querySelector('[data-action="edit-goal"]').addEventListener('click', () => openGoalModal(goal));
      main.appendChild(row);
    });
  }

  if (txns.length === 0 && state.goals.length === 0) {
    const limitsExist = state.categories.some(c => c.type === 'expense' && c.limit > 0);
    if (!limitsExist) {
      main.appendChild(emptyState('Brak transakcji', 'Dotknij + na dole, żeby dodać pierwszą.'));
      return;
    }
  }

  // Limity budżetowe
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

  // Top kategorie wydatków
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

  // ----- Stopka: status backupu -----
  // Pokazuj zawsze gdy są jakieś dane, bo to przypomnienie krytyczne dla
  // bezpieczeństwa. Kolor sygnalizuje pilność.
  const health = checkBackupHealth();
  if (health.level !== 'empty') {
    const footer = document.createElement('div');
    footer.className = `backup-status ${health.level}`;

    let label;
    if (health.level === 'never') {
      label = 'Nigdy nie zrobiłeś backupu. Eksportuj teraz.';
    } else if (health.daysSince === 0) {
      label = 'Backup: dzisiaj ✓';
    } else if (health.daysSince === 1) {
      label = 'Backup: wczoraj';
    } else {
      label = `Backup: ${health.daysSince} dni temu`;
    }
    if (health.txnsSince > 0 && health.level !== 'never') {
      label += ` · ${health.txnsSince} ${health.txnsSince === 1 ? 'nowa transakcja' : 'nowych'}`;
    }

    footer.innerHTML = `
      <div class="backup-status-icon">${health.level === 'danger' ? '⚠' : health.level === 'warn' ? '◐' : '●'}</div>
      <div class="backup-status-text">${escapeHtml(label)}</div>
      <button class="btn-mini" id="backup-now-btn">Backup teraz</button>
    `;
    footer.querySelector('#backup-now-btn').addEventListener('click', exportData);
    main.appendChild(footer);
  }
}

function renderMomDelta(current, prev, prevLabel, type) {
  if (prev === 0) return '';
  const delta = current - prev;
  const pct = (delta / prev) * 100;
  if (Math.abs(pct) < 0.5) return `<div class="mom-delta neutral">≈ ${escapeHtml(prevLabel)}</div>`;
  // dla wydatków: spadek = dobrze (zielono), wzrost = źle (czerwono); dla przychodów odwrotnie
  const isGood = type === 'expense' ? delta < 0 : delta > 0;
  const arrow = delta > 0 ? '↑' : '↓';
  const cls = isGood ? 'good' : 'bad';
  return `<div class="mom-delta ${cls}">${arrow} ${Math.abs(pct).toFixed(0)}% vs ${escapeHtml(prevLabel)}</div>`;
}

// ----- Lista transakcji -----
function renderList(main) {
  let txns = getTxnsInPeriod(state.selectedDate, 'month');

  // Filtr po tagu
  if (state.tagFilter) {
    txns = txns.filter(t => (t.tags || []).includes(state.tagFilter));
  }

  // Pasek z tagami (tylko jeśli są tagi w bieżącym miesiącu)
  const tagsInPeriod = new Set();
  getTxnsInPeriod(state.selectedDate, 'month').forEach(t => (t.tags || []).forEach(tag => tagsInPeriod.add(tag)));
  if (tagsInPeriod.size > 0) {
    const bar = document.createElement('div');
    bar.className = 'tag-filter-bar';
    const tagList = Array.from(tagsInPeriod).sort((a, b) => a.localeCompare(b, 'pl'));
    bar.innerHTML = `
      <button class="tag-filter-chip ${!state.tagFilter ? 'active' : ''}" data-tag="">wszystkie</button>
      ${tagList.map(tag => `<button class="tag-filter-chip ${state.tagFilter === tag ? 'active' : ''}" data-tag="${escapeHtml(tag)}">#${escapeHtml(tag)}</button>`).join('')}
    `;
    bar.addEventListener('click', e => {
      const btn = e.target.closest('.tag-filter-chip');
      if (!btn) return;
      state.tagFilter = btn.dataset.tag || null;
      render();
    });
    main.appendChild(bar);
  }

  if (txns.length === 0) {
    const msg = state.tagFilter
      ? `Brak transakcji z tagiem #${state.tagFilter} w tym miesiącu.`
      : 'W tym miesiącu jeszcze nic nie dodałeś.';
    main.appendChild(emptyState('Brak transakcji', msg));
    return;
  }

  txns = txns.slice().sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

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
      const tagsHtml = (t.tags && t.tags.length > 0)
        ? `<span class="txn-tags">${t.tags.map(tag => `<span class="txn-tag">#${escapeHtml(tag)}</span>`).join('')}</span>`
        : '';
      const recurringBadge = t.recurringId ? '<span class="recurring-badge" title="z reguły cyklicznej">↻</span>' : '';
      const row = document.createElement('div');
      row.className = 'txn-row';
      row.innerHTML = `
        <div class="txn-left">
          <span class="txn-category">
            <span class="cat-bullet" style="background:${cat ? cat.color : '#666'}"></span>
            <span class="txn-category-text">${cat ? escapeHtml(cat.name) : '(brak kategorii)'}</span>
            ${recurringBadge}
          </span>
          ${t.note ? `<span class="txn-note">${escapeHtml(t.note)}</span>` : ''}
          ${tagsHtml}
        </div>
        <span class="txn-amount ${t.type}">${t.type === 'expense' ? '−' : '+'}${formatMoney(t.amount).replace(/^[+−]/, '')}</span>
      `;
      row.addEventListener('click', () => openTransactionModal(t));
      group.appendChild(row);
    });

    main.appendChild(group);
  });
}

// ----- Kalendarz z heatmapą -----
function renderCalendar(main) {
  const year = state.selectedDate.getFullYear();
  const monthIdx = state.selectedDate.getMonth();
  const firstOfMonth = new Date(year, monthIdx, 1);
  const dim = daysInMonth(year, monthIdx);

  // Pn = 0 (zachodnia konwencja: Mon-first w Polsce)
  let leadingBlanks = (firstOfMonth.getDay() + 6) % 7;

  // Wydatki per dzień (do skali heatmapy)
  const expByDay = {};
  const incByDay = {};
  for (let d = 1; d <= dim; d++) {
    const key = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    expByDay[key] = 0;
    incByDay[key] = 0;
  }
  getTxnsInPeriod(state.selectedDate, 'month').forEach(t => {
    if (t.type === 'expense') expByDay[t.date] = (expByDay[t.date] || 0) + t.amount;
    else                      incByDay[t.date] = (incByDay[t.date] || 0) + t.amount;
  });
  const maxExp = Math.max(...Object.values(expByDay), 1);

  const todayStr = todayISO();

  const grid = document.createElement('div');
  grid.className = 'calendar-grid';

  // Nagłówki dni tygodnia
  WEEKDAY_SHORT.forEach(w => {
    const h = document.createElement('div');
    h.className = 'calendar-weekday';
    h.textContent = w;
    grid.appendChild(h);
  });

  // Puste komórki przed 1-ym
  for (let i = 0; i < leadingBlanks; i++) {
    const blank = document.createElement('div');
    blank.className = 'calendar-day blank';
    grid.appendChild(blank);
  }

  // Właściwe dni
  for (let d = 1; d <= dim; d++) {
    const dayStr = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const exp = expByDay[dayStr] || 0;
    const inc = incByDay[dayStr] || 0;
    const intensity = exp / maxExp;

    const cell = document.createElement('button');
    cell.className = 'calendar-day';
    if (dayStr === todayStr) cell.classList.add('today');
    if (dayStr === state.selectedDay) cell.classList.add('selected');
    if (exp > 0) {
      cell.style.background = `rgba(196, 84, 75, ${0.12 + intensity * 0.42})`;
    }

    cell.innerHTML = `
      <span class="calendar-day-num">${d}</span>
      ${inc > 0 ? '<span class="income-dot"></span>' : ''}
      ${exp > 0 ? `<span class="calendar-day-amount">${exp.toFixed(0)}</span>` : ''}
    `;
    cell.addEventListener('click', () => {
      state.selectedDay = state.selectedDay === dayStr ? null : dayStr;
      render();
    });
    grid.appendChild(cell);
  }

  main.appendChild(grid);

  // Legenda
  const legend = document.createElement('div');
  legend.className = 'calendar-legend';
  legend.innerHTML = `
    <span><span class="legend-swatch" style="background:rgba(196,84,75,0.15)"></span> mało</span>
    <span><span class="legend-swatch" style="background:rgba(196,84,75,0.4)"></span> średnio</span>
    <span><span class="legend-swatch" style="background:rgba(196,84,75,0.55)"></span> dużo</span>
    <span><span class="legend-dot" style="background:var(--income)"></span> przychód</span>
  `;
  main.appendChild(legend);

  // Wybrany dzień
  if (state.selectedDay) {
    const dayTxns = state.transactions.filter(t => t.date === state.selectedDay);

    const panel = document.createElement('div');
    panel.className = 'day-panel';
    const dayNet = dayTxns.reduce((s, t) => s + (t.type === 'expense' ? -t.amount : t.amount), 0);

    panel.innerHTML = `
      <div class="day-panel-header">
        <h3>${formatDate(state.selectedDay)}</h3>
        <span class="day-total">${formatMoney(dayNet, true)}</span>
      </div>
    `;

    if (dayTxns.length === 0) {
      const noTxns = document.createElement('div');
      noTxns.className = 'day-panel-empty';
      noTxns.textContent = 'W tym dniu nic.';
      panel.appendChild(noTxns);
    } else {
      dayTxns.forEach(t => {
        const cat = getCategory(t.categoryId);
        const tagsHtml = (t.tags && t.tags.length > 0)
          ? `<span class="txn-tags">${t.tags.map(tag => `<span class="txn-tag">#${escapeHtml(tag)}</span>`).join('')}</span>` : '';
        const row = document.createElement('div');
        row.className = 'txn-row';
        row.innerHTML = `
          <div class="txn-left">
            <span class="txn-category">
              <span class="cat-bullet" style="background:${cat ? cat.color : '#666'}"></span>
              <span class="txn-category-text">${cat ? escapeHtml(cat.name) : '(brak)'}</span>
              ${t.recurringId ? '<span class="recurring-badge">↻</span>' : ''}
            </span>
            ${t.note ? `<span class="txn-note">${escapeHtml(t.note)}</span>` : ''}
            ${tagsHtml}
          </div>
          <span class="txn-amount ${t.type}">${t.type === 'expense' ? '−' : '+'}${formatMoney(t.amount).replace(/^[+−]/, '')}</span>
        `;
        row.addEventListener('click', () => openTransactionModal(t));
        panel.appendChild(row);
      });
    }

    // Szybkie dodawanie z prefilled datą
    const addBtn = document.createElement('button');
    addBtn.className = 'btn secondary btn-full';
    addBtn.style.marginTop = '10px';
    addBtn.textContent = '+ Dodaj transakcję w tym dniu';
    addBtn.addEventListener('click', () => openTransactionModal(null, { date: state.selectedDay }));
    panel.appendChild(addBtn);

    main.appendChild(panel);
  }
}

// ----- Raporty -----
function renderReports(main) {
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
  const prevTxns = getTxnsInPeriod(getPrevPeriodDate(state.selectedDate, state.reportMode), state.reportMode);
  const prevLabel = getPrevPeriodLabel(state.selectedDate, state.reportMode);

  if (txns.length === 0) {
    main.appendChild(emptyState('Brak danych', 'W tym okresie nie ma transakcji.'));
    return;
  }

  const expenses = txns.filter(t => t.type === 'expense');
  const incomes  = txns.filter(t => t.type === 'income');
  const prevExp  = prevTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const prevInc  = prevTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);

  if (expenses.length > 0) renderReportSection(main, expenses, 'expense', 'Wydatki', prevExp, prevLabel);
  if (incomes.length  > 0) renderReportSection(main, incomes,  'income',  'Przychody', prevInc, prevLabel);

  if (state.reportMode === 'year') {
    renderYearMonthlyChart(main, txns);
  }
}

function renderReportSection(main, txns, type, label, prevTotal, prevLabel) {
  const total = txns.reduce((s, t) => s + t.amount, 0);
  const byCat = {};
  txns.forEach(t => { byCat[t.categoryId] = (byCat[t.categoryId] || 0) + t.amount; });
  const data = Object.entries(byCat)
    .map(([id, amt]) => ({ cat: getCategory(id), amt }))
    .filter(x => x.cat)
    .sort((a, b) => b.amt - a.amt);

  const title = document.createElement('h2');
  title.className = 'section-title';
  title.innerHTML = `${label} — ${formatMoney(total)} ${renderMomDelta(total, prevTotal, prevLabel, type)}`;
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
            backgroundColor: '#24211e', titleColor: '#f0ebe2', bodyColor: '#f0ebe2',
            borderColor: '#38332e', borderWidth: 1, padding: 10,
            callbacks: { label: ctx => ` ${ctx.label}: ${formatMoney(ctx.parsed)}` },
          },
        },
      },
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
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#908a7f', font: { size: 11 } } },
          tooltip: {
            backgroundColor: '#24211e', titleColor: '#f0ebe2', bodyColor: '#f0ebe2',
            borderColor: '#38332e', borderWidth: 1,
            callbacks: { label: ctx => ` ${ctx.dataset.label}: ${formatMoney(ctx.parsed.y)}` },
          },
        },
        scales: {
          x: { ticks: { color: '#908a7f', font: { size: 10 } }, grid: { display: false } },
          y: { ticks: { color: '#908a7f', font: { size: 10 } }, grid: { color: '#38332e' } },
        },
      },
    });
  });
}

// ----- Ustawienia -----
function renderSettings(main) {
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

  // ----- Cele oszczędnościowe -----
  const goalsTitle = document.createElement('h2');
  goalsTitle.className = 'section-title';
  goalsTitle.textContent = 'Cele oszczędnościowe';
  main.appendChild(goalsTitle);

  state.goals.forEach(goal => {
    const row = document.createElement('div');
    row.className = 'recurring-row';
    row.innerHTML = `
      <div class="recurring-info">
        <span class="cat-bullet" style="background:${goal.color}"></span>
        <div class="recurring-text">
          <strong>${escapeHtml(goal.name)}</strong>
          <span class="recurring-meta">${formatMoney(goal.currentAmount)} / ${formatMoney(goal.targetAmount)}${goal.deadline ? ' · do ' + goal.deadline : ''}</span>
        </div>
      </div>
      <div class="recurring-actions">
        <button class="btn-mini" data-action="edit">Edytuj</button>
        <button class="delete-icon" data-action="delete" aria-label="usuń">×</button>
      </div>
    `;
    row.querySelector('[data-action="edit"]').addEventListener('click', () => openGoalModal(goal));
    row.querySelector('[data-action="delete"]').addEventListener('click', () => {
      if (!confirm(`Usunąć cel "${goal.name}"?`)) return;
      state.goals = state.goals.filter(g => g.id !== goal.id);
      save();
      render();
    });
    main.appendChild(row);
  });

  const addGoalBtn = document.createElement('button');
  addGoalBtn.className = 'btn secondary btn-full';
  addGoalBtn.style.marginTop = '6px';
  addGoalBtn.textContent = '+ Dodaj cel';
  addGoalBtn.addEventListener('click', () => openGoalModal());
  main.appendChild(addGoalBtn);

  // ----- Transakcje cykliczne -----
  const recTitle = document.createElement('h2');
  recTitle.className = 'section-title';
  recTitle.textContent = 'Transakcje cykliczne';
  main.appendChild(recTitle);

  const recHint = document.createElement('div');
  recHint.className = 'section-hint';
  recHint.textContent = 'Definiujesz raz — Netflix, czynsz, abonament — apka sama dorzuca transakcję w odpowiednim dniu.';
  main.appendChild(recHint);

  state.recurring.forEach(rule => {
    const cat = getCategory(rule.categoryId);
    const freqLabel = rule.frequency === 'monthly'
      ? `Co miesiąc, ${rule.dayOfMonth}.`
      : `Co rok, ${rule.dayOfMonth}. ${MONTH_NAMES[rule.monthOfYear - 1].toLowerCase()}`;
    const row = document.createElement('div');
    row.className = 'recurring-row';
    if (!rule.active) row.classList.add('inactive');
    row.innerHTML = `
      <div class="recurring-info">
        <span class="cat-bullet" style="background:${cat ? cat.color : '#666'}"></span>
        <div class="recurring-text">
          <strong>${escapeHtml(rule.note || (cat ? cat.name : '(brak)'))}</strong>
          <span class="recurring-meta">${rule.type === 'expense' ? '−' : '+'}${formatMoney(rule.amount).replace(/^[+−]/, '')} · ${freqLabel}${!rule.active ? ' · pauza' : ''}</span>
        </div>
      </div>
      <div class="recurring-actions">
        <button class="btn-mini" data-action="toggle">${rule.active ? 'Pauza' : 'Wznów'}</button>
        <button class="btn-mini" data-action="edit">Edytuj</button>
        <button class="delete-icon" data-action="delete" aria-label="usuń">×</button>
      </div>
    `;
    row.querySelector('[data-action="toggle"]').addEventListener('click', () => {
      rule.active = !rule.active;
      save();
      render();
    });
    row.querySelector('[data-action="edit"]').addEventListener('click', () => openRecurringModal(rule));
    row.querySelector('[data-action="delete"]').addEventListener('click', () => {
      if (!confirm(`Usunąć regułę cykliczną "${rule.note || cat?.name}"?\nWygenerowane transakcje zostaną.`)) return;
      state.recurring = state.recurring.filter(r => r.id !== rule.id);
      save();
      render();
    });
    main.appendChild(row);
  });

  const addRecBtn = document.createElement('button');
  addRecBtn.className = 'btn secondary btn-full';
  addRecBtn.style.marginTop = '6px';
  addRecBtn.textContent = '+ Dodaj cykliczną';
  addRecBtn.addEventListener('click', () => openRecurringModal());
  main.appendChild(addRecBtn);

  // ----- Kategorie -----
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
        <button class="delete-icon" data-id="${cat.id}" aria-label="usuń">×</button>
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

  // ----- Dane -----
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
    state.transactions = []; state.categories = []; state.recurring = []; state.goals = [];
    load();
    render();
    toast('Dane wyczyszczone');
  });

  // ----- Aplikacja -----
  const appTitle = document.createElement('h2');
  appTitle.className = 'section-title';
  appTitle.textContent = 'Aplikacja';
  main.appendChild(appTitle);

  const versionRow = document.createElement('div');
  versionRow.className = 'setting-row';
  versionRow.innerHTML = `
    <div>
      <div style="font-size: 14px; font-weight: 500;">Wersja</div>
      <div style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); margin-top: 2px;">${APP_VERSION}</div>
    </div>
    <button class="btn-mini" id="check-update-btn">Sprawdź aktualizacje</button>
  `;
  versionRow.querySelector('#check-update-btn').addEventListener('click', checkForUpdates);
  main.appendChild(versionRow);

  const info = document.createElement('div');
  info.style.cssText = 'text-align:center; color: var(--text-dim); font-size: 11px; margin-top: 16px; padding: 8px 0 20px; font-family: var(--font-mono); letter-spacing: 0.05em;';
  info.textContent = `${state.transactions.length} TXN · ${state.recurring.length} REC · ${state.goals.length} CEL`;
  main.appendChild(info);
}

function emptyState(title, msg) {
  const el = document.createElement('div');
  el.className = 'empty-state';
  el.innerHTML = `<div class="big">∅</div><p><strong>${escapeHtml(title)}</strong></p><p>${escapeHtml(msg)}</p>`;
  return el;
}

// =================================================================
// MODAL: transakcja (z tagami)
// =================================================================
function openTransactionModal(existing, prefill = {}) {
  const overlay = document.getElementById('modal-overlay');
  overlay.hidden = false;

  const draft = existing ? { ...existing, tags: [...(existing.tags || [])] } : {
    id: null,
    type: 'expense',
    amount: '',
    categoryId: '',
    date: prefill.date || todayISO(),
    note: '',
    tags: [],
  };
  let tagInput = '';

  const renderModal = () => {
    const cats = state.categories.filter(c => c.type === draft.type);
    const existingTags = allTags();
    const suggestions = tagInput.trim()
      ? existingTags.filter(t => t.toLowerCase().includes(tagInput.toLowerCase()) && !draft.tags.includes(t)).slice(0, 6)
      : [];

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

        <div class="field">
          <label class="field-label" for="tag-input">Tagi (opcjonalne)</label>
          <div class="tag-input-wrap">
            <div class="tag-chip-list" id="tag-chip-list">
              ${draft.tags.map((tag, i) => `<span class="tag-chip-editable" data-idx="${i}">#${escapeHtml(tag)} <span class="tag-remove">×</span></span>`).join('')}
              <input type="text" id="tag-input" placeholder="${draft.tags.length === 0 ? 'np. rajd, urlop, prezent' : ''}" value="${escapeHtml(tagInput)}" autocomplete="off">
            </div>
            ${suggestions.length > 0 ? `
              <div class="tag-suggestions">
                ${suggestions.map(t => `<button class="tag-suggestion" data-tag="${escapeHtml(t)}">#${escapeHtml(t)}</button>`).join('')}
              </div>` : ''}
          </div>
        </div>

        <div class="btn-group">
          ${existing ? '<button class="btn danger" id="delete-btn">Usuń</button>' : ''}
          <button class="btn" id="save-btn">${existing ? 'Zapisz' : 'Dodaj'}</button>
        </div>
      </div>
    `;

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

    // Tag input — Enter / przecinek dodaje
    const tagInputEl = overlay.querySelector('#tag-input');
    tagInputEl.addEventListener('input', e => {
      tagInput = e.target.value;
      // Re-render only suggestions area (rerender all to be safe)
      const cursorAt = e.target.selectionStart;
      renderModal();
      const newInput = overlay.querySelector('#tag-input');
      if (newInput) { newInput.focus(); newInput.setSelectionRange(cursorAt, cursorAt); }
    });
    tagInputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const val = tagInput.trim().replace(/[,#]/g, '');
        if (val && !draft.tags.includes(val)) {
          draft.tags.push(val);
          tagInput = '';
          renderModal();
          overlay.querySelector('#tag-input')?.focus();
        }
      } else if (e.key === 'Backspace' && tagInput === '' && draft.tags.length > 0) {
        draft.tags.pop();
        renderModal();
        overlay.querySelector('#tag-input')?.focus();
      }
    });

    // Klikanie sugestii
    overlay.querySelectorAll('.tag-suggestion').forEach(btn => {
      btn.addEventListener('click', () => {
        const tag = btn.dataset.tag;
        if (!draft.tags.includes(tag)) draft.tags.push(tag);
        tagInput = '';
        renderModal();
        overlay.querySelector('#tag-input')?.focus();
      });
    });

    // Usuwanie tagów
    overlay.querySelectorAll('.tag-chip-editable').forEach(chip => {
      chip.addEventListener('click', () => {
        const idx = parseInt(chip.dataset.idx, 10);
        draft.tags.splice(idx, 1);
        renderModal();
        overlay.querySelector('#tag-input')?.focus();
      });
    });

    overlay.querySelector('#save-btn').addEventListener('click', () => {
      const amount = parseFloat(String(draft.amount).replace(',', '.'));
      if (!amount || amount <= 0 || Number.isNaN(amount)) { toast('Wpisz kwotę większą od 0'); return; }
      if (!draft.categoryId) { toast('Wybierz kategorię'); return; }
      if (!draft.date) { toast('Wybierz datę'); return; }

      // Dorzuć aktualny tekst z inputu jako tag jeśli niepusty
      const pending = tagInput.trim().replace(/[,#]/g, '');
      if (pending && !draft.tags.includes(pending)) draft.tags.push(pending);

      const payload = {
        type: draft.type,
        amount: Math.round(amount * 100) / 100,
        categoryId: draft.categoryId,
        date: draft.date,
        note: (draft.note || '').trim(),
        tags: draft.tags,
        recurringId: draft.recurringId || null,
      };

      if (existing) {
        const idx = state.transactions.findIndex(t => t.id === existing.id);
        if (idx >= 0) state.transactions[idx] = { id: existing.id, ...payload };
        markDirty();
        toast('Zapisano');
      } else {
        state.transactions.push({ id: uid(), ...payload });
        markDirty();
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
        markDirty();
        save();
        closeModal();
        render();
        toast('Usunięto');
      });
    }

    if (!existing) {
      setTimeout(() => overlay.querySelector('#amount-input')?.focus(), 80);
    }
  };

  renderModal();
  overlay.onclick = e => { if (e.target === overlay) closeModal(); };
}

// =================================================================
// MODAL: transakcja cykliczna
// =================================================================
function openRecurringModal(existing) {
  const overlay = document.getElementById('modal-overlay');
  overlay.hidden = false;

  const draft = existing ? { ...existing, tags: [...(existing.tags || [])] } : {
    id: null,
    type: 'expense',
    amount: '',
    categoryId: '',
    note: '',
    tags: [],
    frequency: 'monthly',
    dayOfMonth: new Date().getDate(),
    monthOfYear: new Date().getMonth() + 1,
    startDate: todayISO(),
    endDate: '',
    active: true,
  };

  const renderModal = () => {
    const cats = state.categories.filter(c => c.type === draft.type);
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-header">
          <h2 class="modal-title">${existing ? 'Edytuj cykliczną' : 'Nowa cykliczna'}</h2>
          <button class="close-btn" id="modal-close" aria-label="zamknij">×</button>
        </div>

        <div class="type-toggle">
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
          <label class="field-label" for="note-input">Nazwa / notatka</label>
          <input type="text" id="note-input" placeholder="np. Netflix, czynsz, rata Paseo" value="${escapeHtml(draft.note)}" autocomplete="off">
        </div>

        <div class="field">
          <label class="field-label">Częstotliwość</label>
          <div class="type-toggle">
            <button data-freq="monthly" class="${draft.frequency === 'monthly' ? 'active freq-active' : ''}">Co miesiąc</button>
            <button data-freq="yearly"  class="${draft.frequency === 'yearly'  ? 'active freq-active' : ''}">Co rok</button>
          </div>
        </div>

        ${draft.frequency === 'monthly' ? `
          <div class="field">
            <label class="field-label" for="dom-input">Dzień miesiąca</label>
            <input type="number" min="1" max="31" id="dom-input" value="${draft.dayOfMonth}">
          </div>
        ` : `
          <div class="field-row">
            <div class="field">
              <label class="field-label" for="moy-input">Miesiąc</label>
              <select id="moy-input">
                ${MONTH_NAMES.map((m, i) => `<option value="${i+1}" ${draft.monthOfYear === i+1 ? 'selected' : ''}>${m}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label class="field-label" for="dom-input">Dzień</label>
              <input type="number" min="1" max="31" id="dom-input" value="${draft.dayOfMonth}">
            </div>
          </div>
        `}

        <div class="field-row">
          <div class="field">
            <label class="field-label" for="start-input">Od</label>
            <input type="date" id="start-input" value="${draft.startDate}">
          </div>
          <div class="field">
            <label class="field-label" for="end-input">Do (opc.)</label>
            <input type="date" id="end-input" value="${draft.endDate || ''}">
          </div>
        </div>

        <div class="btn-group">
          ${existing ? '<button class="btn danger" id="delete-btn">Usuń</button>' : ''}
          <button class="btn" id="save-btn">${existing ? 'Zapisz' : 'Dodaj'}</button>
        </div>
      </div>
    `;

    overlay.querySelector('#modal-close').addEventListener('click', closeModal);
    overlay.querySelector('.type-toggle').addEventListener('click', e => {
      const btn = e.target.closest('button[data-type]');
      if (!btn) return;
      draft.type = btn.dataset.type;
      draft.categoryId = '';
      renderModal();
    });
    overlay.querySelectorAll('button[data-freq]').forEach(btn => {
      btn.addEventListener('click', () => {
        draft.frequency = btn.dataset.freq;
        renderModal();
      });
    });

    overlay.querySelector('#amount-input').addEventListener('input', e => { draft.amount = e.target.value; });
    overlay.querySelector('#note-input').addEventListener('input', e => { draft.note = e.target.value; });
    overlay.querySelector('#dom-input').addEventListener('input', e => {
      draft.dayOfMonth = Math.max(1, Math.min(31, parseInt(e.target.value, 10) || 1));
    });
    const moy = overlay.querySelector('#moy-input');
    if (moy) moy.addEventListener('change', e => { draft.monthOfYear = parseInt(e.target.value, 10); });
    overlay.querySelector('#start-input').addEventListener('input', e => { draft.startDate = e.target.value; });
    overlay.querySelector('#end-input').addEventListener('input', e => { draft.endDate = e.target.value; });

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
      if (!draft.startDate) { toast('Wybierz datę startu'); return; }

      const payload = {
        type: draft.type,
        amount: Math.round(amount * 100) / 100,
        categoryId: draft.categoryId,
        note: (draft.note || '').trim(),
        tags: draft.tags,
        frequency: draft.frequency,
        dayOfMonth: draft.dayOfMonth,
        monthOfYear: draft.monthOfYear,
        startDate: draft.startDate,
        endDate: draft.endDate || null,
        active: draft.active !== false,
      };

      if (existing) {
        const idx = state.recurring.findIndex(r => r.id === existing.id);
        if (idx >= 0) state.recurring[idx] = { ...existing, ...payload };
        toast('Zapisano');
      } else {
        state.recurring.push({ id: uid(), lastGeneratedDate: null, ...payload });
        toast('Dodano regułę');
      }
      save();
      generateRecurring();      // od razu wygeneruj transakcje wsteczne
      closeModal();
      render();
    });

    if (existing) {
      overlay.querySelector('#delete-btn').addEventListener('click', () => {
        if (!confirm('Usunąć regułę cykliczną?\nWygenerowane transakcje pozostaną.')) return;
        state.recurring = state.recurring.filter(r => r.id !== existing.id);
        save();
        closeModal();
        render();
        toast('Usunięto');
      });
    }
  };

  renderModal();
  overlay.onclick = e => { if (e.target === overlay) closeModal(); };
}

// =================================================================
// MODAL: cel oszczędnościowy
// =================================================================
function openGoalModal(existing) {
  const overlay = document.getElementById('modal-overlay');
  overlay.hidden = false;

  const draft = existing ? { ...existing } : {
    id: null,
    name: '',
    targetAmount: '',
    currentAmount: 0,
    deadline: '',
    color: GOAL_COLORS[Math.floor(Math.random() * GOAL_COLORS.length)],
    createdAt: todayISO(),
  };

  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h2 class="modal-title">${existing ? 'Edytuj cel' : 'Nowy cel'}</h2>
        <button class="close-btn" id="modal-close" aria-label="zamknij">×</button>
      </div>

      <div class="field">
        <label class="field-label" for="goal-name">Nazwa</label>
        <input type="text" id="goal-name" placeholder="np. Klatka bezpieczeństwa do Paseo" value="${escapeHtml(draft.name)}" autocomplete="off">
      </div>

      <div class="field-row">
        <div class="field">
          <label class="field-label" for="goal-target">Cel</label>
          <input type="text" inputmode="decimal" id="goal-target" placeholder="0,00" value="${draft.targetAmount}">
        </div>
        <div class="field">
          <label class="field-label" for="goal-current">Już zebrane</label>
          <input type="text" inputmode="decimal" id="goal-current" placeholder="0,00" value="${draft.currentAmount}">
        </div>
      </div>

      <div class="field">
        <label class="field-label" for="goal-deadline">Termin (opcjonalny)</label>
        <input type="date" id="goal-deadline" value="${draft.deadline || ''}">
      </div>

      <div class="field">
        <label class="field-label">Kolor</label>
        <div class="color-picker">
          ${GOAL_COLORS.map(c => `<button class="color-swatch ${draft.color === c ? 'selected' : ''}" data-color="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}
        </div>
      </div>

      <div class="btn-group">
        ${existing ? '<button class="btn danger" id="delete-btn">Usuń</button>' : ''}
        <button class="btn" id="save-btn">${existing ? 'Zapisz' : 'Dodaj'}</button>
      </div>
    </div>
  `;

  overlay.querySelector('#modal-close').addEventListener('click', closeModal);
  overlay.querySelector('#goal-name').addEventListener('input', e => { draft.name = e.target.value; });
  overlay.querySelector('#goal-target').addEventListener('input', e => { draft.targetAmount = e.target.value; });
  overlay.querySelector('#goal-current').addEventListener('input', e => { draft.currentAmount = e.target.value; });
  overlay.querySelector('#goal-deadline').addEventListener('input', e => { draft.deadline = e.target.value; });

  overlay.querySelector('.color-picker').addEventListener('click', e => {
    const sw = e.target.closest('.color-swatch');
    if (!sw) return;
    draft.color = sw.dataset.color;
    overlay.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
    sw.classList.add('selected');
  });

  overlay.querySelector('#save-btn').addEventListener('click', () => {
    if (!draft.name.trim()) { toast('Wpisz nazwę celu'); return; }
    const target = parseFloat(String(draft.targetAmount).replace(',', '.'));
    if (!target || target <= 0) { toast('Wpisz kwotę celu większą od 0'); return; }
    const current = parseFloat(String(draft.currentAmount).replace(',', '.')) || 0;

    const payload = {
      name: draft.name.trim(),
      targetAmount: Math.round(target * 100) / 100,
      currentAmount: Math.round(current * 100) / 100,
      deadline: draft.deadline || null,
      color: draft.color,
      createdAt: draft.createdAt,
    };

    if (existing) {
      const idx = state.goals.findIndex(g => g.id === existing.id);
      if (idx >= 0) state.goals[idx] = { id: existing.id, ...payload };
      toast('Zapisano');
    } else {
      state.goals.push({ id: uid(), ...payload });
      toast('Dodano cel');
    }
    save();
    closeModal();
    render();
  });

  if (existing) {
    overlay.querySelector('#delete-btn').addEventListener('click', () => {
      if (!confirm(`Usunąć cel "${existing.name}"?`)) return;
      state.goals = state.goals.filter(g => g.id !== existing.id);
      save();
      closeModal();
      render();
      toast('Usunięto');
    });
  }

  overlay.onclick = e => { if (e.target === overlay) closeModal(); };
}

function addToGoal(goal) {
  const v = prompt(`Dodaj wpłatę do "${goal.name}".\nObecnie ${formatMoney(goal.currentAmount)} / ${formatMoney(goal.targetAmount)}.\nKwota wpłaty:`);
  if (!v) return;
  const amt = parseFloat(String(v).replace(',', '.'));
  if (!amt || amt <= 0) { toast('Niepoprawna kwota'); return; }
  goal.currentAmount = Math.round((goal.currentAmount + amt) * 100) / 100;
  save();
  render();
  toast(`Dodano ${formatMoney(amt)}`);
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
async function exportData() {
  const data = {
    app: 'budzet-pwa',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    transactions: state.transactions,
    categories: state.categories,
    recurring: state.recurring,
    goals: state.goals,
    settings: state.settings,
  };
  const json = JSON.stringify(data, null, 2);
  const filename = `budzet-${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([json], { type: 'application/json' });

  let success = false;
  let usedMethod = '';

  // 1. Próba: Web Share API z plikiem — na iOS pokazuje natywny panel Udostępnij,
  //    z którego można wybrać Files → iCloud Drive jednym tapnięciem.
  try {
    if (navigator.canShare && typeof File !== 'undefined') {
      const file = new File([blob], filename, { type: 'application/json' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Backup budżetu',
          text: filename,
        });
        success = true;
        usedMethod = 'share';
      }
    }
  } catch (err) {
    // User mógł anulować share — wtedy AbortError. Inne błędy też pomijamy
    // i lecimy do fallbacku.
    if (err.name !== 'AbortError') console.warn('share failed:', err);
    // Jeśli user anulował, NIE oznaczamy jako zapisane — niech spróbuje ponownie.
    if (err.name === 'AbortError') return;
  }

  // 2. Fallback: klasyczne pobranie pliku (działa na desktopie i Androidzie).
  if (!success) {
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      success = true;
      usedMethod = 'download';
    } catch (err) {
      console.warn('download failed:', err);
    }
  }

  // 3. Ostatnia deska ratunku: schowek. Można wkleić do Notatek i tam żyje.
  if (!success) {
    try {
      await navigator.clipboard.writeText(json);
      success = true;
      usedMethod = 'clipboard';
      alert('Skopiowano backup do schowka. Wklej go do Notatek lub innego bezpiecznego miejsca.');
    } catch (err) {
      console.error('clipboard failed:', err);
    }
  }

  if (success) {
    // Oznacz że backup się udał
    state.settings.lastBackupDate = todayISO();
    state.settings.txnsSinceBackup = 0;
    save();
    const msg = usedMethod === 'share' ? 'Backup zapisany'
              : usedMethod === 'clipboard' ? 'Backup w schowku'
              : 'Backup pobrany';
    toast(msg);
    render();
  } else {
    toast('Nie udało się zapisać backupu');
  }
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = migrate(JSON.parse(reader.result));
      if (!Array.isArray(data.transactions) || !Array.isArray(data.categories)) {
        throw new Error('Niepoprawny format pliku');
      }
      if (!confirm(`Zaimportować ${data.transactions.length} transakcji, ${data.categories.length} kategorii, ${data.recurring.length} cyklicznych i ${data.goals.length} celów?\nTo zastąpi obecne dane na tym urządzeniu.`)) {
        e.target.value = '';
        return;
      }
      state.transactions = data.transactions;
      state.categories   = data.categories;
      state.recurring    = data.recurring;
      state.goals        = data.goals;
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
  requestPersistentStorage();   // poproś Safari, żeby nie eksmitowało danych
  generateRecurring();   // dogonienie transakcji cyklicznych po starcie

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // wyczyść filtr tagów przy zmianie widoku
      if (state.view !== btn.dataset.view) state.tagFilter = null;
      state.view = btn.dataset.view;
      render();
    });
  });

  document.getElementById('prev-month').addEventListener('click', () => {
    const yearMode = state.view === 'reports' && state.reportMode === 'year';
    const d = new Date(state.selectedDate);
    if (yearMode) d.setFullYear(d.getFullYear() - 1);
    else d.setMonth(d.getMonth() - 1);
    state.selectedDate = d;
    state.selectedDay = null;
    render();
  });
  document.getElementById('next-month').addEventListener('click', () => {
    const yearMode = state.view === 'reports' && state.reportMode === 'year';
    const d = new Date(state.selectedDate);
    if (yearMode) d.setFullYear(d.getFullYear() + 1);
    else d.setMonth(d.getMonth() + 1);
    state.selectedDate = d;
    state.selectedDay = null;
    render();
  });

  document.getElementById('fab').addEventListener('click', () => openTransactionModal());

  render();
}

document.addEventListener('DOMContentLoaded', init);
