import { db } from '/db.js';
import { fmt, showToast } from '/app.js';

let year = new Date().getFullYear();
let month = new Date().getMonth() + 1;

export async function renderDashboard(container) {
  container.innerHTML = `<div class="dashboard">
    <div class="year-selector">
      <button id="yr-prev">‹</button>
      <span id="yr-label">${year}</span>
      <button id="yr-next">›</button>
    </div>
    <div class="stat-cards" id="year-cards">
      ${skeleton(80)}${skeleton(80)}${skeleton(80, true)}
    </div>
    <div class="card" style="padding:16px;margin-bottom:12px">
      <div style="font-size:14px;font-weight:700;margin-bottom:8px">選擇月份</div>
      <div class="month-grid" id="month-grid"></div>
    </div>
    <div id="month-stats"></div>
  </div>`;

  document.getElementById('yr-prev').onclick = () => { year--; refresh(); };
  document.getElementById('yr-next').onclick = () => { year++; refresh(); };
  await refresh();
}

function skeleton(h, full = false) {
  return `<div class="stat-card${full?' full':''} skeleton" style="height:${h}px"></div>`;
}

async function refresh() {
  document.getElementById('yr-label').textContent = year;
  try {
    const data = await db.getSummary({ year });
    renderYearCards(data);
    renderMonthGrid();
    await renderMonthStats(month);
  } catch (e) { showToast('載入失敗：' + e.message); }
}

function renderYearCards(data) {
  const ys = data.yearStats[year] || {};
  const inc = ys.income || 0, exp = ys.expense || 0, net = inc - exp;
  document.getElementById('year-cards').innerHTML = `
    <div class="stat-card income"><div class="label">年度收入</div><div class="value">${fmt(inc)}</div></div>
    <div class="stat-card expense"><div class="label">年度支出</div><div class="value">${fmt(exp)}</div></div>
    <div class="stat-card full net"><div class="label">年度結餘</div><div class="value">${fmt(net)}</div></div>`;
}

function renderMonthGrid() {
  const grid = document.getElementById('month-grid');
  if (!grid) return;
  grid.innerHTML = Array.from({length:12},(_,i)=>i+1).map(m =>
    `<button class="month-btn${m===month?' active':''}" data-m="${m}">${m}月</button>`
  ).join('');
  grid.querySelectorAll('.month-btn').forEach(btn => {
    btn.onclick = () => {
      month = +btn.dataset.m;
      grid.querySelectorAll('.month-btn').forEach(b => b.classList.toggle('active', +b.dataset.m === month));
      renderMonthStats(month);
    };
  });
}

async function renderMonthStats(m) {
  const c = document.getElementById('month-stats');
  if (!c) return;
  c.innerHTML = `<div class="month-stats">${skeleton(80)}</div>`;
  try {
    const data = await db.getSummary({ year, month: m });
    const { income = 0, expense = 0, net = 0 } = data.summary;
    const maxAmt = data.byCategory.length ? Math.max(...data.byCategory.map(x => +x.total)) : 1;
    c.innerHTML = `
      <div class="month-stats">
        <div style="font-size:14px;font-weight:700;margin-bottom:4px">${year}年${m}月</div>
        <div class="month-stats-grid">
          <div class="mstat inc"><div class="ml">收入</div><div class="mv">${fmt(income)}</div></div>
          <div class="mstat exp"><div class="ml">支出</div><div class="mv">${fmt(expense)}</div></div>
          <div class="mstat net"><div class="ml">結餘</div><div class="mv">${fmt(net)}</div></div>
        </div>
        ${data.byCategory.length ? `
        <div style="margin-top:16px">
          <div style="font-size:13px;font-weight:700;color:var(--text-3);margin-bottom:8px">分類明細</div>
          ${data.byCategory.map(c => `
          <div style="margin-bottom:8px">
            <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:3px">
              <span style="color:${c.type==='income'?'var(--income)':'var(--expense)'}">${c.item_name}</span>
              <span style="font-weight:700">${fmt(+c.total)}</span>
            </div>
            <div style="height:6px;border-radius:3px;background:${c.type==='income'?'var(--income-bg)':'var(--expense-bg)'}">
              <div style="height:6px;border-radius:3px;background:${c.type==='income'?'var(--income)':'var(--expense)'};width:${Math.round(+c.total/maxAmt*100)}%"></div>
            </div>
          </div>`).join('')}
        </div>` : ''}
      </div>`;
  } catch {
    c.innerHTML = `<div class="month-stats"><p style="color:var(--text-3);text-align:center">無資料</p></div>`;
  }
}
