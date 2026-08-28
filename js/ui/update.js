import { esc } from '../format.js';
import { APP_VERSION } from '../version.js';

// アップデート告知ポップアップ。新しい Service Worker が待機状態になったとき、
// changelog.json から「今動いているバージョンより新しい更新内容」を取得して表示し、
// 「今すぐ更新」で待機中の SW を有効化（→ app.js の controllerchange でリロード）する。

let promptOpen = false;

// changelog.json をネットワークから取得（?ts= でSWキャッシュを回避し常に最新を取る）。
// APP_VERSION より新しいエントリだけを返す（＝この更新で増えた内容）。
async function fetchNewChanges() {
  try {
    const res = await fetch('changelog.json?ts=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return [];
    const list = await res.json();
    if (!Array.isArray(list)) return [];
    return list
      .filter((e) => e && Number(e.v) > APP_VERSION && Array.isArray(e.items))
      .sort((a, b) => Number(b.v) - Number(a.v));
  } catch {
    return [];
  }
}

// reg.waiting がある前提で、更新内容を取得してポップアップを表示する。
export async function promptUpdate(reg) {
  if (promptOpen) return;
  if (!reg || !reg.waiting) return;
  const changes = await fetchNewChanges();
  showModal(changes, () => {
    // 待機中の新SWに skipWaiting を依頼 → 有効化されると controllerchange が発火しリロードされる。
    reg.waiting && reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  });
}

function showModal(changes, onUpdate) {
  promptOpen = true;
  const items = changes.flatMap((e) => e.items);
  const listHtml = items.length
    ? `<ul class="update-list">${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`
    : `<p class="update-generic">最新の改善を反映します。</p>`;

  const back = document.createElement('div');
  back.className = 'modal-backdrop';
  back.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true" aria-label="アップデート">
      <div class="update-head">${icon()}<span>アップデートがあります</span></div>
      <div class="update-sub">最新版に更新できます。更新すると新しい内容が反映されます。</div>
      ${listHtml}
      <div class="modal-actions">
        <button class="btn btn-ghost" type="button" data-act="later">あとで</button>
        <button class="btn" type="button" data-act="now">今すぐ更新</button>
      </div>
    </div>`;
  document.body.appendChild(back);

  const close = () => {
    back.classList.remove('show');
    setTimeout(() => back.remove(), 180);
    promptOpen = false;
  };
  back.querySelector('[data-act="later"]').onclick = close;
  back.onclick = (e) => { if (e.target === back) close(); }; // 背景タップであとで
  const nowBtn = back.querySelector('[data-act="now"]');
  nowBtn.onclick = () => {
    nowBtn.disabled = true;
    nowBtn.textContent = '更新中…';
    back.querySelector('[data-act="later"]').disabled = true;
    onUpdate();
    // リロードはSW有効化後に app.js 側で行われる。届かない環境向けの保険。
    setTimeout(() => window.location.reload(), 2500);
  };
  requestAnimationFrame(() => back.classList.add('show'));
}

function icon() {
  return `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v10"/><path d="m8 9 4 4 4-4"/><path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"/></svg>`;
}
