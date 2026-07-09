import { state } from '../state.js';
import { esc, weekdayJa, shortDateJa, todayIso } from '../format.js';
import { navigate } from '../app.js';
import { shiftReminders, campaignReminders } from '../reminders-logic.js';

// ホーム上部のアプリ内リマインダー（出勤予定の忘れ防止／キャンペーン終了間近）。
// アプリを開いた日ごとに、設定した「○日前から」の範囲に入った予定を念押し表示する。
export function renderReminders(el) {
  const today = todayIso();
  const p = state.profile || {};
  const sr = p.shiftReminder || {};
  const cr = p.campaignReminder || {};

  const items = [];

  if (sr.enabled) {
    for (const s of shiftReminders(state.shifts, today, sr.leadDays)) {
      const when = s.daysUntil === 0 ? '本日' : s.daysUntil === 1 ? '明日'
        : `${shortDateJa(s.date)}(${weekdayJa(s.date)})`;
      const time = (s.start || s.end) ? ` ${esc(s.start || '')}〜${esc(s.end || '')}` : '';
      const label = s.confirmed ? '出勤' : '出勤予定';
      const tag = s.daysUntil === 0 ? '今日' : `あと${s.daysUntil}日`;
      const tagCls = s.daysUntil === 0 ? 'today' : 'soon';
      items.push(`
        <li class="remind-item" data-go="calendar">
          <span class="remind-ico">🔔</span>
          <span class="remind-text"><strong>${when}</strong> ${label}${time}</span>
          <span class="remind-tag ${tagCls}">${tag}</span>
        </li>`);
    }
  }

  if (cr.enabled) {
    for (const a of campaignReminders(state.announcements, today, cr.leadDays)) {
      const left = a.daysUntil === 0 ? '本日まで' : `あと${a.daysUntil}日`;
      items.push(`
        <li class="remind-item" data-go="settings">
          <span class="remind-ico">⏰</span>
          <span class="remind-text">「${esc(a.title)}」は ${shortDateJa(a.endDate)} で終了</span>
          <span class="remind-tag overdue">${left}</span>
        </li>`);
    }
  }

  if (items.length === 0) { el.innerHTML = ''; return; }

  el.innerHTML = `
    <div class="card remind-card">
      <div class="remind-head">🔔 リマインダー</div>
      <ul class="remind-list">${items.join('')}</ul>
    </div>`;

  el.querySelectorAll('.remind-item[data-go]').forEach((li) => {
    li.style.cursor = 'pointer';
    li.onclick = () => navigate(li.dataset.go);
  });
}
