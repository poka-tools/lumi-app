// js/rc.js — RevenueCat Web Billing（Stripe基盤）接続ラッパー。
// Lumiはビルド無しの素ESMのため、SDK本体は js/vendor/purchases-js.mjs に同梱（相対import）。
// 実際の決済UI（カード入力）はSDKが表示し、裏でStripe.jsを js.stripe.com から読み込む（index.htmlのCSPで許可）。
// このファイルは重い（SDK約1MB）ので、必要になったときだけ動的 import する（entitlement.js 側は静的importしない）。
import { Purchases, ErrorCode, PurchasesError } from './vendor/purchases-js.mjs';
import { setPremiumCached } from './entitlement.js';

// Web Billing 公開キー（publishable）。クライアントに埋め込む前提のもので秘密ではない。
// URLで出し分ける：販売用URL（/lumi-official）だけ本番キー、それ以外（テスト用URL・ローカル）はSandbox。
// → 同じコードを両URLへ配信しても、本番決済は販売用URLのみで走る。
const WEB_BILLING_KEYS = {
  sandbox: 'rcb_sb_kWvtmwBHxCpQTosEdzqugZEdJ',
  production: 'rcb_SSANxGHmGUobsiwHkYDHufYsXNuI', // 本番 rcb_ キー（新App「Lumi (RevenueCat Billing)」・Live Stripe連携・2026-09-04設定）
};

function webBillingKey() {
  let isProdSite = false;
  try { isProdSite = location.pathname.includes('/lumi-official'); } catch { /* 非ブラウザ環境 */ }
  if (isProdSite && WEB_BILLING_KEYS.production) return WEB_BILLING_KEYS.production;
  return WEB_BILLING_KEYS.sandbox; // 本番キー未設定・テストURL・ローカルは Sandbox
}

// ダッシュボードで作成した権利の識別子（コードが参照する固定値）。
export const ENTITLEMENT_ID = 'lumi_pro';

// この端末の RevenueCat App User ID を localStorage に保持する。
// Lumiの「データ削除（リセット）」は IndexedDB のみを消す（localStorageは残る）ため、
// 同一端末では購入済みの権利がリセット後も維持される（＝解約とデータ削除を連動させない方針と一致）。
const APPUSER_KEY = 'lumi_rc_appuser';
const EMAIL_KEY = 'lumi_rc_email';

let _configured = false;
let _cachedInfo = null;

function appUserId() {
  let id = null;
  try { id = localStorage.getItem(APPUSER_KEY); } catch { /* ストレージ不可でも続行 */ }
  if (!id) {
    id = Purchases.generateRevenueCatAnonymousAppUserId();
    try { localStorage.setItem(APPUSER_KEY, id); } catch { /* 無視 */ }
  }
  return id;
}

// 購入モーダルでユーザーが「キャンセル」したかを判定（キャンセルはエラー表示しない）。
export function isUserCancelled(err) {
  return err instanceof PurchasesError && err.errorCode === ErrorCode.UserCancelledError;
}

// SDKを一度だけ設定する。以後は共有インスタンスを使う。
export function ensureConfigured() {
  if (!_configured) {
    Purchases.configure({ apiKey: webBillingKey(), appUserId: appUserId() });
    _configured = true;
  }
  return Purchases.getSharedInstance();
}

// キャッシュしている権利状態（同期・レンダリングから参照）。
export function hasActiveEntitlementCached() {
  return !!(_cachedInfo && _cachedInfo.entitlements && _cachedInfo.entitlements.active
    && _cachedInfo.entitlements.active[ENTITLEMENT_ID]);
}

// サーバーから最新の顧客情報を取得し、entitlement.js のキャッシュにも反映する。
export async function refreshCustomerInfo() {
  const p = ensureConfigured();
  _cachedInfo = await p.getCustomerInfo();
  const active = hasActiveEntitlementCached();
  setPremiumCached(active);
  return active;
}

// サブスクの管理／解約ページURL（RevenueCat/Stripeホスト）を取得する。
// 最新の顧客情報を取り直してから managementURL を返す。無ければ null。
export async function getManagementUrl() {
  await refreshCustomerInfo();
  return (_cachedInfo && _cachedInfo.managementURL) || null;
}

// default オファリングの monthly パッケージを取得。
async function monthlyPackage() {
  const p = ensureConfigured();
  const offerings = await p.getOfferings();
  const cur = offerings.current;
  if (!cur) return null;
  return cur.monthly || (cur.availablePackages && cur.availablePackages[0]) || null;
}

// 購入フローを開始する。SDKがカード入力モーダルを表示し、成功すると権利が付与される。
// 成功時は entitlement.js のキャッシュを更新し、権利が有効になったかを返す。
export async function purchasePremium(email) {
  const p = ensureConfigured();
  const pkg = await monthlyPackage();
  if (!pkg) throw new Error('購入できる商品が見つかりませんでした（オファリング設定をご確認ください）');
  const opts = { rcPackage: pkg };
  if (email) opts.customerEmail = email;
  const { customerInfo } = await p.purchase(opts);
  _cachedInfo = customerInfo;
  if (email) { try { localStorage.setItem(EMAIL_KEY, email); } catch { /* 無視 */ } }
  const active = hasActiveEntitlementCached();
  setPremiumCached(active);
  return active;
}
