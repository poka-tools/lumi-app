import { state, loadAll } from '../state.js';
import { icon } from './icons.js';
import { put, del, uid } from '../db.js';
import { esc, dateTimeJa } from '../format.js';
import { sortMemos, hasMemoContent } from '../memos-logic.js';
import { compressImage } from '../img.js';
import { confirmModal } from './confirm.js';
import { toast } from './toast.js';

// 選択中の写真（dataURL）を追加フォームのスコープで保持する。
let pendingPhoto = '';

// カレンダー画面「やることリスト」の下の汎用メモ（写真つき・日付非依存の走り書き）。
export function renderMemos(el) {
  const draw = () => {
    const memos = sortMemos(state.memos);

    const rowHtml = (m) => `
      <li class="memo-item" data-id="${esc(m.id)}">
        ${m.photo ? `<img class="memo-thumb" src="${esc(m.photo)}" alt="添付写真" data-photo="${esc(m.id)}">` : ''}
        <div class="memo-main">
          ${m.text ? `<div class="memo-text">${esc(m.text)}</div>` : ''}
          <div class="memo-date muted">${icon('note')} ${esc(dateTimeJa(m.createdAt))}</div>
        </div>
        <button class="memo-del" type="button" aria-label="削除">${icon('close')}</button>
      </li>`;

    const listHtml = memos.length === 0
      ? '<p class="muted memo-empty">メモを追加すると、ここに表示されます。</p>'
      : memos.map(rowHtml).join('');

    el.innerHTML = `
      <section class="card memo-card">
        <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px">
          <h3 style="margin:0">メモ</h3>
          <span class="muted">${memos.length ? `${memos.length} 件` : ''}</span>
        </div>
        <p class="muted" style="font-size:12px;margin:0 0 8px">気づいたこと・引き継ぎ・写真を残せます。日付に紐づかない自由メモです。</p>
        <form class="memo-add" id="memoAdd">
          <textarea id="memoInput" class="inline-input" placeholder="メモを入力…"
            maxlength="1000" rows="2" style="width:100%;resize:vertical"></textarea>
          <div class="memo-photo-preview" id="memoPreview" ${pendingPhoto ? '' : 'hidden'}>
            ${pendingPhoto ? `<img src="${esc(pendingPhoto)}" alt="選択中の写真">
              <button type="button" id="memoPhotoClear" aria-label="写真を外す">${icon('close')}</button>` : ''}
          </div>
          <div class="row" style="margin-top:8px;align-items:center;gap:8px">
            <label class="btn btn-ghost memo-photo-btn" style="flex:0 0 auto;margin:0">
              ${icon('camera')} 写真
              <input id="memoPhoto" type="file" accept="image/*" hidden>
            </label>
            <button class="btn" type="submit" style="flex:1;padding:10px 16px">追加</button>
          </div>
        </form>
        <ul class="memo-list">${listHtml}</ul>
      </section>`;

    const photoInput = el.querySelector('#memoPhoto');
    photoInput.onchange = async () => {
      const file = photoInput.files && photoInput.files[0];
      if (!file) return;
      try {
        pendingPhoto = await compressImage(file);
        draw();
        el.querySelector('#memoInput').focus();
      } catch {
        toast('写真を読み込めませんでした');
      }
    };

    const clearBtn = el.querySelector('#memoPhotoClear');
    if (clearBtn) clearBtn.onclick = () => { pendingPhoto = ''; draw(); };

    el.querySelector('#memoAdd').onsubmit = async (e) => {
      e.preventDefault();
      const text = el.querySelector('#memoInput').value.trim();
      const photo = pendingPhoto;
      if (!hasMemoContent({ text, photo })) { toast('メモか写真を入力してください'); return; }
      await put('memos', { id: uid(), text, photo, createdAt: Date.now() });
      pendingPhoto = '';
      await loadAll();
      draw();
    };

    el.querySelectorAll('.memo-item').forEach((li) => {
      const id = li.dataset.id;
      li.querySelector('.memo-del').onclick = async () => {
        if (!(await confirmModal('このメモを削除します。よろしいですか？（元に戻せません）'))) return;
        await del('memos', id);
        await loadAll();
        draw();
      };
      const thumb = li.querySelector('.memo-thumb');
      if (thumb) thumb.onclick = () => openPhoto(thumb.src);
    });
  };

  draw();
}

// 写真をタップで全画面拡大（背景タップで閉じる）。
function openPhoto(src) {
  const back = document.createElement('div');
  back.className = 'memo-lightbox';
  back.innerHTML = `<img src="${esc(src)}" alt="添付写真"><button type="button" class="memo-lightbox-close" aria-label="閉じる">${icon('close')}</button>`;
  const close = () => back.remove();
  back.onclick = close;
  document.body.appendChild(back);
}
