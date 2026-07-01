import { state, shiftsOfMonth } from '../state.js';
import { plStatement, monthlyWorkedHours } from '../calc.js';
import { yen, signedYen, esc } from '../format.js';

export async function renderReport(el) {
  const wage = state.profile, items = state.backItems;
  const cur = shiftsOfMonth();
  const pl = plStatement(wage, items, cur);

  // P/L の1行（金額はマイナスなら符号付き）。count 指定時は数量バッジを添える。
  const line = (label, amount, cls = '', count = null) => `
    <div class="pl-line ${cls}">
      <span>${esc(label)}${count ? `<span class="pl-count">×${count}</span>` : ''}</span>
      <span class="pl-amt">${amount < 0 ? signedYen(amount) : yen(amount)}</span>
    </div>`;
  const subtotal = (label, amount) => `
    <div class="pl-line pl-subtotal">
      <span>${esc(label)}</span>
      <span class="pl-amt">${amount < 0 ? signedYen(amount) : yen(amount)}</span>
    </div>`;

  const hasData = pl.wageRows.length || pl.incentiveRows.length || pl.penaltyRows.length;

  el.innerHTML = `
    <h2>収支レポート（${esc(state.month.replace('-', '年'))}月）</h2>
    <div class="card">
      <div class="row" style="justify-content:space-between"><span>総勤務時間</span><strong>${monthlyWorkedHours(cur)}h</strong></div>
      <div class="row" style="justify-content:space-between"><span>出勤日数</span><strong>${cur.length}日</strong></div>
    </div>

    <div class="card pl-card">
      ${hasData ? `
        <div class="pl-section-head">売上（収入）</div>
        ${pl.wageRows.map((r) => line(r.label, r.amount)).join('')}
        ${pl.wageRows.length ? subtotal('時給 小計', pl.wageTotal) : ''}
        ${pl.incentiveRows.length ? `
          <div class="pl-gap"></div>
          ${pl.incentiveRows.map((r) => line(r.label, r.amount, '', r.count)).join('')}
          ${subtotal('インセンティブ 小計', pl.incentiveTotal)}
        ` : ''}
        ${subtotal('収入合計', pl.grossIncome)}

        ${pl.penaltyRows.length ? `
          <div class="pl-section-head" style="margin-top:14px">控除（ペナルティ）</div>
          ${pl.penaltyRows.map((r) => line(r.label, r.amount, 'pl-neg', r.count)).join('')}
          ${subtotal('控除 小計', pl.penaltyTotal)}
        ` : ''}

        <div class="pl-net">
          <span>差引 最終合計</span>
          <strong>${yen(pl.net)}</strong>
        </div>
      ` : '<p class="muted">この月の実績がまだありません。</p>'}
    </div>`;
}
