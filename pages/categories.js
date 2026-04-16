import { db } from '/db.js';
import { showToast } from '/app.js';

let activeType = 'income';
let items = [];

export async function renderCategories(container) {
  container.innerHTML = `
    <div class="categories-page">
      <div class="cat-type-tabs">
        <button id="tab-inc" class="active income">收入分類</button>
        <button id="tab-exp">支出分類</button>
      </div>
      <div id="cat-list"></div>
      <button id="add-cat" class="btn btn-primary btn-full" style="margin-top:8px">+ 新增分類</button>
    </div>`;

  document.getElementById('tab-inc').onclick = () => setType('income');
  document.getElementById('tab-exp').onclick = () => setType('expense');
  document.getElementById('add-cat').onclick  = () => showForm(null);

  await load();
}

async function load() {
  try { items = await db.getItems(); renderList(); }
  catch (e) { showToast('載入失敗：' + e.message); }
}

function setType(t) {
  activeType = t;
  document.getElementById('tab-inc').className = t==='income' ? 'active income' : '';
  document.getElementById('tab-exp').className = t==='expense'? 'active expense': '';
  renderList();
}

function renderList() {
  const el = document.getElementById('cat-list');
  if (!el) return;
  const list = items.filter(i => i.type === activeType);
  if (!list.length) { el.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-3)">尚無分類</div>`; return; }
  el.innerHTML = list.map(item => `
    <div class="cat-item">
      <div style="flex:1">
        <div class="cat-name">${item.name}</div>
        ${(item.subitems||[]).length ? `<div class="cat-subs">子項目：${item.subitems.join('、')}</div>` : ''}
      </div>
      <div class="cat-actions">
        <button class="btn-icon" data-edit="${item.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn-icon" data-del="${item.id}" data-name="${item.name}" style="color:var(--expense)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>
        </button>
      </div>
    </div>`).join('');

  el.querySelectorAll('[data-edit]').forEach(btn => {
    btn.onclick = () => { const item = items.find(i => i.id === +btn.dataset.edit); if (item) showForm(item); };
  });
  el.querySelectorAll('[data-del]').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm(`確定刪除「${btn.dataset.name}」？`)) return;
      try { await db.deleteItem(+btn.dataset.del); showToast('已刪除'); await load(); }
      catch (e) { showToast('刪除失敗：' + e.message); }
    };
  });
}

function showForm(item) {
  const isEdit = !!item;
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `
    <div class="modal">
      <div class="modal-handle"></div>
      <div class="modal-title">${isEdit?'編輯分類':'新增分類'}</div>
      <div class="input-group">
        <label>分類名稱</label>
        <input id="c-name" type="text" value="${item?.name||''}" placeholder="輸入名稱">
      </div>
      ${!isEdit?`<div class="input-group"><label>類型</label>
        <select id="c-type">
          <option value="income"  ${activeType==='income' ?'selected':''}>收入</option>
          <option value="expense" ${activeType==='expense'?'selected':''}>支出</option>
        </select></div>`:''}
      <div class="input-group">
        <label>子項目 <span style="color:var(--text-3);font-weight:400">(選填，用逗號分隔)</span></label>
        <input id="c-subs" type="text" value="${(item?.subitems||[]).join('、')}" placeholder="例：機票、住宿">
      </div>
      <div style="display:flex;gap:10px;margin-top:8px">
        <button id="c-save" class="btn btn-primary" style="flex:1">${isEdit?'儲存':'新增'}</button>
        <button id="c-cancel" class="btn btn-ghost" style="flex:1">取消</button>
      </div>
    </div>`;

  ov.onclick = e => { if (e.target === ov) ov.remove(); };
  ov.querySelector('#c-cancel').onclick = () => ov.remove();
  ov.querySelector('#c-save').onclick = async () => {
    const name = ov.querySelector('#c-name').value.trim();
    if (!name) { showToast('請輸入名稱'); return; }
    const subsRaw = ov.querySelector('#c-subs').value;
    const subitems = subsRaw ? subsRaw.split(/[,，、]/).map(s=>s.trim()).filter(Boolean) : [];
    const type = isEdit ? item.type : ov.querySelector('#c-type').value;
    try {
      if (isEdit) {
        await db.updateItem(item.id, { name, subitems });
      } else {
        const existing = await db.getItems(type);
        const maxOrder = existing.reduce((m, i) => Math.max(m, i.sort_order||0), 0);
        await db.addItem({ name, type, sort_order: maxOrder + 1, subitems });
      }
      ov.remove(); showToast(isEdit?'已儲存':'已新增'); await load();
    } catch (e) { showToast('操作失敗：' + e.message); }
  };
  document.body.appendChild(ov);
}
