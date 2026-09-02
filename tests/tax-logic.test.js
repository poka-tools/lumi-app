import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withholdingTax, annualGrossIncome, wallStatus } from '../js/tax-logic.js';
import { occupationBackItems, OCCUPATIONS } from '../js/presets.js';

test('withholdingTax: 10.21%を切り捨てで計算', () => {
  assert.equal(withholdingTax(100000), 10210);
  assert.equal(withholdingTax(12345), 1260); // 1260.42 → 切り捨て
  assert.equal(withholdingTax(0), 0);
  assert.equal(withholdingTax(-500), 0);
  assert.equal(withholdingTax(100000, 0), 0);
});

test('wallStatus: 手前・超過・安全の判定', () => {
  const safe = wallStatus(500000, 1030000);
  assert.equal(safe.active, true);
  assert.equal(safe.over, false);
  assert.equal(safe.near, false);
  assert.equal(safe.remaining, 530000);

  const near = wallStatus(950000, 1030000); // 92% → near(>=90%)
  assert.equal(near.near, true);
  assert.equal(near.over, false);

  const over = wallStatus(1100000, 1030000);
  assert.equal(over.over, true);
  assert.equal(over.near, false);
  assert.equal(over.remaining, -70000);

  assert.equal(wallStatus(100, 0).active, false); // 閾値0は無効
});

test('annualGrossIncome: 当年のシフト額面＋イベント歩合を合算', () => {
  const wage = { hourlyWage: 1000 };
  const shifts = [
    { id: 'a', date: '2026-03-10', start: '20:00', end: '24:00', breakMin: 0, confirmed: true },
    { id: 'b', date: '2025-12-31', start: '20:00', end: '24:00', breakMin: 0, confirmed: true },
  ];
  // 2026年は a のみ＝4h×1000＝4000、イベント歩合 6000 を加算
  assert.equal(annualGrossIncome(wage, [], shifts, 2026, 6000), 10000);
  // 2025年は b のみ＝4000
  assert.equal(annualGrossIncome(wage, [], shifts, 2025), 4000);
});

test('occupationBackItems: 職種ごとの件数と中身', () => {
  let n = 0;
  const gen = () => 'id' + (n++);
  assert.equal(occupationBackItems('concafe', gen, 0).length, 5);
  assert.equal(occupationBackItems('idol', gen, 0).length, 4);
  assert.equal(occupationBackItems('other', gen, 0).length, 0);
  const items = occupationBackItems('cabakura', gen, 3);
  assert.equal(items[0].order, 3); // startOrder から連番
  assert.equal(items[0].kind, 'income');
  assert.equal(items[0].fixedValue, 0);
  assert.ok(items[0].unit);
  assert.equal(OCCUPATIONS.length, 5);
});
