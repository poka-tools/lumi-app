import { state, shiftsOfMonth, prevMonth, loadAll } from '../state.js';
import { put } from '../db.js';
import {
  monthlyEstimate, monthlyWorkedHours,
  incomeBreakdown, backRanking, monthOverMonth, shiftTotal, workedHours,
} from '../calc.js';
import { yen, signedYen, weekdayJa, esc, todayIso, shortDateJa } from '../format.js';
import { drawDonut } from './donut.js';
import { setEditingShift } from './record.js';
import { renderReminder } from './todos.js';
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
  const today = todayIso();
  const todayShift = cur.find((s) => s.date === today);
  const todayAmount = todayShift ? shiftTotal(wage, items, todayShift) : 0;

  const monthLabel = state.month.replace('-', '年') + '月';
  const medals = ['🥇', '🥈', '🥉'];

  // 本日の予定：シフト出勤と今日締切のTodo
  let shiftLine;
  if (todayShift && todayShift.confirmed)
    shiftLine = `🏢 <strong>出勤（実績）</strong> ${esc(todayShift.start || '')}〜${esc(todayShift.end || '')} ・ ${yen(todayAmount)}`;
  else if (todayShift)
    shiftLine = `🏢 <strong>出勤予定</strong> ${esc(todayShift.start || '')}〜${esc(todayShift.end || '')}`;
  else
    shiftLine = '<span class="muted">🏢 本日の出勤予定はありません</span>';

  const todayTodos = state.todos.filter((t) => t.due === today);
  const todoBlock = todayTodos.length
    ? `<ul class="today-todos">${todayTodos.map((t) => `
        <li class="${t.done ? 'done' : ''}" data-id="${esc(t.id)}">
          <button class="todo-check" type="button" aria-label="${t.done ? '未完了に戻す' : '完了にする'}">${t.done ? '✓' : ''}</button>
          <span>${esc(t.text)}</span>
        </li>`).join('')}</ul>`
    : '<div class="muted" style="margin-top:8px">✅ 今日のやることはありません</div>';

  const activeAnn = state.announcements.filter((a) =>
    (!a.startDate || a.startDate <= today) && (!a.endDate || today <= a.endDate));

  el.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between;align-items:center">
        <h3 style="margin:0">📅 本日の予定</h3>
        <span class="muted">${shortDateJa(today)}</span>
      </div>
      <div style="margin-top:8px">${shiftLine}</div>
      ${todoBlock}
    </div>

    <div id="reminder"></div>

    <div class="card estimate-card">
      <div class="estimate-head">${esc(monthLabel)}の見込み <span class="badge">確定前</span></div>
      <div class="big-amount">${yen(estimate)}</div>
      ${mom ? `<div class="muted">前月比 <span style="color:var(--pink);font-weight:600">${signedYen(mom.diff)}（${mom.pct >= 0 ? '+' : ''}${mom.pct}%）</span></div>` : ''}
      <div class="metric-grid">
        <div><span class="muted">時給(基本給)</span><strong>${yen(bd.wage)}</strong></div>
        <div><span class="muted">インセンティブ</span><strong>${yen(bd.back)}</strong></div>
        <div><span class="muted">総勤務時間</span><strong>${hours}h</strong></div>
      </div>
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
      <h3>インセンティブ TOP3</h3>
      ${ranking.length === 0 ? '<p class="muted">まだインセンティブ実績がありません。</p>'
        : ranking.map((r, i) => `<div class="row" style="justify-content:space-between;margin-bottom:6px">
            <span>${medals[i]} ${esc(r.name)}</span><span><strong>${yen(r.amount)}</strong> <span class="muted">${r.pct}%</span></span>
          </div>`).join('')}
    </div>

    <div class="card">
      <div class="row" style="justify-content:space-between"><h3>直近のシフト・実績</h3>
        <a id="toCal" class="muted">カレンダーで確認 ›</a></div>
      <div class="chips" id="recent"></div>
    </div>`;

  el.querySelectorAll('.today-todos li').forEach((li) => {
    const todo = state.todos.find((t) => t.id === li.dataset.id);
    li.querySelector('.todo-check').onclick = async () => {
      await put('todos', { ...todo, done: !todo.done });
      await loadAll();
      renderHome(el);
    };
  });

  renderReminder(el.querySelector('#reminder'));

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
