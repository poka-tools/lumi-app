import { loadAll } from './state.js';
import { renderHome } from './ui/home.js';
import { renderCalendar } from './ui/calendar.js';
import { renderRecord, setEditingShift } from './ui/record.js';
import { renderReport } from './ui/report.js';
import { renderSettings } from './ui/settings.js';
import { renderBackItems } from './ui/backitems.js';
import { renderCustomers } from './ui/customers.js';
import { renderHelp } from './ui/help.js';
import { maybeStartTour, startTour } from './ui/onboarding.js';
import { esc } from './format.js';

const screen = document.getElementById('screen');
const appbar = document.getElementById('appbar');
const renderers = {
  home: renderHome, calendar: renderCalendar, record: renderRecord,
  report: renderReport, customers: renderCustomers, settings: renderSettings,
  backitems: renderBackItems, help: renderHelp,
};
// 下タブのハイライト用（専用サブページは親タブを点灯させる）。
const NAV_TAB = { backitems: 'settings' };

// 画面ごとのヘッダー。ホームと主要タブは「Lumi」ブランドバー、
// メニューから開く設定・ヘルプ・記録は「‹ 戻る」バー（ピンクグラデ）。
const BRAND_TABS = new Set(['home', 'calendar', 'report', 'customers', 'backitems']);
const BACK_TITLES = { settings: '設定', help: 'ヘルプ', record: '記録' };

function brandBarHtml() {
  const bell = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9.5a6 6 0 0 1 12 0c0 4.6 1.8 5.7 1.8 5.7H4.2S6 14.1 6 9.5Z"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>`;
  const menu = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`;
  return `<div class="ab-brand">Lumi<span class="ab-spark">✦</span></div>
    <div class="ab-actions">
      <button id="abBell" class="ab-icon" type="button" aria-label="お知らせ">${bell}</button>
      <button id="abMenu" class="ab-icon" type="button" aria-label="メニュー">${menu}</button>
    </div>`;
}

function setAppbar(tab) {
  if (BRAND_TABS.has(tab)) {
    appbar.className = 'brand';
    appbar.innerHTML = brandBarHtml();
    appbar.querySelector('#abBell').onclick = () => navigate('home');
    appbar.querySelector('#abMenu').onclick = openDrawer;
  } else {
    appbar.className = 'back';
    appbar.innerHTML = `<button id="abBack" class="ab-back" type="button" aria-label="戻る">‹</button>
      <div class="ab-title">${esc(BACK_TITLES[tab] || '')}</div>
      <div class="ab-actions"></div>`;
    appbar.querySelector('#abBack').onclick = () => navigate('home');
  }
}

export async function navigate(tab) {
  if (tab !== 'record') setEditingShift(null);
  const navTab = NAV_TAB[tab] || tab;
  document.querySelectorAll('#tabbar button').forEach((b) =>
    b.classList.toggle('active', b.dataset.tab === navTab));
  setAppbar(tab);
  screen.innerHTML = '';
  await renderers[tab](screen);
  screen.scrollTop = 0;
  window.scrollTo(0, 0);
}

document.getElementById('tabbar').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (btn) navigate(btn.dataset.tab);
});

// ===== ヘッダーのメニュードロワー =====
const drawer = document.getElementById('drawer');
const drawerBackdrop = document.getElementById('drawerBackdrop');
function openDrawer() {
  drawer.classList.add('show');
  drawerBackdrop.classList.add('show');
  drawer.removeAttribute('inert');            // 開いている間はフォーカス可能に
  drawer.setAttribute('aria-hidden', 'false');
}
function closeDrawer() {
  // aria-hidden の要素内にフォーカスが残らないよう、閉じる前にフォーカスを外す
  if (drawer.contains(document.activeElement)) document.activeElement.blur();
  drawer.classList.remove('show');
  drawerBackdrop.classList.remove('show');
  drawer.setAttribute('inert', '');           // 閉じたらフォーカス・支援技術から除外
  drawer.setAttribute('aria-hidden', 'true');
}
drawerBackdrop.addEventListener('click', closeDrawer);
drawer.addEventListener('click', async (e) => {
  const item = e.target.closest('[data-go]');
  const closeBtn = e.target.closest('[data-drawer-close]');
  if (closeBtn) { closeDrawer(); return; }
  if (!item) return;
  const go = item.dataset.go;
  closeDrawer();
  if (go === 'guide') { startTour(); return; }
  if (go === 'backup') {
    await navigate('settings');
    const bc = document.getElementById('backupCard');
    if (bc) { bc.open = true; bc.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    return;
  }
  navigate(go);
});

function hideSplash() {
  const el = document.getElementById('splash');
  if (!el) return;
  el.classList.add('hide');
  el.addEventListener('transitionend', () => el.remove(), { once: true });
  setTimeout(() => el.remove(), 700); // transition 無効時のフォールバック
}

(async () => {
  // 端末のストレージを「永続」に昇格させる（best-effort ストレージだと容量逼迫時に消えるため）。
  // 失敗・非対応でもアプリ動作には影響しないので握りつぶす。
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }
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
  maybeStartTour(); // 初回のみ目印つき使い方ツアーを表示（読み込み失敗時は profile が無いので出ない）
  if ('serviceWorker' in navigator) {
    // SW更新の反映漏れ（新旧アセット混在）を防ぐ：新しいSWが制御を取ったら一度だけ自動リロードして
    // 全アセットを新版に揃える。初回登録時（もともと制御SWが無い）はリロードしない。
    const hadController = !!navigator.serviceWorker.controller;
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || refreshing) return;
      refreshing = true;
      window.location.reload();
    });
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
})();
