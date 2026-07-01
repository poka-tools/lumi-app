import { state, loadAll } from '../state.js';
import { put, uid } from '../db.js';
import { workedHours, shiftTotal } from '../calc.js';
import { yen, esc } from '../format.js';
import { navigate } from '../app.js';
import { hasFixed, hasRate, itemLabel } from './backfields.js';

export let editingShift = null;
export function setEditingShift(s) { editingShift = s; }

export async function renderRecord(el) {
  const today = new Date().toISOString().slice(0, 10);
  const s = editingShift || {
    id: uid(), date: today,
    start: state.profile.defaultStart || '20:00',
    end: state.profile.defaultEnd || '01:00',
    breakMin: Number(state.profile.defaultBreakMin) || 0, confirmed: false, entries: [],
  };
  if (!s.id) s.id = uid();

  const entryVal = (id, key) => {
    const e = (s.entries || []).find((x) => x.backItemId === id);
    return e && e[key] != null ? e[key] : '';
  };

  el.innerHTML = `
    <h2>収入を記録</h2>
    <div class="card">
      <div class="field"><label>日付</label><input id="date" type="date" value="${esc(s.date)}"></div>
      <div class="row">
        <div class="field" style="flex:1"><label>開始</label><input id="start" type="time" value="${esc(s.start)}"></div>
        <div class="field" style="flex:1"><label>終了</label><input id="end" type="time" value="${esc(s.end)}"></div>
        <div class="field" style="flex:1"><label>休憩(分)</label><input id="break" type="number" value="${Number(s.breakMin) || 0}"></div>
      </div>
      <div class="row" style="gap:16px;flex-wrap:wrap">
        <label><input id="nomination" type="checkbox" ${s.nomination ? 'checked' : ''}> 指名あり</label>
        <label><input id="douhan" type="checkbox" ${s.douhan ? 'checked' : ''}> 同伴あり</label>
        <label><input id="confirmed" type="checkbox" ${s.confirmed ? 'checked' : ''}> 確定（実績）にする</label>
      </div>
    </div>

    <div class="card">
      <h3>インセンティブ・ペナルティ実績</h3>
      ${state.backItems.length === 0
        ? '<p class="muted">先に「設定」でインセンティブ項目を登録してください。</p>'
        : state.backItems.map((it) => `
          <div class="field" data-row="${esc(it.id)}">
            <label>${esc(it.name)} <span class="muted">(${esc(itemLabel(it))})</span></label>
            <div class="row">
              ${hasFixed(it) ? `<input class="entry" data-id="${esc(it.id)}" data-key="count" type="number" inputmode="numeric"
                placeholder="件数" value="${entryVal(it.id, 'count')}" style="flex:1">` : ''}
              ${hasRate(it) ? `<input class="entry" data-id="${esc(it.id)}" data-key="sales" type="number" inputmode="numeric"
                placeholder="対象売上(円)" value="${entryVal(it.id, 'sales')}" style="flex:1">` : ''}
            </div>
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
    s.nomination = el.querySelector('#nomination').checked;
    s.douhan = el.querySelector('#douhan').checked;
    // 同一項目の件数・売上を1エントリーにまとめる
    const byId = new Map();
    el.querySelectorAll('.entry').forEach((inp) => {
      const id = inp.dataset.id, key = inp.dataset.key, v = Number(inp.value) || 0;
      const e = byId.get(id) || { backItemId: id };
      e[key] = v;
      byId.set(id, e);
    });
    s.entries = [...byId.values()].filter((e) => (e.count || e.sales));
    return s;
  };

  const updatePreview = () => {
    const cur = collect();
    el.querySelector('#preview').textContent = yen(shiftTotal(state.profile, state.backItems, cur));
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
