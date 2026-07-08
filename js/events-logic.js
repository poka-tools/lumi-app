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

// 予約1件の歩合（自分の取り分）＝ 本数×歩合(円/件) ＋ 売上(予定金額)×歩合(％)/100。
export function reservationBack(res) {
  const c = effectiveCount(res);
  const fixed = Number(res && res.backFixed) || 0;
  const rate = Number(res && res.backRate) || 0;
  const sales = Number(res && res.amount) || 0;
  return c * fixed + sales * rate / 100;
}

// 指定イベントの集計（予約件数・本数・売上合計・歩合合計）。本数は実効本数で合計。
export function eventTotals(reservations, eventId) {
  const rows = (reservations || []).filter((r) => r.eventId === eventId);
  return rows.reduce((acc, r) => {
    acc.count += 1;
    acc.bottles += effectiveCount(r);
    acc.amount += Number(r.amount) || 0;
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

// 予約の品目ラベル：シャンパン銘柄＋セットメニュー・その他商品を「/」で連結。
// どちらも未設定なら「予約」。顧客名は使わない（レポートは品目名で表示するため）。
export function reservationLabel(res) {
  const parts = [res && res.bottle, res && res.product]
    .map((x) => (x == null ? '' : String(x).trim()))
    .filter(Boolean);
  return parts.length ? parts.join(' / ') : '予約';
}

// 指定月(YYYY-MM)の対応済み歩合を「イベント名ごと＋明細」で返す（レポートの別枠表示用）。
// 返り値: [{ eventId, name, total, items: [{ label, count, amount }] }]（金額降順・歩合0は除外）。
// item の label は 銘柄→なければ参加者名（控え）→「予約」の順。
export function eventIncentiveDetail(reservations, events, month) {
  const groups = new Map();
  for (const r of (reservations || [])) {
    if (!r.done) continue;
    if (reservationDate(r, events).slice(0, 7) !== month) continue;
    const amount = reservationBack(r);
    if (!amount) continue;
    if (!groups.has(r.eventId)) groups.set(r.eventId, { total: 0, items: new Map() });
    const g = groups.get(r.eventId);
    // 同じ品目名は数量・金額をまとめて1行に合算する
    const label = reservationLabel(r);
    const cur = g.items.get(label) || { label, count: 0, amount: 0 };
    cur.count += effectiveCount(r);
    cur.amount += amount;
    g.items.set(label, cur);
    g.total += amount;
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
