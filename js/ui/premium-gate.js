// 有料機能のゲート（ロック→ペイウォール）共通ヘルパー。
// isPremium() は「ロックしないモード（通常の本番）」では常に true を返すため、
// これらのゲートは enforcing()（本番有効化 or ?rctest=1）かつ未購入のときだけ働く。
import { isPremium } from '../entitlement.js';
import { openPaywall } from './paywall.js';
import { icon } from './icons.js';
import { esc } from '../format.js';

// 有料機能を実行する直前に呼ぶ。使えるなら true。使えないならペイウォールを出して false。
export function ensurePremium() {
  if (isPremium()) return true;
  openPaywall();
  return false;
}

// タブ／ページ全体をロックするときのプレースホルダーHTML。
export function lockScreen(title, lines) {
  const list = (lines || []).map((t) => `<li>${esc(t)}</li>`).join('');
  return `<div class="lock-screen">
    <div class="lock-badge">${icon('lock', { size: 26 })}</div>
    <h3 class="lock-title"><span class="pw-spark">✦</span> ${esc(title)}</h3>
    <p class="lock-sub">この機能は Lumi Premium でご利用いただけます。</p>
    ${list ? `<ul class="lock-list">${list}</ul>` : ''}
    <button class="btn pw-cta lock-cta" type="button" data-act="gate-cta">Premium の内容を見る</button>
    <p class="pw-fine">最初の7日間は無料。いつでも解約できます。</p>
  </div>`;
}

// lockScreen 内の CTA をペイウォールに配線する。
export function wireLockCta(el) {
  const btn = el.querySelector('[data-act="gate-cta"]');
  if (btn) btn.onclick = () => openPaywall();
}
