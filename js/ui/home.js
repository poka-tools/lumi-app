import { state, shiftsOfMonth, prevMonth } from '../state.js';
import {
  monthlyEstimate, monthlyWorkedHours, hourlyEquivalent,
  incomeBreakdown, backRanking, monthOverMonth, shiftTotal, workedHours,
} from '../calc.js';
import { yen, signedYen, weekdayJa, esc } from '../format.js';
import { drawDonut } from './donut.js';
import { setEditingShift } from './record.js';
import { navigate } from '../app.js';

export async function renderHome(el) {
  const wage = state.profile;
  const items = state.backItems;
  const cur = shiftsOfMonth();
  const prev = shiftsOfMonth(prevMonth());

  const estimate = monthlyEstimate(wage, items, cur);
  const prevEstimate = prev.length ? monthlyEstimate(wage, items, prev) : null;
  const mom = monthOverMonth(estimate, prevEstimate);
  const bd = incomeBreakdown(wage, items, cur);
  const ranking = backRanking(wage, items, cur).slice(0, 3);
  const hours = monthlyWorkedHours(cur);
  const today = new Date().toISOString().slice(0, 10);
  const todayShift = cur.find((s) => s.date === today);
  const todayAmount = todayShift ? shiftTotal(wage, items, todayShift) : 0;

  const monthLabel = state.month.replace('-', '年') + '月';
  const greetName = state.profile.name || 'あなた';
  const medals = ['🥇', '🥈', '🥉'];

  const activeAnn = state.announcements.filter((a) =>
    (!a.startDate || a.startDate <= today) && (!a.endDate || today <= a.endDate));

  el.innerHTML = `
    <div class="card" style="display:flex;align-items:center;gap:10px">
      <div style="font-size:32px">🦉</div>
      <div><strong>おはようございます、${esc(greetName)}さん🌸</strong>
      <div class="muted">今日も一日がんばりましょう！</div></div>
    </div>

    <div class="card">
      <div>${esc(monthLabel)}の見込み<span class="badge">確定前</span></div>
      <div class="big-amount">${yen(estimate)}</div>
      ${mom ? `<div class="muted">前月比 <span style="color:var(--pink)">${signedYen(mom.diff)}（${mom.pct >= 0 ? '+' : ''}${mom.pct}%）</span></div>` : ''}
      <div class="row" style="margin-top:12px;text-align:center">
        <div style="flex:1"><div class="muted">時給(基本給)</div><strong>${yen(bd.wage)}</strong></div>
        <div style="flex:1"><div class="muted">インセンティブ</div><strong>${yen(bd.back)}</strong></div>
        <div style="flex:1"><div class="muted">総勤務時間</div><strong>${hours}h</strong></div>
      </div>
    </div>

    <div class="chips">
      <div class="chip"><div class="muted">出勤日数</div><strong>${cur.length}日</strong></div>
      <div class="chip"><div class="muted">時給換算</div><strong>${yen(hourlyEquivalent(wage, items, cur))}</strong></div>
      <div class="chip"><div class="muted">バック総額</div><strong>${yen(bd.back)}</strong></div>
      <div class="chip"><div class="muted">本日見込み</div><strong>${yen(todayAmount)}</strong></div>
    </div>

    ${activeAnn.map((a) => `<div class="card" style="background:var(--pink-soft)">
      📣 <strong>${esc(a.title)}</strong></div>`).join('')}

    <div class="card">
      <h3>今月の収入サマリー</h3>
      <div class="row" style="align-items:center">
        <canvas id="donut"></canvas>
        <div style="flex:1">
          <div>🩷 時給(基本給) <strong>${bd.wagePct}%</strong></div>
          <div>💜 インセンティブ <strong>${bd.backPct}%</strong></div>
        </div>
      </div>
    </div>

    <div class="card">
      <h3>バック TOP3</h3>
      ${ranking.length === 0 ? '<p class="muted">まだバック実績がありません。</p>'
        : ranking.map((r, i) => `<div class="row" style="justify-content:space-between;margin-bottom:6px">
            <span>${medals[i]} ${esc(r.name)}</span><span><strong>${yen(r.amount)}</strong> <span class="muted">${r.pct}%</span></span>
          </div>`).join('')}
    </div>

    <div class="card">
      <div class="row" style="justify-content:space-between"><h3>直近のシフト・実績</h3>
        <a id="toCal" class="muted">カレンダーで確認 ›</a></div>
      <div class="chips" id="recent"></div>
    </div>`;

  drawDonut(
    el.querySelector('#donut'),
    [{ value: Math.max(0, bd.wage), color: '#ff5c8a' }, { value: Math.max(0, bd.back), color: '#a78bfa' }],
    yen(estimate)
  );

  const recent = [...cur].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
  el.querySelector('#recent').innerHTML = recent.map((s) => `
    <div class="chip" data-id="${esc(s.id)}">
      <div>${Number(s.date.slice(8))}日(${weekdayJa(s.date)})</div>
      <strong>${yen(shiftTotal(wage, items, s))}</strong>
      <div class="muted">${s.confirmed ? workedHours(s) + 'h' : '未確定'}</div>
    </div>`).join('') || '<span class="muted">記録がありません</span>';

  el.querySelectorAll('#recent .chip').forEach((c) => {
    c.onclick = () => {
      setEditingShift(state.shifts.find((s) => s.id === c.dataset.id));
      navigate('record');
    };
  });
  el.querySelector('#toCal').onclick = () => navigate('calendar');
}
