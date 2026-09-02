import { state, shiftsOfMonth, prevMonth, loadAll } from '../state.js';
import { put, saveProfile } from '../db.js';
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
import { icon } from './icons.js';
import { birthdaysInMonth, visitsInMonth } from '../customers-logic.js';
import { eventIncomeInMonth, eventIncomeInYear } from '../events-logic.js';
import { annualGrossIncome, wallStatus } from '../tax-logic.js';

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

  // 年収の壁アラート：設定ONで、今年の収入（額面）が壁に近い/超えたときだけ表示。
  let wallCard = '';
  const iw = state.profile.incomeWall || {};
  if (iw.enabled && Number(iw.threshold) > 0) {
    const year = new Date().getFullYear();
    const eventYear = eventIncomeInYear(state.reservations, state.events, year);
    const yearInc = annualGrossIncome(state.profile, items, state.shifts, year, eventYear);
    const w = wallStatus(yearInc, iw.threshold);
    if (w.over || w.near) {
      const cls = w.over ? 'wall-over' : 'wall-near';
      const head = w.over ? '年収の壁を超えました' : '年収の壁が近づいています';
      const detail = w.over
        ? `${year}年の収入 <strong>${yen(w.income)}</strong> が、壁 ${yen(w.threshold)} を <strong>${yen(-w.remaining)}</strong> 超えています`
        : `${year}年の収入 <strong>${yen(w.income)}</strong>（壁 ${yen(w.threshold)} まであと <strong>${yen(w.remaining)}</strong>・${w.pct}%）`;
      wallCard = `<div class="card wall-card ${cls}">
        <div class="wall-head">${icon('warning')} ${head}</div>
        <div class="wall-detail">${detail}</div>
        <div class="wall-bar"><div class="wall-bar-fill" style="width:${Math.min(100, w.pct)}%"></div></div>
        <div class="wall-note">扶養や税金の目安です（あくまで概算）。詳しくは設定で調整できます。</div>
      </div>`;
    }
  }

  // 本日の予定：出勤の行（状態でラベル/値を出し分け）
  let shiftRow;
  if (todayShift && todayShift.absent)
    shiftRow = `<div class="today-row"><span class="tr-label">本日</span><span class="tr-value">${icon('ban')} 欠勤${todayAmount ? ' ・ ' + yen(todayAmount) : ''}</span></div>`;
  else if (todayShift && todayShift.confirmed)
    shiftRow = `<div class="today-row"><span class="tr-label">出勤（実績）</span><span class="tr-value">${esc(todayShift.start || '')} - ${esc(todayShift.end || '')} ・ ${yen(todayAmount)}</span></div>`;
  else if (todayShift)
    shiftRow = `<div class="today-row"><span class="tr-label">出勤予定</span><span class="tr-value">${esc(todayShift.start || '')} - ${esc(todayShift.end || '')}</span></div>`;
  else
    shiftRow = `<div class="today-row"><span class="tr-label">出勤予定</span><span class="tr-value muted-v">予定はありません</span></div>`;

  const bdays = birthdaysInMonth(state.customers, state.month);
  const monthVisits = visitsInMonth(state.visits, state.customers, state.month);

  // 今月の来店予定は「本日の予定」カード内にまとめて表示（該当者ゼロなら非表示）
  const visitsBlock = monthVisits.length ? `
    <div class="today-visits">
      <div class="today-visits-head">${icon('person')} 今月の来店予定</div>
      <ul>${monthVisits.map((v) => `<li><span class="v-date">${shortDateJa(v.date)}</span><span class="v-name">${esc(v.customerName)}${v.note ? '（' + esc(v.note) + '）' : ''}</span></li>`).join('')}</ul>
    </div>` : '';

  // 今月の誕生日も「本日の予定」カード内にまとめて表示（該当者ゼロなら非表示）
  const bdayBlock = bdays.length ? `
    <div class="today-bday">
      <div class="today-bday-head">${icon('cake')} 今月お誕生日</div>
      <ul>${bdays.map((c) => `<li><span class="v-date">${Number(c.birthday.slice(0, 2))}/${Number(c.birthday.slice(3, 5))}</span><span class="v-name">${esc(c.name)}</span></li>`).join('')}</ul>
    </div>` : '';

  // 今月の目標（未設定は 0）。設定済みなら達成率バーを表示。
  const goal = Number(state.profile.monthlyGoal) || 0;
  const goalPct = goal ? Math.min(100, Math.round((estimateAll / goal) * 100)) : 0;
  const goalRemain = Math.max(0, goal - estimateAll);
  const goalCard = goal > 0
    ? `<div class="card goal-card" id="goalCard">
        <div class="goal-head">
          <span class="goal-title">${icon('target')} 今月の目標</span>
          <span class="goal-target">${yen(goal)}</span>
        </div>
        <div class="goal-bar"><div class="goal-bar-fill" style="width:${goalPct}%"></div></div>
        <div class="goal-meta">
          <span>達成率 <strong>${goalPct}%</strong></span>
          <span>${goalRemain > 0 ? 'あと ' + yen(goalRemain) : icon('party') + ' 目標達成！'}</span>
        </div>
      </div>`
    : `<button class="card goal-cta" id="goalCta" type="button">
        <span class="goal-cta-ico">${icon('target')}</span>
        <span class="goal-cta-body">
          <span class="goal-cta-title">今月の目標を設定しよう</span>
          <span class="goal-cta-sub">目標を設定するとモチベーションUP！</span>
        </span>
        <span class="goal-cta-chev">›</span>
      </button>`;

  el.innerHTML = `
    <div class="card estimate-card">
      <div class="estimate-head">${esc(monthLabel)}の見込み <span class="badge">確定前</span></div>
      <div class="big-amount">${yen(estimateAll)}</div>
      ${mom ? `<div class="muted">前月比 <span style="color:var(--pink);font-weight:600">${signedYen(mom.diff)}（${mom.pct >= 0 ? '+' : ''}${mom.pct}%）</span></div>` : ''}
      ${dpReceived > 0 ? `<div class="daypay-line">${icon('yen')} 日払い受取済 <strong>${yen(dpReceived)}</strong> ／ 日払いを抜いた額 <strong>${yen(dpUnpaid)}</strong></div>` : ''}
      <div class="metric-grid">
        <div><span class="muted">時給(基本給)</span><strong>${yen(bd.wage)}</strong></div>
        <div><span class="muted">歩合</span><strong>${yen(backAll)}</strong></div>
        <div><span class="muted">総勤務時間</span><strong>${hours}h</strong></div>
      </div>
    </div>

    ${wallCard}

    <div id="reminders"></div>
    <div id="reminder"></div>

    <div class="card">
      <div class="card-head">
        <h3>今月の収入サマリー</h3>
        <button class="link-btn" id="toReport" type="button">詳細を見る ›</button>
      </div>
      <div class="summary-body">
        <canvas id="donut"></canvas>
        <div class="sum-legend">
          <div class="sum-leg-row">
            <span class="leg-dot" style="background:#ff5c8a"></span>
            <div class="leg-main"><div class="leg-name">時給(基本給)</div>
              <div class="leg-amt">${yen(bd.wage)} <span class="leg-pct">(${wagePctAll}%)</span></div></div>
          </div>
          <div class="sum-leg-row">
            <span class="leg-dot" style="background:#a78bfa"></span>
            <div class="leg-main"><div class="leg-name">歩合</div>
              <div class="leg-amt">${yen(backAll)} <span class="leg-pct">(${backPctAll}%)</span></div></div>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <h3>${icon('calendar')} 本日の予定</h3>
        <span class="muted">${shortDateJa(today)}</span>
      </div>
      ${shiftRow}
      ${visitsBlock}
      ${bdayBlock}
    </div>

    <div class="card">
      <div class="card-head"><h3>直近のシフト・実績</h3>
        <button class="link-btn" id="toCal" type="button">カレンダーで確認 ›</button></div>
      <div class="chips" id="recent"></div>
    </div>

    ${goalCard}

    <div class="home-actions">
      <button class="home-action" id="homeHelpBtn" type="button">
        <span class="ha-ico">${icon('help')}</span><span class="ha-label">ヘルプ</span>
      </button>
      <button class="home-action" id="homeSettingsBtn" type="button">
        <span class="ha-ico">${icon('gear')}</span><span class="ha-label">設定</span>
      </button>
    </div>`;

  renderReminders(el.querySelector('#reminders'));
  renderReminder(el.querySelector('#reminder'));

  drawDonut(
    el.querySelector('#donut'),
    [{ value: Math.max(0, bd.wage), color: '#ff5c8a' }, { value: Math.max(0, backAll), color: '#a78bfa' }],
    yen(estimateAll),
    '合計金額'
  );

  const recent = [...cur].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
  el.querySelector('#recent').innerHTML = recent.map((s) => `
    <div class="chip" data-id="${esc(s.id)}">
      <div class="chip-date">${Number(s.date.slice(8))}日(${weekdayJa(s.date)})</div>
      <div class="chip-state">${s.absent ? '欠勤' : (s.confirmed ? '出勤' : '予定')}</div>
      <strong>${yen(shiftTotal(wage, items, s))}</strong>
      <div class="muted">${s.absent ? '—' : (s.confirmed ? workedHours(s) + 'h' : '未確定')}</div>
    </div>`).join('') || '<span class="muted">記録がありません</span>';

  el.querySelectorAll('#recent .chip').forEach((c) => {
    c.onclick = () => {
      setEditingShift(state.shifts.find((s) => s.id === c.dataset.id));
      navigate('record');
    };
  });
  el.querySelector('#toCal').onclick = () => navigate('calendar');
  el.querySelector('#toReport').onclick = () => navigate('report');
  el.querySelector('#homeHelpBtn').onclick = () => navigate('help');
  el.querySelector('#homeSettingsBtn').onclick = () => navigate('settings');

  const editGoal = async () => {
    const next = await goalModal(goal);
    if (next === null) return;
    await saveProfile({ ...state.profile, monthlyGoal: next });
    await loadAll();
    renderHome(el);
  };
  el.querySelector('#goalCta')?.addEventListener('click', editGoal);
  el.querySelector('#goalCard')?.addEventListener('click', editGoal);
}

// 今月の目標を入力するモーダル（PWA では window.prompt が使えないため自前実装）。
// 保存で数値、キャンセル/背景タップで null を返す。0 を保存すると目標は未設定に戻る。
function goalModal(current) {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'modal-backdrop';
    back.innerHTML = `
      <div class="modal-card">
        <div class="modal-msg">今月の目標金額（円）</div>
        <input id="goalInput" class="goal-input" type="number" inputmode="numeric"
          placeholder="例: 300000" value="${current > 0 ? current : ''}">
        <div class="modal-actions">
          <button class="btn btn-ghost" id="goalCancel" type="button">キャンセル</button>
          <button class="btn" id="goalSave" type="button">保存する</button>
        </div>
      </div>`;
    document.body.appendChild(back);
    requestAnimationFrame(() => back.classList.add('show'));
    const input = back.querySelector('#goalInput');
    setTimeout(() => input.focus(), 60);
    const close = (val) => {
      back.classList.remove('show');
      setTimeout(() => back.remove(), 180);
      resolve(val);
    };
    back.querySelector('#goalCancel').onclick = () => close(null);
    back.querySelector('#goalSave').onclick = () => close(Math.max(0, Math.round(Number(input.value) || 0)));
    back.addEventListener('click', (e) => { if (e.target === back) close(null); });
  });
}
