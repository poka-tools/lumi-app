import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortMemos, hasMemoContent } from '../js/memos-logic.js';

test('sortMemos: 新しい順', () => {
  const memos = [
    { id: 'a', createdAt: 100 },
    { id: 'b', createdAt: 300 },
    { id: 'c', createdAt: 200 },
  ];
  assert.deepEqual(sortMemos(memos).map((m) => m.id), ['b', 'c', 'a']);
  assert.deepEqual(sortMemos([]), []);
  assert.deepEqual(sortMemos(undefined), []);
});

test('sortMemos: 元配列を破壊しない', () => {
  const memos = [{ id: 'a', createdAt: 1 }, { id: 'b', createdAt: 2 }];
  sortMemos(memos);
  assert.equal(memos[0].id, 'a');
});

test('hasMemoContent: 本文か写真があれば有効', () => {
  assert.equal(hasMemoContent({ text: 'メモ' }), true);
  assert.equal(hasMemoContent({ photo: 'data:image/jpeg;base64,xxx' }), true);
  assert.equal(hasMemoContent({ text: '   ', photo: '' }), false);
  assert.equal(hasMemoContent({}), false);
  assert.equal(hasMemoContent(), false);
});
