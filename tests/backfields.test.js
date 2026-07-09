import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categoryList, allCategories, itemCategory, UNCATEGORIZED } from '../js/ui/backfields.js';

const items = [
  { id: 'a', name: 'モエ', category: 'シャンパン' },
  { id: 'b', name: 'ハイボール', category: 'ドリンク' },
  { id: 'c', name: '指名料', category: '' },        // 未分類
  { id: 'd', name: 'アルマンド', category: 'シャンパン' }, // 重複
];

test('itemCategory：空欄は未分類に寄せる', () => {
  assert.equal(itemCategory({ category: '  ' }), UNCATEGORIZED);
  assert.equal(itemCategory({ category: 'ドリンク' }), 'ドリンク');
});

test('categoryList：出現順・重複なし（未分類も含む）', () => {
  assert.deepEqual(categoryList(items), ['シャンパン', 'ドリンク', UNCATEGORIZED]);
});

test('allCategories：マスターを先頭に、未登録の使用中分類を後ろへ補完（未分類は除外）', () => {
  const profile = { backCategories: ['ドリンク', 'フード'] };
  // マスター順（ドリンク,フード）→ 未登録のシャンパンを補完。未分類は含めない
  assert.deepEqual(allCategories(profile, items), ['ドリンク', 'フード', 'シャンパン']);
});

test('allCategories：マスター未設定なら使用中分類のみ（未分類除外）', () => {
  assert.deepEqual(allCategories({}, items), ['シャンパン', 'ドリンク']);
  assert.deepEqual(allCategories(null, items), ['シャンパン', 'ドリンク']);
});

test('allCategories：重複や順序が壊れない', () => {
  const profile = { backCategories: ['シャンパン'] };
  assert.deepEqual(allCategories(profile, items), ['シャンパン', 'ドリンク']);
});
