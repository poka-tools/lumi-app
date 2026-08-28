import { esc } from '../format.js';
import { icon } from './icons.js';
import { toast } from './toast.js';
import { isPremium, PREMIUM_FEATURES, FREE_FEATURES } from '../entitlement.js';

// Lumi Premium の案内（ペイウォール）モーダル。
// フェーズ1では決済は未接続のため「登録する」は近日公開の案内にとどめる。
// フェーズ2で RevenueCat 接続時に onSubscribe を購入フローに差し替える。

let open = false;

export function openPaywall() {
  if (open) return;
  open = true;

  const premium = isPremium();
  const freeList = FREE_FEATURES.map((t) => `<li>${esc(t)}</li>`).join('');
  const premiumList = Object.values(PREMIUM_FEATURES).map((t) => `<li>${esc(t)}</li>`).join('');

  const back = document.createElement('div');
  back.className = 'modal-backdrop';
  back.innerHTML = `
    <div class="modal-card pw-card" role="dialog" aria-modal="true" aria-label="Lumi Premium">
      <button class="notif-close" type="button" data-act="close" aria-label="閉じる">${icon('close')}</button>
      <div class="pw-head"><span class="pw-spark">✦</span> Lumi Premium</div>
      <div class="pw-price"><strong>¥500</strong><span>/ 月</span></div>
      <div class="pw-scroll">
        <div class="pw-sec-title">${icon('check')} 無料プランで使える</div>
        <ul class="pw-list free">${freeList}</ul>
        <div class="pw-sec-title pw-premium">${icon('target')} Premium で解放</div>
        <ul class="pw-list premium">${premiumList}</ul>
      </div>
      ${premium
        ? `<div class="pw-note">現在すべての機能をお使いいただけます。</div>`
        : `<button class="btn pw-cta" type="button" data-act="subscribe">Premium に登録する</button>`}
      <p class="pw-fine">いつでも解約できます。${premium ? '' : '※お支払い機能は近日公開予定です。'}</p>
    </div>`;
  document.body.appendChild(back);

  const close = () => {
    back.classList.remove('show');
    setTimeout(() => back.remove(), 180);
    open = false;
  };
  back.querySelector('[data-act="close"]').onclick = close;
  back.onclick = (e) => { if (e.target === back) close(); };
  const cta = back.querySelector('[data-act="subscribe"]');
  if (cta) cta.onclick = onSubscribe;
  requestAnimationFrame(() => back.classList.add('show'));
}

// フェーズ2でここを RevenueCat の購入フローに差し替える。
function onSubscribe() {
  toast('お支払い機能は近日公開予定です');
}
