import { state } from './state.js';

// ===== 有料プラン（Lumi Premium）の権利判定の土台 =====
// フェーズ1：まだ課金基盤（RevenueCat）を繋いでいないので「ロックはしない」。
// isPremium() は当面 true を返し、本番ユーザーの機能を一切制限しない。
// フェーズ2で RevenueCat を接続したら ENFORCE を true にし、実際の entitlement を反映する。

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

const ENFORCE = false; // フェーズ2で true にする

export function isPremium() {
  if (!ENFORCE) return true; // 課金基盤未接続の間は全機能を開放
  return !!(state.profile && state.profile.premium);
}

// 機能が使えるか。ロック中なら false（呼び出し側でペイウォールを出す想定）。
export function canUse(_featureKey) {
  return isPremium();
}
