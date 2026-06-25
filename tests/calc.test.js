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

import { shiftWage, shiftBackTotal, shiftTotal } from '../js/calc.js';

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
});
test('monthOverMonth', () => {
  const m = monthOverMonth(23000, 20000);
  assert.equal(m.diff, 3000);
  assert.equal(m.pct, 15.0);
});
test('monthOverMonth: 前月なしは null', () => { assert.equal(monthOverMonth(23000, null), null); });
