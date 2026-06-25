import { loadAll } from './state.js';
import { renderHome } from './ui/home.js';
import { renderCalendar } from './ui/calendar.js';
import { renderRecord, setEditingShift } from './ui/record.js';
import { renderReport } from './ui/report.js';
import { renderSettings } from './ui/settings.js';

const screen = document.getElementById('screen');
const renderers = {
  home: renderHome, calendar: renderCalendar, record: renderRecord,
  report: renderReport, settings: renderSettings,
};

export async function navigate(tab) {
  if (tab !== 'record') setEditingShift(null);
  document.querySelectorAll('#tabbar button').forEach((b) =>
    b.classList.toggle('active', b.dataset.tab === tab));
  screen.innerHTML = '';
  await renderers[tab](screen);
  screen.scrollTop = 0;
}

document.getElementById('tabbar').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (btn) navigate(btn.dataset.tab);
});

(async () => {
  await loadAll();
  await navigate('home');
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
})();
