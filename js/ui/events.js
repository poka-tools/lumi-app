import { state, loadAll } from '../state.js';
import { put, del, uid, saveProfile } from '../db.js';
import { esc, yen, shortDateJa, todayIso } from '../format.js';
import { toast } from './toast.js';
import { confirmModal } from './confirm.js';
import {
  TIMINGS, timingLabel, resolveResName, reservationsOfEvent,
  eventTotals, reservationCountByEvent, sortEvents, buildEventClone, cloneReservation,
  autoAmount, reservationBack, reservationItems, reservationSales, reservationSummary, itemBack,
} from '../events-logic.js';

// イベントと配下の予約名簿をまとめて削除（一覧・詳細で共用）
async function deleteEventById(id) {
  await Promise.all(state.reservations.filter((r) => r.eventId === id).map((r) => del('reservations', r.id)));
  await del('events', id);
  await loadAll();
}

// 顧客タブ上部の「顧客 / イベント」切替セグメント（顧客側から渡される goCustomers で顧客へ戻る）
function sectionSeg(active, goCustomers) {
  const wrap = document.createElement('div');
  wrap.className = 'seg cust-seg';
  wrap.innerHTML = `
    <button class="seg-btn${active === 'customers' ? ' active' : ''}" type="button" data-sec="customers">顧客</button>
    <button class="seg-btn${active === 'events' ? ' active' : ''}" type="button" data-sec="events">イベント</button>`;
  wrap.querySelector('[data-sec="customers"]').onclick = () => goCustomers && goCustomers();
  return wrap.outerHTML;
}

// customers.js から呼ばれる入口。イベント一覧を表示する。
export function drawEventsSection(el, opts = {}) {
  drawEventList(el, opts);
}

let editingEventId = null; // イベント編集中のid（新規は null）
let editingResId = null;   // 予約編集中のid（新規は null）

// ===== イベント一覧 =====
function drawEventList(el, opts) {
  const events = sortEvents(state.events);
  const countByEvent = reservationCountByEvent(state.reservations);

  const cards = events.length === 0
    ? '<p class="muted" style="text-align:center;margin-top:24px">「＋イベントを作成」から生誕祭などの予約名簿を作れます。</p>'
    : events.map((ev) => {
        const t = eventTotals(state.reservations, ev.id);
        const n = countByEvent.get(ev.id) || 0;
        return `<div class="ev-row" data-id="${esc(ev.id)}">
          <button class="cust-card ev-open" type="button">
            <div class="cust-name">${esc(ev.name)}${ev.date ? ` <span class="ev-date">${shortDateJa(ev.date)}</span>` : ''}</div>
            <div class="muted cust-sub">予約${n}件${t.bottles ? ` ・ ${t.bottles}本` : ''}${t.amount ? ` ・ ${yen(t.amount)}` : ''}</div>
          </button>
          <button class="ev-del" type="button" aria-label="削除">🗑</button>
        </div>`;
      }).join('');

  el.innerHTML = `
    ${sectionSeg('events', opts.goCustomers)}
    <div class="row" style="justify-content:space-between;align-items:center">
      <h2 style="margin:0">イベント</h2>
      <span class="muted">${events.length}件</span>
    </div>
    <form id="evForm" hidden style="margin-top:12px" class="card">
      <div class="field"><label>イベント名</label><input id="eName" class="inline-input" type="text" maxlength="40" placeholder="生誕祭2026 など" required style="width:100%"></div>
      <div class="field"><label>開催日（任意）</label><input id="eDate" type="date"></div>
      <div class="field"><label>メモ（任意）</label><input id="eMemo" class="inline-input" type="text" maxlength="120" style="width:100%"></div>
      <div class="row" style="gap:8px;margin-top:8px">
        <button type="button" class="btn btn-ghost" id="eCancel" style="flex:1">キャンセル</button>
        <button type="submit" class="btn" style="flex:1">保存</button>
      </div>
    </form>
    <div class="cust-list" style="margin-top:12px">${cards}</div>
    <button class="btn" id="evAdd" type="button" style="margin-top:14px">＋イベントを作成</button>`;

  wireSeg(el, opts);

  const form = el.querySelector('#evForm');
  const openForm = (ev) => {
    editingEventId = ev ? ev.id : null;
    el.querySelector('#eName').value = ev ? ev.name : '';
    el.querySelector('#eDate').value = ev ? (ev.date || '') : '';
    el.querySelector('#eMemo').value = ev ? (ev.memo || '') : '';
    form.hidden = false;
    el.querySelector('#eName').focus();
  };
  el.querySelector('#evAdd').onclick = () => openForm(null);
  el.querySelector('#eCancel').onclick = () => { form.hidden = true; editingEventId = null; };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const name = el.querySelector('#eName').value.trim();
    if (!name) return;
    const base = editingEventId ? state.events.find((x) => x.id === editingEventId) : null;
    await put('events', {
      id: editingEventId || uid(),
      name,
      date: el.querySelector('#eDate').value || '',
      memo: el.querySelector('#eMemo').value.trim(),
      createdAt: base ? base.createdAt : Date.now(),
    });
    editingEventId = null;
    await loadAll();
    toast('保存しました');
    drawEventList(el, opts);
  };

  el.querySelectorAll('.ev-row').forEach((row) => {
    const id = row.dataset.id;
    row.querySelector('.ev-open').onclick = () => drawEventDetail(el, id, opts);
    row.querySelector('.ev-del').onclick = async () => {
      const ev = state.events.find((x) => x.id === id);
      if (!(await confirmModal(`「${ev.name}」を削除します。予約名簿もすべて削除されます。よろしいですか？（元に戻せません）`))) return;
      await deleteEventById(id);
      drawEventList(el, opts);
    };
  });
}

// ===== イベント詳細（予約名簿）=====
function drawEventDetail(el, eventId, opts) {
  const ev = state.events.find((x) => x.id === eventId);
  if (!ev) { drawEventList(el, opts); return; }
  const rows = reservationsOfEvent(state.reservations, eventId);
  const totals = eventTotals(state.reservations, eventId);

  // 名簿は種別順のフラットリスト（種別は名前の横にタグ表示）
  const groupHtml = rows.length
    ? `<ul class="res-list">${rows.map(resLi).join('')}</ul>`
    : '<p class="muted" style="margin:10px 0 0">まだ予約がありません。「＋予約を追加」から登録できます。</p>';

  const custOptions = ['<option value="">—</option>']
    .concat([...state.customers].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ja'))
      .map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`)).join('');
  const timingOptions = TIMINGS.map((t) => `<option value="${t.key}">${t.label}</option>`).join('');
  // 本数はスクロール選択（0=—〜30本）
  const countOptions = ['<option value="">—</option>']
    .concat(Array.from({ length: 30 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`)).join('');

  el.innerHTML = `
    ${sectionSeg('events', opts.goCustomers)}
    <button class="btn btn-ghost" id="evBack" type="button" style="width:auto;padding:6px 14px">‹ イベント一覧へ</button>
    <div class="card cust-profile" style="margin-top:12px">
      <div class="row" style="justify-content:space-between;align-items:center">
        <h2 style="margin:0">${esc(ev.name)}</h2>
        <div class="row" style="gap:6px;width:auto">
          <button id="evDup" class="btn btn-ghost" type="button" style="width:auto;padding:6px 12px">複製</button>
          <button id="evEdit" class="btn btn-ghost" type="button" style="width:auto;padding:6px 12px">編集</button>
        </div>
      </div>
      <div class="cust-info-block">
        ${ev.date ? `<div class="cust-info-row"><span class="muted">開催日</span><span>${shortDateJa(ev.date)}</span></div>` : ''}
        ${ev.memo ? `<div class="cust-info-row"><span class="muted">メモ</span><span>${esc(ev.memo)}</span></div>` : ''}
      </div>
      <div class="metric-grid" style="margin-top:12px;text-align:center">
        <div><span class="muted">予約</span><strong>${totals.count}件</strong></div>
        <div><span class="muted">数量</span><strong>${totals.bottles}</strong></div>
        <div><span class="muted">売上</span><strong>${yen(totals.amount)}</strong></div>
      </div>
      <div class="sheet-total" style="margin:10px 0 0">
        <span>歩合合計 <span class="muted">（対応済み分を計上）</span></span>
        <strong>${yen(totals.back)}</strong>
      </div>

      <div class="cust-sec">
      <div class="row" style="justify-content:space-between;align-items:center">
        <h3 class="cust-sec-title">📋 予約名簿</h3>
        <button id="resAdd" class="btn btn-ghost" type="button" style="width:auto;padding:6px 12px">＋予約を追加</button>
      </div>
      <p class="muted" style="font-size:12px;margin:6px 0 0;line-height:1.6">誰が何を予約したかを管理する一覧です。各行は「名前＋種別（当日/前祝い/後祝い）」と「商品名×数量」を表示します。決済が終わったら左の□に ✓（対応済み）を入れると、決済日にレポート／カレンダーの歩合へ計上されます。金額は上の集計・各予約の編集画面で確認できます。</p>
      <form id="resForm" hidden style="margin-top:10px">
        <div class="field"><label>参加者（顧客リストから選択）</label>
          <select id="rCust" class="inline-input" style="width:100%">${custOptions}</select></div>
        <div class="field" id="rNameField"><label>名前（未登録顧客の場合）</label>
          <input id="rName" class="inline-input" type="text" maxlength="40" placeholder="源氏名・呼び名など" style="width:100%"></div>
        <div class="field"><label>種別</label>
          <select id="rTiming" class="inline-input" style="width:100%">${timingOptions}</select></div>
        <div class="field"><label>決済日</label>
          <input id="rDate" type="date" class="inline-input" style="width:100%">
          <div class="muted" style="font-size:12px;margin-top:4px;line-height:1.5">設定した決済日を含む月のレポートと、その日のカレンダーに、✓（対応済み）の予約がイベント歩合として計上されます。</div>
          <label style="display:flex;align-items:center;gap:6px;margin-top:6px;font-size:13px;white-space:nowrap">
            <input id="rDateTBD" type="checkbox"> 未定（後祝いなど・決済前）
          </label>
          <div id="rTBDNote" style="font-size:12px;margin-top:6px;color:var(--pink);line-height:1.5" hidden>⚠ 未定の予約は歩合に計上されません。後日、決済日を入れて未定を外し ✓（対応済み）にすると計上されます。</div>
        </div>
        <h4 style="margin:14px 0 4px">商品（複数追加できます）</h4>
        <p class="muted" style="font-size:12px;margin:0 0 6px">一度入力した商品名は履歴に残ります。名前を選ぶと単価・歩合が自動で入ります。</p>
        <datalist id="riProducts">${(state.profile.productPresets || []).map((p) => `<option value="${esc(p.label)}"></option>`).join('')}</datalist>
        <div id="rItems"></div>
        <button type="button" class="btn btn-ghost" id="rAddItem" style="margin-top:4px">＋ 商品を追加</button>
        <div class="sheet-total" id="rResTotals" style="margin:12px 0"></div>
        <div class="muted" style="font-size:12px;margin-bottom:4px">予約を ✓（対応済み）にすると、歩合の合計が決済日にレポート／カレンダーのイベント歩合へ加算されます。</div>
        <div class="field"><label>メモ（任意）</label><input id="rMemo" class="inline-input" type="text" maxlength="80" style="width:100%"></div>
        <div class="row" style="gap:8px;margin-top:8px">
          <button type="button" class="btn btn-ghost" id="rCancel" style="flex:1">キャンセル</button>
          <button type="submit" class="btn" style="flex:1">保存</button>
        </div>
      </form>
      <div id="resGroups" style="margin-top:10px">${groupHtml}</div>
      </div>
    </div>

    <button class="btn btn-ghost" id="evDelete" type="button" style="color:#f55;margin-top:4px">このイベントを削除</button>`;

  wireSeg(el, opts);
  el.querySelector('#evBack').onclick = () => drawEventList(el, opts);
  el.querySelector('#evEdit').onclick = () => { drawEventList(el, opts); /* 編集はリストのフォームで */ openEventEdit(el, ev, opts); };

  // 複製：同じ内容で新イベントを作り、名前だけ変更できるよう編集フォームを開く
  el.querySelector('#evDup').onclick = async () => {
    const { event: newEvent, reservations: rows } = buildEventClone(ev, state.reservations, uid);
    await put('events', newEvent);
    for (const r of rows) await put('reservations', r);
    await loadAll();
    toast(`複製しました（予約${rows.length}件）`);
    drawEventList(el, opts);
    openEventEdit(el, newEvent, opts);
    el.querySelector('#eName').select(); // 名前を全選択して即リネームできる状態に
  };

  // ===== 予約フォーム =====
  const form = el.querySelector('#resForm');
  const rCust = el.querySelector('#rCust');
  const rName = el.querySelector('#rName');
  const rNameField = el.querySelector('#rNameField');
  const rDate = el.querySelector('#rDate');
  const rDateTBD = el.querySelector('#rDateTBD');
  const rTBDNote = el.querySelector('#rTBDNote');
  // 未定チェック時は日付入力を無効化（見た目も薄く）＋注意書きを表示
  const syncDateTBD = () => {
    rDate.disabled = rDateTBD.checked;
    rDate.style.opacity = rDateTBD.checked ? '.4' : '';
    rTBDNote.hidden = !rDateTBD.checked;
  };
  rDateTBD.onchange = syncDateTBD;
  const rMemo = el.querySelector('#rMemo');
  const rItems = el.querySelector('#rItems');
  const rResTotals = el.querySelector('#rResTotals');
  let formItems = [];
  const blankItem = () => ({ label: '', count: 0, unitPrice: 0, amount: 0, backFixed: 0, backRate: 0, amountEdited: false });

  // 予約全体の合計（売上・歩合）を表示
  const updateResTotals = () => {
    const back = reservationBack({ items: formItems });
    const sales = reservationSales({ items: formItems });
    rResTotals.innerHTML = `<span>合計 <span class="muted">売上 ${yen(sales)}</span></span><strong>歩合 ${yen(back)}</strong>`;
  };

  const itemRowHtml = (it, i) => `
    <div class="res-item-row" data-idx="${i}">
      <div class="row" style="align-items:center;gap:8px">
        <input class="ri-label inline-input" type="text" list="riProducts" maxlength="40" placeholder="商品名（オリシャン・フードセット 等）" value="${esc(it.label || '')}" style="flex:1">
        <button type="button" class="ri-del" aria-label="この商品を削除">✕</button>
      </div>
      <div class="row" style="margin-top:6px">
        <div class="field" style="flex:1"><label>数量</label>
          <select class="ri-count inline-input" style="width:100%">${countOptions}</select></div>
        <div class="field" style="flex:1"><label>単価（円）</label>
          <input class="ri-unit inline-input" type="number" inputmode="numeric" min="0" placeholder="0" value="${it.unitPrice || ''}" style="width:100%"></div>
      </div>
      <div class="field" style="margin-top:6px"><label>予定金額（売上・円）</label>
        <input class="ri-amount inline-input" type="number" inputmode="numeric" min="0" placeholder="0" value="${it.amount || ''}" style="width:100%">
        <div class="muted" style="font-size:11px;margin-top:2px">数量×単価で自動計算（手入力で上書き可）</div></div>
      <div class="row" style="margin-top:6px">
        <div class="field" style="flex:1"><label>歩合（円/件）</label>
          <input class="ri-bfixed inline-input" type="number" inputmode="numeric" min="0" placeholder="0" value="${it.backFixed || ''}" style="width:100%"></div>
        <div class="field" style="flex:1"><label>歩合（％）</label>
          <input class="ri-brate inline-input" type="number" inputmode="numeric" min="0" placeholder="0" value="${it.backRate || ''}" style="width:100%"></div>
      </div>
      <div class="muted ri-back" style="font-size:12px;margin-top:4px"></div>
    </div>`;

  const wireItemRow = (i) => {
    const row = rItems.querySelector(`[data-idx="${i}"]`);
    const q = (sel) => row.querySelector(sel);
    const label = q('.ri-label'), count = q('.ri-count'), unit = q('.ri-unit'),
      amount = q('.ri-amount'), bfixed = q('.ri-bfixed'), brate = q('.ri-brate'), backView = q('.ri-back');
    count.value = formItems[i].count ? String(formItems[i].count) : '';
    const showBack = () => { const b = itemBack(formItems[i]); backView.textContent = b ? `→ 歩合 ${yen(b)}` : ''; };
    const readInputs = () => {
      formItems[i].label = label.value;
      formItems[i].count = Number(count.value) || 0;
      formItems[i].unitPrice = Number(unit.value) || 0;
      formItems[i].backFixed = Number(bfixed.value) || 0;
      formItems[i].backRate = Number(brate.value) || 0;
    };
    const recalc = () => {
      readInputs();
      if (!formItems[i].amountEdited) {
        const amt = autoAmount(formItems[i].count, formItems[i].label, formItems[i].unitPrice);
        amount.value = amt ? amt : '';
      }
      formItems[i].amount = Number(amount.value) || 0;
      showBack(); updateResTotals();
    };
    // 履歴から商品名を選んだら単価・歩合を自動補完（空欄のみ・入力済みは上書きしない）
    const applyPreset = () => {
      const preset = (state.profile.productPresets || []).find((p) => p.label === label.value.trim());
      if (!preset) return;
      if (!unit.value && preset.unitPrice) unit.value = preset.unitPrice;
      if (!bfixed.value && preset.backFixed) bfixed.value = preset.backFixed;
      if (!brate.value && preset.backRate) brate.value = preset.backRate;
      formItems[i].amountEdited = false; // 単価が入るので売上を再計算させる
      recalc();
    };
    label.oninput = recalc;
    label.onchange = applyPreset;
    count.onchange = recalc;
    unit.oninput = recalc;
    bfixed.oninput = recalc;
    brate.oninput = recalc;
    amount.oninput = () => { formItems[i].amountEdited = true; readInputs(); formItems[i].amount = Number(amount.value) || 0; showBack(); updateResTotals(); };
    q('.ri-del').onclick = () => {
      if (formItems.length > 1) formItems.splice(i, 1); else formItems[0] = blankItem();
      renderItems();
    };
    showBack();
  };

  const renderItems = () => {
    rItems.innerHTML = formItems.map(itemRowHtml).join('');
    formItems.forEach((_, i) => wireItemRow(i));
    updateResTotals();
  };
  el.querySelector('#rAddItem').onclick = () => { formItems.push(blankItem()); renderItems(); };

  // 顧客選択時：名前欄を隠し、好みのボトルを先頭商品名へ初期補完（空欄時のみ）
  const syncCustPick = () => {
    const c = state.customers.find((x) => x.id === rCust.value);
    rNameField.hidden = !!c;
    if (c && c.favoriteBottle && formItems[0] && !formItems[0].label) { formItems[0].label = c.favoriteBottle; renderItems(); }
  };
  rCust.onchange = syncCustPick;

  const openResForm = (res) => {
    editingResId = res ? res.id : null;
    rCust.value = res ? (res.customerId || '') : '';
    rName.value = res ? (res.name || '') : '';
    el.querySelector('#rTiming').value = res ? (res.timing || 'day') : 'day';
    rDate.value = (res && res.date) || ev.date || todayIso();
    rDateTBD.checked = !!(res && res.dateTBD);
    syncDateTBD();
    // 商品アイテムを作業配列へ（旧モデルの単一商品は1アイテムに変換される）
    formItems = res
      ? reservationItems(res).map((it) => ({
          label: it.label || '', count: Number(it.count) || 0, unitPrice: Number(it.unitPrice) || 0,
          amount: Number(it.amount) || 0, backFixed: Number(it.backFixed) || 0, backRate: Number(it.backRate) || 0,
          amountEdited: !!(Number(it.amount)),
        }))
      : [blankItem()];
    if (!formItems.length) formItems = [blankItem()];
    rMemo.value = res ? (res.memo || '') : '';
    renderItems();
    syncCustPick();
    form.hidden = false;
    (rNameField.hidden ? el.querySelector('#rTiming') : rName).focus();
  };
  el.querySelector('#resAdd').onclick = () => openResForm(null);
  el.querySelector('#rCancel').onclick = () => { form.hidden = true; editingResId = null; };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const custId = rCust.value;
    const cust = state.customers.find((x) => x.id === custId);
    const name = cust ? cust.name : rName.value.trim();
    if (!name) { rName.focus(); return; } // 顧客未選択なら名前必須
    const base = editingResId ? state.reservations.find((x) => x.id === editingResId) : null;
    // 空アイテム（品名・数量・金額いずれも無し）は保存しない
    const items = formItems
      .filter((it) => (it.label && it.label.trim()) || it.count || it.amount)
      .map((it) => ({
        label: (it.label || '').trim(), count: Number(it.count) || 0, unitPrice: Number(it.unitPrice) || 0,
        amount: Number(it.amount) || 0, backFixed: Number(it.backFixed) || 0, backRate: Number(it.backRate) || 0,
      }));
    await put('reservations', {
      id: editingResId || uid(),
      eventId,
      customerId: custId,
      name, // 控えのスナップショット（顧客削除時のフォールバック）
      timing: el.querySelector('#rTiming').value || 'day',
      date: rDateTBD.checked ? '' : (rDate.value || ''),
      dateTBD: rDateTBD.checked,
      items,
      memo: rMemo.value.trim(),
      done: base ? !!base.done : false,
      createdAt: base ? base.createdAt : Date.now(),
    });
    // 商品名・単価・歩合を履歴に保存（同名は最新の値で更新・次回の新規入力で選べる）
    if (items.length) {
      const presets = [...(state.profile.productPresets || [])];
      for (const it of items) {
        if (!it.label) continue;
        const entry = { label: it.label, unitPrice: it.unitPrice, backFixed: it.backFixed, backRate: it.backRate };
        const idx = presets.findIndex((p) => p.label === it.label);
        if (idx >= 0) presets[idx] = entry; else presets.push(entry);
      }
      await saveProfile({ ...state.profile, productPresets: presets });
    }
    editingResId = null;
    await loadAll();
    toast('保存しました');
    drawEventDetail(el, eventId, opts);
  };

  // 予約行の操作（済トグル・編集・削除）
  el.querySelectorAll('.res-item').forEach((li) => {
    const r = state.reservations.find((x) => x.id === li.dataset.id);
    if (!r) return;
    li.querySelector('.res-check').onclick = async () => {
      // 未対応→対応済み（＝計上）にするときだけ、計上の許可を確認する
      if (!r.done) {
        const back = reservationBack(r);
        const msg = back
          ? `この項目の歩合 ${yen(back)} を計上しますか？`
          : 'この項目を対応済みにしますか？（歩合未設定のため計上額は0円です）';
        if (!(await confirmModal(msg, { okLabel: '計上する', danger: false }))) return;
      }
      await put('reservations', { ...r, done: !r.done });
      await loadAll();
      toast(r.done ? '計上を取り消しました' : '歩合を計上しました');
      drawEventDetail(el, eventId, opts);
    };
    li.querySelector('.res-dup').onclick = async () => {
      await put('reservations', cloneReservation(r, uid()));
      await loadAll();
      toast('予約を複製しました');
      drawEventDetail(el, eventId, opts);
    };
    li.querySelector('.res-edit').onclick = () => openResForm(r);
    li.querySelector('.res-del').onclick = async () => {
      if (!(await confirmModal('この予約を削除しますか？'))) return;
      await del('reservations', r.id);
      await loadAll();
      drawEventDetail(el, eventId, opts);
    };
  });

  el.querySelector('#evDelete').onclick = async () => {
    if (!(await confirmModal(`「${ev.name}」を削除します。予約名簿もすべて削除されます。よろしいですか？（元に戻せません）`))) return;
    await deleteEventById(eventId);
    drawEventList(el, opts);
  };
}

// 予約1行のマークアップ（名前＋種別タグ・商品名×数量のみ・複数商品は「/」連結）
function resLi(r) {
  const name = resolveResName(r, state.customers);
  const meta = esc(reservationSummary(r)); // 例: オリシャン ×3 / フードセット ×1
  // 名前の横に種別（当日/前祝い/後祝い）タグを表示
  const timingTag = r.timing ? `<span class="res-tag res-timing">${esc(timingLabel(r.timing))}</span>` : '';
  const outTag = r.customerId ? '' : '<span class="res-tag">未登録顧客</span>';
  return `<li class="res-item ${r.done ? 'done' : ''}" data-id="${esc(r.id)}">
    <button class="res-check todo-check" type="button" aria-label="${r.done ? '未対応に戻す' : '対応済みにする'}">${r.done ? '✓' : ''}</button>
    <div class="res-main">
      <div class="res-name">${esc(name)}${timingTag}${outTag}</div>
      ${meta ? `<div class="muted res-meta">${meta}</div>` : ''}
    </div>
    <div class="res-actions">
      <button class="res-dup" type="button" aria-label="複製"><span class="ra-ico">⧉</span><span class="ra-txt">複製</span></button>
      <button class="res-edit" type="button" aria-label="編集"><span class="ra-ico">✎</span><span class="ra-txt">編集</span></button>
      <button class="res-del" type="button" aria-label="削除"><span class="ra-ico">✕</span><span class="ra-txt">削除</span></button>
    </div>
  </li>`;
}

// 詳細の「編集」から一覧へ戻り、そのイベントのフォームを開く
function openEventEdit(el, ev, opts) {
  const form = el.querySelector('#evForm');
  if (!form) return;
  editingEventId = ev.id;
  el.querySelector('#eName').value = ev.name;
  el.querySelector('#eDate').value = ev.date || '';
  el.querySelector('#eMemo').value = ev.memo || '';
  form.hidden = false;
  el.querySelector('#eName').focus();
}

// セグメント配線：「顧客」→顧客一覧へ、「イベント」→イベント一覧へ戻る
function wireSeg(el, opts) {
  const seg = el.querySelector('.cust-seg');
  if (!seg) return;
  seg.querySelector('[data-sec="customers"]').onclick = () => opts.goCustomers && opts.goCustomers();
  seg.querySelector('[data-sec="events"]').onclick = () => drawEventList(el, opts);
}
