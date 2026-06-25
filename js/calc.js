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

export function shiftWage(hourlyWage, shift) {
  return (hourlyWage || 0) * workedHours(shift);
}
export function shiftBackTotal(items, shift) {
  const byId = new Map((items || []).map((it) => [it.id, it]));
  return (shift.entries || []).reduce((sum, e) => {
    const item = byId.get(e.backItemId);
    return sum + backAmount(item, e);
  }, 0);
}
export function shiftTotal(hourlyWage, items, shift) {
  return shiftWage(hourlyWage, shift) + shiftBackTotal(items, shift);
}

const round1 = (n) => Math.round(n * 10) / 10;

export function monthlyEstimate(hourlyWage, items, shifts) {
  return (shifts || []).reduce((s, sh) => s + shiftTotal(hourlyWage, items, sh), 0);
}
export function monthlyWorkedHours(shifts) {
  return (shifts || []).reduce((s, sh) => s + workedHours(sh), 0);
}
export function hourlyEquivalent(hourlyWage, items, shifts) {
  const hours = monthlyWorkedHours(shifts);
  if (hours === 0) return 0;
  return Math.round(monthlyEstimate(hourlyWage, items, shifts) / hours);
}
export function incomeBreakdown(hourlyWage, items, shifts) {
  const wage = (shifts || []).reduce((s, sh) => s + shiftWage(hourlyWage, sh), 0);
  const back = (shifts || []).reduce((s, sh) => s + shiftBackTotal(items, sh), 0);
  const total = wage + back;
  return {
    wage, back, total,
    wagePct: total ? round1((wage / total) * 100) : 0,
    backPct: total ? round1((back / total) * 100) : 0,
  };
}
export function backRanking(hourlyWage, items, shifts) {
  const monthTotal = monthlyEstimate(hourlyWage, items, shifts);
  const sums = (items || []).map((it) => {
    const amount = (shifts || []).reduce((s, sh) => {
      const e = (sh.entries || []).find((x) => x.backItemId === it.id);
      return s + (e ? backAmount(it, e) : 0);
    }, 0);
    return { itemId: it.id, name: it.name, amount,
      pct: monthTotal ? round1((amount / monthTotal) * 100) : 0 };
  });
  return sums.filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount);
}
export function monthOverMonth(current, previous) {
  if (previous === null || previous === undefined) return null;
  const diff = current - previous;
  const pct = previous === 0 ? 0 : round1((diff / previous) * 100);
  return { diff, pct };
}
