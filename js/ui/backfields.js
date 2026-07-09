// 歩合項目の入力欄の出し分け・ラベル整形（record と calendar で共用）。
// 旧モデル(type/value)・新モデル(fixedValue/rateValue・kind)の両対応。

export const hasFixed = (it) =>
  it.type === 'fixed' || it.kind === 'penalty' || it.kind === 'deduction' || Number(it.fixedValue) > 0 ||
  (!it.type && !(Number(it.rateValue) > 0));

export const hasRate = (it) =>
  it.type === 'rate' || Number(it.rateValue) > 0;

export function itemLabel(it) {
  const parts = [];
  if (it.type === 'fixed') parts.push((Number(it.value) || 0) + '円/件');
  else if (it.type === 'rate') parts.push((Number(it.value) || 0) + '%');
  else {
    if (Number(it.fixedValue) > 0) parts.push(it.fixedValue + '円/件');
    if (Number(it.rateValue) > 0) parts.push(it.rateValue + '%');
  }
  const desc = parts.join(' + ') || '0';
  if (it.kind === 'penalty') return `⚠️罰金 ${desc}`;
  if (it.kind === 'deduction') return `➖控除 ${desc}`;
  return desc;
}

// 項目の分類（カテゴリ）。空欄は「未分類」に寄せる。
export const UNCATEGORIZED = '未分類';
export const itemCategory = (it) => ((it.category || '').trim() || UNCATEGORIZED);

// 登録済み項目に出現する分類を出現順に列挙（重複なし）。
export function categoryList(items) {
  const seen = [];
  for (const it of (items || [])) {
    const c = itemCategory(it);
    if (!seen.includes(c)) seen.push(c);
  }
  return seen;
}

// 選択肢に出す分類の一覧。事前登録したマスター（profile.backCategories）を先頭に、
// マスター未登録でも項目で使われている分類を後ろに補完（既存データの取りこぼし防止）。
// 「未分類」は含めない（UI側で別途 未分類=空 を用意する）。
export function allCategories(profile, items) {
  const out = [...((profile && profile.backCategories) || [])];
  for (const c of categoryList(items)) {
    if (c !== UNCATEGORIZED && !out.includes(c)) out.push(c);
  }
  return out;
}
