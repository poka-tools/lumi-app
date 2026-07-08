// イベント・シャンパン予約名簿の純粋関数（DOM/IndexedDB 非依存・テスト対象）

// 予約のタイミング種別（当日／前祝い／後祝い）。表示順もこの並び。
export const TIMINGS = [
  { key: 'day', label: '当日' },
  { key: 'pre', label: '前祝い' },
  { key: 'post', label: '後祝い' },
];
const TIMING_ORDER = new Map(TIMINGS.map((t, i) => [t.key, i]));
export function timingLabel(key) {
  const t = TIMINGS.find((x) => x.key === key);
  return t ? t.label : '当日';
}

// 予約の表示名。顧客に紐付いていれば顧客名（削除済みは控えの name → なければ表記）。
// リスト外（手入力）は res.name をそのまま返す。
export function resolveResName(res, customers) {
  if (res.customerId) {
    const c = (customers || []).find((x) => x.id === res.customerId);
    if (c) return c.name;
    return res.name || '(削除済み顧客)';
  }
  return res.name || '';
}

// 指定イベントの予約を「タイミング順→登録順」で返す。
export function reservationsOfEvent(reservations, eventId) {
  return (reservations || [])
    .filter((r) => r.eventId === eventId)
    .sort((a, b) =>
      (TIMING_ORDER.get(a.timing) ?? 0) - (TIMING_ORDER.get(b.timing) ?? 0)
      || (a.createdAt || 0) - (b.createdAt || 0));
}

// 実効本数：本数が入力されていればその値、未入力でも銘柄があれば最低1本とみなす。
export function effectiveCount(res) {
  const c = Number(res && res.count) || 0;
  if (c > 0) return c;
  return (res && res.bottle) ? 1 : 0;
}

// 予定金額の自動計算（実効本数 × 単価）。
export function autoAmount(count, bottle, unitPrice) {
  return effectiveCount({ count, bottle }) * (Number(unitPrice) || 0);
}

// 指定イベントの集計（予約件数・本数合計・予定金額合計）。本数は実効本数で合計。
export function eventTotals(reservations, eventId) {
  const rows = (reservations || []).filter((r) => r.eventId === eventId);
  return rows.reduce((acc, r) => {
    acc.count += 1;
    acc.bottles += effectiveCount(r);
    acc.amount += Number(r.amount) || 0;
    return acc;
  }, { count: 0, bottles: 0, amount: 0 });
}

// イベントごとの予約件数 Map<eventId, count>（一覧バッジ用）。
export function reservationCountByEvent(reservations) {
  const m = new Map();
  for (const r of (reservations || [])) m.set(r.eventId, (m.get(r.eventId) || 0) + 1);
  return m;
}

// イベントと予約名簿を複製する新オブジェクトを組み立てる（純粋・idはgenIdで採番）。
// 予約は新id・新eventIdへ付け替え、対応済み(done)はリセットして名簿を使い回せる状態に。
export function buildEventClone(ev, reservations, genId, nameSuffix = ' のコピー', now = Date.now()) {
  const newEvent = {
    id: genId(),
    name: (ev.name || '') + nameSuffix,
    date: ev.date || '',
    memo: ev.memo || '',
    createdAt: now,
  };
  const rows = (reservations || [])
    .filter((r) => r.eventId === ev.id)
    .map((r) => ({ ...r, id: genId(), eventId: newEvent.id, done: false, createdAt: r.createdAt || now }));
  return { event: newEvent, reservations: rows };
}

// 予約1件を複製する新オブジェクト（同一イベント内・新id・対応済みリセット・末尾に並ぶよう createdAt 更新）。
export function cloneReservation(res, newId, now = Date.now()) {
  return { ...res, id: newId, done: false, createdAt: now };
}

// イベント一覧の並び：日付の新しい順（日付なしは末尾）→ 登録の新しい順。
export function sortEvents(events) {
  return [...(events || [])].sort((a, b) =>
    (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
}
