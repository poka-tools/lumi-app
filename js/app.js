import { loadAll } from './state.js';
import { renderHome } from './ui/home.js';
import { renderCalendar } from './ui/calendar.js';
import { renderRecord, setEditingShift } from './ui/record.js';
import { renderReport } from './ui/report.js';
import { renderSettings } from './ui/settings.js';
import { esc } from './format.js';

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

function hideSplash() {
  const el = document.getElementById('splash');
  if (!el) return;
  el.classList.add('hide');
  el.addEventListener('transitionend', () => el.remove(), { once: true });
  setTimeout(() => el.remove(), 700); // transition 無効時のフォールバック
}

(async () => {
  const minSplash = new Promise((r) => setTimeout(r, 1100)); // 最低表示時間
  try {
    await loadAll();
    await navigate('home');
  } catch (err) {
    console.error('初期化に失敗しました:', err);
    screen.innerHTML = `
      <div class="card">
        <h3>読み込みに失敗しました</h3>
        <p class="muted">${esc(String((err && err.message) || err))}</p>
        <p class="muted">プライベートブラウズや <code>file://</code> で開いていると
        データ保存（IndexedDB）が使えない場合があります。
        <code>python3 -m http.server</code> などHTTP経由で開いてください。</p>
      </div>`;
  } finally {
    await minSplash;
    hideSplash(); // 何があってもスプラッシュは必ず閉じる
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
})();
