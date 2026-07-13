import { state, shiftsOfMonth, prevMonth, loadAll } from '../state.js';
import { put } from '../db.js';
import {
  monthlyEstimate, monthlyWorkedHours,
  incomeBreakdown, monthOverMonth, shiftTotal, workedHours, dayPaySummary,
} from '../calc.js';
import { yen, signedYen, weekdayJa, esc, todayIso, shortDateJa } from '../format.js';
import { drawDonut } from './donut.js';
import { setEditingShift } from './record.js';
import { renderReminder } from './todos.js';
import { renderReminders } from './reminders.js';
import { navigate } from '../app.js';
import { birthdaysInMonth, visitsInMonth } from '../customers-logic.js';
import { eventIncomeInMonth } from '../events-logic.js';

export async function renderHome(el) {
  const wage = state.profile;
  const items = state.backItems;
  const cur = shiftsOfMonth();
  const prev = shiftsOfMonth(prevMonth());

  const estimate = monthlyEstimate(wage, items, cur);
  const prevEstimate = prev.length ? monthlyEstimate(wage, items, prev) : null;
  const bd = incomeBreakdown(wage, items, cur);

  // 顧客イベント予約（対応済み）の当月歩合を、シフト由来の歩合に合算する。
  const eventInc = eventIncomeInMonth(state.reservations, state.events, state.month);
  const prevEventInc = eventIncomeInMonth(state.reservations, state.events, prevMonth());
  const estimateAll = estimate + eventInc;          // 見込み合計（時給＋歩合＋イベント歩合）
  const backAll = bd.back + eventInc;               // 歩合合計（通常歩合＋イベント歩合）
  const totalAll = bd.wage + backAll;
  const wagePctAll = totalAll ? Math.round((bd.wage / totalAll) * 1000) / 10 : 0;
  const backPctAll = totalAll ? Math.round((backAll / totalAll) * 1000) / 10 : 0;
  // 前月にシフトもイベント歩合も無ければ比較対象なし（null）
  const prevAll = (prev.length || prevEventInc) ? (prevEstimate || 0) + prevEventInc : null;
  const mom = monthOverMonth(estimateAll, prevAll);
  // 日払い：受取済み合計と未受取（＝日払いを抜いた額。イベント歩合は後日精算扱いで未受取に含める）
  const dp = dayPaySummary(wage, items, cur);
  const dpReceived = dp.received;
  const dpUnpaid = estimateAll - dpReceived; // 総額から日払い受取済みを除いた額
  const hours = monthlyWorkedHours(cur);
  const today = todayIso();
  const todayShift = cur.find((s) => s.date === today);
  const todayAmount = todayShift ? shiftTotal(wage, items, todayShift) : 0;

  const monthLabel = state.month.replace('-', '年') + '月';

  // 本日の予定：シフト出勤と今日締切のTodo
  let shiftLine;
  if (todayShift && todayShift.absent)
    shiftLine = `🚫 <strong>欠勤</strong>` + (todayAmount ? ` ・ ${yen(todayAmount)}` : '');
  else if (todayShift && todayShift.confirmed)
    shiftLine = `🏢 <strong>出勤（実績）</strong> ${esc(todayShift.start || '')}〜${esc(todayShift.end || '')} ・ ${yen(todayAmount)}`;
  else if (todayShift)
    shiftLine = `🏢 <strong>出勤予定</strong> ${esc(todayShift.start || '')}〜${esc(todayShift.end || '')}`;
  else
    shiftLine = '<span class="muted">🏢 本日の出勤予定はありません</span>';

  const todayTodos = state.todos.filter((t) => t.due === today);
  const todoBlock = todayTodos.length
    ? `<div class="muted" style="font-size:12px;margin-top:6px">終わったら左の□にチェック。</div>
      <ul class="today-todos">${todayTodos.map((t) => `
        <li class="${t.done ? 'done' : ''}" data-id="${esc(t.id)}">
          <button class="todo-check" type="button" aria-label="${t.done ? '未完了に戻す' : '完了にする'}">${t.done ? '✓' : ''}</button>
          <span>${esc(t.text)}</span>
        </li>`).join('')}</ul>`
    : '<div class="muted" style="margin-top:8px">✅ 今日のやることはありません</div>';

  const bdays = birthdaysInMonth(state.customers, state.month);
  const monthVisits = visitsInMonth(state.visits, state.customers, state.month);

  // 今月の来店予定は「本日の予定」カード内にまとめて表示（該当者ゼロなら非表示）
  const visitsBlock = monthVisits.length ? `
    <div class="today-visits">
      <div class="today-visits-head">👤 今月の来店予定</div>
      <ul>${monthVisits.map((v) => `<li><span class="v-date">${shortDateJa(v.date)}</span><span class="v-name">${esc(v.customerName)}${v.note ? '（' + esc(v.note) + '）' : ''}</span></li>`).join('')}</ul>
    </div>` : '';

  // 今月の誕生日も「本日の予定」カード内にまとめて表示（該当者ゼロなら非表示）
  const bdayBlock = bdays.length ? `
    <div class="today-bday">
      <div class="today-bday-head">🎂 今月お誕生日</div>
      <ul>${bdays.map((c) => `<li><span class="v-date">${Number(c.birthday.slice(0, 2))}/${Number(c.birthday.slice(3, 5))}</span><span class="v-name">${esc(c.name)}</span></li>`).join('')}</ul>
    </div>` : '';

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
      ${visitsBlock}
      ${bdayBlock}
    </div>

    <div id="reminders"></div>
    <div id="reminder"></div>

    <div class="card estimate-card">
      <div class="estimate-head">${esc(monthLabel)}の見込み <span class="badge">確定前</span></div>
      <div class="big-amount">${yen(estimateAll)}</div>
      ${mom ? `<div class="muted">前月比 <span style="color:var(--pink);font-weight:600">${signedYen(mom.diff)}（${mom.pct >= 0 ? '+' : ''}${mom.pct}%）</span></div>` : ''}
      ${dpReceived > 0 ? `<div class="daypay-line">💴 日払い受取済 <strong>${yen(dpReceived)}</strong> ／ 日払いを抜いた額 <strong>${yen(dpUnpaid)}</strong></div>` : ''}
      <div class="metric-grid">
        <div><span class="muted">時給(基本給)</span><strong>${yen(bd.wage)}</strong></div>
        <div><span class="muted">歩合</span><strong>${yen(backAll)}</strong></div>
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
          <div><span style="color:#ff5c8a">●</span> 時給(基本給) <strong>${wagePctAll}%</strong></div>
          <div><span style="color:#a78bfa">●</span> 歩合 <strong>${backPctAll}%</strong></div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="row" style="justify-content:space-between"><h3>直近のシフト・実績</h3>
        <a id="toCal" class="muted">カレンダーで確認 ›</a></div>
      <div class="chips" id="recent"></div>
    </div>

    <div class="home-actions">
      <button class="home-action" id="homeHelpBtn" type="button">
        <span class="ha-ico">❓</span><span class="ha-label">ヘルプ</span>
      </button>
      <button class="home-action" id="homeSettingsBtn" type="button">
        <span class="ha-ico">⚙️</span><span class="ha-label">設定</span>
      </button>
    </div>`;

  el.querySelectorAll('.today-todos li').forEach((li) => {
    const todo = state.todos.find((t) => t.id === li.dataset.id);
    li.querySelector('.todo-check').onclick = async () => {
      await put('todos', { ...todo, done: !todo.done });
      await loadAll();
      renderHome(el);
    };
  });

  renderReminders(el.querySelector('#reminders'));
  renderReminder(el.querySelector('#reminder'));

  drawDonut(
    el.querySelector('#donut'),
    [{ value: Math.max(0, bd.wage), color: '#ff5c8a' }, { value: Math.max(0, backAll), color: '#a78bfa' }],
    yen(estimateAll)
  );

  const recent = [...cur].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
  el.querySelector('#recent').innerHTML = recent.map((s) => `
    <div class="chip" data-id="${esc(s.id)}">
      <div>${Number(s.date.slice(8))}日(${weekdayJa(s.date)})</div>
      <strong>${yen(shiftTotal(wage, items, s))}</strong>
      <div class="muted">${s.absent ? '欠勤' : (s.confirmed ? workedHours(s) + 'h' : '未確定')}</div>
    </div>`).join('') || '<span class="muted">記録がありません</span>';

  el.querySelectorAll('#recent .chip').forEach((c) => {
    c.onclick = () => {
      setEditingShift(state.shifts.find((s) => s.id === c.dataset.id));
      navigate('record');
    };
  });
  el.querySelector('#toCal').onclick = () => navigate('calendar');
  el.querySelector('#homeHelpBtn').onclick = () => navigate('help');
  el.querySelector('#homeSettingsBtn').onclick = () => navigate('settings');
}
