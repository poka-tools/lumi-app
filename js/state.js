import { getAll, getProfile } from './db.js';

export const state = {
  profile: null,
  backItems: [],
  shifts: [],
  announcements: [],
  todos: [],
  month: monthIso(new Date()),
};

// ローカル日付の年月（YYYY-MM）。toISOString は UTC 変換で月がずれるため使わない。
function monthIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function loadAll() {
  state.profile = await getProfile();
  state.backItems = (await getAll('backItems')).sort((a, b) => (a.order || 0) - (b.order || 0));
  state.shifts = await getAll('shifts');
  state.announcements = await getAll('announcements');
  state.todos = (await getAll('todos')).sort((a, b) => (a.order || 0) - (b.order || 0));
}

export function shiftsOfMonth(month = state.month) {
  return state.shifts.filter((s) => (s.date || '').startsWith(month));
}
export function prevMonth(month = state.month) {
  const [y, m] = month.split('-').map(Number);
  return monthIso(new Date(y, m - 2, 1));
}
