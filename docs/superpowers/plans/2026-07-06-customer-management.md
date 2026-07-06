# 顧客管理 & 来店予定機能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** キャストが顧客リストを管理し、顧客ごとの来店予定を日付で登録してカレンダー・ホームに反映できるようにする。

**Architecture:** 既存の `shifts`/`todos` と同じIndexedDB汎用CRUD＋メモリ内フィルタのパターンを踏襲。新ストア `customers`/`visits` を追加（DB v2→v3、既存データ保持）。日付ロジックは純粋関数 `js/customers-logic.js` に切り出して単体テスト。UIは `js/ui/customers.js`（一覧・詳細・入力）を新規追加し、カレンダーとホームに表示連携する。設定は下タブから外し、ホーム右上の⚙️から到達する。

**Tech Stack:** バニラ ES Modules / IndexedDB / `node --test`（純粋関数）。ビルドなし。SWは stale-while-revalidate。

---

## File Structure

- `js/db.js` — DB v3・`customers`/`visits` ストア追加（変更）
- `js/state.js` — `state.customers`/`state.visits` 読み込み（変更）
- `js/customers-logic.js` — 顧客・来店予定の純粋関数（新規）
- `tests/customers-logic.test.js` — 上記の単体テスト（新規）
- `js/ui/customers.js` — 顧客タブUI（一覧／詳細／顧客フォーム／来店予定管理）（新規）
- `index.html` — 下タブ `settings`→`customers` 入替（変更）
- `js/app.js` — `customers` ルート追加（変更）
- `js/ui/home.js` — 誕生日/近日来店カード＋設定⚙️ボタン（変更）
- `js/ui/calendar.js` — 来店予定バッジ＋日別シートの来店セクション（変更）
- `css/style.css` — 顧客・来店予定・ヒント用スタイル追加（変更）
- `service-worker.js` — ASSETS追記・キャッシュ v39（変更）

---

## データ形

```
customers: { id, name, contact, birthday("MM-DD"|""), favoriteBottle, memo, createdAt }
visits:    { id, customerId, date("YYYY-MM-DD"), note, done, createdAt }
```

---

### Task 1: DB v3 マイグレーション（customers / visits ストア）

**Files:**
- Modify: `js/db.js:2`（DB_VERSION）, `js/db.js:9-22`（onupgradeneeded）

- [ ] **Step 1: DB_VERSION を 3 に上げる**

`js/db.js` 2行目を変更:

```js
const DB_VERSION = 3;
```

- [ ] **Step 2: onupgradeneeded に2ストア追加**

`js/db.js` の `todos` ストア追加ブロックの直後（`req.onsuccess` の前）に追記:

```js
      if (!db.objectStoreNames.contains('todos'))
        db.createObjectStore('todos', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('customers'))
        db.createObjectStore('customers', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('visits'))
        db.createObjectStore('visits', { keyPath: 'id' });
```

- [ ] **Step 3: コミット**

```bash
git add js/db.js
git commit -m "feat(db): customers/visits ストアを追加（DB v3）"
```

---

### Task 2: state に customers / visits を読み込む

**Files:**
- Modify: `js/state.js:3-10`（state 定義）, `js/state.js:18-24`（loadAll）

- [ ] **Step 1: state に配列を追加**

`js/state.js` の `state` オブジェクトに2フィールド追加（`todos: [],` の下）:

```js
export const state = {
  profile: null,
  backItems: [],
  shifts: [],
  announcements: [],
  todos: [],
  customers: [],
  visits: [],
  month: monthIso(new Date()),
};
```

- [ ] **Step 2: loadAll で読み込む**

`js/state.js` の `loadAll` 内、`state.todos = ...` の下に追記:

```js
  state.todos = (await getAll('todos')).sort((a, b) => (a.order || 0) - (b.order || 0));
  state.customers = await getAll('customers');
  state.visits = await getAll('visits');
```

- [ ] **Step 3: コミット**

```bash
git add js/state.js
git commit -m "feat(state): customers/visits をロード"
```

---

### Task 3: 純粋ロジック `customers-logic.js` ＋テスト（TDD）

**Files:**
- Create: `js/customers-logic.js`
- Test: `tests/customers-logic.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`tests/customers-logic.test.js` を作成:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  birthdaysInMonth, addDaysIso, upcomingVisits,
  visitsOnDate, nextVisitDate, searchCustomers, visitCountByDate,
} from '../js/customers-logic.js';

const custs = [
  { id: 'a', name: '田中さん', birthday: '03-15' },
  { id: 'b', name: 'サトウ', birthday: '07-02' },
  { id: 'c', name: '鈴木', birthday: '' },
];
const visits = [
  { id: 'v1', customerId: 'a', date: '2026-07-06', done: false },
  { id: 'v2', customerId: 'a', date: '2026-07-10', done: false },
  { id: 'v3', customerId: 'b', date: '2026-07-06', done: true },
  { id: 'v4', customerId: 'a', date: '2026-06-30', done: false },
];

test('birthdaysInMonth: 当月の誕生日のみを日付順で返す', () => {
  const r = birthdaysInMonth(custs, '2026-07');
  assert.deepEqual(r.map((c) => c.id), ['b']);
  assert.equal(birthdaysInMonth(custs, '2026-03')[0].id, 'a');
  assert.equal(birthdaysInMonth(custs, '2026-12').length, 0);
});

test('addDaysIso: ローカル日付でn日加算（月跨ぎ）', () => {
  assert.equal(addDaysIso('2026-07-06', 7), '2026-07-13');
  assert.equal(addDaysIso('2026-07-30', 3), '2026-08-02');
});

test('upcomingVisits: today〜+days の未完了を昇順・顧客名付き', () => {
  const r = upcomingVisits(visits, custs, '2026-07-06', 7);
  assert.deepEqual(r.map((v) => v.id), ['v1', 'v2']); // v3=done除外, v4=過去除外
  assert.equal(r[0].customerName, '田中さん');
});

test('visitsOnDate: 指定日の来店予定を顧客名付きで', () => {
  const r = visitsOnDate(visits, custs, '2026-07-06');
  assert.deepEqual(r.map((v) => v.id).sort(), ['v1', 'v3']);
});

test('nextVisitDate: today以降・未完了の最早', () => {
  assert.equal(nextVisitDate(visits, 'a', '2026-07-06'), '2026-07-06');
  assert.equal(nextVisitDate(visits, 'a', '2026-07-07'), '2026-07-10');
  assert.equal(nextVisitDate(visits, 'b', '2026-07-06'), ''); // doneのみ
});

test('searchCustomers: 名前部分一致・空クエリは全件', () => {
  assert.equal(searchCustomers(custs, '').length, 3);
  assert.deepEqual(searchCustomers(custs, '田中').map((c) => c.id), ['a']);
  assert.equal(searchCustomers(custs, 'いない').length, 0);
});

test('visitCountByDate: 日付ごとの件数', () => {
  const m = visitCountByDate(visits);
  assert.equal(m.get('2026-07-06'), 2);
  assert.equal(m.get('2026-07-10'), 1);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test tests/customers-logic.test.js`
Expected: FAIL（`Cannot find module '../js/customers-logic.js'`）

- [ ] **Step 3: `js/customers-logic.js` を実装**

```js
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

// today〜today+days（両端含む）の未完了来店予定を日付昇順・顧客名付きで
export function upcomingVisits(visits, customers, today, days = 7) {
  const until = addDaysIso(today, days);
  const nameById = new Map(customers.map((c) => [c.id, c.name]));
  return visits
    .filter((v) => !v.done && v.date >= today && v.date <= until)
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

// 名前で顧客を絞り込み（部分一致・大文字小文字無視）。名前昇順で返す
export function searchCustomers(customers, query) {
  const q = (query || '').trim().toLowerCase();
  const sorted = [...customers].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ja'));
  if (!q) return sorted;
  return sorted.filter((c) => (c.name || '').toLowerCase().includes(q));
}

// 日付ごとの来店予定件数 Map<date, count>（カレンダーバッジ用）
export function visitCountByDate(visits) {
  const m = new Map();
  for (const v of visits) m.set(v.date, (m.get(v.date) || 0) + 1);
  return m;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test tests/customers-logic.test.js`
Expected: PASS（7テスト）

- [ ] **Step 5: 既存テストも壊れていないことを確認**

Run: `node --test`
Expected: すべて PASS

- [ ] **Step 6: コミット**

```bash
git add js/customers-logic.js tests/customers-logic.test.js
git commit -m "feat(customers): 顧客・来店予定の純粋ロジック＋テスト"
```

---

### Task 4: 顧客タブUI `js/ui/customers.js`（一覧・詳細・入力・来店予定）

**Files:**
- Create: `js/ui/customers.js`
- Modify: `css/style.css`（末尾に追記）

- [ ] **Step 1: `js/ui/customers.js` を作成**

```js
import { state, loadAll } from '../state.js';
import { put, del, uid } from '../db.js';
import { esc, shortDateJa, todayIso } from '../format.js';
import { searchCustomers, nextVisitDate } from '../customers-logic.js';

let query = '';      // 検索文字列（再描画で保持）
let editingId = null; // フォーム編集中の顧客id（新規は null）

export async function renderCustomers(el) {
  query = '';
  drawList(el);
}

// ===== 顧客フォーム（ボトムシート）=====
function sheetMarkup() {
  return `
    <div class="sheet-backdrop" id="custSheetBg" hidden></div>
    <section class="sheet" id="custSheet" hidden aria-label="顧客入力">
      <div class="sheet-handle"></div>
      <div class="row" style="justify-content:space-between;align-items:center">
        <h3 id="custSheetTitle" style="margin:0">顧客を追加</h3>
        <button id="custSheetClose" type="button" style="border:none;background:none;font-size:20px;color:var(--muted)">✕</button>
      </div>
      <form id="custForm" style="margin-top:8px">
        <div class="field"><label>名前 / 源氏名</label><input id="fName" class="inline-input" type="text" maxlength="40" required style="width:100%"></div>
        <div class="field"><label>連絡先（LINE/電話など）</label><input id="fContact" class="inline-input" type="text" maxlength="60" style="width:100%"></div>
        <div class="field"><label>誕生日</label><input id="fBday" class="inline-input" type="text" inputmode="numeric" placeholder="MM-DD 例: 03-15" maxlength="5" style="width:100%"></div>
        <div class="field"><label>好みのボトル・ドリンク</label><input id="fBottle" class="inline-input" type="text" maxlength="40" style="width:100%"></div>
        <div class="field"><label>メモ</label><input id="fMemo" class="inline-input" type="text" maxlength="120" style="width:100%"></div>
        <button class="btn" type="submit" style="margin-top:10px">保存</button>
      </form>
    </section>`;
}

function openForm(el, customer) {
  editingId = customer ? customer.id : null;
  const sheet = el.querySelector('#custSheet');
  const bg = el.querySelector('#custSheetBg');
  el.querySelector('#custSheetTitle').textContent = customer ? '顧客を編集' : '顧客を追加';
  el.querySelector('#fName').value = customer ? customer.name : '';
  el.querySelector('#fContact').value = customer ? (customer.contact || '') : '';
  el.querySelector('#fBday').value = customer ? (customer.birthday || '') : '';
  el.querySelector('#fBottle').value = customer ? (customer.favoriteBottle || '') : '';
  el.querySelector('#fMemo').value = customer ? (customer.memo || '') : '';
  sheet.hidden = false; bg.hidden = false;
  requestAnimationFrame(() => { sheet.classList.add('show'); bg.classList.add('show'); });
  el.querySelector('#fName').focus();
}

function wireSheet(el) {
  const sheet = el.querySelector('#custSheet');
  const bg = el.querySelector('#custSheetBg');
  const close = () => {
    sheet.classList.remove('show'); bg.classList.remove('show');
    setTimeout(() => { sheet.hidden = true; bg.hidden = true; }, 250);
  };
  el.querySelector('#custSheetClose').onclick = close;
  bg.onclick = close;
  el.querySelector('#custForm').onsubmit = async (e) => {
    e.preventDefault();
    const name = el.querySelector('#fName').value.trim();
    if (!name) return;
    const bday = el.querySelector('#fBday').value.trim();
    const base = editingId ? state.customers.find((c) => c.id === editingId) : null;
    await put('customers', {
      id: editingId || uid(),
      name,
      contact: el.querySelector('#fContact').value.trim(),
      birthday: /^\d{2}-\d{2}$/.test(bday) ? bday : '',
      favoriteBottle: el.querySelector('#fBottle').value.trim(),
      memo: el.querySelector('#fMemo').value.trim(),
      createdAt: base ? base.createdAt : Date.now(),
    });
    const savedId = editingId;
    await loadAll();
    close();
    if (savedId) drawDetail(el, savedId); else drawList(el);
  };
}

// ===== 一覧 =====
function drawList(el) {
  const today = todayIso();
  const list = searchCustomers(state.customers, query);
  const cardHtml = list.length === 0
    ? `<p class="muted" style="text-align:center;margin-top:24px">${
        state.customers.length ? '該当する顧客がいません。' : '「＋顧客を追加」から登録できます。'}</p>`
    : list.map((c) => {
        const nv = nextVisitDate(state.visits, c.id, today);
        return `<button class="cust-card" data-id="${esc(c.id)}" type="button">
          <div class="cust-name">${esc(c.name)}</div>
          <div class="muted cust-sub">${nv ? '次回来店 ' + shortDateJa(nv) : '来店予定なし'}</div>
        </button>`;
      }).join('');

  el.innerHTML = `
    <div class="row" style="justify-content:space-between;align-items:center">
      <h2 style="margin:0">顧客リスト</h2>
      <span class="muted">${state.customers.length}人</span>
    </div>
    <input id="custSearch" class="inline-input" type="search" placeholder="名前で検索…"
      value="${esc(query)}" autocomplete="off" style="width:100%;margin:12px 0">
    <div class="cust-list">${cardHtml}</div>
    <button class="btn" id="custAdd" type="button" style="margin-top:14px">＋顧客を追加</button>
    ${sheetMarkup()}`;

  const search = el.querySelector('#custSearch');
  search.oninput = () => {
    const pos = search.selectionStart;
    query = search.value;
    drawList(el);
    const s2 = el.querySelector('#custSearch');
    s2.focus(); s2.setSelectionRange(pos, pos);
  };
  el.querySelectorAll('.cust-card').forEach((b) => {
    b.onclick = () => drawDetail(el, b.dataset.id);
  });
  el.querySelector('#custAdd').onclick = () => openForm(el, null);
  wireSheet(el);
}

// ===== 詳細 =====
function drawDetail(el, id) {
  const c = state.customers.find((x) => x.id === id);
  if (!c) { drawList(el); return; }
  const today = todayIso();
  const mine = state.visits.filter((v) => v.customerId === id);
  const future = mine.filter((v) => v.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = mine.filter((v) => v.date < today).sort((a, b) => b.date.localeCompare(a.date));

  const info = (label, val) => val
    ? `<div class="cust-info-row"><span class="muted">${label}</span><span>${esc(val)}</span></div>` : '';
  const bdayLabel = c.birthday ? `${Number(c.birthday.slice(0, 2))}月${Number(c.birthday.slice(3, 5))}日` : '';

  const visitLi = (v) => `
    <li class="visit-item ${v.done ? 'done' : ''}" data-id="${esc(v.id)}">
      <button class="todo-check" type="button" aria-label="${v.done ? '未来店に戻す' : '来店済みにする'}">${v.done ? '✓' : ''}</button>
      <div class="visit-main">
        <span class="visit-date">${shortDateJa(v.date)}</span>
        ${v.note ? `<span class="muted visit-note">${esc(v.note)}</span>` : ''}
      </div>
      <button class="visit-del" type="button" aria-label="削除">✕</button>
    </li>`;

  el.innerHTML = `
    <button class="btn btn-ghost" id="custBack" type="button" style="width:auto;padding:6px 14px">‹ 一覧へ</button>
    <div class="card" style="margin-top:12px">
      <div class="row" style="justify-content:space-between;align-items:center">
        <h2 style="margin:0">${esc(c.name)}</h2>
        <button id="custEdit" class="btn btn-ghost" type="button" style="width:auto;padding:6px 12px">編集</button>
      </div>
      <div style="margin-top:10px">
        ${info('連絡先', c.contact)}
        ${info('誕生日', bdayLabel)}
        ${info('好みのボトル', c.favoriteBottle)}
        ${info('メモ', c.memo)}
        ${!c.contact && !bdayLabel && !c.favoriteBottle && !c.memo ? '<span class="muted">情報未登録</span>' : ''}
      </div>
    </div>

    <div class="card">
      <div class="row" style="justify-content:space-between;align-items:center">
        <h3 style="margin:0">来店予定</h3>
        <button id="visitAdd" class="btn btn-ghost" type="button" style="width:auto;padding:6px 12px">＋予定</button>
      </div>
      <form id="visitForm" hidden style="margin-top:10px">
        <div class="field"><label>来店日</label><input id="vDate" type="date" value="${today}"></div>
        <div class="field"><label>メモ（任意）</label><input id="vNote" class="inline-input" type="text" maxlength="60" placeholder="同伴・イベント等" style="width:100%"></div>
        <div class="row" style="gap:8px;margin-top:8px">
          <button type="button" class="btn btn-ghost" id="vCancel" style="flex:1">キャンセル</button>
          <button type="submit" class="btn" style="flex:1">追加</button>
        </div>
      </form>
      ${future.length ? `<ul class="visit-list">${future.map(visitLi).join('')}</ul>`
        : '<p class="muted" style="margin:10px 0 0">今後の来店予定はありません。</p>'}
      ${past.length ? `<div class="muted" style="margin:14px 0 4px">来店履歴</div>
        <ul class="visit-list past">${past.map(visitLi).join('')}</ul>` : ''}
    </div>

    <button class="btn btn-ghost" id="custDelete" type="button" style="color:#f55;margin-top:4px">この顧客を削除</button>
    ${sheetMarkup()}`;

  el.querySelector('#custBack').onclick = () => drawList(el);
  el.querySelector('#custEdit').onclick = () => openForm(el, c);

  const vForm = el.querySelector('#visitForm');
  el.querySelector('#visitAdd').onclick = () => { vForm.hidden = false; el.querySelector('#vDate').focus(); };
  el.querySelector('#vCancel').onclick = () => { vForm.hidden = true; };
  vForm.onsubmit = async (e) => {
    e.preventDefault();
    const date = el.querySelector('#vDate').value;
    if (!date) return;
    const note = el.querySelector('#vNote').value.trim();
    await put('visits', { id: uid(), customerId: id, date, note, done: false, createdAt: Date.now() });
    await loadAll();
    drawDetail(el, id);
  };

  el.querySelectorAll('.visit-item').forEach((li) => {
    const v = state.visits.find((x) => x.id === li.dataset.id);
    li.querySelector('.todo-check').onclick = async () => {
      await put('visits', { ...v, done: !v.done });
      await loadAll();
      drawDetail(el, id);
    };
    li.querySelector('.visit-del').onclick = async () => {
      await del('visits', v.id);
      await loadAll();
      drawDetail(el, id);
    };
  });

  el.querySelector('#custDelete').onclick = async () => {
    if (!confirm(`「${c.name}」を削除します。よろしいですか？（来店予定も削除・元に戻せません）`)) return;
    await Promise.all(state.visits.filter((v) => v.customerId === id).map((v) => del('visits', v.id)));
    await del('customers', id);
    await loadAll();
    drawList(el);
  };

  wireSheet(el);
}
```

- [ ] **Step 2: `css/style.css` の末尾に顧客用スタイルを追記**

```css
/* ===== 顧客管理 ===== */
.cust-list { display: flex; flex-direction: column; gap: 10px; }
.cust-card { text-align: left; background: var(--card); border: none; border-radius: 14px;
  box-shadow: var(--shadow); padding: 14px 16px; width: 100%; }
.cust-name { font-weight: 700; font-size: 16px; color: var(--ink); }
.cust-sub { margin-top: 2px; }
.cust-info-row { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0;
  border-bottom: 1px solid #f2f2f2; }
.cust-info-row:last-child { border-bottom: none; }
.visit-list { list-style: none; padding: 0; margin: 10px 0 0; }
.visit-list.past { opacity: .7; }
.visit-item { display: flex; align-items: center; gap: 10px; padding: 8px 0; }
.visit-item.done .visit-date, .visit-item.done .visit-note { text-decoration: line-through; color: var(--muted); }
.visit-main { flex: 1; display: flex; flex-direction: column; }
.visit-date { font-weight: 600; }
.visit-note { font-size: 12px; }
.visit-del { border: none; background: none; color: var(--muted); font-size: 16px; }
```

- [ ] **Step 3: 構文チェック（import解決）**

Run: `node --check js/ui/customers.js`
Expected: エラーなし（終了コード0）

- [ ] **Step 4: コミット**

```bash
git add js/ui/customers.js css/style.css
git commit -m "feat(customers): 顧客一覧・詳細・入力・来店予定UI"
```

---

### Task 5: ナビゲーション（下タブ入替・ルート追加）

**Files:**
- Modify: `index.html:25-26`, `js/app.js:1-13`

- [ ] **Step 1: 下タブの settings を customers に入替**

`index.html` の tabbar 内、`settings` ボタン行を置換:

```html
    <button data-tab="report">📊<span>レポート</span></button>
    <button data-tab="customers">👤<span>顧客</span></button>
```

（`⚙️設定` タブは削除。設定へはホーム右上の⚙️から到達する＝Task 6）

- [ ] **Step 2: app.js に customers ルートを追加**

`js/app.js` の import 群に追加（`renderSettings` の import の下）:

```js
import { renderSettings } from './ui/settings.js';
import { renderCustomers } from './ui/customers.js';
```

`renderers` を更新（settings はルートとして残す）:

```js
const renderers = {
  home: renderHome, calendar: renderCalendar, record: renderRecord,
  report: renderReport, customers: renderCustomers, settings: renderSettings,
};
```

- [ ] **Step 3: 構文チェック**

Run: `node --check js/app.js`
Expected: エラーなし

- [ ] **Step 4: コミット**

```bash
git add index.html js/app.js
git commit -m "feat(nav): 顧客タブを追加し設定をタブから外す"
```

---

### Task 6: ホーム連携（設定⚙️ボタン＋誕生日/近日来店カード）

**Files:**
- Modify: `js/ui/home.js`（import・render・イベント）, `css/style.css`（末尾追記）

- [ ] **Step 1: home.js に import を追加**

`js/ui/home.js` の import 群に追加:

```js
import { birthdaysInMonth, upcomingVisits } from '../customers-logic.js';
```

- [ ] **Step 2: 計算とカードHTMLを用意**

`renderHome` 内、`const activeAnn = ...` の行の直前に追記:

```js
  const bdays = birthdaysInMonth(state.customers, state.month);
  const upcoming = upcomingVisits(state.visits, state.customers, today, 7);
  const custHintHtml = (bdays.length || upcoming.length) ? `
    <div class="card cust-hint">
      ${upcoming.length ? `<div class="cust-hint-block">
        <div class="cust-hint-head">👤 近日の来店予定</div>
        <ul>${upcoming.map((v) => `<li>${shortDateJa(v.date)} ・ ${esc(v.customerName)}${v.note ? '（' + esc(v.note) + '）' : ''}</li>`).join('')}</ul>
      </div>` : ''}
      ${bdays.length ? `<div class="cust-hint-block">
        <div class="cust-hint-head">🎂 今月お誕生日</div>
        <ul>${bdays.map((c) => `<li>${Number(c.birthday.slice(0, 2))}/${Number(c.birthday.slice(3, 5))} ・ ${esc(c.name)}</li>`).join('')}</ul>
      </div>` : ''}
    </div>` : '';
```

- [ ] **Step 3: 「本日の予定」カードのヘッダーに⚙️を足し、ヒントカードを差し込む**

`js/ui/home.js` の「本日の予定」カード見出し行を置換:

置換前:
```js
      <div class="row" style="justify-content:space-between;align-items:center">
        <h3 style="margin:0">📅 本日の予定</h3>
        <span class="muted">${shortDateJa(today)}</span>
      </div>
```
置換後:
```js
      <div class="row" style="justify-content:space-between;align-items:center">
        <h3 style="margin:0">📅 本日の予定</h3>
        <div style="display:flex;align-items:center;gap:12px">
          <span class="muted">${shortDateJa(today)}</span>
          <button id="homeSettings" type="button" aria-label="設定" style="border:none;background:none;font-size:20px;cursor:pointer;padding:0;line-height:1">⚙️</button>
        </div>
      </div>
```

同じ `el.innerHTML` テンプレート内、`<div id="reminder"></div>` の直後に `${custHintHtml}` を挿入:

置換前:
```js
    <div id="reminder"></div>

    <div class="card estimate-card">
```
置換後:
```js
    <div id="reminder"></div>
    ${custHintHtml}

    <div class="card estimate-card">
```

- [ ] **Step 4: ⚙️のクリックで設定へ遷移する配線を追加**

`renderHome` 末尾、`el.querySelector('#toCal').onclick = ...` の行の下に追記（`navigate` は既にimport済み）:

```js
  el.querySelector('#homeSettings').onclick = () => navigate('settings');
```

- [ ] **Step 5: `css/style.css` の末尾にヒント用スタイルを追記**

```css
.cust-hint .cust-hint-block + .cust-hint-block { margin-top: 12px; }
.cust-hint-head { font-weight: 700; margin-bottom: 4px; }
.cust-hint ul { list-style: none; padding: 0; margin: 0; }
.cust-hint li { padding: 3px 0; font-size: 14px; }
```

- [ ] **Step 6: 構文チェック**

Run: `node --check js/ui/home.js`
Expected: エラーなし

- [ ] **Step 7: コミット**

```bash
git add js/ui/home.js css/style.css
git commit -m "feat(home): 設定⚙️導線と誕生日/近日来店カードを追加"
```

---

### Task 7: カレンダー連携（来店バッジ＋日別シートの来店セクション）

**Files:**
- Modify: `js/ui/calendar.js`（import・セル・シート）, `css/style.css`（末尾追記）

- [ ] **Step 1: calendar.js に import を追加**

`js/ui/calendar.js` の import 群に追加:

```js
import { visitCountByDate, visitsOnDate } from '../customers-logic.js';
```

- [ ] **Step 2: 来店件数マップを用意しセルにバッジを出す**

`todosByDate` を作るブロックの直後に追記:

```js
  const visitsByDate = visitCountByDate(state.visits);
```

セル生成部の `const todoMark = ...` の直後に追記:

```js
    const vCount = visitsByDate.get(iso) || 0;
    const visitMark = vCount ? `<div class="cal-visit">👤${vCount > 1 ? vCount : ''}</div>` : '';
```

セルのテンプレート文字列に `${visitMark}` を追加:

置換前:
```js
    cells.push(`<div class="cal-cell ${cls}" data-date="${esc(iso)}">
      <div class="cal-day">${d}</div>${body}${todoMark}</div>`);
```
置換後:
```js
    cells.push(`<div class="cal-cell ${cls}" data-date="${esc(iso)}">
      <div class="cal-day">${d}</div>${body}${todoMark}${visitMark}</div>`);
```

- [ ] **Step 3: 日別シートに「この日の来店予定」セクションを追加**

`renderSheet` 内、`const dayTodosHtml = ...` ブロックの直後に追記:

```js
    const dayVisits = visitsOnDate(state.visits, state.customers, draft.date);
    const dayVisitsHtml = dayVisits.length ? `
      <div class="sheet-visits">
        <div class="muted" style="margin-bottom:4px">👤 この日の来店予定</div>
        <ul>${dayVisits.map((v) => `<li class="visit-line ${v.done ? 'done' : ''}" data-id="${esc(v.id)}">
          <button class="todo-check" type="button" aria-label="${v.done ? '未来店に戻す' : '来店済みにする'}">${v.done ? '✓' : ''}</button>
          <span>${esc(v.customerName)}${v.note ? ' ・ ' + esc(v.note) : ''}</span></li>`).join('')}</ul>
      </div>` : '';
```

`body.innerHTML` テンプレートの先頭で `${dayTodosHtml}` の直後に `${dayVisitsHtml}` を挿入:

置換前:
```js
    body.innerHTML = `
      ${dayTodosHtml}
      <div class="row">
```
置換後:
```js
    body.innerHTML = `
      ${dayTodosHtml}
      ${dayVisitsHtml}
      <div class="row">
```

- [ ] **Step 4: 来店トグルを配線（インセンティブ入力を消さず、その行だけ更新）**

`body.innerHTML = ...` を設定した後、チップ配線（`const chipGrid = q('#chipGrid');`）の直前に追記:

```js
    body.querySelectorAll('.visit-line').forEach((li) => {
      const vid = li.dataset.id;
      li.querySelector('.todo-check').onclick = async () => {
        const v = state.visits.find((x) => x.id === vid);
        if (!v) return;
        await put('visits', { ...v, done: !v.done });
        await loadAll();
        const nv = state.visits.find((x) => x.id === vid);
        li.classList.toggle('done', !!(nv && nv.done));
        li.querySelector('.todo-check').textContent = nv && nv.done ? '✓' : '';
      };
    });
```

（注: シート全体を再描画すると入力途中のインセンティブ件数が失われるため、該当行のDOMだけを更新する）

- [ ] **Step 5: `css/style.css` の末尾にカレンダー来店用スタイルを追記**

```css
.cal-visit { color: var(--purple); font-size: 9px; font-weight: 700; margin-top: 1px; }
.sheet-visits { background: var(--pink-soft); border-radius: 10px; padding: 8px 10px; margin-bottom: 10px; }
.sheet-visits ul { list-style: none; padding: 0; margin: 0; }
.visit-line { display: flex; align-items: center; gap: 8px; padding: 3px 0; }
.visit-line.done span { text-decoration: line-through; color: var(--muted); }
```

- [ ] **Step 6: 構文チェック**

Run: `node --check js/ui/calendar.js`
Expected: エラーなし

- [ ] **Step 7: コミット**

```bash
git add js/ui/calendar.js css/style.css
git commit -m "feat(calendar): 来店予定バッジと日別シートの来店セクション"
```

---

### Task 8: SWキャッシュ更新＋通し動作確認

**Files:**
- Modify: `service-worker.js:1`（CACHE）, `service-worker.js:2-11`（ASSETS）

- [ ] **Step 1: キャッシュ版を v39 に上げ、新規JSをASSETSに追記**

`service-worker.js` 1行目:

```js
const CACHE = 'yashoku-v39';
```

ASSETS 配列の JS 行に `customers-logic.js` と `ui/customers.js` を追記:

```js
  './js/app.js', './js/state.js', './js/db.js', './js/calc.js', './js/format.js',
  './js/customers-logic.js',
  './js/ui/home.js', './js/ui/calendar.js', './js/ui/record.js',
  './js/ui/report.js', './js/ui/settings.js', './js/ui/donut.js',
  './js/ui/backfields.js', './js/ui/todos.js', './js/ui/customers.js',
```

- [ ] **Step 2: 全テスト実行**

Run: `node --test`
Expected: すべて PASS（既存＋customers-logic 7件）

- [ ] **Step 3: ローカルでSWキャッシュ回避のため別ポートで起動して目視**

Run: `python3 -m http.server 8123`
（別ポート＝別オリジンで旧SWキャッシュを回避。ブラウザで http://localhost:8123 を開く）

確認シナリオ:
1. 👤顧客タブが下バーに出る／設定タブは消え、ホーム右上⚙️で設定へ行ける
2. 顧客を追加→一覧に表示→タップで詳細
3. 詳細で来店予定を追加（今日＋数日後）→一覧カードに「次回来店」が出る
4. カレンダーの該当日に 👤 バッジ→日タップで「この日の来店予定」が出て、来た✓トグルが効く（インセンティブ入力が消えない）
5. ホームに「近日の来店予定」／当月誕生日があれば「今月お誕生日」カードが出る
6. 顧客を編集・削除、来店予定を削除できる
7. リロードしても顧客・来店・既存データ（シフト/Todo）が残る（DB v3マイグレーションでデータ保持）

- [ ] **Step 4: コミット**

```bash
git add service-worker.js
git commit -m "chore(sw): 顧客管理アセット追加・キャッシュ v39"
```

- [ ] **Step 5: （ユーザー確認後）公開**

目視OKをユーザーが確認したら push:

```bash
git push origin master
```

Pages反映後、`https://poka-tools.github.io/lumi-app/` をハードリロードして確認。

---

## Self-Review メモ
- スペック各要件 → タスク対応: 顧客モデル(Task1,4) / 来店予定(Task1,4) / カレンダー表示(Task7) / ホーム表示(Task6) / タブ入替＋設定⚙️(Task5,6) / DB v3(Task1) / テスト(Task3)。ランク機能はスペック通り不採用（含めていない）。
- 型整合: `visit.done`/`customer.birthday("MM-DD")` は全タスクで一貫。純粋関数名（`birthdaysInMonth`/`upcomingVisits`/`visitsOnDate`/`nextVisitDate`/`searchCustomers`/`visitCountByDate`/`addDaysIso`）はテスト・UI・カレンダー・ホームで同一。
- プレースホルダなし（全ステップに実コード／実コマンド）。
