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
// 未登録顧客（手入力）は res.name をそのまま返す。
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

// 実効数量：数量が入力されていればその値、未入力でも品名(銘柄/商品)があれば最低1とみなす。
export function effectiveCount(res) {
  const c = Number(res && res.count) || 0;
  if (c > 0) return c;
  return (res && (res.bottle || res.label)) ? 1 : 0;
}

// 予定金額の自動計算（実効数量 × 単価）。第2引数は品名（有無で1扱い判定）。
export function autoAmount(count, label, unitPrice) {
  return effectiveCount({ count, label }) * (Number(unitPrice) || 0);
}

// 1商品アイテムの実効数量。
export function itemCount(item) {
  const c = Number(item && item.count) || 0;
  if (c > 0) return c;
  return (item && item.label && String(item.label).trim()) ? 1 : 0;
}
// 1商品アイテムの歩合（取り分）＝ 数量×歩合(円/件) ＋ 売上×歩合(％)/100。
export function itemBack(item) {
  const fixed = Number(item && item.backFixed) || 0;
  const rate = Number(item && item.backRate) || 0;
  const sales = Number(item && item.amount) || 0;
  return itemCount(item) * fixed + sales * rate / 100;
}
// 予約の商品アイテム配列。新モデルは res.items、旧モデル(単一商品)は1アイテムへ変換。
export function reservationItems(res) {
  if (res && Array.isArray(res.items) && res.items.length) return res.items;
  const label = [res && res.bottle, res && res.product]
    .map((x) => (x == null ? '' : String(x).trim())).filter(Boolean).join(' / ');
  return [{
    label,
    count: Number(res && res.count) || 0,
    unitPrice: Number(res && res.unitPrice) || 0,
    amount: Number(res && res.amount) || 0,
    backFixed: Number(res && res.backFixed) || 0,
    backRate: Number(res && res.backRate) || 0,
  }];
}
// 予約の合計（全アイテム集計）。
export function reservationCount(res) {
  return reservationItems(res).reduce((s, it) => s + itemCount(it), 0);
}
export function reservationSales(res) {
  return reservationItems(res).reduce((s, it) => s + (Number(it.amount) || 0), 0);
}
export function reservationBack(res) {
  return reservationItems(res).reduce((s, it) => s + itemBack(it), 0);
}
// 予約の品目サマリー（名簿の行表示用）: 「品名 ×数量」を「/」で連結。
export function reservationSummary(res) {
  return reservationItems(res)
    .filter((it) => (it.label && it.label.trim()) || itemCount(it))
    .map((it) => ((it.label && it.label.trim()) || '商品') + (itemCount(it) ? ` ×${itemCount(it)}` : ''))
    .join(' / ');
}

// 指定イベントの集計（予約件数・数量・売上合計・歩合合計）。
export function eventTotals(reservations, eventId) {
  const rows = (reservations || []).filter((r) => r.eventId === eventId);
  return rows.reduce((acc, r) => {
    acc.count += 1;
    acc.bottles += reservationCount(r);
    acc.amount += reservationSales(r);
    acc.back += reservationBack(r);
    return acc;
  }, { count: 0, bottles: 0, amount: 0, back: 0 });
}

// 予約の売上日：未定(dateTBD)なら空（＝集計対象外）。個別日付があればそれ、
// 無ければ所属イベントの開催日にフォールバック。
export function reservationDate(res, events) {
  if (res && res.dateTBD) return '';
  if (res && res.date) return res.date;
  const ev = (events || []).find((e) => e.id === (res && res.eventId));
  return ev ? (ev.date || '') : '';
}

// 対応済み(done)の予約の歩合（取り分）を売上日ごとに合計（カレンダー用）Map<date, back>。
export function eventIncomeByDate(reservations, events) {
  const m = new Map();
  for (const r of (reservations || [])) {
    if (!r.done) continue;
    const d = reservationDate(r, events);
    if (!d) continue;
    m.set(d, (m.get(d) || 0) + reservationBack(r));
  }
  return m;
}

// 指定月(YYYY-MM)の対応済み予約の歩合合計（レポートのイベント歩合用）。
export function eventIncomeInMonth(reservations, events, month) {
  return (reservations || []).reduce((s, r) => {
    if (!r.done) return s;
    return reservationDate(r, events).slice(0, 7) === month ? s + reservationBack(r) : s;
  }, 0);
}

// 指定月(YYYY-MM)の対応済み歩合を「イベント名ごと＋明細（商品名別）」で返す（レポートの別枠用）。
// 返り値: [{ eventId, name, total, items: [{ label, count, amount }] }]（金額降順・歩合0は除外）。
// 全予約の全商品アイテムを走査し、同じ商品名は数量・金額をまとめて合算する。
export function eventIncentiveDetail(reservations, events, month) {
  const groups = new Map();
  for (const r of (reservations || [])) {
    if (!r.done) continue;
    if (reservationDate(r, events).slice(0, 7) !== month) continue;
    for (const it of reservationItems(r)) {
      const amount = itemBack(it);
      if (!amount) continue;
      if (!groups.has(r.eventId)) groups.set(r.eventId, { total: 0, items: new Map() });
      const g = groups.get(r.eventId);
      const label = (it.label && String(it.label).trim()) || '商品';
      const cur = g.items.get(label) || { label, count: 0, amount: 0 };
      cur.count += itemCount(it);
      cur.amount += amount;
      g.items.set(label, cur);
      g.total += amount;
    }
  }
  const out = [];
  for (const [eventId, g] of groups) {
    const ev = (events || []).find((e) => e.id === eventId);
    const items = [...g.items.values()].sort((a, b) => b.amount - a.amount);
    out.push({ eventId, name: ev ? ev.name : '(削除済みイベント)', total: g.total, items });
  }
  return out.sort((a, b) => b.total - a.total);
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
