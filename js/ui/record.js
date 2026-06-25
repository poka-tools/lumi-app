export let editingShift = null;
export function setEditingShift(s) { editingShift = s; }
export async function renderRecord(el) { el.innerHTML = '<div class="card">記録（仮）</div>'; }
