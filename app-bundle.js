// IDC 潛水收支管理 — 單檔離線 PWA

// ─── 工具函式 ──────────────────────────────────────────────────────────────────
function fmt(n) {
  return 'NT$' + Math.abs(+n || 0).toLocaleString('zh-TW');
}
function fmtDate(dateStr, precision) {
  var d = new Date(dateStr);
  var y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
  if (precision === 'year')  return y + '年';
  if (precision === 'month') return y + '年' + m + '月';
  return y + '/' + String(m).padStart(2,'0') + '/' + String(day).padStart(2,'0');
}
var _toastTimer;
function showToast(msg) {
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function(){ el.classList.remove('show'); }, 2500);
}
var _navState = {};
function navigate(hash, state) {
  if (state) Object.assign(_navState, state);
  location.hash = hash;
}

// ─── IndexedDB ────────────────────────────────────────────────────────────────
var DB = (function() {
  var _db = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise(function(res, rej) {
      var req = indexedDB.open('idc-finance', 1);
      req.onupgradeneeded = function(e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('items')) {
          var is = db.createObjectStore('items', { keyPath: 'id', autoIncrement: true });
          is.createIndex('type', 'type');
        }
        if (!db.objectStoreNames.contains('records')) {
          var rs = db.createObjectStore('records', { keyPath: 'id', autoIncrement: true });
          rs.createIndex('date', 'date');
          rs.createIndex('type', 'type');
        }
      };
      req.onsuccess = function(e) { _db = e.target.result; res(_db); };
      req.onerror   = function(e) { rej(e.target.error); };
    });
  }

  function getAll(store) {
    return open().then(function(db) {
      return new Promise(function(res, rej) {
        var req = db.transaction([store], 'readonly').objectStore(store).getAll();
        req.onsuccess = function(e) { res(e.target.result); };
        req.onerror   = function(e) { rej(e.target.error); };
      });
    });
  }

  function txWrite(store, fn) {
    return open().then(function(db) {
      return new Promise(function(res, rej) {
        var t = db.transaction([store], 'readwrite');
        t.oncomplete = function() { res(); };
        t.onerror    = function(e) { rej(e.target.error); };
        t.onabort    = function(e) { rej(e.target.error); };
        fn(t.objectStore(store));
      });
    });
  }

  function getOne(store, id) {
    return open().then(function(db) {
      return new Promise(function(res, rej) {
        var req = db.transaction([store], 'readonly').objectStore(store).get(id);
        req.onsuccess = function(e) { res(e.target.result); };
        req.onerror   = function(e) { rej(e.target.error); };
      });
    });
  }

  function countStore(store) {
    return open().then(function(db) {
      return new Promise(function(res, rej) {
        var req = db.transaction([store], 'readonly').objectStore(store).count();
        req.onsuccess = function(e) { res(e.target.result); };
        req.onerror   = function(e) { rej(e.target.error); };
      });
    });
  }

  return {
    getItems: function(type) {
      return getAll('items').then(function(all) {
        var f = type ? all.filter(function(i){ return i.type === type; }) : all;
        return f.sort(function(a,b){ return (a.sort_order||0)-(b.sort_order||0) || a.id-b.id; });
      });
    },
    addItem: function(item) {
      return txWrite('items', function(s){ s.add(item); });
    },
    updateItem: function(id, data) {
      return getOne('items', id).then(function(existing) {
        return txWrite('items', function(s){ s.put(Object.assign({}, existing, data)); });
      });
    },
    deleteItem: function(id) {
      return txWrite('items', function(s){ s.delete(id); });
    },
    getRecords: function(opts) {
      opts = opts || {};
      var year = opts.year, month = opts.month, type = opts.type, search = opts.search;
      var limit = opts.limit || 50, offset = opts.offset || 0;
      return getAll('records').then(function(all) {
        var f = all;
        if (year)   f = f.filter(function(r){ return new Date(r.date).getUTCFullYear() == year; });
        if (month)  f = f.filter(function(r){ return (new Date(r.date).getUTCMonth()+1) == month; });
        if (type)   f = f.filter(function(r){ return r.type === type; });
        if (search) {
          var q = search.toLowerCase();
          f = f.filter(function(r){ return (r.item_name||'').toLowerCase().includes(q) || (r.note||'').toLowerCase().includes(q); });
        }
        f.sort(function(a,b){ return b.date < a.date ? -1 : b.date > a.date ? 1 : b.id - a.id; });
        return { records: f.slice(offset, offset+limit), total: f.length };
      });
    },
    addRecord: function(rec) {
      return txWrite('records', function(s){ s.add(rec); });
    },
    updateRecord: function(id, data) {
      return getOne('records', id).then(function(existing) {
        return txWrite('records', function(s){ s.put(Object.assign({}, existing, data)); });
      });
    },
    deleteRecord: function(id) {
      return txWrite('records', function(s){ s.delete(id); });
    },
    getSummary: function(opts) {
      opts = opts || {};
      return getAll('records').then(function(all) {
        var f = all;
        if (opts.year)  f = f.filter(function(r){ return new Date(r.date).getUTCFullYear() == opts.year; });
        if (opts.month) f = f.filter(function(r){ return (new Date(r.date).getUTCMonth()+1) == opts.month; });
        var summary = { income: 0, expense: 0 };
        f.forEach(function(r){ summary[r.type] = (summary[r.type]||0) + (+r.amount); });
        summary.net = summary.income - summary.expense;
        var yearStats = {};
        all.forEach(function(r) {
          var y = new Date(r.date).getUTCFullYear();
          if (!yearStats[y]) yearStats[y] = { income: 0, expense: 0 };
          yearStats[y][r.type] = (yearStats[y][r.type]||0) + (+r.amount);
        });
        var catMap = {};
        f.forEach(function(r) {
          var k = r.type + '__' + r.item_name;
          if (!catMap[k]) catMap[k] = { item_name: r.item_name, type: r.type, total: 0 };
          catMap[k].total += +r.amount;
        });
        var byCategory = Object.values(catMap).sort(function(a,b){ return b.total - a.total; });
        return { summary: summary, yearStats: yearStats, byCategory: byCategory };
      });
    },
    isEmpty: function() {
      return Promise.all([countStore('records'), countStore('items')]).then(function(counts) {
        return counts[0] === 0 && counts[1] === 0;
      });
    },
    seedAll: function(items, records) {
      return txWrite('items', function(s) {
        items.forEach(function(i){ s.put(i); });
      }).then(function() {
        var SZ = 100, i = 0;
        function next() {
          if (i >= records.length) return Promise.resolve();
          var batch = records.slice(i, i + SZ);
          i += SZ;
          return txWrite('records', function(s) {
            batch.forEach(function(r){ s.put(r); });
          }).then(next);
        }
        return next();
      });
    }
  };
})();

// ─── Auth ─────────────────────────────────────────────────────────────────────
function getPwd()    { return localStorage.getItem('idc_pwd'); }
function setPwd(p)   { localStorage.setItem('idc_pwd', p); }
function isAuthed()  { return !!sessionStorage.getItem('idc_auth'); }
function setAuthed() { sessionStorage.setItem('idc_auth', '1'); }

function showLogin() {
  document.getElementById('login-screen').style.display = '';
  document.getElementById('main-screen').style.display  = 'none';
  var hasPwd = !!getPwd();
  document.getElementById('login-title').textContent    = hasPwd ? '輸入密碼' : '設定密碼';
  document.getElementById('login-subtitle').textContent = hasPwd ? '輸入您的密碼以繼續' : '首次使用，請設定一組密碼';
  document.getElementById('confirm-group').style.display = hasPwd ? 'none' : '';
  document.getElementById('skip-btn').style.display      = hasPwd ? 'none' : '';
  document.getElementById('logout-hint').style.display   = hasPwd ? ''     : 'none';
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('main-screen').style.display  = 'flex';
  if (!location.hash || location.hash === '#') location.hash = '#/dashboard';
  handleRoute();
}

// ─── 種子資料 ──────────────────────────────────────────────────────────────────
function initSeed() {
  return DB.isEmpty().then(function(empty) {
    if (!empty) return;
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,119,182,0.95);display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;z-index:9999;font-family:system-ui;gap:16px';
    ov.innerHTML = '<div style="width:56px;height:56px;border:4px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin 0.8s linear infinite"></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style><div style="font-size:18px;font-weight:700">正在載入歷史資料…</div><div id="seed-p" style="font-size:14px;opacity:0.8">準備中</div>';
    document.body.appendChild(ov);
    document.getElementById('seed-p').textContent = '匯入 ' + SEED_RECORDS.length + ' 筆記錄中…';
    return DB.seedAll(SEED_ITEMS, SEED_RECORDS).then(function() {
      ov.remove();
    }).catch(function(e) {
      console.error('Seed error:', e);
      ov.remove();
    });
  });
}

// ─── 頁面：總覽 ────────────────────────────────────────────────────────────────
var dashYear  = new Date().getFullYear();
var dashMonth = new Date().getMonth() + 1;

function renderDashboard(c) {
  c.innerHTML = '<div class="dashboard">' +
    '<div class="year-selector"><button id="yr-p">‹</button><span id="yr-l">' + dashYear + '</span><button id="yr-n">›</button></div>' +
    '<div class="stat-cards" id="yr-cards"><div class="stat-card skeleton" style="height:80px"></div><div class="stat-card skeleton" style="height:80px"></div><div class="stat-card full skeleton" style="height:80px"></div></div>' +
    '<div class="card" style="padding:16px;margin-bottom:12px"><div style="font-size:14px;font-weight:700;margin-bottom:8px">選擇月份</div><div class="month-grid" id="m-grid"></div></div>' +
    '<div id="m-stats"></div></div>';

  document.getElementById('yr-p').onclick = function(){ dashYear--; dashRefresh(); };
  document.getElementById('yr-n').onclick = function(){ dashYear++; dashRefresh(); };
  dashRefresh();
}

function dashRefresh() {
  document.getElementById('yr-l').textContent = dashYear;
  DB.getSummary({ year: dashYear }).then(function(data) {
    var ys = data.yearStats[dashYear] || {};
    var inc = ys.income||0, exp = ys.expense||0, net = inc-exp;
    document.getElementById('yr-cards').innerHTML =
      '<div class="stat-card income"><div class="label">年度收入</div><div class="value">' + fmt(inc) + '</div></div>' +
      '<div class="stat-card expense"><div class="label">年度支出</div><div class="value">' + fmt(exp) + '</div></div>' +
      '<div class="stat-card full net"><div class="label">年度結餘</div><div class="value">' + fmt(net) + '</div></div>';
    renderMonthGrid();
    renderMonthStats(dashMonth);
  }).catch(function(e){ showToast('載入失敗：' + e.message); });
}

function renderMonthGrid() {
  var g = document.getElementById('m-grid');
  if (!g) return;
  g.innerHTML = [1,2,3,4,5,6,7,8,9,10,11,12].map(function(m) {
    return '<button class="month-btn' + (m===dashMonth?' active':'') + '" data-m="' + m + '">' + m + '月</button>';
  }).join('');
  g.querySelectorAll('.month-btn').forEach(function(btn) {
    btn.onclick = function() {
      dashMonth = +btn.dataset.m;
      g.querySelectorAll('.month-btn').forEach(function(b){ b.classList.toggle('active', +b.dataset.m===dashMonth); });
      renderMonthStats(dashMonth);
    };
  });
}

function renderMonthStats(m) {
  var c = document.getElementById('m-stats');
  if (!c) return;
  c.innerHTML = '<div class="month-stats"><div class="skeleton" style="height:80px"></div></div>';
  DB.getSummary({ year: dashYear, month: m }).then(function(data) {
    var inc = data.summary.income||0, exp = data.summary.expense||0, net = data.summary.net||0;
    var maxA = data.byCategory.length ? Math.max.apply(null, data.byCategory.map(function(x){ return +x.total; })) : 1;
    var cats = data.byCategory.map(function(cat) {
      var color = cat.type==='income' ? 'var(--income)' : 'var(--expense)';
      var bg    = cat.type==='income' ? 'var(--income-bg)' : 'var(--expense-bg)';
      var pct   = Math.round(+cat.total/maxA*100);
      return '<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:3px"><span style="color:' + color + '">' + cat.item_name + '</span><span style="font-weight:700">' + fmt(+cat.total) + '</span></div><div style="height:6px;border-radius:3px;background:' + bg + '"><div style="height:6px;border-radius:3px;background:' + color + ';width:' + pct + '%"></div></div></div>';
    }).join('');
    c.innerHTML = '<div class="month-stats"><div style="font-size:14px;font-weight:700;margin-bottom:4px">' + dashYear + '年' + m + '月</div>' +
      '<div class="month-stats-grid"><div class="mstat inc"><div class="ml">收入</div><div class="mv">' + fmt(inc) + '</div></div><div class="mstat exp"><div class="ml">支出</div><div class="mv">' + fmt(exp) + '</div></div><div class="mstat net"><div class="ml">結餘</div><div class="mv">' + fmt(net) + '</div></div></div>' +
      (cats ? '<div style="margin-top:16px"><div style="font-size:13px;font-weight:700;color:var(--text-3);margin-bottom:8px">分類明細</div>' + cats + '</div>' : '') +
      '</div>';
  }).catch(function() {
    c.innerHTML = '<div class="month-stats"><p style="color:var(--text-3);text-align:center">無資料</p></div>';
  });
}

// ─── 頁面：記錄 ────────────────────────────────────────────────────────────────
var recFilters = { year: new Date().getFullYear(), month: '', type: '' };
var recOffset = 0, recTotal = 0;
var PAGE_SIZE = 30;

function renderRecords(c) {
  var yr = new Date().getFullYear();
  var years = [yr, yr-1, yr-2, yr-3, yr-4, yr-5];
  var yearChips = ['<button class="filter-chip' + (!recFilters.year?' active':'') + '" data-f="year" data-v="">全部年份</button>'].concat(
    years.map(function(y){ return '<button class="filter-chip' + (recFilters.year==y?' active':'') + '" data-f="year" data-v="' + y + '">' + y + '</button>'; })
  ).join('');
  var monthChips = '<button class="filter-chip' + (!recFilters.month?' active':'') + '" data-f="month" data-v="">全部月份</button>' +
    [1,2,3,4,5,6,7,8,9,10,11,12].map(function(m){ return '<button class="filter-chip' + (recFilters.month==m?' active':'') + '" data-f="month" data-v="' + m + '">' + m + '月</button>'; }).join('');
  var typeChips = '<button class="filter-chip' + (!recFilters.type?' active':'') + '" data-f="type" data-v="">全部</button>' +
    '<button class="filter-chip' + (recFilters.type==='income'?' active':'') + '" data-f="type" data-v="income" style="color:var(--income)">收入</button>' +
    '<button class="filter-chip' + (recFilters.type==='expense'?' active':'') + '" data-f="type" data-v="expense" style="color:var(--expense)">支出</button>';
  c.innerHTML = '<div class="records-header"><div class="filter-row">' + yearChips + '</div><div class="filter-row" style="margin-top:8px">' + monthChips + '</div><div class="filter-row" style="margin-top:8px">' + typeChips + '</div></div><div id="rec-list" class="record-list"></div>';
  c.querySelectorAll('.filter-chip').forEach(function(chip) {
    chip.onclick = function() {
      recFilters[chip.dataset.f] = chip.dataset.v;
      chip.closest('.filter-row').querySelectorAll('.filter-chip').forEach(function(x){ x.classList.remove('active'); });
      chip.classList.add('active');
      loadRecords(true);
    };
  });
  loadRecords(true);
}

function loadRecords(reset) {
  if (reset) recOffset = 0;
  var list = document.getElementById('rec-list');
  if (!list) return;
  if (reset) list.innerHTML = '<div class="skeleton" style="height:70px;border-radius:12px;margin-bottom:8px"></div>'.repeat(4);
  DB.getRecords(Object.assign({}, recFilters, { limit: PAGE_SIZE, offset: recOffset })).then(function(data) {
    recTotal = data.total;
    if (reset) list.innerHTML = '';
    if (!data.records.length && reset) {
      list.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg><p>沒有符合的記錄</p></div>';
      return;
    }
    data.records.forEach(function(rec) {
      var el = document.createElement('div');
      el.className = 'record-item ' + rec.type;
      el.innerHTML = '<div class="record-dot">' + (rec.type==='income'?'收':'支') + '</div>' +
        '<div class="record-body"><div class="record-name">' + rec.item_name + '</div>' +
        (rec.note ? '<div class="record-note">' + rec.note + '</div>' : '') +
        '<div class="record-date">' + fmtDate(rec.date, rec.date_precision) + '</div></div>' +
        '<div class="record-amount"><div class="amt">' + fmt(+rec.amount) + '</div></div>';
      el.onclick = function(){ showRecordDetail(rec); };
      list.appendChild(el);
    });
    var old = list.querySelector('.load-more');
    if (old) old.remove();
    recOffset += data.records.length;
    if (recOffset < recTotal) {
      var btn = document.createElement('div');
      btn.className = 'load-more';
      btn.textContent = '載入更多（還有 ' + (recTotal - recOffset) + ' 筆）';
      btn.onclick = function(){ loadRecords(false); };
      list.appendChild(btn);
    }
  }).catch(function(e){ showToast('載入失敗：' + e.message); });
}

function showRecordDetail(rec) {
  var ov = document.createElement('div');
  ov.className = 'modal-overlay';
  var color = rec.type==='income' ? 'var(--income)' : 'var(--expense)';
  ov.innerHTML = '<div class="modal"><div class="modal-handle"></div>' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">' +
    '<div><div style="font-size:11px;font-weight:700;color:' + color + ';margin-bottom:4px">' + (rec.type==='income'?'收入':'支出') + '</div><div style="font-size:20px;font-weight:800">' + rec.item_name + '</div></div>' +
    '<div style="font-size:24px;font-weight:800;color:' + color + '">' + (rec.type==='expense'?'-':'') + fmt(+rec.amount) + '</div></div>' +
    '<div style="background:var(--bg);border-radius:12px;padding:14px;margin-bottom:16px">' +
    '<div style="display:flex;justify-content:space-between"><span style="color:var(--text-3);font-size:13px">日期</span><span style="font-weight:600;font-size:14px">' + fmtDate(rec.date, rec.date_precision) + '</span></div>' +
    (rec.note ? '<div style="border-top:1px solid var(--border);padding-top:8px;margin-top:8px;font-size:13px;color:var(--text-2);word-break:break-all">' + rec.note + '</div>' : '') +
    '</div><div style="display:flex;gap:10px"><button id="rd-edit" class="btn btn-ghost" style="flex:1">編輯</button><button id="rd-del" class="btn btn-danger" style="flex:1">刪除</button></div></div>';
  ov.onclick = function(e){ if (e.target === ov) ov.remove(); };
  ov.querySelector('#rd-del').onclick = function() {
    if (!confirm('確定刪除「' + rec.item_name + '」嗎？')) return;
    DB.deleteRecord(rec.id).then(function(){ ov.remove(); showToast('已刪除'); loadRecords(true); }).catch(function(){ showToast('刪除失敗'); });
  };
  ov.querySelector('#rd-edit').onclick = function() { ov.remove(); navigate('#/edit', { record: rec }); };
  document.body.appendChild(ov);
}

// ─── 頁面：新增/編輯 ──────────────────────────────────────────────────────────
function renderForm(c, editRecord) {
  var isEdit = !!editRecord;
  var selType = isEdit ? editRecord.type : 'income';
  var today = new Date().toISOString().split('T')[0];
  var dateVal = isEdit ? (editRecord.date || '').slice(0, 10) : today;
  var items = [];

  c.innerHTML = '<div class="form-page">' +
    '<div class="type-toggle"><button id="f-inc" class="' + (selType==='income'?'active income':'') + '">收入</button><button id="f-exp" class="' + (selType==='expense'?'active expense':'') + '">支出</button></div>' +
    '<form id="rec-form">' +
    '<div class="input-group"><label>日期</label><input type="date" id="f-date" value="' + dateVal + '" required></div>' +
    '<div class="input-group"><label>分類</label><select id="f-item" required></select></div>' +
    '<div class="input-group" id="f-sub-g" style="display:none"><label>子分類</label><select id="f-sub"></select></div>' +
    '<div class="input-group"><label>金額（NT$）</label><div class="amount-input-wrap"><span class="amount-prefix">$</span><input type="number" id="f-amt" value="' + (isEdit?editRecord.amount:'') + '" placeholder="0" required min="0" inputmode="numeric"></div></div>' +
    '<div class="input-group"><label>備註 <span style="color:var(--text-3);font-weight:400">(選填)</span></label><textarea id="f-note" placeholder="備註說明...">' + (isEdit?editRecord.note||'':'') + '</textarea></div>' +
    '<button type="submit" class="btn btn-primary btn-full" style="margin-top:8px">' + (isEdit?'儲存修改':'新增記錄') + '</button>' +
    (isEdit ? '<button type="button" id="f-cancel" class="btn btn-ghost btn-full" style="margin-top:10px">取消</button>' : '') +
    '</form></div>';

  function setType(t) {
    selType = t;
    document.getElementById('f-inc').className = t==='income'  ? 'active income'  : '';
    document.getElementById('f-exp').className = t==='expense' ? 'active expense' : '';
    populateItems();
  }
  function populateItems() {
    var sel = document.getElementById('f-item');
    var list = items.filter(function(i){ return i.type === selType; });
    sel.innerHTML = list.map(function(i){ return '<option value="' + i.id + '" data-subs="' + encodeURIComponent(JSON.stringify(i.subitems||[])) + '">' + i.name + '</option>'; }).join('');
    if (isEdit && list.some(function(i){ return i.id == editRecord.item_id; })) sel.value = editRecord.item_id;
    updateSub();
  }
  function updateSub() {
    var sel = document.getElementById('f-item');
    var opt = sel.options[sel.selectedIndex];
    if (!opt) return;
    var subs = [];
    try { subs = JSON.parse(decodeURIComponent(opt.dataset.subs || '%5B%5D')); } catch(e) {}
    var sg = document.getElementById('f-sub-g');
    if (subs.length) {
      sg.style.display = '';
      document.getElementById('f-sub').innerHTML = '<option value="">不指定</option>' + subs.map(function(s){ return '<option>' + s + '</option>'; }).join('');
    } else { sg.style.display = 'none'; }
  }

  document.getElementById('f-inc').onclick = function(){ setType('income'); };
  document.getElementById('f-exp').onclick = function(){ setType('expense'); };
  document.getElementById('f-item').onchange = updateSub;
  if (isEdit) document.getElementById('f-cancel').onclick = function(){ navigate('#/records'); };

  DB.getItems().then(function(all) {
    items = all;
    populateItems();
    if (isEdit) setType(editRecord.type);
  });

  document.getElementById('rec-form').onsubmit = function(e) {
    e.preventDefault();
    var sel = document.getElementById('f-item');
    var opt = sel.options[sel.selectedIndex];
    var subVal = (document.getElementById('f-sub') || {}).value || '';
    var note = document.getElementById('f-note').value.trim();
    var finalNote = subVal ? (note ? '[' + subVal + '] ' + note : subVal) : (note || null);
    var payload = {
      date: document.getElementById('f-date').value,
      item_id: +sel.value || null,
      item_name: opt ? opt.text : '',
      type: selType,
      amount: +document.getElementById('f-amt').value,
      note: finalNote,
      date_precision: 'day'
    };
    var btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = '儲存中…';
    var op = isEdit ? DB.updateRecord(editRecord.id, payload) : DB.addRecord(payload);
    op.then(function() {
      if (isEdit) { showToast('已儲存'); navigate('#/records'); }
      else {
        showToast('已新增');
        e.target.reset();
        document.getElementById('f-date').value = today;
        populateItems();
        btn.disabled = false; btn.textContent = '新增記錄';
      }
    }).catch(function(err) {
      showToast('失敗：' + err.message);
      btn.disabled = false; btn.textContent = isEdit ? '儲存修改' : '新增記錄';
    });
  };
}

// ─── 頁面：分類 ────────────────────────────────────────────────────────────────
var catType = 'income';
var catItems = [];

function renderCategories(c) {
  c.innerHTML = '<div class="categories-page"><div class="cat-type-tabs"><button id="ct-inc" class="active income">收入分類</button><button id="ct-exp">支出分類</button></div><div id="cat-list"></div><button id="cat-add" class="btn btn-primary btn-full" style="margin-top:8px">+ 新增分類</button></div>';
  document.getElementById('ct-inc').onclick = function(){ setCatType('income'); };
  document.getElementById('ct-exp').onclick = function(){ setCatType('expense'); };
  document.getElementById('cat-add').onclick = function(){ showCatForm(null); };
  loadCats();
}
function setCatType(t) {
  catType = t;
  document.getElementById('ct-inc').className = t==='income'  ? 'active income'  : '';
  document.getElementById('ct-exp').className = t==='expense' ? 'active expense' : '';
  renderCatList();
}
function loadCats() {
  DB.getItems().then(function(all){ catItems = all; renderCatList(); }).catch(function(e){ showToast('載入失敗：' + e.message); });
}
function renderCatList() {
  var el = document.getElementById('cat-list');
  if (!el) return;
  var list = catItems.filter(function(i){ return i.type === catType; });
  if (!list.length) { el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-3)">尚無分類</div>'; return; }
  el.innerHTML = list.map(function(item) {
    return '<div class="cat-item"><div style="flex:1"><div class="cat-name">' + item.name + '</div>' +
      ((item.subitems||[]).length ? '<div class="cat-subs">子項目：' + item.subitems.join('、') + '</div>' : '') +
      '</div><div class="cat-actions">' +
      '<button class="btn-icon" data-edit="' + item.id + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>' +
      '<button class="btn-icon" data-del="' + item.id + '" data-name="' + item.name + '" style="color:var(--expense)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg></button>' +
      '</div></div>';
  }).join('');
  el.querySelectorAll('[data-edit]').forEach(function(btn) {
    btn.onclick = function() { var i = catItems.find(function(x){ return x.id === +btn.dataset.edit; }); if (i) showCatForm(i); };
  });
  el.querySelectorAll('[data-del]').forEach(function(btn) {
    btn.onclick = function() {
      if (!confirm('確定刪除「' + btn.dataset.name + '」？')) return;
      DB.deleteItem(+btn.dataset.del).then(function(){ showToast('已刪除'); loadCats(); }).catch(function(e){ showToast('刪除失敗：' + e.message); });
    };
  });
}
function showCatForm(item) {
  var isEdit = !!item;
  var ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = '<div class="modal"><div class="modal-handle"></div><div class="modal-title">' + (isEdit?'編輯分類':'新增分類') + '</div>' +
    '<div class="input-group"><label>分類名稱</label><input id="cn" type="text" value="' + (item?item.name:'') + '" placeholder="輸入名稱"></div>' +
    (!isEdit ? '<div class="input-group"><label>類型</label><select id="ct"><option value="income"' + (catType==='income'?' selected':'') + '>收入</option><option value="expense"' + (catType==='expense'?' selected':'') + '>支出</option></select></div>' : '') +
    '<div class="input-group"><label>子項目 <span style="color:var(--text-3);font-weight:400">(選填，用逗號分隔)</span></label><input id="cs" type="text" value="' + ((item && item.subitems||[]).join('、')) + '" placeholder="例：機票、住宿"></div>' +
    '<div style="display:flex;gap:10px;margin-top:8px"><button id="cs-save" class="btn btn-primary" style="flex:1">' + (isEdit?'儲存':'新增') + '</button><button id="cs-cancel" class="btn btn-ghost" style="flex:1">取消</button></div></div>';
  ov.onclick = function(e){ if (e.target === ov) ov.remove(); };
  ov.querySelector('#cs-cancel').onclick = function(){ ov.remove(); };
  ov.querySelector('#cs-save').onclick = function() {
    var name = ov.querySelector('#cn').value.trim();
    if (!name) { showToast('請輸入名稱'); return; }
    var subsRaw = ov.querySelector('#cs').value;
    var subs = subsRaw ? subsRaw.split(/[,，、]/).map(function(s){ return s.trim(); }).filter(Boolean) : [];
    var type = isEdit ? item.type : ov.querySelector('#ct').value;
    var op;
    if (isEdit) {
      op = DB.updateItem(item.id, { name: name, subitems: subs });
    } else {
      var maxO = catItems.filter(function(i){ return i.type===type; }).reduce(function(m,i){ return Math.max(m, i.sort_order||0); }, 0);
      op = DB.addItem({ name: name, type: type, sort_order: maxO+1, subitems: subs });
    }
    op.then(function(){ ov.remove(); showToast(isEdit?'已儲存':'已新增'); loadCats(); }).catch(function(e){ showToast('操作失敗：' + e.message); });
  };
  document.body.appendChild(ov);
}

// ─── 頁面：統計 ────────────────────────────────────────────────────────────────
function renderStats(c) {
  c.innerHTML = '<div class="stats-page"><div class="skeleton" style="height:200px;border-radius:14px;margin-bottom:16px"></div><div class="skeleton" style="height:300px;border-radius:14px"></div></div>';
  DB.getSummary().then(function(data) {
    var ys = data.yearStats;
    var years = Object.keys(ys).map(Number).sort(function(a,b){ return b-a; });
    var allInc = 0, allExp = 0;
    years.forEach(function(y){ allInc += ys[y].income||0; allExp += ys[y].expense||0; });
    var rows = years.map(function(y) {
      var inc = ys[y].income||0, exp = ys[y].expense||0, net = inc-exp;
      return '<tr><td>' + y + '</td><td class="inc">' + fmt(inc) + '</td><td class="exp">' + fmt(exp) + '</td><td style="color:' + (net>=0?'var(--income)':'var(--expense)') + ';font-weight:700">' + fmt(net) + '</td></tr>';
    }).join('');
    c.innerHTML = '<div class="stats-page">' +
      '<div class="card" style="padding:16px;margin-bottom:16px"><div style="font-size:14px;font-weight:700;margin-bottom:12px">累計總計</div><div class="stat-cards">' +
      '<div class="stat-card income"><div class="label">累計收入</div><div class="value">' + fmt(allInc) + '</div></div>' +
      '<div class="stat-card expense"><div class="label">累計支出</div><div class="value">' + fmt(allExp) + '</div></div>' +
      '<div class="stat-card full net"><div class="label">累計結餘</div><div class="value">' + fmt(allInc-allExp) + '</div></div></div></div>' +
      '<div class="card" style="padding:16px;overflow-x:auto"><div style="font-size:14px;font-weight:700;margin-bottom:12px">歷年收支總覽</div>' +
      '<table class="year-table"><thead><tr><th>年份</th><th>收入</th><th>支出</th><th>結餘</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }).catch(function(e){ showToast('載入失敗：' + e.message); });
}

// ─── 路由 ──────────────────────────────────────────────────────────────────────
var ROUTES = {
  '/dashboard': { title: '總覽',    nav: 'dashboard',  fn: renderDashboard },
  '/records':   { title: '收支記錄', nav: 'records',    fn: renderRecords   },
  '/add':       { title: '新增記錄', nav: 'add',        fn: function(c){ renderForm(c, null); } },
  '/edit':      { title: '編輯記錄', nav: 'records',    fn: function(c){ renderForm(c, _navState.record); } },
  '/categories':{ title: '分類管理', nav: 'categories', fn: renderCategories },
  '/stats':     { title: '統計',     nav: 'stats',      fn: renderStats      }
};

function handleRoute() {
  var hash = location.hash.replace('#','') || '/dashboard';
  var key  = '/' + hash.split('/').filter(Boolean)[0];
  var route = ROUTES[key];
  if (!route) { location.hash = '#/dashboard'; return; }
  document.getElementById('page-title').textContent = route.title;
  document.getElementById('back-btn').style.display = key === '/edit' ? '' : 'none';
  document.querySelectorAll('.nav-item').forEach(function(el){ el.classList.toggle('active', el.dataset.page === route.nav); });
  var c = document.getElementById('page-content');
  c.innerHTML = '';
  c.scrollTop = 0;
  route.fn(c);
}

// ─── 初始化 ────────────────────────────────────────────────────────────────────
document.getElementById('login-form').addEventListener('submit', function(e) {
  e.preventDefault();
  var pw  = document.getElementById('login-password').value;
  var pw2 = document.getElementById('login-confirm').value;
  var err = document.getElementById('login-error');
  err.style.display = 'none';
  var stored = getPwd();
  if (!stored) {
    if (pw.length < 4) { err.textContent = '密碼至少 4 個字元'; err.style.display = ''; return; }
    if (pw !== pw2)    { err.textContent = '兩次密碼不一致';   err.style.display = ''; return; }
    setPwd(pw);
  } else {
    if (pw !== stored) { err.textContent = '密碼錯誤，請再試'; err.style.display = ''; return; }
  }
  setAuthed();
  initSeed().then(showApp);
});

document.getElementById('skip-btn').addEventListener('click', function() {
  setPwd('__SKIP__');
  setAuthed();
  initSeed().then(showApp);
});

document.getElementById('logout-hint').addEventListener('click', function() {
  if (confirm('確定要重設密碼嗎？')) {
    localStorage.removeItem('idc_pwd');
    sessionStorage.removeItem('idc_auth');
    location.reload();
  }
});

window.addEventListener('hashchange', function() {
  if (isAuthed()) handleRoute();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(function(e){ console.error('SW error:', e); });
}

if (isAuthed()) {
  initSeed().then(showApp);
} else {
  showLogin();
}
