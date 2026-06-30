import { state, shiftsOfMonth, loadAll } from '../state.js';
import { put, del, uid } from '../db.js';
import { shiftTotal, workedHours } from '../calc.js';
import { yen, esc, weekdayJa } from '../format.js';
import { hasFixed, hasRate, itemLabel } from './backfields.js';

export async function renderCalendar(el) {
  const [y, m] = state.month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const byDate = new Map(shiftsOfMonth().map((s) => [s.date, s]));
  const wage = state.profile, items = state.backItems;

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
    cells.push(`<div class="cal-cell ${cls}" data-date="${esc(iso)}">
      <div class="cal-day">${d}</div>${body}</div>`);
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

    <div class="sheet-backdrop" id="sheetBackdrop" hidden></div>
    <section class="sheet" id="sheet" hidden aria-label="日別入力">
      <div class="sheet-handle"></div>
      <div class="row" style="justify-content:space-between;align-items:center">
        <h3 id="sheetDate" style="margin:0"></h3>
        <button id="sheetClose" style="border:none;background:none;font-size:20px;color:var(--muted)">✕</button>
      </div>
      <div id="sheetBody"></div>
    </section>`;

  const shiftMonth = (delta) => {
    const d = new Date(y, m - 1 + delta, 1);
    state.month = d.toISOString().slice(0, 7);
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

  const closeSheet = () => {
    sheet.classList.remove('show');
    backdrop.classList.remove('show');
    setTimeout(() => { sheet.hidden = true; backdrop.hidden = true; }, 280);
  };

  const entryVal = (id, key) => {
    const e = (draft.entries || []).find((x) => x.backItemId === id);
    return e && e[key] != null ? e[key] : '';
  };

  // 件数/売上の現在値からバッジと選択状態（見た目）を更新
  const syncRow = (row) => {
    const hasC = row.dataset.hasc === '1';
    const ci = row.querySelector('[data-key="count"]');
    const si = row.querySelector('[data-key="sales"]');
    const c = ci ? Number(ci.value) || 0 : 0;
    const sv = si ? Number(si.value) || 0 : 0;
    const active = c > 0 || sv > 0;
    row.classList.toggle('active', active);
    row.querySelector('.bi-check').textContent = hasC ? (c > 0 ? String(c) : '＋') : (active ? '✓' : '＋');
  };

  const collectDraft = () => {
    draft.start = q('#sStart').value;
    draft.end = q('#sEnd').value;
    draft.breakMin = Number(q('#sBreak').value) || 0;
    draft.confirmed = q('#sConfirmed').checked;
    draft.nomination = q('#sNom').checked;
    draft.douhan = q('#sDou').checked;
    const entries = [];
    sheet.querySelectorAll('.bi-row').forEach((row) => {
      const e = { backItemId: row.dataset.id };
      row.querySelectorAll('.bi-input').forEach((inp) => { e[inp.dataset.key] = Number(inp.value) || 0; });
      if (e.count || e.sales) entries.push(e);
    });
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

    const itemsHtml = state.backItems.length === 0
      ? '<p class="muted">先に「設定」でバック項目を登録してください。</p>'
      : state.backItems.map((it) => {
        const c = Number(entryVal(it.id, 'count')) || 0;
        const sales = entryVal(it.id, 'sales');
        const hasC = hasFixed(it), hasR = hasRate(it);
        const active = c > 0 || (Number(sales) || 0) > 0;
        const badge = hasC ? (c > 0 ? c : '＋') : (active ? '✓' : '＋');
        return `<div class="bi-row ${active ? 'active' : ''}" data-id="${esc(it.id)}" data-hasc="${hasC ? 1 : 0}">
          <div class="bi-head">
            <span class="bi-check">${badge}</span>
            <span style="flex:1">${esc(it.name)} <span class="muted">${esc(itemLabel(it))}</span><div class="muted bi-hint">タップで＋1</div></span>
          </div>
          <div class="bi-controls row" style="margin-top:8px;align-items:center">
            ${hasC ? `<button class="bi-minus" type="button" aria-label="減らす">−</button>
              <input class="bi-input inline-input" data-key="count" type="number" inputmode="numeric" placeholder="件数" value="${c || ''}" style="flex:1;text-align:center">
              <button class="bi-plus" type="button" aria-label="増やす">＋</button>` : ''}
            ${hasR ? `<input class="bi-input inline-input" data-key="sales" type="number" inputmode="numeric" placeholder="対象売上(円)" value="${sales}" style="flex:1">` : ''}
          </div>
        </div>`;
      }).join('');

    body.innerHTML = `
      <div class="row">
        <div class="field" style="flex:1"><label>開始</label><input id="sStart" type="time" value="${esc(draft.start || '20:00')}"></div>
        <div class="field" style="flex:1"><label>終了</label><input id="sEnd" type="time" value="${esc(draft.end || '01:00')}"></div>
        <div class="field" style="flex:1"><label>休憩(分)</label><input id="sBreak" type="number" inputmode="numeric" value="${Number(draft.breakMin) || 0}"></div>
      </div>
      <div class="row" style="gap:16px;flex-wrap:wrap;margin-bottom:6px">
        <label><input id="sNom" type="checkbox" ${draft.nomination ? 'checked' : ''}> 指名あり</label>
        <label><input id="sDou" type="checkbox" ${draft.douhan ? 'checked' : ''}> 同伴あり</label>
      </div>
      <h4 style="margin:10px 0 8px">入ったインセンティブをタップで選択</h4>
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
      <button class="btn btn-ghost" id="sDelete" style="color:#f55">この日の記録を削除</button>`;

    // バック項目：タップ／＋／− で件数更新、売上は直接入力
    sheet.querySelectorAll('.bi-row').forEach((row) => {
      const hasC = row.dataset.hasc === '1';
      const countInp = row.querySelector('[data-key="count"]');
      const setCount = (n) => { countInp.value = n > 0 ? n : ''; syncRow(row); recalc(); };
      if (hasC) {
        const inc = () => setCount((Number(countInp.value) || 0) + 1);
        const dec = () => setCount(Math.max(0, (Number(countInp.value) || 0) - 1));
        row.querySelector('.bi-head').onclick = inc;
        row.querySelector('.bi-plus').onclick = (e) => { e.stopPropagation(); inc(); };
        row.querySelector('.bi-minus').onclick = (e) => { e.stopPropagation(); dec(); };
      } else {
        // 率（売上）項目はタップで入力欄にフォーカス
        const sales = row.querySelector('[data-key="sales"]');
        row.querySelector('.bi-head').onclick = () => { if (sales) sales.focus(); };
      }
    });
    sheet.querySelectorAll('.bi-input').forEach((inp) => {
      inp.oninput = () => { syncRow(inp.closest('.bi-row')); recalc(); };
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
    draft = existing
      ? JSON.parse(JSON.stringify(existing))
      : { id: uid(), date: iso, start: '20:00', end: '01:00', breakMin: 0, confirmed: false, entries: [] };
    renderSheet();
    sheet.hidden = false; backdrop.hidden = false;
    requestAnimationFrame(() => { sheet.classList.add('show'); backdrop.classList.add('show'); });
  };

  el.querySelector('#sheetClose').onclick = closeSheet;
  backdrop.onclick = closeSheet;
  el.querySelectorAll('.cal-cell').forEach((cell) => {
    cell.onclick = () => openSheet(cell.dataset.date);
  });
}
