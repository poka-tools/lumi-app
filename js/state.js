import { getAll, getProfile } from './db.js';

export const state = {
  profile: null,
  backItems: [],
  shifts: [],
  announcements: [],
  month: new Date().toISOString().slice(0, 7),
};

export async function loadAll() {
  state.profile = await getProfile();
  state.backItems = (await getAll('backItems')).sort((a, b) => (a.order || 0) - (b.order || 0));
  state.shifts = await getAll('shifts');
  state.announcements = await getAll('announcements');
}

export function shiftsOfMonth(month = state.month) {
  return state.shifts.filter((s) => (s.date || '').startsWith(month));
}
export function prevMonth(month = state.month) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return d.toISOString().slice(0, 7);
}
