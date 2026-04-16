import { db } from '/db.js';

// ─── 工具函式 ──────────────────────────────────────────────────────────────────

export function fmt(n) {
  return 'NT$' + Math.abs(+n || 0).toLocaleString('zh-TW');
}

export function fmtDate(dateStr, precision) {
  const d = new Date(dateStr);
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
  if (precision === 'year')  return `${y}年`;
  if (precision === 'month') return `${y}年${m}月`;
  return `${y}/${String(m).padStart(2,'0')}/${String(day).padStart(2,'0')}`;
}

let _toastTimer;
export function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

const _state = {};
export function navigate(hash, state = {}) {
  Object.assign(_state, state);
  location.hash = hash;
}
export function getState() { return _state; }

// ─── 路由 ──────────────────────────────────────────────────────────────────────

const routes = {
  '/dashboard': { title: '總覽',    nav: 'dashboard',  load: async c => { const { renderDashboard } = await import('/pages/dashboard.js');  renderDashboard(c); } },
  '/records':   { title: '收支記錄', nav: 'records',    load: async c => { const { renderRecords }   = await import('/pages/records.js');    renderRecords(c);   } },
  '/add':       { title: '新增記錄', nav: 'add',        load: async c => { const { renderForm }      = await import('/pages/form.js');       renderForm(c, null); } },
  '/edit':      { title: '編輯記錄', nav: 'records',    load: async c => { const { renderForm }      = await import('/pages/form.js');       renderForm(c, _state.record); } },
  '/categories':{ title: '分類管理', nav: 'categories', load: async c => { const { renderCategories }= await import('/pages/categories.js'); renderCategories(c); } },
  '/stats':     { title: '統計',    nav: 'stats',      load: async c => { const { renderStats }     = await import('/pages/stats.js');      renderStats(c);     } },
};

function handleRoute() {
  const hash  = location.hash.replace('#', '') || '/dashboard';
  const parts = hash.split('/').filter(Boolean);
  const key   = '/' + parts[0];
  const route = routes[key];
  if (!route) { location.hash = '#/dashboard'; return; }

  document.getElementById('page-title').textContent = route.title;
  document.getElementById('back-btn').style.display = key === '/edit' ? '' : 'none';
  document.querySelectorAll('.nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.page === route.nav));

  const c = document.getElementById('page-content');
  c.innerHTML = '';
  c.scrollTop = 0;
  route.load(c);
}

// ─── 密碼 ──────────────────────────────────────────────────────────────────────

function getPwd()    { return localStorage.getItem('idc_pwd'); }
function setPwd(p)   { localStorage.setItem('idc_pwd', p); }
function isAuthed()  { return !!sessionStorage.getItem('idc_auth'); }
function setAuthed() { sessionStorage.setItem('idc_auth', '1'); }

function showLogin() {
  document.getElementById('login-screen').style.display = '';
  document.getElementById('main-screen').style.display = 'none';

  const hasPwd = !!getPwd();
  document.getElementById('login-title').textContent    = hasPwd ? '輸入密碼' : '設定密碼';
  document.getElementById('login-subtitle').textContent = hasPwd ? '輸入您的密碼以繼續' : '首次使用，請設定一組密碼';
  document.getElementById('confirm-group').style.display = hasPwd ? 'none' : '';
  document.getElementById('skip-btn').style.display      = hasPwd ? 'none' : '';
  document.getElementById('logout-hint').style.display   = hasPwd ? '' : 'none';
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('main-screen').style.display  = 'flex';
  if (!location.hash) location.hash = '#/dashboard';
  handleRoute();
}

// ─── 初始化種子資料 ─────────────────────────────────────────────────────────────

async function initSeed() {
  const empty = await db.isEmpty();
  if (!empty) return;

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,119,182,0.95);display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;z-index:9999;font-family:system-ui;gap:16px';
  overlay.innerHTML = `
    <div style="width:56px;height:56px;border:4px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin 0.8s linear infinite"></div>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
    <div style="font-size:18px;font-weight:700">正在載入歷史資料…</div>
    <div id="seed-progress" style="font-size:14px;opacity:0.8">準備中</div>`;
  document.body.appendChild(overlay);

  try {
    document.getElementById('seed-progress').textContent = '讀取分類資料…';
    const { SEED_ITEMS, SEED_RECORDS } = await import('/seed.js');
    document.getElementById('seed-progress').textContent = `匯入 ${SEED_RECORDS.length} 筆記錄中…`;
    await db.seedAll(SEED_ITEMS, SEED_RECORDS);
    document.getElementById('seed-progress').textContent = '完成！';
    await new Promise(r => setTimeout(r, 600));
  } catch (e) {
    console.error('Seed error:', e);
  } finally {
    overlay.remove();
  }
}

// ─── 啟動 ──────────────────────────────────────────────────────────────────────

// Login form submit
document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const pw  = document.getElementById('login-password').value;
  const pw2 = document.getElementById('login-confirm').value;
  const err = document.getElementById('login-error');
  err.style.display = 'none';

  const stored = getPwd();
  if (!stored) {
    // 設定密碼
    if (pw.length < 4) { err.textContent = '密碼至少 4 個字元'; err.style.display = ''; return; }
    if (pw !== pw2)    { err.textContent = '兩次密碼不一致';   err.style.display = ''; return; }
    setPwd(pw);
  } else {
    if (pw !== stored) { err.textContent = '密碼錯誤，請再試'; err.style.display = ''; return; }
  }
  setAuthed();
  await initSeed();
  showApp();
});

// Skip (no password)
document.getElementById('skip-btn')?.addEventListener('click', async () => {
  setPwd('');
  setAuthed();
  await initSeed();
  showApp();
});

// Logout hint
document.getElementById('logout-hint')?.addEventListener('click', () => {
  if (confirm('確定要重設密碼嗎？')) {
    localStorage.removeItem('idc_pwd');
    sessionStorage.removeItem('idc_auth');
    location.reload();
  }
});

window.addEventListener('hashchange', () => { if (isAuthed()) handleRoute(); });

// Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(console.error);
}

// Startup
if (isAuthed()) {
  initSeed().then(showApp);
} else {
  showLogin();
}
