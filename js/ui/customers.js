import { state, loadAll } from '../state.js';
import { put, del, uid } from '../db.js';
import { esc, shortDateJa, todayIso } from '../format.js';
import { searchCustomers, sortCustomers, nextVisitDate, doneVisitCount, notesForCustomer } from '../customers-logic.js';
import { drawEventsSection } from './events.js';
import { confirmModal } from './confirm.js';

let query = '';      // 検索文字列（再描画で保持）
let sortKey = 'name'; // 並び替えキー（再描画で保持）
let editingId = null; // フォーム編集中の顧客id（新規は null）

const SORTS = [
  { key: 'name', label: '名前' },
  { key: 'next', label: '来店予定' },
  { key: 'new', label: '新着' },
  { key: 'visits', label: '来店回数' },
];

export async function renderCustomers(el) {
  query = '';
  sortKey = 'name';
  drawList(el);
}

// ===== 顧客フォーム（ボトムシート）=====
const pad2 = (n) => String(n).padStart(2, '0');
// タイムスタンプ(ms)→ローカルISO日付("YYYY-MM-DD")。メモの表示日付に使う。
function isoFromTs(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
// from〜to の <option>（value はゼロ埋め、表示は数値＋suffix）
function rangeOptions(from, to, suffix = '') {
  let s = '';
  for (let i = from; i <= to; i++) s += `<option value="${pad2(i)}">${i}${suffix}</option>`;
  return s;
}

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
        <div class="field"><label>誕生日</label>
          <div class="row" style="gap:8px">
            <select id="fBdayMonth" class="inline-input" style="flex:1"><option value="">月</option>${rangeOptions(1, 12, '月')}</select>
            <select id="fBdayDay" class="inline-input" style="flex:1"><option value="">日</option>${rangeOptions(1, 31, '日')}</select>
          </div>
        </div>
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
  const bd = customer && customer.birthday ? customer.birthday : '';
  el.querySelector('#fBdayMonth').value = bd ? bd.slice(0, 2) : '';
  el.querySelector('#fBdayDay').value = bd ? bd.slice(3, 5) : '';
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
    const bm = el.querySelector('#fBdayMonth').value;
    const bday = el.querySelector('#fBdayDay').value;
    const base = editingId ? state.customers.find((c) => c.id === editingId) : null;
    await put('customers', {
      id: editingId || uid(),
      name,
      contact: el.querySelector('#fContact').value.trim(),
      birthday: bm && bday ? `${bm}-${bday}` : '',
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
  const filtered = searchCustomers(state.customers, query);
  const list = sortCustomers(filtered, sortKey, { visits: state.visits, today });
  const cardHtml = list.length === 0
    ? `<p class="muted" style="text-align:center;margin-top:24px">${
        state.customers.length ? '該当する顧客がいません。' : '「＋顧客を追加」から登録できます。'}</p>`
    : list.map((c) => {
        const sub = sortKey === 'visits'
          ? `来店 ${doneVisitCount(state.visits, c.id)}回`
          : (() => {
              const nv = nextVisitDate(state.visits, c.id, today);
              return nv ? '次回来店 ' + shortDateJa(nv) : '来店予定なし';
            })();
        return `<button class="cust-card" data-id="${esc(c.id)}" type="button">
          <div class="cust-name">${esc(c.name)}</div>
          <div class="muted cust-sub">${sub}</div>
        </button>`;
      }).join('');

  const sortTabsHtml = SORTS.map((s) =>
    `<button class="sort-chip${s.key === sortKey ? ' active' : ''}" type="button" data-sort="${s.key}">${s.label}</button>`
  ).join('');

  el.innerHTML = `
    <div class="seg cust-seg">
      <button class="seg-btn active" type="button" data-sec="customers">顧客</button>
      <button class="seg-btn" type="button" data-sec="events">イベント</button>
    </div>
    <div class="row" style="justify-content:space-between;align-items:center">
      <h2 style="margin:0">顧客リスト</h2>
      <span class="muted">${state.customers.length}人</span>
    </div>
    <input id="custSearch" class="inline-input" type="search" placeholder="名前で検索…"
      value="${esc(query)}" autocomplete="off" style="width:100%;margin:12px 0 8px">
    <div class="sort-tabs" id="sortTabs">${sortTabsHtml}</div>
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
  el.querySelectorAll('.sort-chip').forEach((b) => {
    b.onclick = () => { sortKey = b.dataset.sort; drawList(el); };
  });
  el.querySelectorAll('.cust-card').forEach((b) => {
    b.onclick = () => drawDetail(el, b.dataset.id);
  });
  el.querySelector('#custAdd').onclick = () => openForm(el, null);
  el.querySelector('.cust-seg [data-sec="events"]').onclick =
    () => drawEventsSection(el, { goCustomers: () => drawList(el) });
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

  const noteRows = notesForCustomer(state.notes, id);
  const noteLi = (n) => `
    <li class="note-item" data-id="${esc(n.id)}">
      <div class="note-main">
        <span class="muted note-date">${shortDateJa(isoFromTs(n.createdAt))}</span>
        <span class="note-text">${esc(n.text)}</span>
      </div>
      <button class="note-del" type="button" aria-label="削除">✕</button>
    </li>`;

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
        ${info('ひとこと', c.memo)}
        ${!c.contact && !bdayLabel && !c.favoriteBottle && !c.memo ? '<span class="muted">情報未登録</span>' : ''}
      </div>
    </div>

    <div class="card">
      <h3 style="margin:0 0 8px">📝 メモ</h3>
      <form id="noteForm" class="row" style="gap:8px;align-items:flex-start">
        <textarea id="noteText" class="inline-input" rows="1" maxlength="500"
          placeholder="話した内容・好み・約束など…" style="width:100%;flex:1;resize:vertical;min-height:38px"></textarea>
        <button type="submit" class="btn" style="width:auto;padding:8px 14px;flex:0 0 auto">＋追加</button>
      </form>
      ${noteRows.length ? `<ul class="note-list">${noteRows.map(noteLi).join('')}</ul>`
        : '<p class="muted" style="margin:10px 0 0">まだメモはありません。</p>'}
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

  el.querySelector('#noteForm').onsubmit = async (e) => {
    e.preventDefault();
    const ta = el.querySelector('#noteText');
    const text = ta.value.trim();
    if (!text) return;
    await put('notes', { id: uid(), customerId: id, text, createdAt: Date.now() });
    await loadAll();
    drawDetail(el, id);
  };
  el.querySelectorAll('.note-item').forEach((li) => {
    li.querySelector('.note-del').onclick = async () => {
      const n = state.notes.find((x) => x.id === li.dataset.id);
      if (!(await confirmModal('このメモを削除します。よろしいですか？'))) return;
      await del('notes', n.id);
      await loadAll();
      drawDetail(el, id);
    };
  });

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
    if (!(await confirmModal(`「${c.name}」を削除します。よろしいですか？（来店予定・メモも削除・元に戻せません）`))) return;
    await Promise.all(state.visits.filter((v) => v.customerId === id).map((v) => del('visits', v.id)));
    await Promise.all(state.notes.filter((n) => n.customerId === id).map((n) => del('notes', n.id)));
    await del('customers', id);
    await loadAll();
    drawList(el);
  };

  wireSheet(el);
}
