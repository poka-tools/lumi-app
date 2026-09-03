import { state, shiftsOfMonth, loadAll } from '../state.js';
import { icon } from './icons.js';
import { put, del, uid } from '../db.js';
import { shiftTotal, shiftBackTotal, workedHours, backAmount } from '../calc.js';
import { yen, esc, weekdayJa, todayIso, dateTimeJa } from '../format.js';
import { openItemPicker } from './itempicker.js';
import { renderTodos } from './todos.js';
import { confirmModal } from './confirm.js';
import { toast } from './toast.js';
import { visitCountByDate, visitsOnDate, birthdaysByDate } from '../customers-logic.js';
import { eventIncomeByDate, eventIncomeByDateDetailed } from '../events-logic.js';
import { ensurePremium } from './premium-gate.js';

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
  // 開催日が確定しているイベントを日付ごとに（カレンダーにタイトル表示）
  const eventTitlesByDate = new Map();
  for (const ev of state.events) {
    if (!ev.date) continue;
    if (!eventTitlesByDate.has(ev.date)) eventTitlesByDate.set(ev.date, []);
    eventTitlesByDate.get(ev.date).push(ev.name || '(無題)');
  }
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
    const evMark = evAmt ? `<div class="cal-ev">${icon('party')}</div>` : '';
    const dueT = todosByDate.get(iso) || [];
    const pend = dueT.filter((t) => !t.done).length;
    const todoMark = dueT.length
      ? `<div class="cal-todo${pend ? '' : ' done'}">${pend ? icon('pin') + (pend > 1 ? pend : '') : icon('check')}</div>`
      : '';
    const vCount = visitsByDate.get(iso) || 0;
    const visitMark = vCount ? `<div class="cal-visit">${icon('person')}${vCount > 1 ? vCount : ''}</div>` : '';
    const bdayNames = bdaysByDate.get(iso);
    const bdayMark = bdayNames ? `<div class="cal-bday">${icon('cake')}${bdayNames.length > 1 ? bdayNames.length : ''}</div>` : '';
    const evTitles = eventTitlesByDate.get(iso) || [];
    const evHeldMark = evTitles.length
      ? `<div class="cal-evheld">${icon('tent')}${evTitles.length > 1 ? evTitles.length : ''}</div>` : '';
    if (bulkMode && bulkSelected.has(iso)) cls += ' bulk-selected';
    cells.push(`<div class="cal-cell ${cls}" data-date="${esc(iso)}">
      <div class="cal-day">${d}</div>${body}${todoMark}${visitMark}${bdayMark}${evHeldMark}${evMark}</div>`);
  }

  const p = state.profile;
  const bulkPanelHtml = bulkMode ? `
    <div class="bulk-panel">
      <div class="bulk-head">${icon('calendar')} まとめて入力：出勤する日をタップで選択（<span id="bulkCount">${bulkSelected.size}</span>日）</div>
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
      <button class="btn btn-ghost" id="bkDelete" style="margin-top:8px;color:#f55">${icon('trash')} 選択した日の記録を削除</button>
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
         <button id="bulkStartBtn" class="btn btn-ghost" style="margin-top:4px">${icon('calendar')} まとめて入力（複数日）</button>`}

    <div id="todoSection" style="margin-top:16px"></div>

    <div class="sheet-backdrop" id="sheetBackdrop" hidden></div>
    <section class="sheet" id="sheet" hidden aria-label="日別入力">
      <div class="sheet-handle"></div>
      <div class="row" style="justify-content:space-between;align-items:center">
        <h3 id="sheetDate" style="margin:0"></h3>
        <button id="sheetClose" style="border:none;background:none;font-size:20px;color:var(--muted)">${icon('close')}</button>
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
    const target = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    // 過去月の閲覧は有料。現在の月より前へ移動しようとしたらペイウォールを出す（未来＝予定は無料）。
    const now = new Date();
    const nowMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (target < nowMonth && !ensurePremium()) return;
    state.month = target;
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
    // 日払いの受け取り方は設定（プロフィール）で全シフト共通に指定。既存の個別 draft.dayPay は保持する。
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

    const itemsHtml = state.backItems.length === 0
      ? `<p class="muted">先に「歩合項目の設定」で項目を登録してください。</p>`
      : `<div id="incSummary"></div>
         <button class="btn btn-ghost inc-open" id="incOpen" type="button">${icon('plus')} 歩合項目を選んで入力する</button>`;

    const dayTodos = state.todos.filter((t) => t.due === draft.date);
    const dayTodosHtml = dayTodos.length ? `
      <div class="sheet-todos">
        <div class="muted" style="margin-bottom:4px">${icon('pin')} この日のやること</div>
        <ul>${dayTodos.map((t) => `<li class="${t.done ? 'done' : ''}">${esc(t.text)}</li>`).join('')}</ul>
      </div>` : '';

    const dayVisits = visitsOnDate(state.visits, state.customers, draft.date);
    const dayVisitsHtml = dayVisits.length ? `
      <div class="sheet-visits">
        <div class="muted" style="margin-bottom:2px">${icon('person')} この日の来店予定</div>
        <div class="muted" style="font-size:12px;margin-bottom:6px">来店したら□にチェックを入れてください</div>
        <ul>${dayVisits.map((v) => `<li class="visit-line ${v.done ? 'done' : ''}" data-id="${esc(v.id)}">
          <button class="todo-check" type="button" aria-label="${v.done ? '未来店に戻す' : '来店済みにする'}">${v.done ? icon('check') : ''}</button>
          <span>${esc(v.customerName)}${v.note ? ' ・ ' + esc(v.note) : ''}</span></li>`).join('')}</ul>
      </div>` : '';

    const dayBdays = bdaysByDate.get(draft.date) || [];
    const dayBdayHtml = dayBdays.length
      ? `<div class="sheet-bday">${icon('cake')} ${dayBdays.map((n) => esc(n)).join('・')} さんのお誕生日</div>`
      : '';

    // この日に開催予定のイベント（開催日が確定しているもの）のタイトルを表示。
    const dayEventTitles = eventTitlesByDate.get(draft.date) || [];
    const dayEventTitleHtml = dayEventTitles.length
      ? `<div class="sheet-bday">${dayEventTitles.map((n) =>
          `<div>${icon('tent')} ${esc(n)}（開催）</div>`).join('')}</div>`
      : '';

    // イベント歩合（対応済み）はイベント名ごとに表示。複数イベントなら複数行。
    const dayEvents = eventDetailByDate.get(draft.date) || [];
    const dayEventHtml = dayEvents.length
      ? `<div class="sheet-bday">${dayEvents.map((e) =>
          `<div>${icon('party')} ${esc(e.name)}（対応済み） <strong>${yen(e.back)}</strong></div>`).join('')}</div>`
      : '';

    body.innerHTML = `
      ${dayTodosHtml}
      ${dayVisitsHtml}
      ${dayBdayHtml}
      ${dayEventTitleHtml}
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
      <div class="inc-head">
        <div class="inc-head-title">${icon('money')} 入った歩合</div>
        <div class="inc-head-sub">「歩合項目を選んで入力」から件数を入力できます</div>
      </div>
      ${itemsHtml}
      <div class="sheet-total">
        <div>
          <span>この日の合計 <span class="muted" id="sheetHours"></span></span>
          <div class="sheet-sub">うち歩合 <strong id="sheetInc">¥0</strong></div>
        </div>
        <strong id="sheetTotal" style="font-size:26px;font-weight:800">¥0</strong>
      </div>
      ${draft.savedAt ? `<div class="saved-at muted">${icon('note')} 記録日時：${esc(dateTimeJa(draft.savedAt))}</div>` : ''}
      <label style="display:block;margin-bottom:12px">
        <input id="sConfirmed" type="checkbox" ${draft.confirmed ? 'checked' : ''}> 確定（実績）にする
        <span class="muted">＝カレンダーに金額表示。OFFは「出勤予定」</span>
      </label>
      <button class="btn" id="sSave">保存</button>
      <div style="height:8px"></div>
      <button class="btn btn-ghost" id="sDelete" style="color:#f55">この日の記録を削除</button>`;

    body.querySelectorAll('.visit-line').forEach((li) => {
      const vid = li.dataset.id;
      li.querySelector('.todo-check').onclick = async () => {
        const v = state.visits.find((x) => x.id === vid);
        if (!v) return;
        await put('visits', { ...v, done: !v.done });
        await loadAll();
        const nv = state.visits.find((x) => x.id === vid);
        li.classList.toggle('done', !!(nv && nv.done));
        li.querySelector('.todo-check').innerHTML = nv && nv.done ? icon('check') : '';
      };
    });

    // ===== 入った歩合の要約（入力済み項目の一覧）＋「歩合項目を選んで入力」で選択画面を開く =====
    const KIND_EMOJI = { income: '💰', penalty: '⚠️', deduction: '🧾' };
    const itemEmoji = (it) => it.icon || KIND_EMOJI[it.kind || 'income'] || '💰';
    const summaryBox = q('#incSummary');

    const renderIncSummary = () => {
      if (!summaryBox) return;
      const rows = state.backItems
        .map((it) => ({ it, c: Number(counts[it.id]) || 0, s: Number(sales[it.id]) || 0 }))
        .filter((r) => r.c > 0 || r.s > 0);
      if (!rows.length) {
        summaryBox.innerHTML = `<p class="inc-empty">まだ歩合が入力されていません。<br>下のボタンから項目を選んで入力できます。</p>`;
        return;
      }
      summaryBox.innerHTML = `<div class="inc-sum-list">${rows.map(({ it, c, s }) => {
        const amt = backAmount(it, { count: c, sales: s });
        const neg = it.kind === 'penalty' || it.kind === 'deduction';
        const qtyTxt = c > 0 ? `×${c}` : (s > 0 ? `売上${yen(s)}` : '');
        return `<div class="inc-sum-row">
          <span class="inc-sum-emoji">${esc(itemEmoji(it))}</span>
          <span class="inc-sum-name">${esc(it.name || '（名称未設定）')}</span>
          <span class="inc-sum-qty">${qtyTxt}</span>
          <span class="inc-sum-amt${neg ? ' neg' : ''}">${yen(amt)}</span>
        </div>`;
      }).join('')}</div>`;
    };

    const openBtn = q('#incOpen');
    if (openBtn) openBtn.onclick = () => {
      // 現在の入力を初期値として選択画面へ渡す
      const initial = {};
      for (const it of state.backItems) {
        const c = Number(counts[it.id]) || 0, s = Number(sales[it.id]) || 0;
        if (c > 0 || s > 0) initial[it.id] = { count: c, sales: s };
      }
      openItemPicker({
        initial,
        onApply: (entries) => {
          // 選択画面の内容でその日の歩合入力を丸ごと置き換える
          counts = {}; sales = {};
          for (const [id, e] of Object.entries(entries)) {
            if (e.count) counts[id] = e.count;
            if (e.sales) sales[id] = e.sales;
          }
          renderIncSummary();
          recalc();
        },
      });
    };

    renderIncSummary();

    sheet.querySelectorAll('#sStart,#sEnd,#sBreak').forEach((inp) => {
      inp.oninput = recalc; inp.onchange = recalc;
    });
    q('#sAbsent').onchange = recalc;
    // 「確定（実績）にする」はチェックしただけでは保存されない。
    // 自動更新と勘違いされないよう、オンにしたら「保存」を促すトーストを出す。
    q('#sConfirmed').onchange = (e) => {
      recalc();
      if (e.target.checked) toast('「保存」を押すと\n確定されます');
    };

    q('#sSave').onclick = async () => {
      const rec = collectDraft();
      rec.savedAt = Date.now(); // 「保存」を押した日時を記録（毎回最新に更新）
      await put('shifts', rec);
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

      const now = Date.now();
      for (const d of emptyDates) {
        await put('shifts', { id: uid(), date: d, start, end, breakMin, confirmed, entries: [], savedAt: now });
      }
      let ow = 0;
      if (overwrite) {
        for (const d of existingDates) {
          const ex = state.shifts.find((s) => s.date === d);
          // 時間帯・確定のみ更新。歩合（entries）は保持、欠勤は解除
          await put('shifts', { ...ex, start, end, breakMin, confirmed, absent: false, savedAt: now });
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
