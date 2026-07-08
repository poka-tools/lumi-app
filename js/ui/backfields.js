// 歩合項目の入力欄の出し分け・ラベル整形（record と calendar で共用）。
// 旧モデル(type/value)・新モデル(fixedValue/rateValue・kind)の両対応。

export const hasFixed = (it) =>
  it.type === 'fixed' || it.kind === 'penalty' || Number(it.fixedValue) > 0 ||
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
  return it.kind === 'penalty' ? `⚠️罰金 ${desc}` : desc;
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
