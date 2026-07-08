import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  birthdaysInMonth, birthdaysByDate, addDaysIso, upcomingVisits,
  visitsOnDate, nextVisitDate, searchCustomers, visitCountByDate,
  sortCustomers, doneVisitCount, visitsInMonth,
} from '../js/customers-logic.js';

const custs = [
  { id: 'a', name: '田中さん', birthday: '03-15' },
  { id: 'b', name: 'サトウ', birthday: '07-02' },
  { id: 'c', name: '鈴木', birthday: '' },
];
const visits = [
  { id: 'v1', customerId: 'a', date: '2026-07-06', done: false },
  { id: 'v2', customerId: 'a', date: '2026-07-10', done: false },
  { id: 'v3', customerId: 'b', date: '2026-07-06', done: true },
  { id: 'v4', customerId: 'a', date: '2026-06-30', done: false },
];

test('birthdaysInMonth: 当月の誕生日のみを日付順で返す', () => {
  const r = birthdaysInMonth(custs, '2026-07');
  assert.deepEqual(r.map((c) => c.id), ['b']);
  assert.equal(birthdaysInMonth(custs, '2026-03')[0].id, 'a');
  assert.equal(birthdaysInMonth(custs, '2026-12').length, 0);
});

test('birthdaysByDate: 当月の誕生日をISO日付→名前配列で', () => {
  const cc = [
    { id: 'a', name: '田中', birthday: '07-06' },
    { id: 'b', name: 'サトウ', birthday: '07-06' },
    { id: 'c', name: '鈴木', birthday: '03-01' },
  ];
  const m = birthdaysByDate(cc, '2026-07');
  assert.deepEqual(m.get('2026-07-06'), ['田中', 'サトウ']);
  assert.equal(m.get('2026-03-01'), undefined);
});

test('addDaysIso: ローカル日付でn日加算（月跨ぎ）', () => {
  assert.equal(addDaysIso('2026-07-06', 7), '2026-07-13');
  assert.equal(addDaysIso('2026-07-30', 3), '2026-08-02');
});

test('upcomingVisits: today〜+days の未完了を昇順・顧客名付き', () => {
  const r = upcomingVisits(visits, custs, '2026-07-06', 7);
  assert.deepEqual(r.map((v) => v.id), ['v1', 'v2']);
  assert.equal(r[0].customerName, '田中さん');
});

test('visitsInMonth: 当月の未完了を昇順・顧客名付き（完了と他月は除外）', () => {
  const r = visitsInMonth(visits, custs, '2026-07');
  assert.deepEqual(r.map((v) => v.id), ['v1', 'v2']); // v3=完了, v4=6月 は除外
  assert.equal(r[0].customerName, '田中さん');
  assert.equal(visitsInMonth(visits, custs, '2026-06').map((v) => v.id).join(), 'v4');
  assert.equal(visitsInMonth(visits, custs, '2026-12').length, 0);
});

test('visitsOnDate: 指定日の来店予定を顧客名付きで', () => {
  const r = visitsOnDate(visits, custs, '2026-07-06');
  assert.deepEqual(r.map((v) => v.id).sort(), ['v1', 'v3']);
});

test('nextVisitDate: today以降・未完了の最早', () => {
  assert.equal(nextVisitDate(visits, 'a', '2026-07-06'), '2026-07-06');
  assert.equal(nextVisitDate(visits, 'a', '2026-07-07'), '2026-07-10');
  assert.equal(nextVisitDate(visits, 'b', '2026-07-06'), '');
});

test('searchCustomers: 名前部分一致・空クエリは全件', () => {
  assert.equal(searchCustomers(custs, '').length, 3);
  assert.deepEqual(searchCustomers(custs, '田中').map((c) => c.id), ['a']);
  assert.equal(searchCustomers(custs, 'いない').length, 0);
});

test('visitCountByDate: 日付ごとの件数', () => {
  const m = visitCountByDate(visits);
  assert.equal(m.get('2026-07-06'), 2);
  assert.equal(m.get('2026-07-10'), 1);
});

test('doneVisitCount: 来店実績(done)の件数', () => {
  assert.equal(doneVisitCount(visits, 'a'), 0);
  assert.equal(doneVisitCount(visits, 'b'), 1);
});

test('sortCustomers: 各キーで並び替え（同点は名前順）', () => {
  const cc = [
    { id: 'a', name: 'あ', createdAt: 100 },
    { id: 'b', name: 'い', createdAt: 300 },
    { id: 'c', name: 'う', createdAt: 200 },
  ];
  const vs = [
    { id: 'v1', customerId: 'a', date: '2026-07-20', done: false },
    { id: 'v2', customerId: 'b', date: '2026-07-08', done: false },
    { id: 'v3', customerId: 'a', date: '2026-07-05', done: true },
    { id: 'v4', customerId: 'a', date: '2026-07-06', done: true },
  ];
  const ctx = { visits: vs, today: '2026-07-06' };
  assert.deepEqual(sortCustomers(cc, 'name', ctx).map((c) => c.id), ['a', 'b', 'c']);
  assert.deepEqual(sortCustomers(cc, 'next', ctx).map((c) => c.id), ['b', 'a', 'c']);
  assert.deepEqual(sortCustomers(cc, 'new', ctx).map((c) => c.id), ['b', 'c', 'a']);
  assert.deepEqual(sortCustomers(cc, 'visits', ctx).map((c) => c.id), ['a', 'b', 'c']);
});
