// ===== 有料プラン（Lumi Premium）の権利判定 =====
// フェーズ2：RevenueCat（Web Billing）を接続済み。ただし本番ユーザーを急にロックしないよう
// 段階的に有効化する。実際の権利状態は rc.js が取得し、setPremiumCached() でここに反映する。
// このファイルは軽量に保つ（重い SDK を静的 import しない）＝レンダリングから安全に参照できる。

// 有料でロック予定の機能キー（ペイウォールの表示や将来のゲートで参照）。
export const PREMIUM_FEATURES = {
  customers: '顧客管理（太客リスト・誕生日・来店予定・メモ）',
  events: 'イベント予約名簿（シャンパン予約・歩合計上）',
  reportDetail: '詳細レポート（年間推移・歩合TOP3・PDF出力）',
  backCategory: '歩合項目の分類＆項目数の無制限',
  pastMonths: '過去月の閲覧',
  dayPay: '日払い管理',
};

// 無料プランで使える主な機能（案内表示用）。
export const FREE_FEATURES = [
  '時給計算（基本時給・深夜手当）',
  'シフト記録（カレンダー・まとめて入力）',
  '歩合入力（項目5個まで）',
  '今月の収支サマリー',
  'やることリスト・出勤リマインダー',
  'データのバックアップ',
];

// 本番で機能ロックを有効化するときに true にする（テスト完了＋本番キー切替後）。
// false の間は「誰も」ロックされない＝現状の全機能無料を維持する。
const ENFORCE = false;

// テスト用スイッチ：?rctest=1 で有効化・?rctest=0 で無効化（localStorage に記憶）。
// 本番ユーザーに影響を与えず、購入フローや権利反映を確認するために使う。
export function rcTestMode() {
  try {
    const q = new URLSearchParams(location.search);
    if (q.get('rctest') === '1') localStorage.setItem('lumi_rc_test', '1');
    else if (q.get('rctest') === '0') localStorage.removeItem('lumi_rc_test');
    return localStorage.getItem('lumi_rc_test') === '1';
  } catch { return false; }
}

// 機能ロックを効かせるモードか（本番有効化 or テストモード）。
export function enforcing() { return ENFORCE || rcTestMode(); }

// rc.js が取得した「実際に有料権利を持っているか」のキャッシュ（同期参照用）。
let _premiumCached = false;
export function setPremiumCached(v) { _premiumCached = !!v; }
export function hasPremium() { return _premiumCached; }

// 機能が使えるか（ゲート判定）。ロックしないモードでは常に true。
export function isPremium() {
  if (!enforcing()) return true;
  return _premiumCached;
}

// 機能が使えるか。ロック中なら false（呼び出し側でペイウォールを出す想定）。
export function canUse(_featureKey) {
  return isPremium();
}
