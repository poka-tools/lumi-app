import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yen, signedYen, weekdayJa, esc, dateTimeJa } from '../js/format.js';

test('yen: ¥と桁区切り', () => {
  assert.equal(yen(428500), '¥428,500');
  assert.equal(yen(0), '¥0');
});
test('signedYen', () => {
  assert.equal(signedYen(52300), '+¥52,300');
  assert.equal(signedYen(-1000), '-¥1,000');
});
test('weekdayJa', () => { assert.equal(weekdayJa('2026-06-25'), '木'); });
test('dateTimeJa: M/D HH:MM・0埋め時刻', () => {
  const ts = new Date(2026, 8, 3, 9, 5).getTime(); // 9/3 09:05（ローカル）
  assert.equal(dateTimeJa(ts), '9/3 09:05');
  assert.equal(dateTimeJa(0), '');
  assert.equal(dateTimeJa(undefined), '');
});
test('esc: HTML特殊文字をエスケープ', () => {
  assert.equal(esc('<img onerror=alert(1)>'), '&lt;img onerror=alert(1)&gt;');
  assert.equal(esc('A & B "C"'), 'A &amp; B &quot;C&quot;');
  assert.equal(esc(null), '');
});
