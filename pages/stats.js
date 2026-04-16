import { db } from '../db.js';
import { fmt, showToast } from '../app.js';

export async function renderStats(container) {
  container.innerHTML = `<div class="stats-page">
    <div class="skeleton" style="height:200px;border-radius:14px;margin-bottom:16px"></div>
    <div class="skeleton" style="height:300px;border-radius:14px"></div>
  </div>`;

  try {
    const data = await db.getSummary();
    const { yearStats } = data;
    const years = Object.keys(yearStats).map(Number).sort((a,b) => b-a);

    const allInc = Object.values(yearStats).reduce((s,y) => s+(y.income||0), 0);
    const allExp = Object.values(yearStats).reduce((s,y) => s+(y.expense||0), 0);

    container.innerHTML = `<div class="stats-page">
      <div class="card" style="padding:16px;margin-bottom:16px">
        <div style="font-size:14px;font-weight:700;margin-bottom:12px">累計總計</div>
        <div class="stat-cards">
          <div class="stat-card income"><div class="label">累計收入</div><div class="value">${fmt(allInc)}</div></div>
          <div class="stat-card expense"><div class="label">累計支出</div><div class="value">${fmt(allExp)}</div></div>
          <div class="stat-card full net"><div class="label">累計結餘</div><div class="value">${fmt(allInc-allExp)}</div></div>
        </div>
      </div>
      <div class="card" style="padding:16px;margin-bottom:16px;overflow-x:auto">
        <div style="font-size:14px;font-weight:700;margin-bottom:12px">歷年收支總覽</div>
        <table class="year-table">
          <thead><tr><th>年份</th><th>收入</th><th>支出</th><th>結餘</th></tr></thead>
          <tbody>
            ${years.map(y => {
              const inc = yearStats[y]?.income || 0;
              const exp = yearStats[y]?.expense || 0;
              const net = inc - exp;
              return `<tr>
                <td>${y}</td>
                <td class="inc">${fmt(inc)}</td>
                <td class="exp">${fmt(exp)}</td>
                <td style="color:${net>=0?'var(--income)':'var(--expense)'};font-weight:700">${fmt(net)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  } catch (e) {
    showToast('載入失敗：' + e.message);
  }
}
