// 「歩合項目を選択」フルスクリーンモーダル（日次詳細シートの「歩合を入力」から開く）。
// 今月の実績付きでカテゴリ別に一覧し、各項目を − 0 + のステッパーで件数入力（率のみの項目は
// 対象売上を入力）して、「選択した歩合を入力する」で呼び出し元（カレンダー日別シート）へ反映する。
// 既存の .bk-* カードスタイルを再利用。
import { state, shiftsOfMonth } from '../state.js';
import { esc, yen } from '../format.js';
import { backItemStats, isDeductionKind, backAmount } from '../calc.js';
import { itemCategory, categoryList, UNCATEGORIZED, hasFixed, hasRate } from './backfields.js';
import { icon } from './icons.js';
import { navigate } from '../app.js';

const KIND_EMOJI = { income: '💰', penalty: '⚠️', deduction: '🧾' };
const itemFixed = (it) => (it.type === 'fixed' ? Number(it.value) || 0 : Number(it.fixedValue) || 0);
const itemRate = (it) => (it.type === 'rate' ? Number(it.value) || 0 : Number(it.rateValue) || 0);
const itemUnit = (it) => it.unit || '件';
const itemEmoji = (it) => it.icon || KIND_EMOJI[it.kind || 'income'] || '💰';
// 率(売上%)のみで、1件あたりの固定額が無い項目＝件数ではなく売上を入力する。
const isRateOnly = (it) => hasRate(it) && !hasFixed(it);

// 1件あたりの歩合表示（例「¥1,100/本」「売上10%」／控除・罰金は「−」付き）。
function rateLabel(it) {
  const f = itemFixed(it), r = itemRate(it);
  const sign = isDeductionKind(it.kind) ? '−' : '';
  const parts = [];
  if (f) parts.push(`${sign}¥${f.toLocaleString('ja-JP')}/${itemUnit(it)}`);
  if (r) parts.push(`${sign}売上${r}%`);
  return parts.join(' ＋ ') || '未設定';
}

const yenSigned = (n) => (n < 0 ? '−' + yen(Math.abs(n)) : yen(n));

/**
 * 歩合項目選択モーダルを開く。
 * @param {object} opts
 * @param {Object<string,{count:number,sales:number}>} [opts.initial] 既存の入力（項目id→件数/売上）。
 * @param {(entries:Object<string,{count:number,sales:number}>)=>void} opts.onApply
 *   「選択した歩合を入力する」タップ時に、件数/売上が入っている項目だけを渡して呼ばれる。
 */
export function openItemPicker({ initial = {}, onApply } = {}) {
  const qty = {};     // 項目id -> 件数
  const salesMap = {}; // 項目id -> 対象売上（率のみ項目）
  for (const [id, e] of Object.entries(initial || {})) {
    if (e && e.count) qty[id] = e.count;
    if (e && e.sales) salesMap[id] = e.sales;
  }
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
    <div class="picker-note">
      ${icon('help')}
      <span>この画面で<strong>今日入った歩合</strong>を入力します。<br>各項目の <strong>−／＋</strong> で件数（本数）を数え、下の<strong>「選択した歩合を入力する」</strong>を押すとこの日の記録に反映されます。</span>
    </div>
    <div class="picker-search">
      <span class="picker-search-ic">${icon('search')}</span>
      <input id="pkSearch" type="search" placeholder="項目名で検索" autocomplete="off">
    </div>
    <div class="picker-body" id="pkBody"></div>
    <div class="picker-foot">
      <div class="picker-foot-info">
        <span>入力中 <strong id="pkSelCount">0件</strong></span>
        <span class="picker-foot-sum">歩合合計 <strong id="pkSelSum">¥0</strong></span>
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

  const isActive = (it) => (Number(qty[it.id]) || 0) > 0 || (Number(salesMap[it.id]) || 0) > 0;

  // 件数ステッパー or 売上入力欄（率のみ項目）。
  function controlHtml(it) {
    if (isRateOnly(it)) {
      const sv = Number(salesMap[it.id]) || 0;
      return `<div class="pick-sales">対象売上
        <input class="pick-sales-in" data-id="${esc(it.id)}" type="number" inputmode="numeric" placeholder="0" value="${sv > 0 ? sv : ''}">円</div>`;
    }
    const q = Number(qty[it.id]) || 0;
    return `<div class="pick-stepper">
      <button class="pick-step" type="button" data-act="minus" data-id="${esc(it.id)}" aria-label="減らす">−</button>
      <span class="pick-qty" data-id="${esc(it.id)}">${q}</span>
      <button class="pick-step" type="button" data-act="plus" data-id="${esc(it.id)}" aria-label="増やす">＋</button>
    </div>`;
  }

  function monthHtml(it) {
    const s = stats.get(it.id) || { count: 0, amount: 0 };
    const amt = isDeductionKind(it.kind) ? '−' + yen(Math.abs(s.amount)) : yen(s.amount);
    return `今月 ${s.count}${esc(itemUnit(it))}・${amt}`;
  }

  function rowHtml(it) {
    const kind = it.kind || 'income';
    return `
      <div class="bk-lrow pick-row${isActive(it) ? ' selected' : ''}" data-id="${esc(it.id)}">
        <div class="bk-ava sm kind-${kind}">${esc(itemEmoji(it))}</div>
        <div class="bk-lrow-main">
          <div class="bk-lrow-name">${esc(it.name || '（名称未設定）')}</div>
          <div class="bk-lrow-sub">${esc(rateLabel(it))}・${monthHtml(it)}</div>
        </div>
        ${controlHtml(it)}
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
      const total = list.reduce((s, it) => s + (stats.get(it.id) ? stats.get(it.id).amount : 0), 0);
      const isCol = collapsed.has(cat);
      const inner = `<div class="bk-list">${list.map(rowHtml).join('')}
             <button class="bk-lrow bk-ladd pick-newcard" type="button">
               <span class="bk-add-ic sm">${icon('plus')}</span><span>項目を追加</span></button></div>`;
      return `
        <div class="bk-group pick-group">
          <button class="bk-group-head" type="button" data-toggle="${esc(cat)}">
            <span class="bk-group-name">${label}</span>
            <span class="bk-group-count">${list.length}項目</span>
            <span class="bk-group-total">今月の合計 ${yenSigned(total)}</span>
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
    body.querySelectorAll('.pick-step').forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        const id = b.dataset.id;
        const cur = Number(qty[id]) || 0;
        qty[id] = Math.max(0, cur + (b.dataset.act === 'plus' ? 1 : -1));
        syncCard(id);
        updateFoot();
      };
    });
    body.querySelectorAll('.pick-sales-in').forEach((inp) => {
      inp.oninput = () => {
        salesMap[inp.dataset.id] = Number(inp.value) || 0;
        syncCard(inp.dataset.id, true);
        updateFoot();
      };
      inp.onclick = (e) => e.stopPropagation();
    });
    body.querySelectorAll('.pick-newcard').forEach((b) => {
      b.onclick = () => { close(); navigate('backitems'); };
    });
  }

  // 1枚のカード/行だけ状態を反映（再描画せず＝スクロール・入力フォーカス維持）。
  function syncCard(id, keepInput) {
    const it = state.backItems.find((x) => x.id === id);
    const el = body.querySelector(`.pick-row[data-id="${CSS.escape(id)}"]`);
    if (!it || !el) return;
    el.classList.toggle('selected', isActive(it));
    if (!keepInput) {
      const qEl = el.querySelector('.pick-qty');
      if (qEl) qEl.textContent = Number(qty[id]) || 0;
    }
  }

  function updateFoot() {
    let sum = 0, n = 0;
    for (const it of state.backItems) {
      const c = Number(qty[it.id]) || 0, s = Number(salesMap[it.id]) || 0;
      if (c > 0 || s > 0) { n++; sum += backAmount(it, { count: c, sales: s }); }
    }
    selCountEl.textContent = `${n}件`;
    selSumEl.textContent = yenSigned(sum);
  }

  modal.querySelector('#pkApply').onclick = () => {
    const entries = {};
    for (const it of state.backItems) {
      const c = Number(qty[it.id]) || 0, s = Number(salesMap[it.id]) || 0;
      if (c > 0 || s > 0) entries[it.id] = { count: c, sales: s };
    }
    close();
    if (onApply) onApply(entries);
  };

  drawBody();
  updateFoot();
}
