import { db } from '/db.js';
import { fmt, fmtDate, showToast, navigate } from '/app.js';

const PAGE = 30;
let filters = { year: new Date().getFullYear(), month: '', type: '' };
let offset = 0, total = 0;

export async function renderRecords(container) {
  const yr = new Date().getFullYear();
  const years = Array.from({length: 6}, (_, i) => yr - i);
  container.innerHTML = `
    <div class="records-header">
      <div class="filter-row">
        <button class="filter-chip${!filters.year?'  active':''}" data-f="year" data-v="">全部年份</button>
        ${years.map(y => `<button class="filter-chip${filters.year==y?' active':''}" data-f="year" data-v="${y}">${y}</button>`).join('')}
      </div>
      <div class="filter-row" style="margin-top:8px">
        <button class="filter-chip${!filters.month?' active':''}" data-f="month" data-v="">全部月份</button>
        ${Array.from({length:12},(_,i)=>i+1).map(m=>`<button class="filter-chip${filters.month==m?' active':''}" data-f="month" data-v="${m}">${m}月</button>`).join('')}
      </div>
      <div class="filter-row" style="margin-top:8px">
        <button class="filter-chip${!filters.type?' active':''}" data-f="type" data-v="">全部</button>
        <button class="filter-chip${filters.type==='income'?' active':''}" data-f="type" data-v="income" style="color:var(--income)">收入</button>
        <button class="filter-chip${filters.type==='expense'?' active':''}" data-f="type" data-v="expense" style="color:var(--expense)">支出</button>
      </div>
    </div>
    <div id="record-list" class="record-list"></div>`;

  container.querySelectorAll('.filter-chip').forEach(chip => {
    chip.onclick = () => {
      filters[chip.dataset.f] = chip.dataset.v;
      chip.closest('.filter-row').querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      loadRecords(true);
    };
  });

  await loadRecords(true);
}

async function loadRecords(reset = false) {
  if (reset) offset = 0;
  const listEl = document.getElementById('record-list');
  if (!listEl) return;

  if (reset) listEl.innerHTML = `<div class="skeleton" style="height:70px;border-radius:12px;margin-bottom:8px"></div>`.repeat(4);

  try {
    const data = await db.getRecords({ ...filters, limit: PAGE, offset });
    total = data.total;
    if (reset) listEl.innerHTML = '';

    if (!data.records.length && reset) {
      listEl.innerHTML = `<div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
          <rect x="9" y="3" width="6" height="4" rx="1"/>
        </svg>
        <p>沒有符合的記錄</p></div>`;
      return;
    }

    data.records.forEach(rec => {
      const el = document.createElement('div');
      el.className = `record-item ${rec.type}`;
      el.innerHTML = `
        <div class="record-dot">${rec.type==='income'?'收':'支'}</div>
        <div class="record-body">
          <div class="record-name">${rec.item_name}</div>
          ${rec.note ? `<div class="record-note">${rec.note}</div>` : ''}
          <div class="record-date">${fmtDate(rec.date, rec.date_precision)}</div>
        </div>
        <div class="record-amount"><div class="amt">${fmt(+rec.amount)}</div></div>`;
      el.onclick = () => showDetail(rec);
      listEl.appendChild(el);
    });

    listEl.querySelector('.load-more')?.remove();
    offset += data.records.length;
    if (offset < total) {
      const btn = document.createElement('div');
      btn.className = 'load-more';
      btn.textContent = `載入更多（還有 ${total - offset} 筆）`;
      btn.onclick = () => loadRecords(false);
      listEl.appendChild(btn);
    }
  } catch (e) { showToast('載入失敗：' + e.message); }
}

function showDetail(rec) {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `
    <div class="modal">
      <div class="modal-handle"></div>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
        <div>
          <div style="font-size:11px;font-weight:700;color:${rec.type==='income'?'var(--income)':'var(--expense)'};margin-bottom:4px">${rec.type==='income'?'收入':'支出'}</div>
          <div style="font-size:20px;font-weight:800">${rec.item_name}</div>
        </div>
        <div style="font-size:24px;font-weight:800;color:${rec.type==='income'?'var(--income)':'var(--expense)'}">
          ${rec.type==='expense'?'-':''}${fmt(+rec.amount)}
        </div>
      </div>
      <div style="background:var(--bg);border-radius:12px;padding:14px;margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;margin-bottom:${rec.note?'8px':'0'}">
          <span style="color:var(--text-3);font-size:13px">日期</span>
          <span style="font-weight:600;font-size:14px">${fmtDate(rec.date, rec.date_precision)}</span>
        </div>
        ${rec.note ? `<div style="border-top:1px solid var(--border);padding-top:8px;font-size:13px;color:var(--text-2);word-break:break-all">${rec.note}</div>` : ''}
      </div>
      <div style="display:flex;gap:10px">
        <button id="edit-r" class="btn btn-ghost" style="flex:1">編輯</button>
        <button id="del-r"  class="btn btn-danger" style="flex:1">刪除</button>
      </div>
    </div>`;

  ov.onclick = e => { if (e.target === ov) ov.remove(); };
  ov.querySelector('#del-r').onclick = async () => {
    if (!confirm(`確定刪除「${rec.item_name}」嗎？`)) return;
    try { await db.deleteRecord(rec.id); ov.remove(); showToast('已刪除'); loadRecords(true); }
    catch { showToast('刪除失敗'); }
  };
  ov.querySelector('#edit-r').onclick = () => { ov.remove(); navigate('#/edit', { record: rec }); };
  document.body.appendChild(ov);
}
