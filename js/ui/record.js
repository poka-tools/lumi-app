import { state, loadAll } from '../state.js';
import { put, uid } from '../db.js';
import { workedHours, shiftTotal } from '../calc.js';
import { yen, esc } from '../format.js';
import { navigate } from '../app.js';

export let editingShift = null;
export function setEditingShift(s) { editingShift = s; }

export async function renderRecord(el) {
  const today = new Date().toISOString().slice(0, 10);
  const s = editingShift || {
    id: uid(), date: today, start: '20:00', end: '01:00',
    breakMin: 0, confirmed: false, entries: [],
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
      <label><input id="confirmed" type="checkbox" ${s.confirmed ? 'checked' : ''}> 確定（実績）にする</label>
    </div>

    <div class="card">
      <h3>バック実績</h3>
      ${state.backItems.length === 0
        ? '<p class="muted">先に「設定」でバック項目を登録してください。</p>'
        : state.backItems.map((it) => `
          <div class="field">
            <label>${esc(it.name)} <span class="muted">(${it.type === 'fixed' ? (Number(it.value) || 0) + '円/件' : (Number(it.value) || 0) + '%'})</span></label>
            <input class="entry" data-id="${esc(it.id)}" data-type="${it.type === 'rate' ? 'rate' : 'fixed'}" type="number" inputmode="numeric"
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
