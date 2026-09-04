import { describeChange } from './audit-logic.js';

const DB_NAME = 'yashoku-salary';
const DB_VERSION = 7;
let _db = null;

export function openDb() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('profile'))
        db.createObjectStore('profile', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('backItems'))
        db.createObjectStore('backItems', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('shifts'))
        db.createObjectStore('shifts', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('announcements'))
        db.createObjectStore('announcements', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('todos'))
        db.createObjectStore('todos', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('customers'))
        db.createObjectStore('customers', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('visits'))
        db.createObjectStore('visits', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('events'))
        db.createObjectStore('events', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('reservations'))
        db.createObjectStore('reservations', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('notes'))
        db.createObjectStore('notes', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('auditLog'))
        db.createObjectStore('auditLog', { keyPath: 'id' });
      // v7: 旧「写真つきメモ」機能で追加したストア。機能は撤去したが、
      // IndexedDB はバージョンを下げられない（既にv7の端末がある）ため、
      // ストア定義だけ残す（未使用・空のまま。DB_VERSION は 7 を維持）。
      if (!db.objectStoreNames.contains('memos'))
        db.createObjectStore('memos', { keyPath: 'id' });
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

// この端末に保存された全データ（DBまるごと）を削除して初期状態に戻す。
// アカウントを持たないローカル完結アプリの「リセット／退会」に相当する操作。
// 呼び出し側は完了後にリロードして、openDb で空のDBを作り直す。
export function resetAllData() {
  return new Promise((resolve, reject) => {
    if (_db) { try { _db.close(); } catch (e) { /* 既に閉じていても無視 */ } _db = null; }
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    // 他タブが開いていて削除がブロックされても、リロードで解消するため成功扱い。
    req.onblocked = () => resolve();
  });
}

function tx(store, mode) {
  return openDb().then((db) => db.transaction(store, mode).objectStore(store));
}
const wrap = (req) => new Promise((res, rej) => {
  req.onsuccess = () => res(req.result);
  req.onerror = () => rej(req.error);
});

export async function getAll(store) {
  // 更新直後などストア未作成の瞬間でも loadAll を落とさない（空配列で継続）
  const db = await openDb();
  if (!db.objectStoreNames.contains(store)) return [];
  return wrap(db.transaction(store, 'readonly').objectStore(store).getAll());
}
export async function get(store, id) { return wrap((await tx(store, 'readonly')).get(id)); }
export async function put(store, value) {
  const r = await wrap((await tx(store, 'readwrite')).put(value));
  logChange(store, 'put', value); // ベストエフォート（await しない＝本処理を遅らせない）
  return r;
}
export async function del(store, id) {
  // 削除前に内容を取得しておく（ログの見出しに顧客名・日付を残すため）
  let prior = null;
  try { prior = await get(store, id); } catch { /* 取得失敗は無視 */ }
  const r = await wrap((await tx(store, 'readwrite')).delete(id));
  logChange(store, 'del', prior || { id });
  return r;
}

// --- 操作ログ（監査ログ）---------------------------------------------------
// import 復元のような一括処理中はログを止め、まとめて1件だけ残す。
let _auditSuppressed = false;
export function suppressAudit(v) { _auditSuppressed = !!v; }

// 変更を auditLog ストアへ記録する。記録の失敗は本処理に影響させない（握りつぶす）。
// auditLog 自身の操作は記録しない（無限ループ防止）。
function logChange(store, op, value) {
  if (_auditSuppressed || store === 'auditLog') return;
  const entry = {
    id: uid(),
    ts: Date.now(),
    store, op,
    label: describeChange(store, op, value),
  };
  openDb()
    .then((db) => {
      if (!db.objectStoreNames.contains('auditLog')) return;
      db.transaction('auditLog', 'readwrite').objectStore('auditLog').put(entry);
    })
    .catch(() => { /* 記録失敗は無視 */ });
}

// 復元など、任意の文言で1件だけログを残したいとき用（op は 'put'|'del'|'info'）
export async function logNote(label, op = 'info') {
  try { await put('auditLog', { id: uid(), ts: Date.now(), store: '', op, label: String(label) }); }
  catch { /* 無視 */ }
}

// 操作ログを全消去する（auditLog 自身の操作なので記録されない）
export async function clearAuditLog() {
  const db = await openDb();
  if (!db.objectStoreNames.contains('auditLog')) return;
  await wrap(db.transaction('auditLog', 'readwrite').objectStore('auditLog').clear());
}

export async function getProfile() {
  const p = (await get('profile', 'me')) || { id: 'me', name: '', hourlyWage: 0, storeName: '', defaultStart: '20:00', defaultEnd: '01:00', defaultBreakMin: 0 };
  // リマインダー設定の既定値（未設定＝無効・出勤は前日から/キャンペーンは3日前から）
  p.shiftReminder = { enabled: false, leadDays: 1, ...(p.shiftReminder || {}) };
  p.campaignReminder = { enabled: false, leadDays: 3, ...(p.campaignReminder || {}) };
  // 歩合項目の分類マスター（事前登録して項目でプルダウン選択する）
  p.backCategories = p.backCategories || [];
  // 予約商品の履歴（商品名→単価・歩合）。新規入力時に名前で呼び出して自動補完する
  p.productPresets = p.productPresets || [];
  // 日払いの既定上限（円・0＝上限なし）とレポートで日払い差額を表示するか
  if (p.dayPayCap === undefined) p.dayPayCap = 0;
  if (p.dayPayType === undefined) p.dayPayType = 'none'; // 日払いの受け取り方（全シフト共通）
  if (p.showDayPayDiff === undefined) p.showDayPayDiff = true;
  // 年収の壁アラート（既定=無効・103万）／源泉徴収の自動計算（既定=無効・10.21%）
  p.incomeWall = { enabled: false, threshold: 1300000, ...(p.incomeWall || {}) };
  p.withholding = { enabled: false, rate: 10.21, ...(p.withholding || {}) };
  return p;
}
export async function saveProfile(p) { return put('profile', { ...p, id: 'me' }); }

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
