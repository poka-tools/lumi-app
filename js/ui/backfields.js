// バック項目の入力欄の出し分け・ラベル整形（record と calendar で共用）。
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
