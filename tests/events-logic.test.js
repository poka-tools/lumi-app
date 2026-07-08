import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TIMINGS, timingLabel, resolveResName, reservationsOfEvent,
  eventTotals, reservationCountByEvent, sortEvents, buildEventClone, cloneReservation,
  effectiveCount, autoAmount,
} from '../js/events-logic.js';

const customers = [
  { id: 'c1', name: '田中さん' },
  { id: 'c2', name: 'サトウ' },
];
const reservations = [
  { id: 'r1', eventId: 'e1', customerId: 'c1', name: '田中さん', timing: 'post', count: 2, amount: 30000, createdAt: 1 },
  { id: 'r2', eventId: 'e1', customerId: '', name: '常連Aさん', timing: 'day', count: 1, amount: 15000, createdAt: 2 },
  { id: 'r3', eventId: 'e1', customerId: 'c2', name: 'サトウ', timing: 'pre', count: 3, amount: 20000, createdAt: 3 },
  { id: 'r4', eventId: 'e2', customerId: '', name: 'ゲスト', timing: 'day', count: 1, amount: 5000, createdAt: 4 },
];

test('TIMINGS / timingLabel: 3種の種別ラベル', () => {
  assert.deepEqual(TIMINGS.map((t) => t.key), ['day', 'pre', 'post']);
  assert.equal(timingLabel('pre'), '前祝い');
  assert.equal(timingLabel('unknown'), '当日'); // フォールバック
});

test('resolveResName: 顧客紐付けは顧客名・リスト外は手入力名・削除済みは控え名', () => {
  assert.equal(resolveResName(reservations[0], customers), '田中さん');
  assert.equal(resolveResName(reservations[1], customers), '常連Aさん');
  assert.equal(resolveResName({ customerId: 'zzz', name: '元○○' }, customers), '元○○');
  assert.equal(resolveResName({ customerId: 'zzz', name: '' }, customers), '(削除済み顧客)');
});

test('reservationsOfEvent: 当日→前祝い→後祝いの順に並ぶ', () => {
  const r = reservationsOfEvent(reservations, 'e1');
  assert.deepEqual(r.map((x) => x.id), ['r2', 'r3', 'r1']); // day, pre, post
  assert.equal(reservationsOfEvent(reservations, 'e2').length, 1);
});

test('eventTotals: 件数・本数・金額を合計', () => {
  assert.deepEqual(eventTotals(reservations, 'e1'), { count: 3, bottles: 6, amount: 65000 });
  assert.deepEqual(eventTotals(reservations, 'nope'), { count: 0, bottles: 0, amount: 0 });
});

test('effectiveCount: 本数優先・空欄でも銘柄あれば1本', () => {
  assert.equal(effectiveCount({ count: 3 }), 3);
  assert.equal(effectiveCount({ count: 0, bottle: 'オリシャン' }), 1); // 空欄+銘柄→1
  assert.equal(effectiveCount({ count: 0, bottle: '' }), 0);
  assert.equal(effectiveCount({ bottle: 'モエ' }), 1);
  // 銘柄あり・本数0の予約が混じると本数合計に+1される
  const rs = [{ eventId: 'x', count: 0, bottle: 'オリシャン', amount: 11000 },
              { eventId: 'x', count: 3, bottle: 'オリシャン', amount: 11000 }];
  assert.deepEqual(eventTotals(rs, 'x'), { count: 2, bottles: 4, amount: 22000 });
});

test('autoAmount: 実効本数×単価', () => {
  assert.equal(autoAmount(3, 'オリシャン', 10000), 30000);
  assert.equal(autoAmount(0, 'オリシャン', 10000), 10000); // 空欄+銘柄→1本×単価
  assert.equal(autoAmount(0, '', 10000), 0);
  assert.equal(autoAmount(2, '', 0), 0);
});

test('reservationCountByEvent: イベントごとの件数Map', () => {
  const m = reservationCountByEvent(reservations);
  assert.equal(m.get('e1'), 3);
  assert.equal(m.get('e2'), 1);
});

test('buildEventClone: 名前に接尾辞・予約を新idで複製・doneリセット', () => {
  const ev = { id: 'e1', name: '生誕祭2026', date: '2026-07-10', memo: 'VIP', createdAt: 100 };
  let n = 0;
  const genId = () => `new${++n}`;
  const doneRows = reservations.map((r) => ({ ...r, done: true }));
  const { event, reservations: rows } = buildEventClone(ev, doneRows, genId, ' のコピー', 999);
  assert.equal(event.id, 'new1');
  assert.equal(event.name, '生誕祭2026 のコピー');
  assert.equal(event.date, '2026-07-10');
  assert.equal(event.createdAt, 999);
  assert.equal(rows.length, 3); // e1 の予約3件のみ（e2は対象外）
  assert.deepEqual(rows.map((r) => r.eventId), ['new1', 'new1', 'new1']);
  assert.deepEqual(rows.map((r) => r.id), ['new2', 'new3', 'new4']);
  assert.ok(rows.every((r) => r.done === false)); // 対応済みはリセット
  assert.equal(rows[0].amount, doneRows[0].amount); // 中身（金額等）は維持
});

test('cloneReservation: 同一イベント内で新id・doneリセット・中身維持', () => {
  const src = { ...reservations[0], done: true };
  const c = cloneReservation(src, 'rNew', 555);
  assert.equal(c.id, 'rNew');
  assert.equal(c.eventId, src.eventId); // 同じイベント
  assert.equal(c.done, false);
  assert.equal(c.createdAt, 555);
  assert.equal(c.name, src.name);
  assert.equal(c.amount, src.amount);
  assert.equal(c.timing, src.timing);
});

test('sortEvents: 日付の新しい順→日付なしは末尾', () => {
  const events = [
    { id: 'a', date: '2026-07-01', createdAt: 1 },
    { id: 'b', date: '', createdAt: 5 },
    { id: 'c', date: '2026-08-10', createdAt: 2 },
  ];
  assert.deepEqual(sortEvents(events).map((e) => e.id), ['c', 'a', 'b']);
});
