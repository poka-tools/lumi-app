import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLapse, nextStored } from '../js/subscription-logic.js';

test('前回有料→今回無効で失効を検知する', () => {
  assert.equal(isLapse('1', false), true);
});

test('有料が継続中は失効ではない', () => {
  assert.equal(isLapse('1', true), false);
});

test('前回も無料なら失効ではない', () => {
  assert.equal(isLapse('0', false), false);
});

test('初回起動（未記録）は失効ではない', () => {
  assert.equal(isLapse(null, false), false);
  assert.equal(isLapse(null, true), false);
  assert.equal(isLapse(undefined, false), false);
});

test('nextStored は現在の権利状態を文字列化する', () => {
  assert.equal(nextStored(true), '1');
  assert.equal(nextStored(false), '0');
});
