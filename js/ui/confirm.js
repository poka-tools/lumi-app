import { esc } from '../format.js';

// アプリ内の確認モーダル（Promise<boolean>）。iOSのホーム画面PWAで window.confirm が
// 動作しない問題を回避するため、ネイティブ confirm の代わりにこれを使う。
export function confirmModal(message, { okLabel = '削除', cancelLabel = 'キャンセル', danger = true } = {}) {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'modal-backdrop';
    back.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true">
        <div class="modal-msg">${esc(message)}</div>
        <div class="modal-actions">
          <button class="btn btn-ghost" type="button" data-act="cancel">${esc(cancelLabel)}</button>
          <button class="btn${danger ? ' btn-danger' : ''}" type="button" data-act="ok">${esc(okLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(back);
    const done = (v) => { back.classList.remove('show'); setTimeout(() => back.remove(), 180); resolve(v); };
    back.querySelector('[data-act="cancel"]').onclick = () => done(false);
    back.querySelector('[data-act="ok"]').onclick = () => done(true);
    back.onclick = (e) => { if (e.target === back) done(false); }; // 背景タップでキャンセル
    requestAnimationFrame(() => back.classList.add('show'));
  });
}
