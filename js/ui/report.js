import { state, shiftsOfMonth } from '../state.js';
import { plStatement, annualSeries, monthlyWorkedHours } from '../calc.js';
import { yen, signedYen, esc } from '../format.js';

export async function renderReport(el) {
  const wage = state.profile, items = state.backItems;
  const cur = shiftsOfMonth();
  const pl = plStatement(wage, items, cur);
  const year = Number(state.month.slice(0, 4));
  const series = annualSeries(wage, items, state.shifts, year);

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

    <div class="card">
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px">
        <h3 style="margin:0">年間（${year}年）</h3>
        <div class="seg">
          <button class="seg-btn active" data-mode="bar">合算・棒</button>
          <button class="seg-btn" data-mode="line">内訳・折れ線</button>
        </div>
      </div>
      <div id="annualChart" class="chart-box"></div>
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
    </div>

    <button id="pdfBtn" class="btn btn-ghost no-print" style="margin-bottom:8px">PDF保存</button>`;

  // --- 年間推移グラフ（インラインSVG・左→右へ描画アニメーション） ---
  const W = 340, H = 190, padL = 36, padR = 12, padT = 14, padB = 24;
  const plotW = W - padL - padR, plotH = H - padT - padB, slot = plotW / 12;
  const baseY = padT + plotH;

  // 縦軸（円）を「きりの良い」目盛りに丸める
  const rawMax = Math.max(1, ...series.map((d) => d.total));
  const niceNum = (x, round) => {
    const exp = Math.floor(Math.log10(x));
    const f = x / Math.pow(10, exp);
    const nf = round ? (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10)
                     : (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10);
    return nf * Math.pow(10, exp);
  };
  const step = niceNum(niceNum(rawMax, false) / 4, true);
  const maxV = Math.ceil(rawMax / step) * step;
  const cx = (i) => padL + (i + 0.5) * slot;
  const cy = (v) => padT + plotH - (v / maxV) * plotH;

  // 縦軸ラベル（円）：1万以上は「◯万」表記でコンパクトに
  const yLabel = (v) => v >= 10000
    ? (v % 10000 === 0 ? v / 10000 + '万' : (v / 10000).toFixed(1) + '万')
    : String(v);
  const yticks = [];
  for (let v = 0; v <= maxV + 0.5; v += step) yticks.push(v);
  const ygrid = yticks.map((v) => {
    const yy = cy(v).toFixed(1);
    return `<line class="chart-grid" x1="${padL}" y1="${yy}" x2="${padL + plotW}" y2="${yy}"/>
      <text class="chart-ylabel" x="${padL - 5}" y="${(cy(v) + 3).toFixed(1)}" text-anchor="end">${yLabel(v)}</text>`;
  }).join('');

  const xlabels = series.map((d, i) =>
    `<text class="chart-xlabel" x="${cx(i).toFixed(1)}" y="${baseY + 14}" text-anchor="middle">${d.month}</text>`
  ).join('');

  const buildChart = (mode) => {
    let body, legend;
    if (mode === 'bar') {
      const bw = slot * 0.54;
      body = series.map((d, i) => {
        const h = Math.max(0, (d.total / maxV) * plotH);
        return `<rect class="chart-bar" x="${(cx(i) - bw / 2).toFixed(1)}" y="${(baseY - h).toFixed(1)}"
          width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="url(#barGrad)"
          style="animation-delay:${i * 45}ms"/>`;
      }).join('');
      legend = `<span class="lg lg-total">■ 合計（時給＋インセンティブ）</span>`;
    } else {
      const poly = (key, cls, delay) => {
        const pts = series.map((d, i) => `${cx(i).toFixed(1)},${cy(d[key]).toFixed(1)}`).join(' ');
        const dots = series.map((d, i) =>
          `<circle class="chart-dot ${cls}-dot" cx="${cx(i).toFixed(1)}" cy="${cy(d[key]).toFixed(1)}"
            r="2.6" style="animation-delay:${900 + i * 45}ms"/>`).join('');
        return `<polyline class="chart-line ${cls}" points="${pts}" pathLength="100"
          style="animation-delay:${delay}ms"/>${dots}`;
      };
      body = poly('wage', 'line-wage', 0) + poly('incentive', 'line-inc', 220);
      legend = `<span class="lg lg-wage">— 時給</span><span class="lg lg-inc">— インセンティブ</span>`;
    }
    return `
      <svg class="annual-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="年間収入推移">
        <defs><linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="var(--pink)"/><stop offset="1" stop-color="var(--purple)"/>
        </linearGradient></defs>
        ${ygrid}
        <line class="chart-axis" x1="${padL}" y1="${baseY}" x2="${padL + plotW}" y2="${baseY}"/>
        ${body}
        ${xlabels}
      </svg>
      <div class="chart-legend">${legend}</div>`;
  };

  const chartBox = el.querySelector('#annualChart');
  const grandTotal = series.reduce((s, d) => s + d.total, 0);
  const renderChart = (mode) => {
    chartBox.innerHTML = grandTotal
      ? buildChart(mode)
      : `<p class="muted">${year}年の実績がまだありません。</p>`;
  };
  el.querySelectorAll('.seg-btn').forEach((b) => {
    b.onclick = () => {
      el.querySelectorAll('.seg-btn').forEach((x) => x.classList.toggle('active', x === b));
      renderChart(b.dataset.mode);
    };
  });
  renderChart('bar');

  // 印刷（ブラウザの「PDFで保存」で書き出し）
  el.querySelector('#pdfBtn').onclick = () => window.print();
}
