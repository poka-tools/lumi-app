// 年収の壁アラート・源泉徴収の純粋計算。UI から切り離してテスト可能にする。
import { plStatement } from './calc.js';

// 源泉徴収税額。キャスト・アイドルの業務委託は報酬から 10.21% 源泉徴収されることが多い。
// base（対象額・額面）に率を掛けて小数切り捨て。base が負なら 0。
export function withholdingTax(base, rate = 10.21) {
  const b = Number(base) || 0;
  const r = Number(rate) || 0;
  if (b <= 0 || r <= 0) return 0;
  return Math.floor((b * r) / 100);
}

// 指定年(西暦)の額面収入合計（時給＋歩合＋イベント歩合）。控除・ペナルティは引かない。
// shifts は全シフト（内部で年で絞り込む）。eventYear は当年のイベント歩合合計（別途算出して渡す）。
export function annualGrossIncome(wage, items, shifts, year, eventYear = 0) {
  const prefix = `${year}-`;
  const ys = (shifts || []).filter((s) => (s.date || '').startsWith(prefix));
  return plStatement(wage, items, ys).grossIncome + (Number(eventYear) || 0);
}

// 年収の壁の状況。income=今年の額面収入、threshold=壁の金額、warnRatio=何割で「そろそろ」判定か。
// active=閾値が有効か、over=超過、near=手前警告域、remaining=残り（負＝超過額）、pct=達成率%。
export function wallStatus(income, threshold, warnRatio = 0.9) {
  const inc = Number(income) || 0;
  const t = Number(threshold) || 0;
  if (t <= 0) return { active: false, income: inc, threshold: 0, remaining: 0, over: false, near: false, pct: 0 };
  const over = inc >= t;
  const near = !over && inc >= t * warnRatio;
  return {
    active: true,
    income: inc,
    threshold: t,
    remaining: t - inc,
    over,
    near,
    pct: Math.round((inc / t) * 1000) / 10,
  };
}
