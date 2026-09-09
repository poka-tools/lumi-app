import { state, loadAll } from '../state.js';
import { put, uid } from '../db.js';
import { workedHours, shiftTotal, backAmount } from '../calc.js';
import { yen, esc } from '../format.js';
import { navigate } from '../app.js';
import { icon } from './icons.js';
import { openItemPicker } from './itempicker.js';
import { toast } from './toast.js';

export let editingShift = null;
export function setEditingShift(s) { editingShift = s; }

const KIND_EMOJI = { income: '💰', penalty: '⚠️', deduction: '🧾' };
const itemEmoji = (it) => it.icon || KIND_EMOJI[it.kind || 'income'] || '💰';

export async function renderRecord(el) {
  const today = new Date().toISOString().slice(0, 10);
  const s = editingShift || {
    id: uid(), date: today,
    start: state.profile.defaultStart || '20:00',
    end: state.profile.defaultEnd || '01:00',
    breakMin: Number(state.profile.defaultBreakMin) || 0, confirmed: false, entries: [],
  };
  if (!s.id) s.id = uid();

  // 歩合の作業用ステート（項目id -> {count, sales}）。既存エントリーから初期化。
  const picked = {};
  for (const e of (s.entries || [])) {
    if (e && e.backItemId) picked[e.backItemId] = { count: Number(e.count) || 0, sales: Number(e.sales) || 0 };
  }

  const incBody = state.backItems.length === 0
    ? '<p class="muted">先に「設定」で歩合項目を登録してください。</p>'
    : `<div class="inc-head">
         <div class="inc-head-title">${icon('money')} 入った歩合</div>
         <div class="inc-head-sub">「歩合項目を選んで入力」から件数を入力できます</div>
       </div>
       <div id="incSummary"></div>
       <button class="btn btn-ghost inc-open" id="incOpen" type="button">${icon('plus')} 歩合項目を選んで入力する</button>`;

  el.innerHTML = `
    <h2>収入を記録</h2>
    <div class="card">
      <div class="field"><label>日付</label><input id="date" type="date" value="${esc(s.date)}"></div>
      <div class="row">
        <div class="field" style="flex:1"><label>開始</label><input id="start" type="time" value="${esc(s.start)}"></div>
        <div class="field" style="flex:1"><label>終了</label><input id="end" type="time" value="${esc(s.end)}"></div>
        <div class="field" style="flex:1"><label>休憩(分)</label><input id="break" type="number" inputmode="numeric" placeholder="0" value="${Number(s.breakMin) || ''}"></div>
      </div>
      <div class="row" style="gap:16px;flex-wrap:wrap">
        <label><input id="confirmed" type="checkbox" ${s.confirmed ? 'checked' : ''}> 確定（実績）にする</label>
      </div>
    </div>

    <div class="card">
      <h3>歩合・ペナルティ実績</h3>
      ${incBody}
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
    s.entries = Object.entries(picked)
      .map(([id, e]) => ({ backItemId: id, count: Number(e.count) || 0, sales: Number(e.sales) || 0 }))
      .filter((e) => e.count || e.sales);
    return s;
  };

  // ===== 入った歩合の要約（入力済み項目だけ・カレンダー日別シートと同じ見た目）=====
  const summaryBox = el.querySelector('#incSummary');
  const renderIncSummary = () => {
    if (!summaryBox) return;
    const rows = state.backItems
      .map((it) => ({ it, c: Number((picked[it.id] || {}).count) || 0, sl: Number((picked[it.id] || {}).sales) || 0 }))
      .filter((r) => r.c > 0 || r.sl > 0);
    if (!rows.length) {
      summaryBox.innerHTML = `<p class="inc-empty">まだ歩合が入力されていません。<br>下のボタンから項目を選んで入力できます。</p>`;
      return;
    }
    summaryBox.innerHTML = `<div class="inc-sum-list">${rows.map(({ it, c, sl }) => {
      const amt = backAmount(it, { count: c, sales: sl });
      const neg = it.kind === 'penalty' || it.kind === 'deduction';
      const qtyTxt = c > 0 ? `×${c}` : (sl > 0 ? `売上${yen(sl)}` : '');
      return `<div class="inc-sum-row">
        <span class="inc-sum-emoji">${esc(itemEmoji(it))}</span>
        <span class="inc-sum-name">${esc(it.name || '（名称未設定）')}</span>
        <span class="inc-sum-qty">${qtyTxt}</span>
        <span class="inc-sum-amt${neg ? ' neg' : ''}">${yen(amt)}</span>
      </div>`;
    }).join('')}</div>`;
  };

  const updatePreview = () => {
    const cur = collect();
    el.querySelector('#preview').textContent = yen(shiftTotal(state.profile, state.backItems, cur));
    el.querySelector('#hours').textContent = `実働 ${workedHours(cur)} 時間`;
  };

  const openBtn = el.querySelector('#incOpen');
  if (openBtn) openBtn.onclick = () => {
    openItemPicker({
      initial: picked,
      onApply: (entries) => {
        // 入力済みだけ返るので、picked を丸ごと差し替え（未選択は消える＝正しい挙動）
        for (const k of Object.keys(picked)) delete picked[k];
        Object.assign(picked, entries);
        renderIncSummary();
        updatePreview();
      },
    });
  };

  el.querySelectorAll('#date,#start,#end,#break,#confirmed').forEach((i) => { i.oninput = updatePreview; });
  renderIncSummary();
  updatePreview();

  el.querySelector('#save').onclick = async () => {
    await put('shifts', { ...collect(), savedAt: Date.now() });
    setEditingShift(null);
    await loadAll();
    toast('保存しました');
    navigate('home');
  };
}
