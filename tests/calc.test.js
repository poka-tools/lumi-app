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
