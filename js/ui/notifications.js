import { state } from '../state.js';
import { saveProfile, suppressAudit } from '../db.js';
import { esc, todayIso } from '../format.js';
import { icon } from './icons.js';
import { APP_VERSION } from '../version.js';

// ホーム右上のベル＝「お知らせ」パネル。キャンペーンお知らせと「アプリの更新」を1つにまとめて表示する。
// 更新まわりの操作は app.js からコールバックで受け取る（このモジュールは更新の状態を持たない）。

// 表示中のキャンペーンお知らせ（期間内のもの）。
export function activeAnnouncements(st = state) {
  const today = todayIso();
  return (st.announcements || []).filter(
    (a) => (!a.startDate || a.startDate <= today) && (!a.endDate || today <= a.endDate)
  );
}

// まだベルで見ていないお知らせ（赤ドット点灯の判定に使う）。
export function unseenAnnouncements(st = state) {
  const seen = new Set((st.profile && st.profile.seenAnnIds) || []);
  return activeAnnouncements(st).filter((a) => !seen.has(a.id));
}

let panelOpen = false;

export function openNotifications({ updateReady, onCheckUpdate, onShowUpdate, afterSeen } = {}) {
  if (panelOpen) return;
  panelOpen = true;

  const anns = activeAnnouncements();
  const annHtml = anns.length
    ? anns.map((a) => `
        <div class="notif-item">
          <div class="notif-item-title">${esc(a.title || 'お知らせ')}</div>
          ${a.body ? `<div class="notif-item-body">${esc(a.body)}</div>` : ''}
          ${a.endDate ? `<div class="notif-item-meta">${esc(a.endDate)} まで</div>` : ''}
        </div>`).join('')
    : `<p class="notif-empty">現在お知らせはありません。</p>`;

  const updateHtml = updateReady
    ? `<div class="notif-update ready">
         <div class="notif-update-txt"><strong>アプリの新しいバージョンがあります</strong><span>タップで内容を確認して更新できます</span></div>
         <button class="btn" type="button" data-act="show-update">更新する</button>
       </div>`
    : `<div class="notif-update">
         <div class="notif-update-txt"><strong>アプリは最新です</strong><span>バージョン v${APP_VERSION}</span></div>
         <button class="btn btn-ghost" type="button" data-act="check-update">更新を確認</button>
       </div>`;

  const back = document.createElement('div');
  back.className = 'modal-backdrop';
  back.innerHTML = `
    <div class="modal-card notif-card" role="dialog" aria-modal="true" aria-label="お知らせ">
      <div class="notif-head">${icon('bell')}<span>お知らせ</span>
        <button class="notif-close" type="button" data-act="close" aria-label="閉じる">${icon('close')}</button>
      </div>
      <div class="notif-scroll">
        <div class="notif-sec-title">アプリの更新</div>
        ${updateHtml}
        <div class="notif-sec-title">お知らせ</div>
        ${annHtml}
      </div>
    </div>`;
  document.body.appendChild(back);

  const close = () => {
    back.classList.remove('show');
    setTimeout(() => back.remove(), 180);
    panelOpen = false;
  };
  back.querySelector('[data-act="close"]').onclick = close;
  back.onclick = (e) => { if (e.target === back) close(); };
  const showBtn = back.querySelector('[data-act="show-update"]');
  if (showBtn) showBtn.onclick = () => { close(); onShowUpdate && onShowUpdate(); };
  const checkBtn = back.querySelector('[data-act="check-update"]');
  if (checkBtn) checkBtn.onclick = () => { close(); onCheckUpdate && onCheckUpdate(); };
  requestAnimationFrame(() => back.classList.add('show'));

  // 開いた時点で表示中のお知らせを「既読」にして赤ドットを消す（更新の赤ドットは別管理）。
  markAnnouncementsSeen();
  afterSeen && afterSeen();
}

function markAnnouncementsSeen() {
  const ids = activeAnnouncements().map((a) => a.id);
  if (!ids.length || !state.profile) return;
  const prev = state.profile.seenAnnIds || [];
  const merged = [...new Set([...prev, ...ids])];
  if (merged.length === prev.length) return; // 変化なし
  state.profile.seenAnnIds = merged;
  // ログを汚さないよう抑制して保存（ベルを開くたびの記録は不要）。
  suppressAudit(true);
  saveProfile(state.profile).finally(() => suppressAudit(false));
}
