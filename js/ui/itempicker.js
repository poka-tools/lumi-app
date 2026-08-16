// 「歩合項目を選択」フルスクリーンモーダル（日次詳細シートの「絞り込み」から開く）。
// 今月の実績（件数・金額）付きでカテゴリ別に一覧し、複数選択して「選択した歩合を入力する」で
// 呼び出し元（カレンダー日別シート）へ反映する。既存の .bk-* カードスタイルを再利用。
import { state, shiftsOfMonth } from '../state.js';
import { esc, yen } from '../format.js';
import { backItemStats, isDeductionKind } from '../calc.js';
import { itemCategory, categoryList, UNCATEGORIZED } from './backfields.js';
import { icon } from './icons.js';
import { navigate } from '../app.js';

const KIND_EMOJI = { income: '💰', penalty: '⚠️', deduction: '🧾' };
const itemFixed = (it) => (it.type === 'fixed' ? Number(it.value) || 0 : Number(it.fixedValue) || 0);
const itemRate = (it) => (it.type === 'rate' ? Number(it.value) || 0 : Number(it.rateValue) || 0);
const itemUnit = (it) => it.unit || '件';
const itemEmoji = (it) => it.icon || KIND_EMOJI[it.kind || 'income'] || '💰';

// 1件あたりの歩合表示（例「¥1,100/本」「売上10%」／控除・罰金は「−」付き）。
function rateLabel(it) {
  const f = itemFixed(it), r = itemRate(it);
  const sign = isDeductionKind(it.kind) ? '−' : '';
  const parts = [];
  if (f) parts.push(`${sign}¥${f.toLocaleString('ja-JP')}/${itemUnit(it)}`);
  if (r) parts.push(`${sign}売上${r}%`);
  return parts.join(' ＋ ') || '未設定';
}

// 選択の1単位あたりの寄与額（フッター「合計」用）。率のみの項目は0（売上未定のため）。
const unitAmount = (it) => (isDeductionKind(it.kind) ? -Math.abs(itemFixed(it)) : itemFixed(it));

/**
 * 歩合項目選択モーダルを開く。
 * @param {object} opts
 * @param {(ids:string[])=>void} opts.onApply 「選択した歩合を入力する」タップ時に選択IDの配列で呼ばれる。
 */
export function openItemPicker({ onApply } = {}) {
  const selected = new Set();
  let view = 'card';            // 'card' | 'list'
  let query = '';               // 名前検索
  const collapsed = new Set();  // 折りたたみ中の分類

  const stats = backItemStats(state.backItems, shiftsOfMonth());

  const backdrop = document.createElement('div');
  backdrop.className = 'picker-backdrop';
  const modal = document.createElement('div');
  modal.className = 'picker-modal';
  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
  requestAnimationFrame(() => { backdrop.classList.add('show'); modal.classList.add('show'); });

  const close = () => {
    backdrop.classList.remove('show');
    modal.classList.remove('show');
    setTimeout(() => { backdrop.remove(); modal.remove(); }, 280);
  };
  backdrop.onclick = close;

  modal.innerHTML = `
    <div class="picker-head">
      <button class="picker-icobtn" id="pkBack" type="button" aria-label="戻る">${icon('arrowLeft')}</button>
      <h3 class="picker-title">歩合項目を選択</h3>
      <button class="picker-icobtn" id="pkClose" type="button" aria-label="閉じる">${icon('close')}</button>
    </div>
    <div class="picker-toggle">
      <button class="picker-tg" data-view="card" type="button">カード表示</button>
      <button class="picker-tg" data-view="list" type="button">リスト表示</button>
    </div>
    <div class="picker-search">
      <span class="picker-search-ic">${icon('search')}</span>
      <input id="pkSearch" type="search" placeholder="項目名で検索" autocomplete="off">
    </div>
    <div class="picker-body" id="pkBody"></div>
    <div class="picker-foot">
      <div class="picker-foot-info">
        <span>選択中 <strong id="pkSelCount">0件</strong></span>
        <span class="picker-foot-sum">合計 <strong id="pkSelSum">¥0</strong></span>
      </div>
      <button class="btn picker-apply" id="pkApply" type="button">選択した歩合を入力する</button>
    </div>`;

  const body = modal.querySelector('#pkBody');
  const selCountEl = modal.querySelector('#pkSelCount');
  const selSumEl = modal.querySelector('#pkSelSum');

  modal.querySelector('#pkBack').onclick = close;
  modal.querySelector('#pkClose').onclick = close;

  const searchEl = modal.querySelector('#pkSearch');
  searchEl.oninput = () => { query = searchEl.value; drawBody(); };

  const syncToggle = () =>
    modal.querySelectorAll('.picker-tg').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  modal.querySelectorAll('.picker-tg').forEach((b) => {
    b.onclick = () => { view = b.dataset.view; syncToggle(); drawBody(); };
  });

  // ---- グルーピング（分類順） ----
  function groups(items) {
    const map = new Map();
    for (const it of items) {
      const c = itemCategory(it);
      if (!map.has(c)) map.set(c, []);
      map.get(c).push(it);
    }
    const order = categoryList(state.backItems).filter((c) => map.has(c));
    return order.map((c) => ({ cat: c, list: map.get(c) }));
  }

  function filtered() {
    const q = query.trim().toLowerCase();
    return q ? state.backItems.filter((it) => (it.name || '').toLowerCase().includes(q)) : state.backItems;
  }

  function cardHtml(it) {
    const s = stats.get(it.id) || { count: 0, amount: 0 };
    const kind = it.kind || 'income';
    const sel = selected.has(it.id);
    const amtCls = isDeductionKind(kind) ? 'neg' : '';
    const amtText = isDeductionKind(kind) ? '−' + yen(Math.abs(s.amount)) : yen(s.amount);
    return `
      <div class="bk-card pick-card${sel ? ' selected' : ''}" data-id="${esc(it.id)}">
        <div class="bk-ava kind-${kind}">${esc(itemEmoji(it))}</div>
        <div class="bk-card-name">${esc(it.name || '（名称未設定）')}</div>
        <div class="bk-card-rate">${esc(rateLabel(it))}</div>
        <div class="bk-card-use">今月 ${s.count}${esc(itemUnit(it))}</div>
        <div class="bk-card-amt ${amtCls}">${amtText}</div>
        <button class="pick-add" data-id="${esc(it.id)}" type="button" aria-label="${sel ? '選択解除' : '選択'}">${sel ? icon('check') : icon('plus')}</button>
      </div>`;
  }

  function rowHtml(it) {
    const s = stats.get(it.id) || { count: 0, amount: 0 };
    const kind = it.kind || 'income';
    const sel = selected.has(it.id);
    const amtCls = isDeductionKind(kind) ? 'neg' : '';
    const amtText = isDeductionKind(kind) ? '−' + yen(Math.abs(s.amount)) : yen(s.amount);
    return `
      <div class="bk-lrow pick-row${sel ? ' selected' : ''}" data-id="${esc(it.id)}">
        <div class="bk-ava sm kind-${kind}">${esc(itemEmoji(it))}</div>
        <div class="bk-lrow-main">
          <div class="bk-lrow-name">${esc(it.name || '（名称未設定）')}</div>
          <div class="bk-lrow-sub">${esc(rateLabel(it))}・今月 ${s.count}${esc(itemUnit(it))}</div>
        </div>
        <div class="bk-lrow-amt ${amtCls}">${amtText}</div>
        <button class="pick-add" data-id="${esc(it.id)}" type="button" aria-label="${sel ? '選択解除' : '選択'}">${sel ? icon('check') : icon('plus')}</button>
      </div>`;
  }

  function drawBody() {
    if (!state.backItems.length) {
      body.innerHTML = `<div class="picker-empty">
        <div class="picker-empty-ic">${icon('clipboard')}</div>
        <p>まだ歩合項目がありません。</p>
        <button class="btn picker-empty-add" id="pkEmptyAdd" type="button">${icon('plus')} 歩合項目を登録する</button>
      </div>`;
      body.querySelector('#pkEmptyAdd').onclick = () => { close(); navigate('backitems'); };
      return;
    }
    const gs = groups(filtered());
    if (!gs.length) { body.innerHTML = `<p class="muted picker-nores">条件に合う項目がありません。</p>`; return; }

    body.innerHTML = gs.map(({ cat, list }) => {
      const label = cat === UNCATEGORIZED ? '未分類' : esc(cat);
      const total = list.reduce((s, it) => {
        const st = stats.get(it.id);
        return s + (st ? st.amount : 0);
      }, 0);
      const totalTxt = total < 0 ? '−' + yen(Math.abs(total)) : yen(total);
      const isCol = collapsed.has(cat);
      const inner = view === 'card'
        ? `<div class="bk-grid">${list.map(cardHtml).join('')}
             <button class="bk-add pick-newcard" type="button">
               <span class="bk-add-ic">${icon('plus')}</span><span>項目を追加</span></button></div>`
        : `<div class="bk-list">${list.map(rowHtml).join('')}
             <button class="bk-lrow bk-ladd pick-newcard" type="button">
               <span class="bk-add-ic sm">${icon('plus')}</span><span>項目を追加</span></button></div>`;
      return `
        <div class="bk-group pick-group">
          <button class="bk-group-head" type="button" data-toggle="${esc(cat)}">
            <span class="bk-group-name">${label}</span>
            <span class="bk-group-count">${list.length}項目</span>
            <span class="bk-group-total">今月の合計 ${totalTxt}</span>
            <span class="bk-group-chev ${isCol ? '' : 'open'}">${icon('chevronDown')}</span>
          </button>
          ${isCol ? '' : `<div class="bk-group-body">${inner}</div>`}
        </div>`;
    }).join('');

    body.querySelectorAll('.bk-group-head').forEach((h) => {
      h.onclick = () => {
        const c = h.dataset.toggle;
        if (collapsed.has(c)) collapsed.delete(c); else collapsed.add(c);
        drawBody();
      };
    });
    body.querySelectorAll('.pick-add').forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); toggle(b.dataset.id); };
    });
    body.querySelectorAll('.pick-newcard').forEach((b) => {
      b.onclick = () => { close(); navigate('backitems'); };
    });
  }

  function toggle(id) {
    if (selected.has(id)) selected.delete(id); else selected.add(id);
    // 該当カード/行だけ更新（再描画せず入力状態を保つ）
    const el = body.querySelector(`.pick-card[data-id="${CSS.escape(id)}"], .pick-row[data-id="${CSS.escape(id)}"]`);
    if (el) {
      const sel = selected.has(id);
      el.classList.toggle('selected', sel);
      const btn = el.querySelector('.pick-add');
      if (btn) { btn.innerHTML = sel ? icon('check') : icon('plus'); btn.setAttribute('aria-label', sel ? '選択解除' : '選択'); }
    }
    updateFoot();
  }

  function updateFoot() {
    let sum = 0;
    for (const id of selected) {
      const it = state.backItems.find((x) => x.id === id);
      if (it) sum += unitAmount(it);
    }
    selCountEl.textContent = `${selected.size}件`;
    selSumEl.textContent = sum < 0 ? '−' + yen(Math.abs(sum)) : yen(sum);
  }

  modal.querySelector('#pkApply').onclick = () => {
    const ids = [...selected];
    close();
    if (onApply) onApply(ids);
  };

  syncToggle();
  drawBody();
  updateFoot();
}
