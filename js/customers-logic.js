// 顧客・来店予定の純粋関数（DOM/IndexedDB に依存しない・テスト対象）

// ISO日付("YYYY-MM-DD")にn日足す（ローカル基準・UTCずれ回避）
export function addDaysIso(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// 指定月(YYYY-MM)に誕生日がある顧客を誕生日昇順で
export function birthdaysInMonth(customers, month) {
  const mm = month.slice(5, 7);
  return customers
    .filter((c) => c.birthday && c.birthday.slice(0, 2) === mm)
    .sort((a, b) => a.birthday.localeCompare(b.birthday));
}

// 指定月(YYYY-MM)の誕生日を ISO日付 -> 顧客名[] のMapで（カレンダーの誕生日表示用）
export function birthdaysByDate(customers, month) {
  const m = new Map();
  for (const c of birthdaysInMonth(customers, month)) {
    const iso = `${month}-${c.birthday.slice(3, 5)}`;
    if (!m.has(iso)) m.set(iso, []);
    m.get(iso).push(c.name);
  }
  return m;
}

// today〜today+days（両端含む）の未完了来店予定を日付昇順・顧客名付きで
export function upcomingVisits(visits, customers, today, days = 7) {
  const until = addDaysIso(today, days);
  const nameById = new Map(customers.map((c) => [c.id, c.name]));
  return visits
    .filter((v) => !v.done && v.date >= today && v.date <= until)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((v) => ({ ...v, customerName: nameById.get(v.customerId) || '(削除済み)' }));
}

// 指定月(YYYY-MM)の未完了の来店予定を日付昇順・顧客名付きで（本日の予定カード用）
export function visitsInMonth(visits, customers, month) {
  const nameById = new Map(customers.map((c) => [c.id, c.name]));
  return visits
    .filter((v) => !v.done && (v.date || '').slice(0, 7) === month)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((v) => ({ ...v, customerName: nameById.get(v.customerId) || '(削除済み)' }));
}

// 指定日の来店予定を顧客名付きで
export function visitsOnDate(visits, customers, date) {
  const nameById = new Map(customers.map((c) => [c.id, c.name]));
  return visits
    .filter((v) => v.date === date)
    .map((v) => ({ ...v, customerName: nameById.get(v.customerId) || '(削除済み)' }));
}

// 顧客の次回来店予定日（today以降・未完了の最早）。なければ ''
export function nextVisitDate(visits, customerId, today) {
  const future = visits
    .filter((v) => v.customerId === customerId && !v.done && v.date >= today)
    .map((v) => v.date)
    .sort();
  return future[0] || '';
}

// ===== フリガナ索引（五十音の行分け）=====
// 各行の代表となる かな（濁点・半濁点・小書きを含む）。
const KANA_ROWS = [
  ['あ', 'ぁあぃいぅうぇえぉおゔ'],
  ['か', 'かがきぎくぐけげこご'],
  ['さ', 'さざしじすずせぜそぞ'],
  ['た', 'ただちぢっつづてでとど'],
  ['な', 'なにぬねの'],
  ['は', 'はばぱひびぴふぶぷへべぺほぼぽ'],
  ['ま', 'まみむめも'],
  ['や', 'ゃやゅゆょよ'],
  ['ら', 'らりるれろ'],
  ['わ', 'わゐゑをんゎ'],
];
// 索引に並べる行の順序（最後の '#' は英数・記号・漢字など五十音に載らないもの）。
export const KANA_ORDER = ['あ', 'か', 'さ', 'た', 'な', 'は', 'ま', 'や', 'ら', 'わ', '#'];

// 読み（フリガナ優先／無ければ名前）の先頭文字から、属する行ラベルを返す。
export function kanaRow(reading) {
  const s = (reading || '').trim();
  if (!s) return '#';
  let ch = s[0];
  const code = ch.charCodeAt(0);
  // カタカナ（U+30A1..U+30F6）はひらがなへ寄せて判定
  if (code >= 0x30A1 && code <= 0x30F6) ch = String.fromCharCode(code - 0x60);
  for (const [label, set] of KANA_ROWS) if (set.includes(ch)) return label;
  return '#';
}

// 名前で顧客を絞り込み（部分一致・大文字小文字無視）。名前昇順で返す
export function searchCustomers(customers, query) {
  const q = (query || '').trim().toLowerCase();
  const sorted = [...customers].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ja'));
  if (!q) return sorted;
  return sorted.filter((c) =>
    (c.name || '').toLowerCase().includes(q) ||
    (c.furigana || '').toLowerCase().includes(q) ||
    (c.memo || '').toLowerCase().includes(q));
}

// 顧客の来店実績（done=true）の件数
export function doneVisitCount(visits, customerId) {
  return visits.filter((v) => v.customerId === customerId && v.done).length;
}

// 顧客リストを指定キーで並び替え（同点は名前順で安定化）。
// sortKey: 'name'(既定) / 'next'(次回来店が近い順) / 'new'(登録が新しい順) / 'visits'(来店回数が多い順)
export function sortCustomers(customers, sortKey, ctx = {}) {
  const { visits = [], today = '' } = ctx;
  const byName = (a, b) => (a.name || '').localeCompare(b.name || '', 'ja');
  const list = [...customers];
  if (sortKey === 'next') {
    const nv = (c) => nextVisitDate(visits, c.id, today) || '9999-99-99';
    return list.sort((a, b) => nv(a).localeCompare(nv(b)) || byName(a, b));
  }
  if (sortKey === 'new') {
    return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0) || byName(a, b));
  }
  if (sortKey === 'visits') {
    return list.sort((a, b) => doneVisitCount(visits, b.id) - doneVisitCount(visits, a.id) || byName(a, b));
  }
  return list.sort(byName);
}

// 日付ごとの来店予定件数 Map<date, count>（カレンダーバッジ用）
export function visitCountByDate(visits) {
  const m = new Map();
  for (const v of visits) m.set(v.date, (m.get(v.date) || 0) + 1);
  return m;
}

// 顧客のメモ（履歴型）を新しい順（createdAt 降順）で返す。
export function notesForCustomer(notes, customerId) {
  return notes
    .filter((n) => n.customerId === customerId)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}
