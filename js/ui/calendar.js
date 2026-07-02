import { state, shiftsOfMonth, loadAll } from '../state.js';
import { put, del, uid } from '../db.js';
import { shiftTotal, workedHours } from '../calc.js';
import { yen, esc, weekdayJa } from '../format.js';
import { hasFixed, hasRate, itemLabel } from './backfields.js';
import { renderTodos } from './todos.js';

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

  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push('<div></div>');
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${state.month}-${String(d).padStart(2, '0')}`;
    const s = byDate.get(iso);
    let body = '', cls = '';
    if (s && s.confirmed) {
      body = `<div class="cal-amt">${yen(shiftTotal(wage, items, s))}</div>`;
      cls = 'has-confirmed';
    } else if (s) {
      // 入力未完了＝出勤予定：時刻を表示
      body = `<div class="cal-amt planned">${esc(s.start || '')}〜</div><div class="cal-tag">予定</div>`;
      cls = 'has-draft';
    }
    const dueT = todosByDate.get(iso) || [];
    const pend = dueT.filter((t) => !t.done).length;
    const todoMark = dueT.length
      ? `<div class="cal-todo${pend ? '' : ' done'}">${pend ? '📌' + (pend > 1 ? pend : '') : '✓'}</div>`
      : '';
    cells.push(`<div class="cal-cell ${cls}" data-date="${esc(iso)}">
      <div class="cal-day">${d}</div>${body}${todoMark}</div>`);
  }

  el.innerHTML = `
    <div class="row" style="justify-content:space-between;align-items:center">
      <button id="prev" class="btn-ghost btn" style="width:auto;padding:6px 12px">‹</button>
      <h2>${y}年${m}月</h2>
      <button id="next" class="btn-ghost btn" style="width:auto;padding:6px 12px">›</button>
    </div>
    <div class="cal-grid head">${['日','月','火','水','木','金','土'].map((w) => `<div>${w}</div>`).join('')}</div>
    <div class="cal-grid" id="grid">${cells.join('')}</div>
    <p class="muted" style="text-align:center;margin-top:10px">日付をタップして記録・予定を入力</p>

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
    draft.nomination = q('#sNom').checked;
    draft.douhan = q('#sDou').checked;
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
    q('#sheetTotal').textContent = yen(shiftTotal(state.profile, state.backItems, draft));
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

    const chipHtml = (it) => {
      const hasC = hasFixed(it);
      const c = Number(counts[it.id]) || 0, s = Number(sales[it.id]) || 0;
      const active = c > 0 || s > 0;
      const badge = hasC ? (c > 0 ? '×' + c : '') : (s > 0 ? '✓' : '');
      return `<button type="button" class="chip-inc${active ? ' active' : ''}${it.kind === 'penalty' ? ' penalty' : ''}" data-id="${esc(it.id)}">
        <span class="chip-name">${it.kind === 'penalty' ? '⚠' : ''}${esc(it.name)}</span>
        ${badge ? `<span class="chip-badge">${badge}</span>` : ''}
      </button>`;
    };
    const itemsHtml = state.backItems.length === 0
      ? '<p class="muted">先に「設定」でインセンティブ項目を登録してください。</p>'
      : `<div class="chip-grid" id="chipGrid">${state.backItems.map(chipHtml).join('')}</div>`;

    const dayTodos = state.todos.filter((t) => t.due === draft.date);
    const dayTodosHtml = dayTodos.length ? `
      <div class="sheet-todos">
        <div class="muted" style="margin-bottom:4px">📌 この日のやること</div>
        <ul>${dayTodos.map((t) => `<li class="${t.done ? 'done' : ''}">${esc(t.text)}</li>`).join('')}</ul>
      </div>` : '';

    body.innerHTML = `
      ${dayTodosHtml}
      <div class="row">
        <div class="field" style="flex:1"><label>開始</label><input id="sStart" type="time" value="${esc(draft.start || '20:00')}"></div>
        <div class="field" style="flex:1"><label>終了</label><input id="sEnd" type="time" value="${esc(draft.end || '01:00')}"></div>
        <div class="field" style="flex:1"><label>休憩(分)</label><input id="sBreak" type="number" inputmode="numeric" value="${Number(draft.breakMin) || 0}"></div>
      </div>
      <div class="row" style="gap:16px;flex-wrap:wrap;margin-bottom:6px">
        <label><input id="sNom" type="checkbox" ${draft.nomination ? 'checked' : ''}> 指名あり</label>
        <label><input id="sDou" type="checkbox" ${draft.douhan ? 'checked' : ''}> 同伴あり</label>
      </div>
      <h4 style="margin:10px 0 4px">入ったインセンティブ</h4>
      <p class="muted" style="margin:0 0 8px;font-size:12px">タップで＋1／長押しで件数・売上を調整</p>
      ${itemsHtml}
      <div class="sheet-total">
        <span>この日の合計 <span class="muted" id="sheetHours"></span></span>
        <strong id="sheetTotal" style="font-size:26px;font-weight:800">¥0</strong>
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

    // ===== インセンティブ・チップ：タップ＝＋1／長押し＝調整ポップオーバー =====
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
        <div class="chip-pop-title">${it.kind === 'penalty' ? '⚠' : ''}${esc(it.name)}
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
    if (chipGrid) chipGrid.querySelectorAll('.chip-inc').forEach((btn) => {
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

    sheet.querySelectorAll('#sStart,#sEnd,#sBreak,#sNom,#sDou').forEach((inp) => {
      inp.oninput = recalc; inp.onchange = recalc;
    });

    q('#sSave').onclick = async () => {
      await put('shifts', collectDraft());
      await loadAll();
      closeSheet();
      renderCalendar(el);
    };
    q('#sDelete').onclick = async () => {
      const exists = state.shifts.some((s) => s.id === draft.id);
      if (exists && !confirm('この日の記録を削除します。よろしいですか？（元に戻せません）')) return;
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
    cell.onclick = () => openSheet(cell.dataset.date);
  });
}
