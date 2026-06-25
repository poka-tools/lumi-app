import { state, shiftsOfMonth } from '../state.js';
import { shiftTotal } from '../calc.js';
import { yen, esc } from '../format.js';
import { setEditingShift } from './record.js';
import { navigate } from '../app.js';

export async function renderCalendar(el) {
  const [y, m] = state.month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const byDate = new Map(shiftsOfMonth().map((s) => [s.date, s]));
  const wage = state.profile.hourlyWage, items = state.backItems;

  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push('<div></div>');
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${state.month}-${String(d).padStart(2, '00')}`;
    const s = byDate.get(iso);
    const amount = s ? yen(shiftTotal(wage, items, s)) : '';
    const cls = s ? (s.confirmed ? 'has-confirmed' : 'has-draft') : '';
    cells.push(`<div class="cal-cell ${cls}" data-date="${esc(iso)}">
      <div class="cal-day">${d}</div><div class="cal-amt">${amount}</div></div>`);
  }

  el.innerHTML = `
    <div class="row" style="justify-content:space-between;align-items:center">
      <button id="prev" class="btn-ghost btn" style="width:auto;padding:6px 12px">‹</button>
      <h2>${y}年${m}月</h2>
      <button id="next" class="btn-ghost btn" style="width:auto;padding:6px 12px">›</button>
    </div>
    <div class="cal-grid head">${['日','月','火','水','木','金','土'].map((w) => `<div>${w}</div>`).join('')}</div>
    <div class="cal-grid" id="grid">${cells.join('')}</div>`;

  const shiftMonth = (delta) => {
    const d = new Date(y, m - 1 + delta, 1);
    state.month = d.toISOString().slice(0, 7);
    renderCalendar(el);
  };
  el.querySelector('#prev').onclick = () => shiftMonth(-1);
  el.querySelector('#next').onclick = () => shiftMonth(1);

  el.querySelectorAll('.cal-cell').forEach((cell) => {
    cell.onclick = () => {
      const iso = cell.dataset.date;
      const existing = state.shifts.find((s) => s.date === iso);
      setEditingShift(existing || { date: iso, start: '20:00', end: '01:00', breakMin: 0, confirmed: false, entries: [] });
      navigate('record');
    };
  });
}
