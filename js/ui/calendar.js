import { state, shiftsOfMonth, loadAll } from '../state.js';
import { put, del, uid } from '../db.js';
import { shiftTotal, shiftBackTotal, workedHours, dayPayReceived, dayPayRemaining } from '../calc.js';
import { yen, esc, weekdayJa, todayIso } from '../format.js';
import { hasFixed, hasRate, itemLabel, categoryList, itemCategory } from './backfields.js';
import { renderTodos } from './todos.js';
import { confirmModal } from './confirm.js';
import { toast } from './toast.js';
import { visitCountByDate, visitsOnDate, birthdaysByDate } from '../customers-logic.js';
import { eventIncomeByDate, eventIncomeByDateDetailed } from '../events-logic.js';

// まとめて入力（複数日選択）モードの状態。カレンダー再描画をまたいで保持する。
let bulkMode = false;
const bulkSelected = new Set();

export async function renderCalendar(el) {
  const [y, m] = state.month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const byDate = new Map(shiftsOfMonth().map((s) => [s.date, s]));
  const wage = state.profile, items = state.backItems;

  // 期限付きTodoを日付ごとに集計（カレンダー表示用）
  const todosByDate = new Map();
  for (const t of state.todos) {
    if (!t.due) continue;
    if (!todosByDate.has(t.due)) todosByDate.set(t.due, []);
    todosByDate.get(t.due).push(t);
  }
  const visitsByDate = visitCountByDate(state.visits);
  const bdaysByDate = birthdaysByDate(state.customers, state.month);
  const eventIncByDate = eventIncomeByDate(state.reservations, state.events); // 対応済み予約の日別収入（合計）
  const eventDetailByDate = eventIncomeByDateDetailed(state.reservations, state.events); // 日別×イベント別の内訳
  const today = todayIso();

  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push('<div></div>');
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${state.month}-${String(d).padStart(2, '0')}`;
    const s = byDate.get(iso);
    let body = '', cls = '';
    if (iso === today) cls = 'is-today';
    const evAmt = eventIncByDate.get(iso) || 0; // その日のイベント歩合（対応済み）
    if (s && s.absent) {
      // 欠勤：時給は付かない。ペナルティ等（マイナス）やイベント歩合があれば併記
      const amt = shiftTotal(wage, items, s) + evAmt;
      body = `<div class="cal-amt absent">欠勤</div>` + (amt ? `<div class="cal-tag">${yen(amt)}</div>` : '');
      cls += ' has-absent';
    } else if (s && s.confirmed) {
      // 時給＋歩合＋イベント歩合を合算表示
      body = `<div class="cal-amt">${yen(shiftTotal(wage, items, s) + evAmt)}</div>`;
      cls += ' has-confirmed';
    } else if (s) {
      // 入力未完了＝出勤予定：時刻を表示
      body = `<div class="cal-amt planned">${esc(s.start || '')}〜</div><div class="cal-tag">予定</div>`;
      cls += ' has-draft';
    } else if (evAmt) {
      // シフトは無いがイベント収入がある日
      body = `<div class="cal-amt">${yen(evAmt)}</div>`;
      cls += ' has-confirmed';
    }
    const evMark = evAmt ? '<div class="cal-ev">🎉</div>' : '';
    const dueT = todosByDate.get(iso) || [];
    const pend = dueT.filter((t) => !t.done).length;
    const todoMark = dueT.length
      ? `<div class="cal-todo${pend ? '' : ' done'}">${pend ? '📌' + (pend > 1 ? pend : '') : '✓'}</div>`
      : '';
    const vCount = visitsByDate.get(iso) || 0;
    const visitMark = vCount ? `<div class="cal-visit">👤${vCount > 1 ? vCount : ''}</div>` : '';
    const bdayNames = bdaysByDate.get(iso);
    const bdayMark = bdayNames ? `<div class="cal-bday">🎂${bdayNames.length > 1 ? bdayNames.length : ''}</div>` : '';
    if (bulkMode && bulkSelected.has(iso)) cls += ' bulk-selected';
    cells.push(`<div class="cal-cell ${cls}" data-date="${esc(iso)}">
      <div class="cal-day">${d}</div>${body}${todoMark}${visitMark}${bdayMark}${evMark}</div>`);
  }

  const p = state.profile;
  const bulkPanelHtml = bulkMode ? `
    <div class="bulk-panel">
      <div class="bulk-head">🗓️ まとめて入力：出勤する日をタップで選択（<span id="bulkCount">${bulkSelected.size}</span>日）</div>
      <div class="row">
        <div class="field" style="flex:1"><label>開始</label><input id="bkStart" type="time" value="${esc(p.defaultStart || '20:00')}"></div>
        <div class="field" style="flex:1"><label>終了</label><input id="bkEnd" type="time" value="${esc(p.defaultEnd || '01:00')}"></div>
        <div class="field" style="flex:1"><label>休憩(分)</label><input id="bkBreak" type="number" inputmode="numeric" placeholder="0" value="${Number(p.defaultBreakMin) || ''}"></div>
      </div>
      <label style="display:block;margin:8px 0"><input id="bkConfirmed" type="checkbox"> 確定（実績）にする　<span class="muted" style="font-size:12px">OFFは「出勤予定」</span></label>
      <div class="row" style="gap:8px">
        <button class="btn btn-ghost" id="bkCancel" style="flex:1">キャンセル</button>
        <button class="btn" id="bkSave" style="flex:2">選択した日を保存</button>
      </div>
      <button class="btn btn-ghost" id="bkDelete" style="margin-top:8px;color:#f55">🗑 選択した日の記録を削除</button>
    </div>` : '';

  el.innerHTML = `
    <div class="row" style="justify-content:space-between;align-items:center">
      <button id="prev" class="btn-ghost btn" style="width:auto;padding:6px 12px">‹</button>
      <h2>${y}年${m}月</h2>
      <button id="next" class="btn-ghost btn" style="width:auto;padding:6px 12px">›</button>
    </div>
    ${bulkPanelHtml}
    <div class="cal-grid head">${['日','月','火','水','木','金','土'].map((w) => `<div>${w}</div>`).join('')}</div>
    <div class="cal-grid" id="grid">${cells.join('')}</div>
    ${bulkMode
      ? '<p class="muted" style="text-align:center;margin-top:10px">タップで選択／もう一度タップで解除</p>'
      : `<p class="muted" style="text-align:center;margin-top:10px">日付をタップして記録・予定を入力</p>
         <button id="bulkStartBtn" class="btn btn-ghost" style="margin-top:4px">🗓️ まとめて入力（複数日）</button>`}

    <div id="todoSection" style="margin-top:16px"></div>

    <div class="sheet-backdrop" id="sheetBackdrop" hidden></div>
    <section class="sheet" id="sheet" hidden aria-label="日別入力">
      <div class="sheet-handle"></div>
      <div class="row" style="justify-content:space-between;align-items:center">
        <h3 id="sheetDate" style="margin:0"></h3>
        <button id="sheetClose" style="border:none;background:none;font-size:20px;color:var(--muted)">✕</button>
      </div>
      <div id="sheetBody"></div>
    </section>`;

  renderTodos(el.querySelector('#todoSection'));

  // 金額を必ず1行に収める：セル幅からはみ出す分だけフォントを縮小して横1列に揃える
  const fitAmounts = () => {
    el.querySelectorAll('.cal-amt').forEach((a) => {
      let fs = 11;
      a.style.fontSize = fs + 'px';
      let guard = 0;
      while (a.scrollWidth > a.clientWidth + 0.5 && fs > 6 && guard++ < 20) {
        fs -= 0.5;
        a.style.fontSize = fs + 'px';
      }
    });
  };
  requestAnimationFrame(fitAmounts);

  const shiftMonth = (delta) => {
    const d = new Date(y, m - 1 + delta, 1);
    // ローカルの年月で組み立てる（toISOString だと UTC 変換で月がずれる）
    state.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (bulkMode) bulkSelected.clear(); // 月をまたいだ選択は混乱するのでクリア
    renderCalendar(el);
  };
  el.querySelector('#prev').onclick = () => shiftMonth(-1);
  el.querySelector('#next').onclick = () => shiftMonth(1);

  // ===== ボトムシート（日別入力） =====
  const sheet = el.querySelector('#sheet');
  const backdrop = el.querySelector('#sheetBackdrop');
  const body = el.querySelector('#sheetBody');
  const q = (sel) => sheet.querySelector(sel);
  let draft = null;
  let counts = {}, sales = {}; // 項目id -> 件数 / 対象売上（チップ入力の作業用）

  const closeSheet = () => {
    sheet.classList.remove('show');
    backdrop.classList.remove('show');
    setTimeout(() => { sheet.hidden = true; backdrop.hidden = true; }, 280);
  };

  const collectDraft = () => {
    draft.start = q('#sStart').value;
    draft.end = q('#sEnd').value;
    draft.breakMin = Number(q('#sBreak').value) || 0;
    draft.confirmed = q('#sConfirmed').checked;
    draft.absent = q('#sAbsent').checked;
    const dpType = q('#sDayPay') ? q('#sDayPay').value : 'none';
    draft.dayPay = { type: dpType, cap: (q('#sDayPayCap') && Number(q('#sDayPayCap').value)) || 0 };
    const entries = [];
    for (const it of state.backItems) {
      const c = Number(counts[it.id]) || 0, s = Number(sales[it.id]) || 0;
      if (c || s) entries.push({ backItemId: it.id, count: c, sales: s });
    }
    draft.entries = entries;
    return draft;
  };

  const recalc = () => {
    collectDraft();
    // 欠勤日は時給欄をグレーアウトし、注意書きを表示（ペナルティは歩合項目から）
    const timeRow = q('#sTimeRow'), absNote = q('#sAbsentNote');
    if (timeRow) timeRow.classList.toggle('is-absent', !!draft.absent);
    if (absNote) absNote.hidden = !draft.absent;
    // その日のイベント歩合（対応済み）も合計・歩合に含める
    const evAmt = eventIncByDate.get(draft.date) || 0;
    q('#sheetTotal').textContent = yen(shiftTotal(state.profile, state.backItems, draft) + evAmt);
    q('#sheetInc').textContent = yen(shiftBackTotal(state.backItems, draft) + evAmt);
    q('#sheetHours').textContent = workedHours(draft) ? `実働 ${workedHours(draft)}h` : '';
    // 日払い：種別に応じて詳細（上限・受取/未受取）を表示
    const dpDetail = q('#dpDetail');
    if (dpDetail) {
      const type = draft.dayPay && draft.dayPay.type;
      const on = type && type !== 'none';
      dpDetail.hidden = !on;
      if (on) {
        const notes = {
          full: '時給＋歩合（ペナルティ差引後）の純額を当日全額受け取ります。',
          base: '基本時給＋深夜手当のみ当日受取。歩合（インセンティブ）は含まれず後日支給です。',
          trial: '体験入店分の純額（歩合込み）を当日全額受け取ります。',
        };
        q('#dpNote').textContent = notes[type] || '';
        q('#dpReceived').textContent = yen(dayPayReceived(state.profile, state.backItems, draft));
        q('#dpRemaining').textContent = yen(dayPayRemaining(state.profile, state.backItems, draft));
      }
    }
  };

  const renderSheet = () => {
    q('#sheetDate').textContent =
      `${Number(draft.date.slice(5, 7))}月${Number(draft.date.slice(8))}日(${weekdayJa(draft.date)})`;

    // チップ入力の作業用マップを下書きから初期化
    counts = {}; sales = {};
    (draft.entries || []).forEach((e) => {
      if (e.count) counts[e.backItemId] = e.count;
      if (e.sales) sales[e.backItemId] = e.sales;
    });

    const chipHtml = (it) => {
      const hasC = hasFixed(it);
      const c = Number(counts[it.id]) || 0, s = Number(sales[it.id]) || 0;
      const active = c > 0 || s > 0;
      const badge = hasC ? (c > 0 ? '×' + c : '') : (s > 0 ? '✓' : '');
      const mark = it.kind === 'penalty' ? '⚠' : it.kind === 'deduction' ? '➖' : '';
      const neg = it.kind === 'penalty' || it.kind === 'deduction';
      return `<button type="button" class="chip-inc${active ? ' active' : ''}${neg ? ' penalty' : ''}" data-id="${esc(it.id)}">
        <span class="chip-name">${mark}${esc(it.name)}</span>
        ${badge ? `<span class="chip-badge">${badge}</span>` : ''}
      </button>`;
    };
    const itemsHtml = state.backItems.length === 0
      ? '<p class="muted">先に「設定」で歩合項目を登録してください。</p>'
      : `<div class="cat-tabs" id="chipTabs"></div><div class="chip-grid" id="chipGrid"></div>`;

    const dayTodos = state.todos.filter((t) => t.due === draft.date);
    const dayTodosHtml = dayTodos.length ? `
      <div class="sheet-todos">
        <div class="muted" style="margin-bottom:4px">📌 この日のやること</div>
        <ul>${dayTodos.map((t) => `<li class="${t.done ? 'done' : ''}">${esc(t.text)}</li>`).join('')}</ul>
      </div>` : '';

    const dayVisits = visitsOnDate(state.visits, state.customers, draft.date);
    const dayVisitsHtml = dayVisits.length ? `
      <div class="sheet-visits">
        <div class="muted" style="margin-bottom:4px">👤 この日の来店予定</div>
        <ul>${dayVisits.map((v) => `<li class="visit-line ${v.done ? 'done' : ''}" data-id="${esc(v.id)}">
          <button class="todo-check" type="button" aria-label="${v.done ? '未来店に戻す' : '来店済みにする'}">${v.done ? '✓' : ''}</button>
          <span>${esc(v.customerName)}${v.note ? ' ・ ' + esc(v.note) : ''}</span></li>`).join('')}</ul>
      </div>` : '';

    const dayBdays = bdaysByDate.get(draft.date) || [];
    const dayBdayHtml = dayBdays.length
      ? `<div class="sheet-bday">🎂 ${dayBdays.map((n) => esc(n)).join('・')} さんのお誕生日</div>`
      : '';

    // イベント歩合（対応済み）はイベント名ごとに表示。複数イベントなら複数行。
    const dayEvents = eventDetailByDate.get(draft.date) || [];
    const dayEventHtml = dayEvents.length
      ? `<div class="sheet-bday">${dayEvents.map((e) =>
          `<div>🎉 ${esc(e.name)}（対応済み） <strong>${yen(e.back)}</strong></div>`).join('')}</div>`
      : '';

    body.innerHTML = `
      ${dayTodosHtml}
      ${dayVisitsHtml}
      ${dayBdayHtml}
      ${dayEventHtml}
      <label class="absent-toggle" style="display:flex;align-items:center;gap:6px;margin-bottom:10px">
        <input id="sAbsent" type="checkbox" ${draft.absent ? 'checked' : ''}> 欠勤（当日出勤しなかった）
        <span class="muted" style="font-size:12px">時給は計上されません</span>
      </label>
      <div class="row" id="sTimeRow">
        <div class="field" style="flex:1"><label>開始</label><input id="sStart" type="time" value="${esc(draft.start || '20:00')}"></div>
        <div class="field" style="flex:1"><label>終了</label><input id="sEnd" type="time" value="${esc(draft.end || '01:00')}"></div>
        <div class="field" style="flex:1"><label>休憩(分)</label><input id="sBreak" type="number" inputmode="numeric" placeholder="0" value="${Number(draft.breakMin) || ''}"></div>
      </div>
      <p class="muted" id="sAbsentNote" style="margin:0 0 8px;font-size:12px;color:var(--pink)" hidden>欠勤日です。ペナルティ（罰金）は下の歩合項目から加算してください。</p>
      <h4 style="margin:10px 0 4px">入った歩合</h4>
      <p class="muted" style="margin:0 0 8px;font-size:12px">タップで＋1／長押しで件数・売上を調整</p>
      ${itemsHtml}
      <div class="sheet-total">
        <div>
          <span>この日の合計 <span class="muted" id="sheetHours"></span></span>
          <div class="sheet-sub">うち歩合 <strong id="sheetInc">¥0</strong></div>
        </div>
        <strong id="sheetTotal" style="font-size:26px;font-weight:800">¥0</strong>
      </div>
      <div class="daypay-box">
        <label style="display:block;font-weight:600;margin-bottom:4px">日払い（当日その場で受取）</label>
        <p class="muted" style="font-size:12px;margin:0 0 6px;line-height:1.6">その日に受け取った分を記録します。受け取っていない差額は「未受取（後日支給）」として集計されます。</p>
        <select id="sDayPay" class="inline-input" style="width:100%">
          <option value="none">なし</option>
          <option value="full">全額 当日日払い</option>
          <option value="base">基本時給のみ 日払い</option>
          <option value="trial">体験入店・全額 日払い</option>
        </select>
        <div id="dpDetail" hidden style="margin-top:8px">
          <p class="muted" id="dpNote" style="font-size:12px;margin:0 0 8px;line-height:1.6"></p>
          <div class="field"><label>上限（円・空欄＝上限なし）</label><input id="sDayPayCap" type="number" inputmode="numeric" placeholder="上限なし"></div>
          <div class="sheet-sub" style="margin-top:6px">受取済み <strong id="dpReceived">¥0</strong> ／ 未受取(差額) <strong id="dpRemaining">¥0</strong></div>
        </div>
      </div>
      <label style="display:block;margin-bottom:12px">
        <input id="sConfirmed" type="checkbox" ${draft.confirmed ? 'checked' : ''}> 確定（実績）にする
        <span class="muted">＝カレンダーに金額表示。OFFは「出勤予定」</span>
      </label>
      <button class="btn" id="sSave">保存</button>
      <div style="height:8px"></div>
      <button class="btn btn-ghost" id="sDelete" style="color:#f55">この日の記録を削除</button>

      <div class="chip-pop-backdrop" id="chipPopBg" hidden></div>
      <div class="chip-pop" id="chipPop" role="dialog" aria-modal="true" hidden></div>`;

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

    // ===== 歩合・チップ：タップ＝＋1／長押し＝調整ポップオーバー =====
    const chipGrid = q('#chipGrid');
    const pop = q('#chipPop'), popBg = q('#chipPopBg');

    const refreshChip = (id) => {
      const it = state.backItems.find((x) => x.id === id);
      const btn = chipGrid && chipGrid.querySelector(`.chip-inc[data-id="${CSS.escape(id)}"]`);
      if (!it || !btn) return;
      const hasC = hasFixed(it);
      const c = Number(counts[id]) || 0, s = Number(sales[id]) || 0;
      btn.classList.toggle('active', c > 0 || s > 0);
      const badge = hasC ? (c > 0 ? '×' + c : '') : (s > 0 ? '✓' : '');
      let b = btn.querySelector('.chip-badge');
      if (badge) {
        if (!b) { b = document.createElement('span'); b.className = 'chip-badge'; btn.appendChild(b); }
        b.textContent = badge;
      } else if (b) { b.remove(); }
    };

    const closePop = () => { pop.hidden = true; popBg.hidden = true; };
    const openPop = (it) => {
      const hasC = hasFixed(it), hasR = hasRate(it);
      pop.innerHTML = `
        <div class="chip-pop-title">${it.kind === 'penalty' ? '⚠' : it.kind === 'deduction' ? '➖' : ''}${esc(it.name)}
          <span class="muted">${esc(itemLabel(it))}</span></div>
        ${hasC ? `<div class="row" style="align-items:center;gap:8px;margin:12px 0">
          <button class="bi-minus" type="button" id="popMinus" aria-label="減らす">−</button>
          <input id="popCount" class="inline-input" type="number" inputmode="numeric" placeholder="件数"
            value="${Number(counts[it.id]) > 0 ? counts[it.id] : ''}" style="flex:1;text-align:center">
          <button class="bi-plus" type="button" id="popPlus" aria-label="増やす">＋</button>
        </div>` : ''}
        ${hasR ? `<div class="field" style="margin:12px 0"><label>対象売上(円)</label>
          <input id="popSales" class="inline-input" type="number" inputmode="numeric"
            value="${Number(sales[it.id]) > 0 ? sales[it.id] : ''}" style="width:100%"></div>` : ''}
        <div class="row" style="gap:8px">
          <button class="btn btn-ghost" type="button" id="popClear" style="flex:1">クリア</button>
          <button class="btn" type="button" id="popDone" style="flex:1">完了</button>
        </div>`;
      const cInp = pop.querySelector('#popCount'), sInp = pop.querySelector('#popSales');
      const apply = () => {
        if (cInp) counts[it.id] = Number(cInp.value) || 0;
        if (sInp) sales[it.id] = Number(sInp.value) || 0;
        refreshChip(it.id); recalc();
      };
      if (cInp) {
        pop.querySelector('#popPlus').onclick = () => { cInp.value = (Number(cInp.value) || 0) + 1; apply(); };
        pop.querySelector('#popMinus').onclick = () => {
          cInp.value = Math.max(0, (Number(cInp.value) || 0) - 1) || ''; apply();
        };
        cInp.oninput = apply;
      }
      if (sInp) sInp.oninput = apply;
      pop.querySelector('#popClear').onclick = () => {
        counts[it.id] = 0; sales[it.id] = 0;
        if (cInp) cInp.value = ''; if (sInp) sInp.value = '';
        refreshChip(it.id); recalc();
      };
      pop.querySelector('#popDone').onclick = closePop;
      pop.hidden = false; popBg.hidden = false;
      if (cInp) { cInp.focus(); cInp.select(); }
    };
    popBg.onclick = closePop;

    const tapChip = (it) => {
      if (hasFixed(it)) { counts[it.id] = (Number(counts[it.id]) || 0) + 1; refreshChip(it.id); recalc(); }
      else openPop(it); // 率(売上)のみの項目はポップオーバーで入力
    };
    const wireChips = () => {
      if (!chipGrid) return;
      chipGrid.querySelectorAll('.chip-inc').forEach((btn) => {
        const it = state.backItems.find((x) => x.id === btn.dataset.id);
        let timer = null, longFired = false, moved = false, sx = 0, sy = 0;
        const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
        btn.addEventListener('pointerdown', (e) => {
          longFired = false; moved = false; sx = e.clientX; sy = e.clientY;
          timer = setTimeout(() => { longFired = true; openPop(it); }, 450);
        });
        btn.addEventListener('pointermove', (e) => {
          if (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10) { moved = true; clear(); }
        });
        btn.addEventListener('pointerup', () => { clear(); if (!longFired && !moved) tapChip(it); });
        btn.addEventListener('pointercancel', clear);
        btn.addEventListener('pointerleave', clear);
        btn.addEventListener('contextmenu', (e) => e.preventDefault());
      });
    };

    // ===== 分類タブでチップを絞り込み（全て＋出現カテゴリ・1種類以下ならタブ非表示） =====
    const chipTabs = q('#chipTabs');
    let activeChipCat = '全て';
    const renderChipGrid = () => {
      if (!chipGrid) return;
      const list = activeChipCat === '全て'
        ? state.backItems
        : state.backItems.filter((it) => itemCategory(it) === activeChipCat);
      chipGrid.innerHTML = list.map(chipHtml).join('');
      wireChips();
    };
    const renderChipTabs = () => {
      if (!chipGrid) return;
      const cats = categoryList(state.backItems);
      if (!chipTabs || cats.length <= 1) { activeChipCat = '全て'; renderChipGrid(); return; }
      const all = ['全て', ...cats];
      if (!all.includes(activeChipCat)) activeChipCat = '全て';
      chipTabs.innerHTML = all.map((c) =>
        `<button type="button" class="cat-tab${c === activeChipCat ? ' active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
      chipTabs.querySelectorAll('.cat-tab').forEach((b) => {
        b.onclick = () => {
          activeChipCat = b.dataset.cat;
          chipTabs.querySelectorAll('.cat-tab').forEach((x) => x.classList.toggle('active', x === b));
          renderChipGrid();
        };
      });
      renderChipGrid();
    };
    renderChipTabs();

    sheet.querySelectorAll('#sStart,#sEnd,#sBreak').forEach((inp) => {
      inp.oninput = recalc; inp.onchange = recalc;
    });
    q('#sAbsent').onchange = recalc;

    // 日払い：初期値（種別・上限）をセットして変更で再計算
    const dpSel = q('#sDayPay');
    if (dpSel) {
      dpSel.value = (draft.dayPay && draft.dayPay.type) || 'none';
      const capIn = q('#sDayPayCap');
      const capVal = (draft.dayPay && draft.dayPay.cap) || state.profile.dayPayCap || 0;
      capIn.value = capVal > 0 ? capVal : '';
      dpSel.onchange = recalc;
      capIn.oninput = recalc;
    }

    q('#sSave').onclick = async () => {
      await put('shifts', collectDraft());
      await loadAll();
      closeSheet();
      renderCalendar(el);
    };
    q('#sDelete').onclick = async () => {
      const exists = state.shifts.some((s) => s.id === draft.id);
      if (exists && !(await confirmModal('この日の記録を削除します。よろしいですか？（元に戻せません）'))) return;
      if (exists) await del('shifts', draft.id);
      await loadAll();
      closeSheet();
      renderCalendar(el);
    };

    recalc();
  };

  const openSheet = (iso) => {
    const existing = state.shifts.find((s) => s.date === iso);
    const p = state.profile;
    draft = existing
      ? JSON.parse(JSON.stringify(existing))
      : { id: uid(), date: iso, start: p.defaultStart || '20:00', end: p.defaultEnd || '01:00', breakMin: Number(p.defaultBreakMin) || 0, confirmed: false, entries: [] };
    renderSheet();
    sheet.hidden = false; backdrop.hidden = false;
    requestAnimationFrame(() => { sheet.classList.add('show'); backdrop.classList.add('show'); });
  };

  el.querySelector('#sheetClose').onclick = closeSheet;
  backdrop.onclick = closeSheet;

  // ハンドルを下へドラッグして閉じる（しきい値未満なら元位置へ戻る）
  const handle = q('.sheet-handle');
  let dragStartY = null;
  const dragMove = (e) => {
    if (dragStartY === null) return;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    const dy = Math.max(0, y - dragStartY);
    sheet.style.transition = 'none';
    sheet.style.transform = `translateY(${dy}px)`;
    if (e.cancelable) e.preventDefault();
  };
  const dragEnd = (e) => {
    if (dragStartY === null) return;
    const y = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
    const dy = Math.max(0, y - dragStartY);
    dragStartY = null;
    window.removeEventListener('touchmove', dragMove);
    window.removeEventListener('touchend', dragEnd);
    window.removeEventListener('mousemove', dragMove);
    window.removeEventListener('mouseup', dragEnd);
    sheet.style.transition = '';
    sheet.style.transform = '';
    if (dy > 90) closeSheet(); // 十分下げたら閉じる。未満は .show のtranslateY(0)へスナップ
  };
  const dragStart = (e) => {
    dragStartY = e.touches ? e.touches[0].clientY : e.clientY;
    window.addEventListener('touchmove', dragMove, { passive: false });
    window.addEventListener('touchend', dragEnd);
    window.addEventListener('mousemove', dragMove);
    window.addEventListener('mouseup', dragEnd);
  };
  handle.addEventListener('touchstart', dragStart, { passive: true });
  handle.addEventListener('mousedown', dragStart);
  el.querySelectorAll('.cal-cell').forEach((cell) => {
    cell.onclick = () => {
      const d = cell.dataset.date;
      if (!bulkMode) { openSheet(d); return; }
      // まとめ入力モード：タップで選択トグル（再描画せずクラスと件数だけ更新）
      if (bulkSelected.has(d)) { bulkSelected.delete(d); cell.classList.remove('bulk-selected'); }
      else { bulkSelected.add(d); cell.classList.add('bulk-selected'); }
      const c = el.querySelector('#bulkCount');
      if (c) c.textContent = bulkSelected.size;
    };
  });

  // ===== まとめて入力（複数日） =====
  const bulkStartBtn = el.querySelector('#bulkStartBtn');
  if (bulkStartBtn) bulkStartBtn.onclick = () => { bulkMode = true; bulkSelected.clear(); renderCalendar(el); };

  if (bulkMode) {
    el.querySelector('#bkCancel').onclick = () => { bulkMode = false; bulkSelected.clear(); renderCalendar(el); };
    el.querySelector('#bkSave').onclick = async () => {
      const dates = [...bulkSelected].sort();
      if (dates.length === 0) { toast('保存する日を選んでください'); return; }
      const start = el.querySelector('#bkStart').value || '20:00';
      const end = el.querySelector('#bkEnd').value || '01:00';
      const breakMin = Number(el.querySelector('#bkBreak').value) || 0;
      const confirmed = el.querySelector('#bkConfirmed').checked;

      const hasShift = (d) => state.shifts.some((s) => s.date === d);
      const emptyDates = dates.filter((d) => !hasShift(d));
      const existingDates = dates.filter(hasShift);

      // 既存記録がある日は上書き可否を確認
      let overwrite = true;
      if (existingDates.length) {
        const md = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
        const list = existingDates.map((d) => {
          const ex = state.shifts.find((s) => s.date === d);
          return `・${md(d)}（${weekdayJa(d)}）${ex.start || ''}〜`;
        }).join('\n');
        overwrite = await confirmModal(
          `次の日はすでに登録されています。上書きしますか？\n\n${list}`,
          { okLabel: '上書きする', cancelLabel: '既存はそのまま' });
      }

      for (const d of emptyDates) {
        await put('shifts', { id: uid(), date: d, start, end, breakMin, confirmed, entries: [] });
      }
      let ow = 0;
      if (overwrite) {
        for (const d of existingDates) {
          const ex = state.shifts.find((s) => s.date === d);
          // 時間帯・確定のみ更新。歩合（entries）は保持、欠勤は解除
          await put('shifts', { ...ex, start, end, breakMin, confirmed, absent: false });
          ow++;
        }
      }
      await loadAll();
      bulkMode = false; bulkSelected.clear();
      renderCalendar(el);
      const skipped = existingDates.length - ow;
      toast(`${emptyDates.length + ow}日分を保存しました${skipped ? `（既存${skipped}日はそのまま）` : ''}`);
    };

    el.querySelector('#bkDelete').onclick = async () => {
      const targets = [...bulkSelected].filter((d) => state.shifts.some((s) => s.date === d)).sort();
      if (targets.length === 0) { toast('削除できる記録がありません'); return; }
      const md = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
      const list = targets.map((d) => `・${md(d)}（${weekdayJa(d)}）`).join('\n');
      const ok = await confirmModal(
        `選択した ${targets.length}日分の記録を削除します。よろしいですか？（元に戻せません）\n\n${list}`,
        { okLabel: '削除する', cancelLabel: 'やめる', danger: true });
      if (!ok) return;
      for (const d of targets) {
        const ex = state.shifts.find((s) => s.date === d);
        if (ex) await del('shifts', ex.id);
      }
      await loadAll();
      bulkMode = false; bulkSelected.clear();
      renderCalendar(el);
      toast(`${targets.length}日分を削除しました`);
    };
  }
}
