// 純粋関数群。DOM / IndexedDB に依存しない（Flutter 移植時の中核）。

export function parseTimeToMinutes(hhmm) {
  if (!hhmm || typeof hhmm !== 'string' || !hhmm.includes(':')) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export function workedHours(shift) {
  const start = parseTimeToMinutes(shift.start);
  const end = parseTimeToMinutes(shift.end);
  if (start === null || end === null) return 0;
  let mins = end - start;
  if (mins <= 0) mins += 24 * 60; // 日跨ぎ
  mins -= shift.breakMin || 0;
  if (mins < 0) mins = 0;
  return mins / 60;
}

export function backAmount(item, entry) {
  if (!item || !entry) return 0;
  if (item.type === 'fixed') return (item.value || 0) * (entry.count || 0);
  if (item.type === 'rate') return (entry.sales || 0) * (item.value || 0) / 100;
  return 0;
}
