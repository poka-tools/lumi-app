import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  daysBetweenIso, shiftReminders, campaignReminders,
} from '../js/reminders-logic.js';

const TODAY = '2026-07-09';

const shifts = [
  { id: 's0', date: '2026-07-09', start: '20:00', end: '01:00' }, // 当日
  { id: 's1', date: '2026-07-10', confirmed: false },             // 明日
  { id: 's2', date: '2026-07-12', confirmed: true },              // 3日後・確定でも対象
  { id: 's3', date: '2026-07-16', confirmed: false },             // 7日後
  { id: 's4', date: '2026-07-03' },                               // 過去
  { id: 's5', date: '' },                                         // 日付なし
];

test('daysBetweenIso：日数差を返す', () => {
  assert.equal(daysBetweenIso('2026-07-09', '2026-07-09'), 0);
  assert.equal(daysBetweenIso('2026-07-09', '2026-07-12'), 3);
  assert.equal(daysBetweenIso('2026-07-31', '2026-08-01'), 1); // 月跨ぎ
});

test('shiftReminders：leadDays=0 は当日のみ', () => {
  const r = shiftReminders(shifts, TODAY, 0);
  assert.deepEqual(r.map((s) => s.id), ['s0']);
  assert.equal(r[0].daysUntil, 0);
});

test('shiftReminders：leadDays=3 は当日〜3日後、過去/日付なしは除外・日付昇順', () => {
  const r = shiftReminders(shifts, TODAY, 3);
  assert.deepEqual(r.map((s) => s.id), ['s0', 's1', 's2']);
  assert.deepEqual(r.map((s) => s.daysUntil), [0, 1, 3]);
});

test('shiftReminders：leadDays=7 で7日後も含む（確定/未確定問わず）', () => {
  const r = shiftReminders(shifts, TODAY, 7);
  assert.deepEqual(r.map((s) => s.id), ['s0', 's1', 's2', 's3']);
});

test('shiftReminders：空入力でも落ちない', () => {
  assert.deepEqual(shiftReminders(undefined, TODAY, 3), []);
  assert.deepEqual(shiftReminders([], TODAY, 3), []);
});

const anns = [
  { id: 'a1', title: '本日まで', endDate: '2026-07-09' }, // 当日終了
  { id: 'a2', title: 'あと2日', endDate: '2026-07-11' },
  { id: 'a3', title: '先の話', endDate: '2026-07-20' },   // 11日後
  { id: 'a4', title: '終了済み', endDate: '2026-07-01' }, // 過去
  { id: 'a5', title: '常時表示', endDate: '' },           // 終了日なし＝対象外
];

test('campaignReminders：leadDays=3 は終了3日以内、終了日昇順', () => {
  const r = campaignReminders(anns, TODAY, 3);
  assert.deepEqual(r.map((a) => a.id), ['a1', 'a2']);
  assert.deepEqual(r.map((a) => a.daysUntil), [0, 2]);
});

test('campaignReminders：終了日なし・過去終了は対象外', () => {
  const r = campaignReminders(anns, TODAY, 30);
  assert.deepEqual(r.map((a) => a.id), ['a1', 'a2', 'a3']);
});

test('campaignReminders：空入力でも落ちない', () => {
  assert.deepEqual(campaignReminders(undefined, TODAY, 3), []);
});
