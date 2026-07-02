import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTimeToMinutes, workedHours } from '../js/calc.js';

test('parseTimeToMinutes: "HH:MM" を分に変換', () => {
  assert.equal(parseTimeToMinutes('21:00'), 1260);
  assert.equal(parseTimeToMinutes('02:30'), 150);
});

test('workedHours: 同日内の実働（休憩控除）', () => {
  const shift = { start: '18:00', end: '23:00', breakMin: 30 };
  assert.equal(workedHours(shift), 4.5);
});

test('workedHours: 日跨ぎ（21:00→翌02:00, 休憩0）', () => {
  const shift = { start: '21:00', end: '02:00', breakMin: 0 };
  assert.equal(workedHours(shift), 5);
});

test('workedHours: end未入力は 0', () => {
  const shift = { start: '20:00', end: '', breakMin: 0 };
  assert.equal(workedHours(shift), 0);
});

import { backAmount } from '../js/calc.js';

test('backAmount fixed: 単価×件数', () => {
  const item = { id: 'a', type: 'fixed', value: 3000 };
  assert.equal(backAmount(item, { count: 2 }), 6000);
});
test('backAmount rate: 売上×率%', () => {
  const item = { id: 'b', type: 'rate', value: 10 };
  assert.equal(backAmount(item, { sales: 50000 }), 5000);
});
test('backAmount: 未入力は 0', () => {
  const fixed = { id: 'a', type: 'fixed', value: 3000 };
  const rate = { id: 'b', type: 'rate', value: 10 };
  assert.equal(backAmount(fixed, {}), 0);
  assert.equal(backAmount(rate, {}), 0);
});

test('backAmount hybrid: 円/件＋％ の併用', () => {
  const item = { fixedValue: 1000, rateValue: 5 };
  assert.equal(backAmount(item, { count: 2, sales: 100000 }), 7000); // 2000 + 5000
});
test('backAmount penalty: マイナス（旧fixed型）', () => {
  const item = { type: 'fixed', value: 3000, kind: 'penalty' };
  assert.equal(backAmount(item, { count: 1 }), -3000);
});
test('backAmount penalty: マイナス（新型・件数）', () => {
  const item = { fixedValue: 2000, kind: 'penalty' };
  assert.equal(backAmount(item, { count: 2 }), -4000);
});

import { effectiveHourly, nightHours, nightPremium } from '../js/calc.js';

test('effectiveHourly: 同伴 > 指名 > 基本給', () => {
  const w = { hourlyWage: 2000, nominationWage: 2500, douhanWage: 3000 };
  assert.equal(effectiveHourly(w, {}), 2000);
  assert.equal(effectiveHourly(w, { nomination: true }), 2500);
  assert.equal(effectiveHourly(w, { douhan: true }), 3000);
  assert.equal(effectiveHourly(w, { nomination: true, douhan: true }), 3000); // 同伴優先
  assert.equal(effectiveHourly(2000, { nomination: true }), 2000); // 数値はそのまま
});

test('nightHours: 20:00→01:00 の 22:00〜05:00 重なりは3h', () => {
  assert.equal(nightHours({ start: '20:00', end: '01:00', breakMin: 0 }), 3);
});
test('nightHours: 18:00→23:00 は 22:00〜23:00 の1h', () => {
  assert.equal(nightHours({ start: '18:00', end: '23:00', breakMin: 0 }), 1);
});
test('nightHours: 実働（休憩控除後）を上限にする', () => {
  // 22:00→02:00=4h, 休憩120分で実働2h → 深夜帯も2hが上限
  assert.equal(nightHours({ start: '22:00', end: '02:00', breakMin: 120 }), 2);
});

test('nightPremium: 深夜3h × 300円 = 900円', () => {
  const w = { hourlyWage: 2000, nightPremium: { enabled: true, start: '22:00', end: '05:00', addPerHour: 300 } };
  assert.equal(nightPremium(w, { start: '20:00', end: '01:00', breakMin: 0 }), 900);
});
test('nightPremium: 無効・数値時給は0', () => {
  assert.equal(nightPremium(2000, { start: '20:00', end: '01:00', breakMin: 0 }), 0);
});

import { shiftWage, shiftBackTotal, shiftTotal } from '../js/calc.js';

test('shiftWage: 深夜手当＋指名時給を反映', () => {
  // 20:00→01:00=5h, 指名時給2500, 深夜3h×300
  const w = { hourlyWage: 2000, nominationWage: 2500, nightPremium: { enabled: true, start: '22:00', end: '05:00', addPerHour: 300 } };
  const shift = { start: '20:00', end: '01:00', breakMin: 0, nomination: true };
  assert.equal(shiftWage(w, shift), 2500 * 5 + 900); // 13400
});

const _items3 = [
  { id: 'douhan', type: 'fixed', value: 3000 },
  { id: 'drink', type: 'rate', value: 10 },
];
const _shift3 = {
  start: '20:00', end: '01:00', breakMin: 0,
  entries: [
    { backItemId: 'douhan', count: 2 },
    { backItemId: 'drink', sales: 50000 },
  ],
};
test('shiftWage: 時給×実働', () => { assert.equal(shiftWage(2500, _shift3), 12500); });
test('shiftBackTotal: 全バック合計', () => { assert.equal(shiftBackTotal(_items3, _shift3), 11000); });
test('shiftTotal: 時給分＋バック', () => { assert.equal(shiftTotal(2500, _items3, _shift3), 23500); });

import {
  monthlyEstimate, monthlyWorkedHours, hourlyEquivalent,
  incomeBreakdown, backRanking, monthOverMonth,
} from '../js/calc.js';

const _items4 = [
  { id: 'douhan', name: '同伴', type: 'fixed', value: 3000 },
  { id: 'drink', name: 'ドリンクバック', type: 'rate', value: 10 },
];
const _shifts4 = [
  { start: '20:00', end: '01:00', breakMin: 0, entries: [{ backItemId: 'douhan', count: 1 }] }, // 5h
  { start: '20:00', end: '00:00', breakMin: 0, entries: [{ backItemId: 'drink', sales: 20000 }] }, // 4h
];
test('monthlyEstimate', () => { assert.equal(monthlyEstimate(2000, _items4, _shifts4), 23000); });
test('monthlyWorkedHours', () => { assert.equal(monthlyWorkedHours(_shifts4), 9); });
test('hourlyEquivalent', () => { assert.equal(hourlyEquivalent(2000, _items4, _shifts4), 2556); });
test('incomeBreakdown', () => {
  const b = incomeBreakdown(2000, _items4, _shifts4);
  assert.equal(b.wage, 18000);
  assert.equal(b.back, 5000);
  assert.equal(b.total, 23000);
  assert.equal(b.wagePct, 78.3);
  assert.equal(b.backPct, 21.7);
});
test('backRanking: 降順＋対月収比', () => {
  const r = backRanking(2000, _items4, _shifts4);
  assert.equal(r[0].name, '同伴');
  assert.equal(r[0].amount, 3000);
  assert.equal(r[1].name, 'ドリンクバック');
  assert.equal(r[1].amount, 2000);
  assert.equal(r[0].pct, 13.0);
  assert.equal(r[0].count, 1); // 同伴×1
  assert.equal(r[1].count, 0); // 売上ベースは件数0
});
test('monthOverMonth', () => {
  const m = monthOverMonth(23000, 20000);
  assert.equal(m.diff, 3000);
  assert.equal(m.pct, 15.0);
});
test('monthOverMonth: 前月なしは null', () => { assert.equal(monthOverMonth(23000, null), null); });

import { plStatement } from '../js/calc.js';

const _wage5 = {
  hourlyWage: 2000, nominationWage: 2500, douhanWage: 3000,
  nightPremium: { enabled: true, start: '22:00', end: '05:00', addPerHour: 500 },
};
const _items5 = [
  { id: 'd', name: '同伴バック', kind: 'income', fixedValue: 3000, rateValue: 0 },
  { id: 'p', name: '遅刻罰金', kind: 'penalty', fixedValue: 1000, rateValue: 0 },
];
const _shifts5 = [
  // 20:00→翌02:00, 休憩0 → 実働6h, 深夜(22-05)4h。基本給。
  { date: '2026-07-01', start: '20:00', end: '02:00', breakMin: 0, entries: [] },
  // 20:00→24:00, 実働4h, 深夜2h。指名。同伴バック1件・遅刻罰金1件。
  { date: '2026-07-02', start: '20:00', end: '00:00', breakMin: 0, nomination: true,
    entries: [{ backItemId: 'd', count: 1 }, { backItemId: 'p', count: 1 }] },
];

test('plStatement: 時給を基本/指名/深夜手当に分解', () => {
  const pl = plStatement(_wage5, _items5, _shifts5);
  // 基本時給: 2000*6 = 12000（同伴なし・指名なしのシフト）
  assert.equal(pl.wageRows.find((r) => r.label === '基本時給').amount, 12000);
  // 指名時給: 2500*4 = 10000
  assert.equal(pl.wageRows.find((r) => r.label === '指名時給').amount, 10000);
  // 同伴時給行は無い（該当シフトなし）
  assert.equal(pl.wageRows.find((r) => r.label === '同伴時給'), undefined);
  // 深夜手当: (4h + 2h)*500 = 3000
  assert.equal(pl.wageRows.find((r) => r.label === '深夜手当').amount, 3000);
  assert.equal(pl.wageTotal, 25000);
});

test('plStatement: インセンティブと控除を項目別に振り分け', () => {
  const pl = plStatement(_wage5, _items5, _shifts5);
  assert.equal(pl.incentiveRows.length, 1);
  assert.equal(pl.incentiveRows[0].amount, 3000);
  assert.equal(pl.incentiveRows[0].count, 1);
  assert.equal(pl.incentiveTotal, 3000);
  assert.equal(pl.penaltyRows.length, 1);
  assert.equal(pl.penaltyRows[0].amount, -1000);
  assert.equal(pl.penaltyRows[0].count, 1);
  assert.equal(pl.penaltyTotal, -1000);
});

test('plStatement: 収入合計と差引最終合計', () => {
  const pl = plStatement(_wage5, _items5, _shifts5);
  assert.equal(pl.grossIncome, 28000); // 25000 + 3000
  assert.equal(pl.net, 27000);         // 28000 - 1000
});

test('plStatement: シフト無しは全て0・行なし', () => {
  const pl = plStatement(_wage5, _items5, []);
  assert.equal(pl.wageRows.length, 0);
  assert.equal(pl.net, 0);
});

import { annualSeries } from '../js/calc.js';

test('annualSeries: 年の12ヶ月分・該当月に集計', () => {
  const wage = { hourlyWage: 2000 };
  const items = [{ id: 'd', name: '同伴', kind: 'income', fixedValue: 3000, rateValue: 0 }];
  const shifts = [
    // 2026-03: 4h → 時給8000, 同伴1件3000
    { date: '2026-03-05', start: '20:00', end: '00:00', breakMin: 0,
      entries: [{ backItemId: 'd', count: 1 }] },
    // 2026-03: もう1日 5h → 時給10000
    { date: '2026-03-12', start: '19:00', end: '00:00', breakMin: 0, entries: [] },
    // 別年は無視
    { date: '2025-03-01', start: '20:00', end: '00:00', breakMin: 0, entries: [] },
  ];
  const s = annualSeries(wage, items, shifts, 2026);
  assert.equal(s.length, 12);
  assert.equal(s[2].month, 3);
  assert.equal(s[2].wage, 18000);      // 8000 + 10000
  assert.equal(s[2].incentive, 3000);
  assert.equal(s[2].total, 21000);
  assert.equal(s[0].total, 0);         // 1月は実績なし
  assert.equal(s[11].total, 0);        // 12月も0
});
