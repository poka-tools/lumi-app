// カレンダー画面の汎用メモ（写真つき）の純粋ロジック。DB/DOM 非依存＝node --test で検証する。
// memo = { id, text, photo(dataURL|''), createdAt }

// 新しい順（createdAt 降順）に並べ替える。同時刻は id で安定化。
export function sortMemos(memos) {
  return [...(memos || [])].sort(
    (a, b) => (b.createdAt || 0) - (a.createdAt || 0) || String(a.id).localeCompare(String(b.id)),
  );
}

// 保存できる中身があるか（本文か写真のどちらかがあれば有効）。
export function hasMemoContent({ text, photo } = {}) {
  return !!((text && text.trim()) || photo);
}
