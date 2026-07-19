// 操作ログ（監査ログ）の純粋ロジック。DB/DOM に依存しない＝node --test で検証する。
// このアプリはサーバー無し・単一端末なので「誰が」は記録しない。
// 目的＝端末内で「いつ・何を追加/削除したか」を後から追える／誤削除に気づけるようにすること。
import { shortDateJa } from './format.js';

// ストア名 → 人が読める名詞
export const STORE_LABELS = {
  profile: '設定',
  backItems: '歩合項目',
  shifts: 'シフト',
  announcements: 'お知らせ',
  todos: 'やること',
  customers: '顧客',
  visits: '来店予定',
  events: 'イベント',
  reservations: '予約',
  notes: 'メモ',
};

// 変更対象の内容から見出し用の短い名前を取り出す（顧客名・シフト日 等）
export function changeSubject(store, v) {
  if (!v || typeof v !== 'object') return '';
  switch (store) {
    case 'shifts':
    case 'visits':
      return v.date ? shortDateJa(v.date) : '';
    case 'customers':
    case 'events':
    case 'reservations':
      return v.name || '';
    case 'announcements':
      return v.title || '';
    case 'backItems':
      return v.name || '';
    case 'todos':
      return v.text || '';
    default:
      return '';
  }
}

// 1件の変更を「顧客「田中」を保存」のような文言にする
export function describeChange(store, op, value) {
  const noun = STORE_LABELS[store] || store;
  const subject = changeSubject(store, value);
  const verb = op === 'del' ? '削除' : '保存';
  return subject ? `${noun}「${subject}」を${verb}` : `${noun}を${verb}`;
}

// ローカル時刻の HH:MM
export function logTime(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
// ローカル日付の YYYY-MM-DD（日グルーピングのキー）
export function logDayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ログ配列を日付ごとにまとめ、新しい日→古い日／各日内も新しい順で返す
export function groupLogsByDay(logs) {
  const byDay = new Map();
  for (const l of logs) {
    const key = logDayKey(l.ts);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(l);
  }
  return [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([day, items]) => ({
      day,
      items: items.sort((a, b) => b.ts - a.ts),
    }));
}

// max 件を超えた古いログの id を返す（プルーニング対象）。新しい方から max 件を残す。
export function logsToPrune(logs, max) {
  if (!Array.isArray(logs) || logs.length <= max) return [];
  return [...logs]
    .sort((a, b) => b.ts - a.ts)
    .slice(max)
    .map((l) => l.id);
}
