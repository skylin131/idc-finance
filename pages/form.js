import { db } from '../db.js';
import { showToast, navigate, getState } from '../app.js';

export async function renderForm(container, editRecord) {
  const isEdit = !!editRecord;
  if (isEdit && !editRecord) { navigate('#/records'); return; }

  let selType = editRecord?.type || 'income';
  let items = [];
  try { items = await db.getItems(); } catch {}

  const today = new Date().toISOString().split('T')[0];
  const dateVal = editRecord?.date?.split('T')[0] || editRecord?.date?.slice(0,10) || today;

  container.innerHTML = `
    <div class="form-page">
      <div class="type-toggle">
        <button id="btn-income" class="${selType==='income'?'active income':''}">收入</button>
        <button id="btn-expense" class="${selType==='expense'?'active expense':''}">支出</button>
      </div>
      <form id="rec-form">
        <div class="input-group">
          <label>日期</label>
          <input type="date" id="f-date" value="${dateVal}" required>
        </div>
        <div class="input-group">
          <label>分類</label>
          <select id="f-item" required></select>
        </div>
        <div class="input-group" id="sub-grp" style="display:none">
          <label>子分類</label>
          <select id="f-sub"></select>
        </div>
        <div class="input-group">
          <label>金額（NT$）</label>
          <div class="amount-input-wrap">
            <span class="amount-prefix">$</span>
            <input type="number" id="f-amount" value="${editRecord?.amount||''}" placeholder="0" required min="0" inputmode="numeric">
          </div>
        </div>
        <div class="input-group">
          <label>備註 <span style="color:var(--text-3);font-weight:400">(選填)</span></label>
          <textarea id="f-note" placeholder="備註說明...">${editRecord?.note||''}</textarea>
        </div>
        <button type="submit" class="btn btn-primary btn-full" style="margin-top:8px">${isEdit?'儲存修改':'新增記錄'}</button>
        ${isEdit?`<button type="button" id="cancel-btn" class="btn btn-ghost btn-full" style="margin-top:10px">取消</button>`:''}
      </form>
    </div>`;

  const setType = t => {
    selType = t;
    document.getElementById('btn-income').className  = t==='income'  ? 'active income'  : '';
    document.getElementById('btn-expense').className = t==='expense' ? 'active expense' : '';
    populateItems();
  };

  const populateItems = () => {
    const sel = document.getElementById('f-item');
    const list = items.filter(i => i.type === selType);
    sel.innerHTML = list.map(i => `<option value="${i.id}" data-subs="${encodeURIComponent(JSON.stringify(i.subitems||[]))}">${i.name}</option>`).join('');
    if (editRecord && list.find(i => i.id == editRecord.item_id)) sel.value = editRecord.item_id;
    updateSub();
  };

  const updateSub = () => {
    const sel = document.getElementById('f-item');
    const opt = sel.options[sel.selectedIndex];
    if (!opt) return;
    let subs = [];
    try { subs = JSON.parse(decodeURIComponent(opt.dataset.subs || '%5B%5D')); } catch {}
    const sg = document.getElementById('sub-grp');
    if (subs.length) {
      sg.style.display = '';
      document.getElementById('f-sub').innerHTML = `<option value="">不指定</option>` + subs.map(s=>`<option>${s}</option>`).join('');
    } else { sg.style.display = 'none'; }
  };

  document.getElementById('btn-income').onclick  = () => setType('income');
  document.getElementById('btn-expense').onclick = () => setType('expense');
  document.getElementById('f-item').onchange = updateSub;
  document.getElementById('cancel-btn')?.addEventListener('click', () => navigate('#/records'));

  populateItems();
  if (isEdit) setType(editRecord.type);

  document.getElementById('rec-form').onsubmit = async e => {
    e.preventDefault();
    const sel = document.getElementById('f-item');
    const opt = sel.options[sel.selectedIndex];
    const subVal = document.getElementById('f-sub')?.value || '';
    const note = document.getElementById('f-note').value.trim();
    const finalNote = subVal ? (note ? `[${subVal}] ${note}` : subVal) : (note || null);

    const payload = {
      date: document.getElementById('f-date').value,
      item_id: +sel.value || null,
      item_name: opt?.text || '',
      type: selType,
      amount: +document.getElementById('f-amount').value,
      note: finalNote,
      date_precision: 'day'
    };

    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = '儲存中…';

    try {
      if (isEdit) {
        await db.updateRecord(editRecord.id, payload);
        showToast('已儲存');
      } else {
        await db.addRecord(payload);
        showToast('已新增');
        e.target.reset();
        document.getElementById('f-date').value = today;
        populateItems();
        btn.disabled = false; btn.textContent = '新增記錄';
        return;
      }
      navigate('#/records');
    } catch (err) {
      showToast('失敗：' + err.message);
      btn.disabled = false; btn.textContent = isEdit ? '儲存修改' : '新增記錄';
    }
  };
}
