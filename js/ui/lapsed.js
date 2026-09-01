// ===== サブスク失効（解約）の案内モーダル =====
// 起動時に「前回有料→今回権利なし」を検知したら1回だけ表示する。
// RevenueCat は課金状態しか持たず、実データは端末内 IndexedDB のみ。
// よって「退会したらデータが消える」誤解を避けつつ、使わない人には削除の導線を用意する。
import { esc } from '../format.js';
import { confirmModal } from './confirm.js';
import { resetAllData } from '../db.js';
import { toast } from './toast.js';
import { isLapse, nextStored, WAS_PREMIUM_KEY } from '../subscription-logic.js';

// 現在の権利状態(active)を前回値と比較し、失効なら true。
// 併せて localStorage に現在値を記録する（同じ失効で二度出さない）。
export function checkLapse(active) {
  let prev = null;
  try { prev = localStorage.getItem(WAS_PREMIUM_KEY); } catch { /* ストレージ不可でも続行 */ }
  const lapsed = isLapse(prev, active);
  try { localStorage.setItem(WAS_PREMIUM_KEY, nextStored(active)); } catch { /* 無視 */ }
  return lapsed;
}

// 失効案内モーダルを表示する。「データを残す」が既定推奨、「データを削除する」は赤確認のうえ全消去。
export function openLapsedModal() {
  const msg = 'Lumi Premium が終了しました。これまでのデータはこの端末に残っており、無料の機能はそのままお使いいただけます。\n\n今後 Lumi を使わない場合は、この端末のデータを削除できます。';
  const back = document.createElement('div');
  back.className = 'modal-backdrop';
  back.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true">
      <h3 class="lapsed-title">有料プランが終了しました</h3>
      <div class="modal-msg">${esc(msg)}</div>
      <div class="modal-actions modal-actions-stack">
        <button class="btn" type="button" data-act="keep">データを残す</button>
        <button class="btn btn-ghost lapsed-del" type="button" data-act="delete">データを削除する</button>
      </div>
    </div>`;
  document.body.appendChild(back);
  const close = () => { back.classList.remove('show'); setTimeout(() => back.remove(), 180); };
  back.querySelector('[data-act="keep"]').onclick = close;
  back.onclick = (e) => { if (e.target === back) close(); }; // 背景タップ＝残す
  back.querySelector('[data-act="delete"]').onclick = async () => {
    close();
    const ok = await confirmModal(
      'すべてのデータを削除して、最初の状態に戻します。\n勤務記録・顧客・イベント・設定など、この端末に保存したすべてが消え、元に戻せません。\n\n本当に削除しますか？',
      { okLabel: 'すべて削除する', cancelLabel: 'やめる', danger: true }
    );
    if (!ok) return;
    try {
      await resetAllData();
      toast('データを削除しました。\n最初の画面に戻ります…');
      setTimeout(() => window.location.reload(), 1400);
    } catch (err) {
      console.error('データ削除に失敗:', err);
      toast('削除に失敗しました。\nアプリを完全に終了してから、もう一度お試しください。');
    }
  };
  requestAnimationFrame(() => back.classList.add('show'));
}
