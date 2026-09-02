import { esc } from '../format.js';
import { icon } from './icons.js';
import { toast } from './toast.js';
import { PREMIUM_FEATURES, FREE_FEATURES, hasPremium, enforcing } from '../entitlement.js';
import { legalLinksHtml } from './legal.js';

// Lumi Premium の案内（ペイウォール）モーダル。
// 「登録する」は RevenueCat（Web Billing）の購入フローに接続済み。
// ただし通常モードでは購入ボタンを出さない（enforcing() のときだけ表示）＝本番ユーザーに影響しない。

let open = false;

export function openPaywall() {
  if (open) return;
  open = true;

  const subscribed = hasPremium();          // 実際に有料権利を持っているか
  const showBuy = enforcing() && !subscribed; // ロックモードで未購入のときだけ購入ボタン
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
      ${subscribed
        ? `<div class="pw-note">Premium をご利用中です。いつもありがとうございます。</div>`
        : showBuy
          ? `<button class="btn pw-cta" type="button" data-act="subscribe">Premium に登録する</button>
             <p class="pw-fine">最初の7日間は無料。いつでも解約できます。</p>`
          : `<div class="pw-note">現在すべての機能をお使いいただけます。</div>
             <p class="pw-fine">いつでも解約できます。※お支払い機能は準備中です。</p>`}
      <nav class="pw-legal">${legalLinksHtml('pw-legal-link')}</nav>
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
  if (cta) cta.onclick = () => onSubscribe(cta, close);
  requestAnimationFrame(() => back.classList.add('show'));
}

// RevenueCat の購入フローを開始する。SDKがカード入力モーダルを表示する。
async function onSubscribe(btn, close) {
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = '処理中…';
  try {
    const rc = await import('../rc.js'); // 重いSDKはここで初めて読み込む
    const active = await rc.purchasePremium();
    if (active) {
      toast('ご登録ありがとうございます！\nPremium が有効になりました');
      close();
    } else {
      toast('お支払いは完了しましたが、\n権利の反映に少し時間がかかっています');
      btn.disabled = false;
      btn.textContent = orig;
    }
  } catch (e) {
    const rc = await import('../rc.js');
    if (!rc.isUserCancelled(e)) {
      toast('購入を完了できませんでした：\n' + ((e && e.message) || e));
    }
    btn.disabled = false;
    btn.textContent = orig;
  }
}
