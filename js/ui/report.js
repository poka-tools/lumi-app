import { state, shiftsOfMonth } from '../state.js';
import { incomeBreakdown, backRanking, monthlyEstimate, monthlyWorkedHours } from '../calc.js';
import { yen, esc } from '../format.js';

export async function renderReport(el) {
  const wage = state.profile.hourlyWage, items = state.backItems;
  const cur = shiftsOfMonth();
  const bd = incomeBreakdown(wage, items, cur);
  const ranking = backRanking(wage, items, cur);
  const total = monthlyEstimate(wage, items, cur) || 1;

  const bar = (label, amount) => `
    <div style="margin-bottom:10px">
      <div class="row" style="justify-content:space-between">
        <span>${esc(label)}</span><strong>${yen(amount)}</strong></div>
      <div style="background:#eee;border-radius:6px;height:8px">
        <div style="background:var(--pink);height:8px;border-radius:6px;width:${Math.min(100, (amount / total) * 100)}%"></div>
      </div>
    </div>`;

  el.innerHTML = `
    <h2>レポート（${esc(state.month.replace('-', '年'))}月）</h2>
    <div class="card">
      <div class="row" style="justify-content:space-between"><span>見込み合計</span><strong>${yen(bd.total)}</strong></div>
      <div class="row" style="justify-content:space-between"><span>総勤務時間</span><strong>${monthlyWorkedHours(cur)}h</strong></div>
      <div class="row" style="justify-content:space-between"><span>出勤日数</span><strong>${cur.length}日</strong></div>
    </div>
    <div class="card">
      <h3>内訳</h3>
      ${bar('時給(基本給)', bd.wage)}
      ${ranking.map((r) => bar(r.name, r.amount)).join('')}
      ${ranking.length === 0 ? '<p class="muted">バック実績がありません。</p>' : ''}
    </div>`;
}
