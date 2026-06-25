# 夜職 給料概算・月収管理アプリ（PWA）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 出勤シフトと各種バックから当月の給料を概算し、現状の稼ぎを管理するオフライン PWA を作る。

**Architecture:** 計算ロジックを純粋関数モジュール `calc.js`（UI/DB 非依存・テスト済み）に隔離し、その上に IndexedDB ラッパ `db.js` と画面描画を載せる。データは端末内のみ（外部送信なし）。後の Flutter 移植時は `calc.js` の仕様をそのまま移す。

**Tech Stack:** バニラ JS (ES Modules) / HTML / CSS、IndexedDB、Service Worker + manifest（PWA）、テストは Node 22 の `node:test` + `node:assert`。フレームワーク・外部依存なし。

設計書: `/mnt/c/Users/tsuba/workspace/yashoku-salary/docs/specs/2026-06-25-yashoku-salary-app-design.md`

---

## ファイル構成

```
workspace/yashoku-salary/
  index.html                  アプリの土台（タブ・各画面のコンテナ）
  manifest.json               PWA マニフェスト
  service-worker.js           オフラインキャッシュ
  package.json                テスト実行用（node:test）
  css/
    style.css                 デザイン（ピンク基調・角丸カード）
  js/
    calc.js                   純粋関数（中核・移植対象）
    db.js                     IndexedDB ラッパ
    state.js                  画面間で共有する読み込み済みデータ
    format.js                 ¥表記・日付整形などの表示ヘルパ
    ui/
      home.js                 ホーム（ダッシュボード）
      calendar.js             カレンダー
      record.js               収入を記録（シフト入力）
      report.js               レポート
      settings.js             設定（時給・バック項目・お知らせ・入出力）
      donut.js                ドーナツ/リング Canvas 描画
    app.js                    初期化・タブ遷移
  tests/
    calc.test.js              calc.js の単体テスト
  assets/
    (マスコット画像・アイコン)
  docs/
    specs/  plans/
```

各タスクは原則 TDD（`calc.js` は完全 TDD、DB/UI はテストできる箇所をテストし、画面はブラウザ目視で検証）。

---

## Task 0: プロジェクト初期化

**Files:**
- Create: `package.json`
- Create: `.gitignore`

- [ ] **Step 1: `package.json` を作成**

```json
{
  "name": "yashoku-salary",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: `.gitignore` を作成**

```
node_modules/
.DS_Store
*.log
```

- [ ] **Step 3: テストランナーが動くことを確認**

Run: `cd /mnt/c/Users/tsuba/workspace/yashoku-salary && npm test`
Expected: 「tests 0」等のメッセージで正常終了（テストファイルが無いのでパスもエラーも無し）

- [ ] **Step 4: Git 初期化 & コミット**

```bash
cd /mnt/c/Users/tsuba/workspace/yashoku-salary
git init
git add package.json .gitignore docs/
git commit -m "chore: init yashoku-salary project"
```

---

## Task 1: 実働時間の計算（夜勤の日跨ぎ対応）

**Files:**
- Create: `js/calc.js`
- Test: `tests/calc.test.js`

`start`/`end` は `"HH:MM"` 文字列。夜職は日付を跨ぐ（例 21:00→翌2:00）ので、`end <= start` のときは +24h する。

- [ ] **Step 1: 失敗するテストを書く**

`tests/calc.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTimeToMinutes, workedHours } from '../js/calc.js';

test('parseTimeToMinutes: "HH:MM" を分に変換', () => {
  assert.equal(parseTimeToMinutes('21:00'), 1260);
  assert.equal(parseTimeToMinutes('02:30'), 150);
});

test('workedHours: 同日内の実働（休憩控除）', () => {
  const shift = { start: '18:00', end: '23:00', breakMin: 30 };
  assert.equal(workedHours(shift), 4.5);
});

test('workedHours: 日跨ぎ（21:00→翌02:00, 休憩0）', () => {
  const shift = { start: '21:00', end: '02:00', breakMin: 0 };
  assert.equal(workedHours(shift), 5);
});

test('workedHours: end===start は 0 ではなく 24h ではない（未入力扱い 0）', () => {
  const shift = { start: '20:00', end: '', breakMin: 0 };
  assert.equal(workedHours(shift), 0);
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm test`
Expected: FAIL（`calc.js` が無い / 関数未定義）

- [ ] **Step 3: 最小実装**

`js/calc.js`:
```js
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
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm test`
Expected: PASS（4 tests）

- [ ] **Step 5: コミット**

```bash
git add js/calc.js tests/calc.test.js
git commit -m "feat(calc): workedHours with overnight handling"
```

---

## Task 2: バック 1 項目の金額計算（固定円 / 歩合%）

**Files:**
- Modify: `js/calc.js`
- Test: `tests/calc.test.js`

`BackItem = { id, name, type: 'fixed'|'rate', value }`、`entry = { backItemId, count, sales }`。
fixed は `value(円) × count`、rate は `sales × value/100`。

- [ ] **Step 1: 失敗するテストを追加**

`tests/calc.test.js` に追記:
```js
import { backAmount } from '../js/calc.js';

test('backAmount fixed: 単価×件数', () => {
  const item = { id: 'a', type: 'fixed', value: 3000 };
  assert.equal(backAmount(item, { count: 2 }), 6000);
});

test('backAmount rate: 売上×率%', () => {
  const item = { id: 'b', type: 'rate', value: 10 };
  assert.equal(backAmount(item, { sales: 50000 }), 5000);
});

test('backAmount: 未入力は 0', () => {
  const fixed = { id: 'a', type: 'fixed', value: 3000 };
  const rate = { id: 'b', type: 'rate', value: 10 };
  assert.equal(backAmount(fixed, {}), 0);
  assert.equal(backAmount(rate, {}), 0);
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm test`
Expected: FAIL（`backAmount` 未定義）

- [ ] **Step 3: 実装を追加**

`js/calc.js` に追記:
```js
export function backAmount(item, entry) {
  if (!item || !entry) return 0;
  if (item.type === 'fixed') return (item.value || 0) * (entry.count || 0);
  if (item.type === 'rate') return (entry.sales || 0) * (item.value || 0) / 100;
  return 0;
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add js/calc.js tests/calc.test.js
git commit -m "feat(calc): backAmount for fixed/rate items"
```

---

## Task 3: 1 日の概算（時給分＋バック合計）

**Files:**
- Modify: `js/calc.js`
- Test: `tests/calc.test.js`

- [ ] **Step 1: 失敗するテストを追加**

```js
import { shiftWage, shiftBackTotal, shiftTotal } from '../js/calc.js';

const items = [
  { id: 'douhan', type: 'fixed', value: 3000 },
  { id: 'drink', type: 'rate', value: 10 },
];
const shift = {
  start: '20:00', end: '01:00', breakMin: 0, // 5h
  entries: [
    { backItemId: 'douhan', count: 2 },   // 6000
    { backItemId: 'drink', sales: 50000 } // 5000
  ],
};

test('shiftWage: 時給×実働', () => {
  assert.equal(shiftWage(2500, shift), 12500);
});

test('shiftBackTotal: 全バック合計', () => {
  assert.equal(shiftBackTotal(items, shift), 11000);
});

test('shiftTotal: 時給分＋バック', () => {
  assert.equal(shiftTotal(2500, items, shift), 23500);
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm test`
Expected: FAIL

- [ ] **Step 3: 実装を追加**

`js/calc.js` に追記:
```js
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
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add js/calc.js tests/calc.test.js
git commit -m "feat(calc): per-shift daily total"
```

---

## Task 4: 月次集計（見込み・内訳・TOP3・時給換算・前月比）

**Files:**
- Modify: `js/calc.js`
- Test: `tests/calc.test.js`

ホーム画面が必要とする集計をまとめて実装する。

- [ ] **Step 1: 失敗するテストを追加**

```js
import {
  monthlyEstimate, monthlyWorkedHours, hourlyEquivalent,
  incomeBreakdown, backRanking, monthOverMonth
} from '../js/calc.js';

const items4 = [
  { id: 'douhan', name: '同伴', type: 'fixed', value: 3000 },
  { id: 'drink', name: 'ドリンクバック', type: 'rate', value: 10 },
];
const shifts4 = [
  { start: '20:00', end: '01:00', breakMin: 0, // 5h, wage10000@2000
    entries: [{ backItemId: 'douhan', count: 1 }] },          // back 3000
  { start: '20:00', end: '00:00', breakMin: 0, // 4h, wage8000@2000
    entries: [{ backItemId: 'drink', sales: 20000 }] },       // back 2000
];

test('monthlyEstimate: 全シフトの日収合計', () => {
  // (10000+3000) + (8000+2000) = 23000
  assert.equal(monthlyEstimate(2000, items4, shifts4), 23000);
});

test('monthlyWorkedHours: 実働合計', () => {
  assert.equal(monthlyWorkedHours(shifts4), 9);
});

test('hourlyEquivalent: 月合計÷総実働', () => {
  // 23000 / 9 ≒ 2555.55 → 四捨五入 2556
  assert.equal(hourlyEquivalent(2000, items4, shifts4), 2556);
});

test('incomeBreakdown: 時給分 vs バック総額と比率', () => {
  const b = incomeBreakdown(2000, items4, shifts4);
  assert.equal(b.wage, 18000);
  assert.equal(b.back, 5000);
  assert.equal(b.total, 23000);
  assert.equal(b.wagePct, 78.3); // 18000/23000 → 小数1桁
  assert.equal(b.backPct, 21.7);
});

test('backRanking: 項目別合計の降順＋構成比', () => {
  const r = backRanking(items4, shifts4);
  assert.equal(r[0].name, '同伴');
  assert.equal(r[0].amount, 3000);
  assert.equal(r[1].name, 'ドリンクバック');
  assert.equal(r[1].amount, 2000);
  assert.equal(r[0].pct, 13.0); // 3000/23000 ... 設計上は対月収比
});

test('monthOverMonth: 差額と%', () => {
  const m = monthOverMonth(23000, 20000);
  assert.equal(m.diff, 3000);
  assert.equal(m.pct, 15.0);
});

test('monthOverMonth: 前月データ無しは null', () => {
  assert.equal(monthOverMonth(23000, null), null);
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm test`
Expected: FAIL

- [ ] **Step 3: 実装を追加**

`js/calc.js` に追記:
```js
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

export function backRanking(items, shifts) {
  const total = (shifts || []).reduce(
    (s, sh) => s + shiftWage(0, sh) + shiftBackTotal(items, sh), 0
  );
  // shiftWage(0,..)=0 なので total は実質バック総額ではなく月収。pct は対月収比。
  const monthTotal = monthlyEstimateFromItems(items, shifts);
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

// pct の分母（対月収）。hourlyWage が backRanking に渡らないため別途受けない設計。
// → 呼び出し側で月収を使えるよう、ここではバック総額ベースにせず内部ヘルパで月収を再計算。
function monthlyEstimateFromItems(items, shifts) {
  // ランキングの pct 用。時給分も含む月収を概算する必要があるが、
  // hourlyWage を持たないため UI 側から渡す版を別途用意する（下記参照）。
  return (shifts || []).reduce((s, sh) => s + shiftBackTotal(items, sh), 0);
}

export function monthOverMonth(current, previous) {
  if (previous === null || previous === undefined) return null;
  const diff = current - previous;
  const pct = previous === 0 ? 0 : round1((diff / previous) * 100);
  return { diff, pct };
}
```

> 注意（設計の整合）: `backRanking` の `pct` 分母を「月収（時給含む）」にするか「バック総額」にするか曖昧。モックアップの TOP3 は月収全体に対する % 表記（26.3% など）なので **分母は月収**。`hourlyWage` を引数に加えてテストもそれに合わせる。次ステップで修正する。

- [ ] **Step 4: backRanking のシグネチャを月収ベースに直す**

`backRanking` を次に置き換え、内部ヘルパ `monthlyEstimateFromItems` を削除:
```js
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
```
そして Step 1 の `backRanking` テストを `backRanking(2000, items4, shifts4)` に修正し、`r[0].pct` の期待値を `round1(3000/23000*100)=13.0` に保つ。

- [ ] **Step 5: テストを実行して成功を確認**

Run: `npm test`
Expected: PASS（全テスト）

- [ ] **Step 6: コミット**

```bash
git add js/calc.js tests/calc.test.js
git commit -m "feat(calc): monthly aggregation, breakdown, ranking, MoM"
```

---

## Task 5: 表示ヘルパ（¥表記・日付）

**Files:**
- Create: `js/format.js`
- Test: `tests/format.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`tests/format.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yen, signedYen, weekdayJa } from '../js/format.js';

test('yen: ¥と桁区切り', () => {
  assert.equal(yen(428500), '¥428,500');
  assert.equal(yen(0), '¥0');
});

test('signedYen: 符号付き', () => {
  assert.equal(signedYen(52300), '+¥52,300');
  assert.equal(signedYen(-1000), '-¥1,000');
});

test('weekdayJa: 曜日', () => {
  assert.equal(weekdayJa('2026-06-25'), '木');
});

import { esc } from '../js/format.js';

test('esc: HTML特殊文字をエスケープ（XSS対策）', () => {
  assert.equal(esc('<img onerror=alert(1)>'), '&lt;img onerror=alert(1)&gt;');
  assert.equal(esc('A & B "C"'), 'A &amp; B &quot;C&quot;');
  assert.equal(esc(null), '');
});
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `npm test`
Expected: FAIL

- [ ] **Step 3: 実装**

`js/format.js`:
```js
export function yen(n) {
  return '¥' + Math.round(n || 0).toLocaleString('ja-JP');
}
export function signedYen(n) {
  const v = Math.round(n || 0);
  return (v >= 0 ? '+' : '-') + '¥' + Math.abs(v).toLocaleString('ja-JP');
}
export function weekdayJa(isoDate) {
  const w = ['日', '月', '火', '水', '木', '金', '土'];
  return w[new Date(isoDate + 'T00:00:00').getDay()];
}
// XSS対策: innerHTML テンプレートに差し込むユーザー入力は必ずこれを通す
export function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
```

> **セキュリティ規約（以降の全 UI タスクで必須）**: `el.innerHTML = \`...\`` のテンプレート内で**ユーザー由来の文字列**（`profile.name`・`storeName`・`backItem.name`・`announcement.title`/`body`）を埋め込む箇所は、必ず `esc(...)` でラップする。
> 例: `<strong>おはようございます、${esc(greetName)}さん🌸</strong>`、`📣 <strong>${esc(a.title)}</strong>`、`<span>${medals[i]} ${esc(r.name)}</span>`、設定/記録画面の `value="${esc(it.name)}"` など。
> 数値・日付・アプリ内定数（`yen()` の出力、`weekdayJa()`、`it.type` 等）はエスケープ不要。`<input value="...">` 属性に入れる場合も `esc()` を使う（属性も `"` をエスケープ済みのため安全）。各 UI タスクの import に `esc` を加えること。

- [ ] **Step 4: 実行して成功を確認**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add js/format.js tests/format.test.js
git commit -m "feat: yen/date formatting helpers"
```

---

## Task 6: IndexedDB ラッパ

**Files:**
- Create: `js/db.js`

IndexedDB は Node では動かないため、ここはブラウザ目視で検証する。store: `profile`(単一), `backItems`, `shifts`, `announcements`。

- [ ] **Step 1: 実装**

`js/db.js`:
```js
const DB_NAME = 'yashoku-salary';
const DB_VERSION = 1;
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
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode) {
  return openDb().then((db) => db.transaction(store, mode).objectStore(store));
}
const wrap = (req) => new Promise((res, rej) => {
  req.onsuccess = () => res(req.result);
  req.onerror = () => rej(req.error);
});

export async function getAll(store) { return wrap((await tx(store, 'readonly')).getAll()); }
export async function get(store, id) { return wrap((await tx(store, 'readonly')).get(id)); }
export async function put(store, value) { return wrap((await tx(store, 'readwrite')).put(value)); }
export async function del(store, id) { return wrap((await tx(store, 'readwrite')).delete(id)); }

// プロフィールは単一レコード（id 固定）
export async function getProfile() {
  return (await get('profile', 'me')) || { id: 'me', name: '', hourlyWage: 0, storeName: '' };
}
export async function saveProfile(p) { return put('profile', { ...p, id: 'me' }); }

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
```

- [ ] **Step 2: コミット**

```bash
git add js/db.js
git commit -m "feat: IndexedDB wrapper"
```

> 検証は Task 8 以降で UI と一緒にブラウザで行う。

---

## Task 7: アプリの土台（index.html・タブ・CSS・state）

**Files:**
- Create: `index.html`, `css/style.css`, `js/app.js`, `js/state.js`

- [ ] **Step 1: `js/state.js` を作成**

```js
import { getAll, getProfile } from './db.js';

export const state = {
  profile: null,
  backItems: [],
  shifts: [],
  announcements: [],
  // 表示中の対象月 'YYYY-MM'
  month: new Date().toISOString().slice(0, 7),
};

export async function loadAll() {
  state.profile = await getProfile();
  state.backItems = (await getAll('backItems')).sort((a, b) => (a.order || 0) - (b.order || 0));
  state.shifts = await getAll('shifts');
  state.announcements = await getAll('announcements');
}

export function shiftsOfMonth(month = state.month) {
  return state.shifts.filter((s) => (s.date || '').startsWith(month));
}
export function prevMonth(month = state.month) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return d.toISOString().slice(0, 7);
}
```

- [ ] **Step 2: `index.html` を作成**

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#ff5c8a" />
  <link rel="manifest" href="manifest.json" />
  <link rel="stylesheet" href="css/style.css" />
  <title>夜職 給料管理</title>
</head>
<body>
  <main id="screen"></main>
  <nav id="tabbar">
    <button data-tab="home" class="active">🏠<span>ホーム</span></button>
    <button data-tab="calendar">📅<span>カレンダー</span></button>
    <button data-tab="record" class="fab">＋</button>
    <button data-tab="report">📊<span>レポート</span></button>
    <button data-tab="settings">⚙️<span>設定</span></button>
  </nav>
  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 3: `js/app.js` を作成**

```js
import { loadAll } from './state.js';
import { renderHome } from './ui/home.js';
import { renderCalendar } from './ui/calendar.js';
import { renderRecord } from './ui/record.js';
import { renderReport } from './ui/report.js';
import { renderSettings } from './ui/settings.js';

const screen = document.getElementById('screen');
const renderers = {
  home: renderHome, calendar: renderCalendar, record: renderRecord,
  report: renderReport, settings: renderSettings,
};

export async function navigate(tab) {
  document.querySelectorAll('#tabbar button').forEach((b) =>
    b.classList.toggle('active', b.dataset.tab === tab));
  screen.innerHTML = '';
  await renderers[tab](screen);
  screen.scrollTop = 0;
}

document.getElementById('tabbar').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (btn) navigate(btn.dataset.tab);
});

(async () => {
  await loadAll();
  await navigate('home');
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
})();
```

- [ ] **Step 4: `css/style.css` を作成（ピンク基調・角丸カード・下タブ）**

```css
:root {
  --pink: #ff5c8a; --pink-soft: #ffe3ec; --purple: #a78bfa;
  --ink: #2b2b2b; --muted: #8a8a8a; --bg: #fafafa; --card: #fff;
  --radius: 18px; --shadow: 0 4px 16px rgba(0,0,0,.06);
}
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
body { margin: 0; font-family: -apple-system, "Hiragino Sans", sans-serif;
  background: var(--bg); color: var(--ink); padding-bottom: 76px; }
#screen { padding: 16px; max-width: 480px; margin: 0 auto; }
.card { background: var(--card); border-radius: var(--radius); box-shadow: var(--shadow);
  padding: 16px; margin-bottom: 14px; }
.big-amount { font-size: 40px; font-weight: 800; letter-spacing: -1px; }
.badge { background: var(--pink-soft); color: var(--pink); font-size: 11px;
  padding: 2px 8px; border-radius: 10px; margin-left: 8px; vertical-align: middle; }
.muted { color: var(--muted); font-size: 13px; }
.row { display: flex; gap: 10px; }
.chips { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 4px; }
.chip { flex: 0 0 auto; background: var(--card); border-radius: 14px; box-shadow: var(--shadow);
  padding: 12px 14px; text-align: center; min-width: 96px; }
input, select, button { font: inherit; }
.field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.field input, .field select { padding: 10px 12px; border: 1px solid #eee; border-radius: 12px; }
.btn { background: var(--pink); color: #fff; border: none; border-radius: 14px;
  padding: 12px 16px; font-weight: 700; width: 100%; }
.btn-ghost { background: var(--pink-soft); color: var(--pink); }
#tabbar { position: fixed; bottom: 0; left: 0; right: 0; height: 64px; background: #fff;
  display: flex; justify-content: space-around; align-items: center;
  box-shadow: 0 -2px 12px rgba(0,0,0,.05); }
#tabbar button { background: none; border: none; color: var(--muted); font-size: 20px;
  display: flex; flex-direction: column; align-items: center; gap: 2px; }
#tabbar button span { font-size: 10px; }
#tabbar button.active { color: var(--pink); }
#tabbar .fab { background: var(--pink); color: #fff; width: 52px; height: 52px;
  border-radius: 50%; font-size: 28px; box-shadow: 0 4px 12px rgba(255,92,138,.4); }
```

- [ ] **Step 5: 各 UI モジュールの空スタブを作成（読み込みエラー回避）**

`js/ui/home.js`, `calendar.js`, `record.js`, `report.js`, `settings.js` をそれぞれ:
```js
export async function renderHome(el) { el.innerHTML = '<div class="card">ホーム（仮）</div>'; }
```
（各ファイル名に合わせて `renderCalendar` / `renderRecord` / `renderReport` / `renderSettings` に変更）

- [ ] **Step 6: ブラウザで起動して確認**

Run: `cd /mnt/c/Users/tsuba/workspace/yashoku-salary && python3 -m http.server 8080`
ブラウザで `http://localhost:8080` を開く。
Expected: 下タブが表示され、タップで各「（仮）」画面に切り替わる。コンソールエラーが無いこと。

- [ ] **Step 7: コミット**

```bash
git add index.html css/style.css js/app.js js/state.js js/ui/
git commit -m "feat: app shell, tabs, base styles"
```

---

## Task 8: 設定画面（時給・バック項目・お知らせ・データ入出力）

**Files:**
- Modify: `js/ui/settings.js`

ホームより先に作る。ここで時給とバック項目を登録しないと他画面が空になるため。

- [ ] **Step 1: `settings.js` を実装**

```js
import { state, loadAll } from '../state.js';
import { put, del, uid, saveProfile, getAll } from '../db.js';
import { navigate } from '../app.js';

export async function renderSettings(el) {
  const p = state.profile;
  el.innerHTML = `
    <h2>設定</h2>
    <div class="card">
      <h3>プロフィール・時給</h3>
      <div class="field"><label>表示名</label><input id="name" value="${p.name || ''}"></div>
      <div class="field"><label>店名（任意）</label><input id="store" value="${p.storeName || ''}"></div>
      <div class="field"><label>時給（円）</label><input id="wage" type="number" inputmode="numeric" value="${p.hourlyWage || 0}"></div>
      <button class="btn" id="saveProfile">保存</button>
    </div>

    <div class="card">
      <h3>バック項目</h3>
      <div id="itemList"></div>
      <button class="btn btn-ghost" id="addItem">＋ 項目を追加</button>
    </div>

    <div class="card">
      <h3>キャンペーンお知らせ</h3>
      <div id="annList"></div>
      <button class="btn btn-ghost" id="addAnn">＋ お知らせを追加</button>
    </div>

    <div class="card">
      <h3>データ</h3>
      <button class="btn btn-ghost" id="exportBtn">エクスポート（JSON）</button>
      <div style="height:8px"></div>
      <label class="btn btn-ghost" style="display:block;text-align:center">
        インポート<input id="importFile" type="file" accept="application/json" hidden>
      </label>
    </div>`;

  el.querySelector('#saveProfile').onclick = async () => {
    await saveProfile({
      name: el.querySelector('#name').value,
      storeName: el.querySelector('#store').value,
      hourlyWage: Number(el.querySelector('#wage').value) || 0,
    });
    await loadAll(); alert('保存しました');
  };

  const renderItems = () => {
    const box = el.querySelector('#itemList');
    box.innerHTML = state.backItems.map((it) => `
      <div class="row" style="align-items:center;margin-bottom:8px" data-id="${it.id}">
        <input class="i-name" value="${it.name}" style="flex:2">
        <select class="i-type" style="flex:1">
          <option value="fixed" ${it.type === 'fixed' ? 'selected' : ''}>円</option>
          <option value="rate" ${it.type === 'rate' ? 'selected' : ''}>％</option>
        </select>
        <input class="i-value" type="number" value="${it.value}" style="flex:1">
        <button class="i-del" style="border:none;background:none;color:#f55">🗑</button>
      </div>`).join('');
    box.querySelectorAll('[data-id]').forEach((rowEl) => {
      const id = rowEl.dataset.id;
      const save = async () => {
        const it = state.backItems.find((x) => x.id === id);
        it.name = rowEl.querySelector('.i-name').value;
        it.type = rowEl.querySelector('.i-type').value;
        it.value = Number(rowEl.querySelector('.i-value').value) || 0;
        await put('backItems', it);
      };
      rowEl.querySelectorAll('input,select').forEach((f) => (f.onchange = save));
      rowEl.querySelector('.i-del').onclick = async () => {
        if (!confirm('この項目を削除しますか？')) return;
        await del('backItems', id); await loadAll(); renderItems();
      };
    });
  };
  renderItems();

  el.querySelector('#addItem').onclick = async () => {
    const order = state.backItems.length;
    await put('backItems', { id: uid(), name: '新規バック', type: 'fixed', value: 0, order });
    await loadAll(); renderItems();
  };

  const renderAnns = () => {
    const box = el.querySelector('#annList');
    box.innerHTML = state.announcements.map((a) => `
      <div class="row" style="align-items:center;margin-bottom:8px" data-id="${a.id}">
        <input class="a-title" value="${a.title}" placeholder="タイトル" style="flex:2">
        <input class="a-start" type="date" value="${a.startDate || ''}" style="flex:1">
        <input class="a-end" type="date" value="${a.endDate || ''}" style="flex:1">
        <button class="a-del" style="border:none;background:none;color:#f55">🗑</button>
      </div>`).join('');
    box.querySelectorAll('[data-id]').forEach((rowEl) => {
      const id = rowEl.dataset.id;
      const save = async () => {
        const a = state.announcements.find((x) => x.id === id);
        a.title = rowEl.querySelector('.a-title').value;
        a.startDate = rowEl.querySelector('.a-start').value;
        a.endDate = rowEl.querySelector('.a-end').value;
        await put('announcements', a);
      };
      rowEl.querySelectorAll('input').forEach((f) => (f.onchange = save));
      rowEl.querySelector('.a-del').onclick = async () => {
        if (!confirm('このお知らせを削除しますか？')) return;
        await del('announcements', id); await loadAll(); renderAnns();
      };
    });
  };
  renderAnns();

  el.querySelector('#addAnn').onclick = async () => {
    await put('announcements', { id: uid(), title: '新しいお知らせ', body: '', startDate: '', endDate: '' });
    await loadAll(); renderAnns();
  };

  el.querySelector('#exportBtn').onclick = async () => {
    const data = {
      profile: state.profile, backItems: state.backItems,
      shifts: state.shifts, announcements: state.announcements,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `yashoku-salary-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  el.querySelector('#importFile').onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    if (!confirm('現在のデータに上書き追加します。よろしいですか？')) return;
    const data = JSON.parse(await file.text());
    if (data.profile) await saveProfile(data.profile);
    for (const it of data.backItems || []) await put('backItems', it);
    for (const s of data.shifts || []) await put('shifts', s);
    for (const an of data.announcements || []) await put('announcements', an);
    await loadAll(); alert('インポートしました'); navigate('settings');
  };
}
```

- [ ] **Step 2: ブラウザで検証**

サーバ起動中に設定画面を開き、(1) 時給を保存→リロードしても残る、(2) バック項目を追加/編集/削除できる、(3) お知らせを追加できる、(4) エクスポートで JSON が落ちる、(5) その JSON をインポートできる、を確認。
Expected: すべて動作し、リロード後もデータが永続化されている。

- [ ] **Step 3: コミット**

```bash
git add js/ui/settings.js
git commit -m "feat: settings (wage, back items, announcements, import/export)"
```

---

## Task 9: 収入を記録（シフト入力）画面

**Files:**
- Modify: `js/ui/record.js`

- [ ] **Step 1: `record.js` を実装**

```js
import { state, loadAll } from '../state.js';
import { put, uid } from '../db.js';
import { workedHours, shiftTotal } from '../calc.js';
import { yen } from '../format.js';
import { navigate } from '../app.js';

// 編集対象を渡せるよう、グローバルに保持（カレンダー/ホームから遷移時に設定）
export let editingShift = null;
export function setEditingShift(s) { editingShift = s; }

export async function renderRecord(el) {
  const today = new Date().toISOString().slice(0, 10);
  const s = editingShift || {
    id: uid(), date: today, start: '20:00', end: '01:00',
    breakMin: 0, confirmed: false, entries: [],
  };
  const entryVal = (id, key) => {
    const e = (s.entries || []).find((x) => x.backItemId === id);
    return e && e[key] != null ? e[key] : '';
  };

  el.innerHTML = `
    <h2>収入を記録</h2>
    <div class="card">
      <div class="field"><label>日付</label><input id="date" type="date" value="${s.date}"></div>
      <div class="row">
        <div class="field" style="flex:1"><label>開始</label><input id="start" type="time" value="${s.start}"></div>
        <div class="field" style="flex:1"><label>終了</label><input id="end" type="time" value="${s.end}"></div>
        <div class="field" style="flex:1"><label>休憩(分)</label><input id="break" type="number" value="${s.breakMin || 0}"></div>
      </div>
      <label><input id="confirmed" type="checkbox" ${s.confirmed ? 'checked' : ''}> 確定（実績）にする</label>
    </div>

    <div class="card">
      <h3>バック実績</h3>
      ${state.backItems.length === 0
        ? '<p class="muted">先に「設定」でバック項目を登録してください。</p>'
        : state.backItems.map((it) => `
          <div class="field">
            <label>${it.name} <span class="muted">(${it.type === 'fixed' ? it.value + '円/件' : it.value + '%'})</span></label>
            <input class="entry" data-id="${it.id}" data-type="${it.type}" type="number" inputmode="numeric"
              placeholder="${it.type === 'fixed' ? '件数' : '対象売上(円)'}"
              value="${it.type === 'fixed' ? entryVal(it.id, 'count') : entryVal(it.id, 'sales')}">
          </div>`).join('')}
    </div>

    <div class="card">
      <div class="row" style="justify-content:space-between">
        <span>この日の概算</span><strong id="preview" class="big-amount" style="font-size:24px"></strong>
      </div>
      <div class="muted" id="hours"></div>
    </div>
    <button class="btn" id="save">保存</button>`;

  const collect = () => {
    s.date = el.querySelector('#date').value;
    s.start = el.querySelector('#start').value;
    s.end = el.querySelector('#end').value;
    s.breakMin = Number(el.querySelector('#break').value) || 0;
    s.confirmed = el.querySelector('#confirmed').checked;
    s.entries = [...el.querySelectorAll('.entry')].map((inp) => {
      const id = inp.dataset.id, type = inp.dataset.type, v = Number(inp.value) || 0;
      return type === 'fixed' ? { backItemId: id, count: v } : { backItemId: id, sales: v };
    }).filter((e) => (e.count || e.sales));
    return s;
  };

  const updatePreview = () => {
    const cur = collect();
    el.querySelector('#preview').textContent = yen(shiftTotal(state.profile.hourlyWage, state.backItems, cur));
    el.querySelector('#hours').textContent = `実働 ${workedHours(cur)} 時間`;
  };
  el.querySelectorAll('input').forEach((i) => { i.oninput = updatePreview; });
  updatePreview();

  el.querySelector('#save').onclick = async () => {
    await put('shifts', collect());
    setEditingShift(null);
    await loadAll();
    alert('保存しました');
    navigate('home');
  };
}
```

- [ ] **Step 2: `app.js` の record 遷移後に編集状態をリセット**

`js/app.js` の `navigate` 内、`record` 以外へ移動したら `editingShift` を消す。`navigate` 冒頭に追加:
```js
import { setEditingShift } from './ui/record.js';
// navigate() の先頭で:
if (tab !== 'record') setEditingShift(null);
```

- [ ] **Step 3: ブラウザで検証**

設定で時給とバック項目を入れた状態で「＋」を開く → 時刻・件数を入れると概算がリアルタイム更新 → 保存 → ホーム（次タスクで実装）or カレンダーに反映されること。
Expected: 概算が `時給×実働＋バック` と一致。日跨ぎ（例 20:00→01:00=5h）も正しい。

- [ ] **Step 4: コミット**

```bash
git add js/ui/record.js js/app.js
git commit -m "feat: shift record screen with live estimate"
```

---

## Task 10: ホーム（ダッシュボード）

**Files:**
- Modify: `js/ui/home.js`
- Create: `js/ui/donut.js`

- [ ] **Step 1: `donut.js`（Canvas ドーナツ描画）を実装**

```js
// segments: [{ value, color }]、中央テキスト centerText を描く
export function drawDonut(canvas, segments, centerText) {
  const dpr = window.devicePixelRatio || 1;
  const size = 160;
  canvas.width = size * dpr; canvas.height = size * dpr;
  canvas.style.width = size + 'px'; canvas.style.height = size + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const cx = size / 2, cy = size / 2, r = 64, lw = 22;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let start = -Math.PI / 2;
  ctx.lineWidth = lw;
  segments.forEach((seg) => {
    const ang = (seg.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.strokeStyle = seg.color;
    ctx.arc(cx, cy, r, start, start + ang);
    ctx.stroke();
    start += ang;
  });
  if (centerText) {
    ctx.fillStyle = '#2b2b2b';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(centerText, cx, cy);
  }
}
```

- [ ] **Step 2: `home.js` を実装**

```js
import { state, shiftsOfMonth, prevMonth } from '../state.js';
import {
  monthlyEstimate, monthlyWorkedHours, hourlyEquivalent,
  incomeBreakdown, backRanking, monthOverMonth, shiftTotal, workedHours,
} from '../calc.js';
import { yen, signedYen, weekdayJa } from '../format.js';
import { drawDonut } from './donut.js';
import { setEditingShift } from './record.js';
import { navigate } from '../app.js';

export async function renderHome(el) {
  const wage = state.profile.hourlyWage;
  const items = state.backItems;
  const cur = shiftsOfMonth();
  const prev = shiftsOfMonth(prevMonth());

  const estimate = monthlyEstimate(wage, items, cur);
  const prevEstimate = prev.length ? monthlyEstimate(wage, items, prev) : null;
  const mom = monthOverMonth(estimate, prevEstimate);
  const bd = incomeBreakdown(wage, items, cur);
  const ranking = backRanking(wage, items, cur).slice(0, 3);
  const hours = monthlyWorkedHours(cur);
  const today = new Date().toISOString().slice(0, 10);
  const todayShift = cur.find((s) => s.date === today);
  const todayAmount = todayShift ? shiftTotal(wage, items, todayShift) : 0;

  const monthLabel = state.month.replace('-', '年') + '月';
  const greetName = state.profile.name || 'あなた';
  const medals = ['🥇', '🥈', '🥉'];

  const activeAnn = state.announcements.filter((a) =>
    (!a.startDate || a.startDate <= today) && (!a.endDate || today <= a.endDate));

  el.innerHTML = `
    <div class="card" style="display:flex;align-items:center;gap:10px">
      <div style="font-size:32px">🦉</div>
      <div><strong>おはようございます、${greetName}さん🌸</strong>
      <div class="muted">今日も一日がんばりましょう！</div></div>
    </div>

    <div class="card">
      <div>${monthLabel}の見込み<span class="badge">確定前</span></div>
      <div class="big-amount">${yen(estimate)}</div>
      ${mom ? `<div class="muted">前月比 <span style="color:var(--pink)">${signedYen(mom.diff)}（${mom.pct >= 0 ? '+' : ''}${mom.pct}%）</span></div>` : ''}
      <div class="row" style="margin-top:12px;text-align:center">
        <div style="flex:1"><div class="muted">時給(基本給)</div><strong>${yen(bd.wage)}</strong></div>
        <div style="flex:1"><div class="muted">インセンティブ</div><strong>${yen(bd.back)}</strong></div>
        <div style="flex:1"><div class="muted">総勤務時間</div><strong>${hours}h</strong></div>
      </div>
    </div>

    <div class="chips">
      <div class="chip"><div class="muted">出勤日数</div><strong>${cur.length}日</strong></div>
      <div class="chip"><div class="muted">時給換算</div><strong>${yen(hourlyEquivalent(wage, items, cur))}</strong></div>
      <div class="chip"><div class="muted">バック総額</div><strong>${yen(bd.back)}</strong></div>
      <div class="chip"><div class="muted">本日見込み</div><strong>${yen(todayAmount)}</strong></div>
    </div>

    ${activeAnn.map((a) => `<div class="card" style="background:var(--pink-soft)">
      📣 <strong>${a.title}</strong></div>`).join('')}

    <div class="card">
      <h3>今月の収入サマリー</h3>
      <div class="row" style="align-items:center">
        <canvas id="donut"></canvas>
        <div style="flex:1">
          <div>🩷 時給(基本給) <strong>${bd.wagePct}%</strong></div>
          <div>💜 インセンティブ <strong>${bd.backPct}%</strong></div>
        </div>
      </div>
    </div>

    <div class="card">
      <h3>バック TOP3</h3>
      ${ranking.length === 0 ? '<p class="muted">まだバック実績がありません。</p>'
        : ranking.map((r, i) => `<div class="row" style="justify-content:space-between;margin-bottom:6px">
            <span>${medals[i]} ${r.name}</span><span><strong>${yen(r.amount)}</strong> <span class="muted">${r.pct}%</span></span>
          </div>`).join('')}
    </div>

    <div class="card">
      <div class="row" style="justify-content:space-between"><h3>直近のシフト・実績</h3>
        <a id="toCal" class="muted">カレンダーで確認 ›</a></div>
      <div class="chips" id="recent"></div>
    </div>`;

  drawDonut(
    el.querySelector('#donut'),
    [{ value: bd.wage, color: '#ff5c8a' }, { value: bd.back, color: '#a78bfa' }],
    yen(estimate)
  );

  const recent = [...cur].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
  el.querySelector('#recent').innerHTML = recent.map((s) => `
    <div class="chip" data-id="${s.id}">
      <div>${Number(s.date.slice(8))}日(${weekdayJa(s.date)})</div>
      <strong>${yen(shiftTotal(wage, items, s))}</strong>
      <div class="muted">${s.confirmed ? workedHours(s) + 'h' : '未確定'}</div>
    </div>`).join('') || '<span class="muted">記録がありません</span>';

  el.querySelectorAll('#recent .chip').forEach((c) => {
    c.onclick = () => {
      setEditingShift(state.shifts.find((s) => s.id === c.dataset.id));
      navigate('record');
    };
  });
  el.querySelector('#toCal').onclick = () => navigate('calendar');
}
```

- [ ] **Step 3: ブラウザで検証**

数日分のシフトを記録 → ホームで見込み合計・内訳ドーナツ・TOP3・直近チップが正しく出る。直近チップをタップすると該当シフトの編集に飛ぶ。
Expected: 合計が手計算と一致。前月データを入れると前月比が出る。

- [ ] **Step 4: コミット**

```bash
git add js/ui/home.js js/ui/donut.js
git commit -m "feat: home dashboard with donut, TOP3, recent shifts"
```

---

## Task 11: カレンダー画面

**Files:**
- Modify: `js/ui/calendar.js`

- [ ] **Step 1: `calendar.js` を実装**

```js
import { state, shiftsOfMonth } from '../state.js';
import { shiftTotal } from '../calc.js';
import { yen } from '../format.js';
import { loadAll } from '../state.js';
import { setEditingShift } from './record.js';
import { navigate } from '../app.js';

export async function renderCalendar(el) {
  const [y, m] = state.month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const byDate = new Map(shiftsOfMonth().map((s) => [s.date, s]));
  const wage = state.profile.hourlyWage, items = state.backItems;

  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push('<div></div>');
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${state.month}-${String(d).padStart(2, '0')}`;
    const s = byDate.get(iso);
    const amount = s ? yen(shiftTotal(wage, items, s)) : '';
    const cls = s ? (s.confirmed ? 'has-confirmed' : 'has-draft') : '';
    cells.push(`<div class="cal-cell ${cls}" data-date="${iso}">
      <div class="cal-day">${d}</div><div class="cal-amt">${amount}</div></div>`);
  }

  el.innerHTML = `
    <div class="row" style="justify-content:space-between;align-items:center">
      <button id="prev" class="btn-ghost btn" style="width:auto;padding:6px 12px">‹</button>
      <h2>${y}年${m}月</h2>
      <button id="next" class="btn-ghost btn" style="width:auto;padding:6px 12px">›</button>
    </div>
    <div class="cal-grid head">${['日','月','火','水','木','金','土'].map((w) => `<div>${w}</div>`).join('')}</div>
    <div class="cal-grid" id="grid">${cells.join('')}</div>`;

  const shift = (delta) => {
    const d = new Date(y, m - 1 + delta, 1);
    state.month = d.toISOString().slice(0, 7);
    renderCalendar(el);
  };
  el.querySelector('#prev').onclick = () => shift(-1);
  el.querySelector('#next').onclick = () => shift(1);

  el.querySelectorAll('.cal-cell').forEach((cell) => {
    cell.onclick = () => {
      const iso = cell.dataset.date;
      const existing = state.shifts.find((s) => s.date === iso);
      setEditingShift(existing || { id: undefined, date: iso, start: '20:00', end: '01:00', breakMin: 0, confirmed: false, entries: [] });
      if (!existing) { import('../db.js').then(({ uid }) => {}); }
      navigate('record');
    };
  });
}
```

- [ ] **Step 2: 編集シフトに id が無い場合の保存対応**

`record.js` の `collect()` で `s.id` が未設定なら採番する。`record.js` 冒頭の import に `uid` を追加し、`renderRecord` 内の `const s = ...` の直後に:
```js
if (!s.id) s.id = uid();
```

- [ ] **Step 3: カレンダー用 CSS を追加**

`css/style.css` に追記:
```css
.cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.cal-grid.head { color: var(--muted); font-size: 12px; text-align: center; margin: 8px 0 4px; }
.cal-cell { background: var(--card); border-radius: 10px; min-height: 56px; padding: 4px;
  box-shadow: var(--shadow); font-size: 11px; }
.cal-day { font-weight: 600; }
.cal-amt { color: var(--pink); font-weight: 700; }
.cal-cell.has-confirmed { outline: 2px solid var(--pink); }
.cal-cell.has-draft { outline: 1px dashed var(--purple); }
```

- [ ] **Step 4: ブラウザで検証**

カレンダーで月移動ができ、シフトのある日に金額が出る。日付タップで記録画面（既存日は編集、空き日は新規）に飛ぶ。
Expected: 確定/未確定で枠線が変わる。保存後カレンダーに反映。

- [ ] **Step 5: コミット**

```bash
git add js/ui/calendar.js js/ui/record.js css/style.css
git commit -m "feat: calendar with monthly shifts"
```

---

## Task 12: レポート画面

**Files:**
- Modify: `js/ui/report.js`

- [ ] **Step 1: `report.js` を実装**

当月の項目別合計（時給分＋各バック）を棒で表示する簡易レポート。

```js
import { state, shiftsOfMonth } from '../state.js';
import { incomeBreakdown, backRanking, monthlyEstimate, monthlyWorkedHours } from '../calc.js';
import { yen } from '../format.js';

export async function renderReport(el) {
  const wage = state.profile.hourlyWage, items = state.backItems;
  const cur = shiftsOfMonth();
  const bd = incomeBreakdown(wage, items, cur);
  const ranking = backRanking(wage, items, cur);
  const total = monthlyEstimate(wage, items, cur) || 1;

  const bar = (label, amount) => `
    <div style="margin-bottom:10px">
      <div class="row" style="justify-content:space-between">
        <span>${label}</span><strong>${yen(amount)}</strong></div>
      <div style="background:#eee;border-radius:6px;height:8px">
        <div style="background:var(--pink);height:8px;border-radius:6px;width:${Math.min(100, (amount / total) * 100)}%"></div>
      </div>
    </div>`;

  el.innerHTML = `
    <h2>レポート（${state.month.replace('-', '年')}月）</h2>
    <div class="card">
      <div class="row" style="justify-content:space-between"><span>見込み合計</span><strong>${yen(bd.total)}</strong></div>
      <div class="row" style="justify-content:space-between"><span>総勤務時間</span><strong>${monthlyWorkedHours(cur)}h</strong></div>
      <div class="row" style="justify-content:space-between"><span>出勤日数</span><strong>${cur.length}日</strong></div>
    </div>
    <div class="card">
      <h3>内訳</h3>
      ${bar('時給(基本給)', bd.wage)}
      ${ranking.map((r) => bar(r.name, r.amount)).join('')}
      ${ranking.length === 0 ? '<p class="muted">バック実績がありません。</p>' : ''}
    </div>`;
}
```

- [ ] **Step 2: ブラウザで検証**

レポートで合計・勤務時間・項目別バーが当月データと一致すること。
Expected: バー幅が金額比に対応。

- [ ] **Step 3: コミット**

```bash
git add js/ui/report.js
git commit -m "feat: monthly report screen"
```

---

## Task 13: PWA 化（manifest・Service Worker・アイコン）

**Files:**
- Create: `manifest.json`, `service-worker.js`, `assets/icon-192.png`, `assets/icon-512.png`

- [ ] **Step 1: アイコンを用意**

`assets/icon-192.png`（192x192）と `assets/icon-512.png`（512x512）を配置（フクロウ or ピンク背景の単色仮アイコンで可）。仮アイコン生成例:
```bash
cd /mnt/c/Users/tsuba/workspace/yashoku-salary/assets
python3 -c "from PIL import Image; [Image.new('RGB',(s,s),(255,92,138)).save(f'icon-{s}.png') for s in (192,512)]" 2>/dev/null || echo "PIL が無ければ任意のPNGを手動配置"
```

- [ ] **Step 2: `manifest.json` を作成**

```json
{
  "name": "夜職 給料管理",
  "short_name": "給料管理",
  "start_url": "./index.html",
  "display": "standalone",
  "background_color": "#fafafa",
  "theme_color": "#ff5c8a",
  "icons": [
    { "src": "assets/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "assets/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 3: `service-worker.js` を作成**

```js
const CACHE = 'yashoku-v1';
const ASSETS = [
  './', './index.html', './manifest.json',
  './css/style.css',
  './js/app.js', './js/state.js', './js/db.js', './js/calc.js', './js/format.js',
  './js/ui/home.js', './js/ui/calendar.js', './js/ui/record.js',
  './js/ui/report.js', './js/ui/settings.js', './js/ui/donut.js',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
```

- [ ] **Step 4: ブラウザで検証**

`http://localhost:8080` を開き、DevTools → Application → Manifest と Service Workers が登録されていること。オフライン（DevTools の Offline）でもリロードして動くこと。スマホで同一 LAN からアクセスし「ホーム画面に追加」でアプリ的に起動できること。
Expected: オフライン動作・ホーム画面追加が可能。

- [ ] **Step 5: コミット**

```bash
git add manifest.json service-worker.js assets/
git commit -m "feat: PWA manifest + service worker (offline, installable)"
```

---

## Task 14: 仕上げ確認とドキュメント

**Files:**
- Create: `README.md`

- [ ] **Step 1: 全テストを実行**

Run: `npm test`
Expected: calc / format の全テスト PASS。

- [ ] **Step 2: `README.md` を作成**

```markdown
# 夜職 給料管理（PWA）

出勤シフトと各種バックから当月の給料を概算・管理するオフライン Web アプリ。

## 使い方（ローカル）
1. `python3 -m http.server 8080`
2. ブラウザ/スマホで `http://<PCのIP>:8080` を開く
3. スマホでは「ホーム画面に追加」でアプリとして起動

## テスト
`npm test`（calc.js / format.js の単体テスト）

## 構成
- `js/calc.js` … 計算ロジック（純粋関数・テスト済み・Flutter 移植の中核）
- `js/db.js` … IndexedDB
- `js/ui/*` … 画面
- 設計書: `docs/specs/`、計画: `docs/plans/`

## 次フェーズ（ストア配布）
`calc.js` の仕様を Flutter へ移植し、App Store / Google Play へ申請（要 Mac / 各デベロッパー登録）。
```

- [ ] **Step 3: 手動シナリオ確認（受け入れ）**

(1) 設定で時給とバック項目を登録 →(2) 数日分のシフトを記録 →(3) ホームの見込み・内訳・TOP3 が正しい →(4) カレンダーに反映 →(5) レポートの内訳が一致 →(6) エクスポート→インポートで復元 →(7) オフラインで起動。
Expected: すべて期待通り。

- [ ] **Step 4: コミット**

```bash
git add README.md
git commit -m "docs: add README and finalize v1"
```

---

## Self-Review（記録）

- **Spec coverage:** 画面構成（ホーム/カレンダー/記録/レポート/設定）= Task 7〜12、データモデル = Task 1〜6・8・9、計算ロジック全項目 = Task 1〜4、キャンペーンお知らせ（表示のみ）= Task 8 登録 + Task 10 表示、PWA/IndexedDB/エクスポート = Task 6・8・13、目標機能=非対象（リング枠を見込み合計に置換、Task 10 で反映）。すべて対応タスクあり。
- **Placeholders:** 各コード手順に実コードを記載。TBD/TODO 無し。
- **Type consistency:** `backRanking(hourlyWage, items, shifts)`（Task 4 Step 4 で確定）をホーム/レポートで同一シグネチャ使用。`shiftTotal(hourlyWage, items, shift)`、`workedHours(shift)`、`setEditingShift`/`editingShift` を各画面で一貫使用。`db.js` の `put/get/getAll/del/uid/saveProfile/getProfile` を UI から一貫使用。
- **セキュリティ（XSS）:** `esc()`（Task 5）を追加し、全 UI タスクでユーザー由来文字列の埋め込みに必須化（Task 5 の「セキュリティ規約」参照）。ローカル単一ユーザー前提でリスクは低いが、Web 配布・JSON 共有時の保存型 XSS を予防。
