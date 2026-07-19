import { test } from 'node:test';
import assert from 'node:assert';
import {
  changeSubject, describeChange, logTime, logDayKey,
  groupLogsByDay, logsToPrune,
} from '../js/audit-logic.js';

test('changeSubject はストアごとに見出しを取り出す', () => {
  assert.equal(changeSubject('customers', { name: '田中' }), '田中');
  assert.equal(changeSubject('events', { name: '周年' }), '周年');
  assert.equal(changeSubject('todos', { text: '買い物' }), '買い物');
  assert.equal(changeSubject('announcements', { title: 'GW' }), 'GW');
  assert.equal(changeSubject('shifts', { date: '2026-07-12' }), '7/12(日)');
  assert.equal(changeSubject('notes', { text: 'x' }), ''); // メモは本文を出さない
  assert.equal(changeSubject('customers', null), '');
  assert.equal(changeSubject('customers', 'id-string'), ''); // 非オブジェクトは空
});

test('describeChange は保存/削除の文言を作る', () => {
  assert.equal(describeChange('customers', 'put', { name: '田中' }), '顧客「田中」を保存');
  assert.equal(describeChange('customers', 'del', { name: '田中' }), '顧客「田中」を削除');
  assert.equal(describeChange('profile', 'put', { id: 'me' }), '設定を保存'); // 名前なし
  assert.equal(describeChange('notes', 'del', { id: 'n1' }), 'メモを削除');
});

test('logTime / logDayKey はゼロ埋めのローカル時刻・日付', () => {
  const ts = new Date(2026, 6, 5, 9, 3).getTime(); // 2026-07-05 09:03 ローカル
  assert.equal(logTime(ts), '09:03');
  assert.equal(logDayKey(ts), '2026-07-05');
});

test('groupLogsByDay は日降順・各日内も新しい順', () => {
  const d1 = new Date(2026, 6, 5, 10, 0).getTime();
  const d1b = new Date(2026, 6, 5, 12, 0).getTime();
  const d2 = new Date(2026, 6, 6, 9, 0).getTime();
  const groups = groupLogsByDay([
    { id: 'a', ts: d1, label: 'A' },
    { id: 'b', ts: d2, label: 'B' },
    { id: 'c', ts: d1b, label: 'C' },
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].day, '2026-07-06'); // 新しい日が先頭
  assert.equal(groups[1].day, '2026-07-05');
  assert.deepEqual(groups[1].items.map((i) => i.id), ['c', 'a']); // 12:00→10:00
});

test('logsToPrune は新しい方から max 件残して残りの id を返す', () => {
  const logs = [
    { id: 'old', ts: 100 },
    { id: 'mid', ts: 200 },
    { id: 'new', ts: 300 },
  ];
  assert.deepEqual(logsToPrune(logs, 2), ['old']);
  assert.deepEqual(logsToPrune(logs, 3), []); // ちょうどは削除なし
  assert.deepEqual(logsToPrune(logs, 5), []);
  assert.deepEqual(logsToPrune([], 2), []);
});
