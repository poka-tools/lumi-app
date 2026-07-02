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

// バック額。後方互換: 旧 type:'fixed'/'rate'+value はそのまま。
// 新モデル: fixedValue(円/件) と rateValue(％) の併用に対応。
// kind:'penalty' の項目はマイナス（罰金）として扱う。
export function backAmount(item, entry) {
  if (!item || !entry) return 0;
  let amt;
  if (item.type === 'fixed') amt = (item.value || 0) * (entry.count || 0);
  else if (item.type === 'rate') amt = (entry.sales || 0) * (item.value || 0) / 100;
  else amt = (item.fixedValue || 0) * (entry.count || 0)
          + (entry.sales || 0) * (item.rateValue || 0) / 100;
  return item.kind === 'penalty' ? -Math.abs(amt) : amt;
}

// wage は数値（旧）でも時給設定オブジェクト（新）でも受ける。
// 新オブジェクト: { hourlyWage, nominationWage, douhanWage,
//   nightPremium: { enabled, start, end, addPerHour } }
function normalizeWage(wage) {
  if (typeof wage === 'number') return { hourlyWage: wage };
  return wage || { hourlyWage: 0 };
}

// 指名・同伴のフラグに応じて適用する時給を返す（同伴 > 指名 > 基本給）。
export function effectiveHourly(wage, shift) {
  const w = normalizeWage(wage);
  if (shift && shift.douhan && w.douhanWage) return w.douhanWage;
  if (shift && shift.nomination && w.nominationWage) return w.nominationWage;
  return w.hourlyWage || 0;
}

// 深夜帯（既定 22:00〜05:00, 日跨ぎ可）に重なる実働時間。休憩控除後の実働を上限にする。
export function nightHours(shift, startHHMM = '22:00', endHHMM = '05:00') {
  const ws = parseTimeToMinutes(shift.start);
  let we = parseTimeToMinutes(shift.end);
  if (ws === null || we === null) return 0;
  if (we <= ws) we += 24 * 60; // 日跨ぎ
  const ns = parseTimeToMinutes(startHHMM);
  let ne = parseTimeToMinutes(endHHMM);
  if (ns === null || ne === null) return 0;
  if (ne <= ns) ne += 24 * 60; // 夜間帯の日跨ぎ
  let nightMin = 0;
  for (const off of [0, 24 * 60]) {
    nightMin += Math.max(0, Math.min(we, ne + off) - Math.max(ws, ns + off));
  }
  const workedMin = workedHours(shift) * 60;
  return Math.min(nightMin, workedMin) / 60;
}

// 深夜手当の加算額（割増は円/時の加算）。
export function nightPremium(wage, shift) {
  const np = normalizeWage(wage).nightPremium;
  if (!np || !np.enabled || !np.addPerHour) return 0;
  return nightHours(shift, np.start, np.end) * (np.addPerHour || 0);
}

export function shiftWage(wage, shift) {
  return effectiveHourly(wage, shift) * workedHours(shift) + nightPremium(wage, shift);
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
    let amount = 0, count = 0;
    for (const sh of (shifts || [])) {
      const e = (sh.entries || []).find((x) => x.backItemId === it.id);
      if (!e) continue;
      amount += backAmount(it, e);
      count += e.count || 0;
    }
    return { itemId: it.id, name: it.name, amount, count,
      pct: monthTotal ? round1((amount / monthTotal) * 100) : 0 };
  });
  return sums.filter((x) => x.amount !== 0 || x.count !== 0).sort((a, b) => b.amount - a.amount);
}
// 損益計算書（P/L）スタイルの収支内訳。設定項目に沿って行を構成する。
// 時給は適用レート（基本/指名/同伴）と深夜手当に分解、バックは項目別に収入/ペナルティへ振り分ける。
export function plStatement(wage, items, shifts) {
  const w = normalizeWage(wage);
  const sh = shifts || [];

  // --- 時給内訳 ---
  let base = 0, nom = 0, dou = 0, night = 0;
  for (const s of sh) {
    const amt = effectiveHourly(w, s) * workedHours(s);
    if (s.douhan && w.douhanWage) dou += amt;
    else if (s.nomination && w.nominationWage) nom += amt;
    else base += amt;
    night += nightPremium(w, s);
  }
  const wageRows = [];
  if (base) wageRows.push({ label: '基本時給', amount: base });
  if (nom) wageRows.push({ label: '指名時給', amount: nom });
  if (dou) wageRows.push({ label: '同伴時給', amount: dou });
  if (night) wageRows.push({ label: '深夜手当', amount: night });
  const wageTotal = base + nom + dou + night;

  // --- バック項目（収入=インセンティブ / ペナルティ=控除） ---
  const incentiveRows = [], penaltyRows = [];
  for (const it of (items || [])) {
    let amount = 0, count = 0;
    for (const shift of sh) {
      const e = (shift.entries || []).find((x) => x.backItemId === it.id);
      if (!e) continue;
      amount += backAmount(it, e);
      count += e.count || 0;
    }
    if (amount === 0) continue;
    const row = { label: it.name, amount, count };
    if (it.kind === 'penalty' || amount < 0) penaltyRows.push(row);
    else incentiveRows.push(row);
  }
  const incentiveTotal = incentiveRows.reduce((s, r) => s + r.amount, 0);
  const penaltyTotal = penaltyRows.reduce((s, r) => s + r.amount, 0);
  const grossIncome = wageTotal + incentiveTotal;
  const net = grossIncome + penaltyTotal; // penaltyTotal は負値

  return {
    wageRows, wageTotal,
    incentiveRows, incentiveTotal,
    penaltyRows, penaltyTotal,
    grossIncome, net,
  };
}

// 指定年(西暦)の月次収入推移。各月の 時給合計 / インセンティブ合計 / 合算 を返す（1〜12月・欠損月は0）。
export function annualSeries(wage, items, shifts, year) {
  const out = [];
  for (let m = 1; m <= 12; m++) {
    const prefix = `${year}-${String(m).padStart(2, '0')}`;
    const monthShifts = (shifts || []).filter((s) => (s.date || '').startsWith(prefix));
    const pl = plStatement(wage, items, monthShifts);
    out.push({ month: m, wage: pl.wageTotal, incentive: pl.incentiveTotal, total: pl.grossIncome });
  }
  return out;
}

export function monthOverMonth(current, previous) {
  if (previous === null || previous === undefined) return null;
  const diff = current - previous;
  const pct = previous === 0 ? 0 : round1((diff / previous) * 100);
  return { diff, pct };
}
