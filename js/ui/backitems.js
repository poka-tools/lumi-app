// 「歩合項目の設定」専用ページ。設定から遷移して、歩合項目の登録・編集・分類分け・
// 今月の実績（件数・金額）確認を行う。ネイティブ移植時も1画面に対応するよう独立ルート化。
import { state, loadAll, shiftsOfMonth } from '../state.js';
import { put, del, uid, saveProfile } from '../db.js';
import { esc, yen, signedYen } from '../format.js';
import { navigate } from '../app.js';
import { backItemStats, isDeductionKind } from '../calc.js';
import { itemCategory, categoryList, allCategories, UNCATEGORIZED } from './backfields.js';
import { icon } from './icons.js';
import { toast } from './toast.js';
import { confirmModal } from './confirm.js';

// ページ内で保持する表示状態（ナビゲーションをまたいで維持）。
let sortKey = 'custom';   // 'custom' | 'name' | 'amount'
let query = '';           // 名前検索
let activeCat = null;     // null=すべて / 分類名で絞り込み
const collapsed = new Set(); // 折りたたみ中の分類

// 種別ごとの既定アイコン（項目に icon 未設定のとき）。
const KIND_EMOJI = { income: '💰', penalty: '⚠️', deduction: '🧾' };
const EMOJI_PALETTE = ['🍾', '🥂', '🍷', '🍶', '🥤', '🍸', '⭐', '👑', '👥', '🌙', '⏰', '💎', '🎀', '💰', '🧾', '⚠️', '🚕', '🎉'];
const UNIT_PRESETS = ['件', '本', '杯', '名', '時間', '回'];

const itemFixed = (it) => it.type === 'fixed' ? Number(it.value) || 0 : Number(it.fixedValue) || 0;
const itemRate = (it) => it.type === 'rate' ? Number(it.value) || 0 : Number(it.rateValue) || 0;
const itemUnit = (it) => (it.unit || '件');
const itemEmoji = (it) => (it.icon || KIND_EMOJI[it.kind || 'income'] || '💰');

// 1件あたりの歩合表示（例「¥1,100/本」「売上10%」／控除・罰金は「−」付き）。
function rateLabel(it) {
  const f = itemFixed(it), r = itemRate(it);
  const sign = isDeductionKind(it.kind) ? '−' : '';
  const parts = [];
  if (f) parts.push(`${sign}¥${f.toLocaleString('ja-JP')}/${itemUnit(it)}`);
  if (r) parts.push(`${sign}売上${r}%`);
  return parts.join(' ＋ ') || '未設定';
}

export async function renderBackItems(el) {
  // 既存ユーザーが今使っている分類を、初回だけ分類マスターへ取り込む（以後は編集可）。
  if ((state.profile.backCategories || []).length === 0) {
    const seed = categoryList(state.backItems).filter((c) => c !== UNCATEGORIZED);
    if (seed.length) { await saveProfile({ ...state.profile, backCategories: seed }); await loadAll(); }
  }

  el.innerHTML = `
    <div class="bk-page">
      <button class="bk-back" id="bkBack" type="button">${icon('chevron', { cls: 'bk-back-ic' })} 設定に戻る</button>
      <div class="bk-header">
        <h1 class="bk-title">歩合項目の設定</h1>
        <button class="bk-new" id="bkNew" type="button">${icon('plus')} 新規登録</button>
      </div>
      <p class="muted bk-lead">売上や件数に応じて発生する歩合項目を登録・管理できます。分類（グループ）ごとに整理して、今月の実績も確認できます。</p>

      <div class="bk-stats" id="bkStats"></div>

      <div class="bk-toolbar bk-toolbar-list">
        <label class="bk-sort">
          ${icon('sort', { cls: 'bk-sort-ic' })}
          <select id="bkSort">
            <option value="custom">カスタム順</option>
            <option value="name">名前順</option>
            <option value="amount">金額順</option>
          </select>
        </label>
      </div>

      <div class="bk-searchbar">
        <span class="bk-search-ic">${icon('search')}</span>
        <input id="bkSearch" type="search" placeholder="項目名で検索" autocomplete="off">
      </div>

      <div class="bk-chips" id="bkChips"></div>
      <div class="bk-catmanage"><button class="bk-link" id="bkManageCats" type="button">${icon('folder')} 分類（グループ）を管理</button></div>

      <div id="bkGroups"></div>
    </div>`;

  el.querySelector('#bkBack').onclick = () => navigate('settings');
  el.querySelector('#bkNew').onclick = () => openEditor(null, activeCatForNew());
  el.querySelector('#bkManageCats').onclick = openCategoryManager;

  const sortSel = el.querySelector('#bkSort');
  sortSel.value = sortKey;
  sortSel.onchange = () => { sortKey = sortSel.value; drawList(); };

  const searchEl = el.querySelector('#bkSearch');
  searchEl.value = query;
  searchEl.oninput = () => { query = searchEl.value; drawList(); };

  // ---- 集計・グルーピング ----
  const monthShifts = () => shiftsOfMonth();
  const stats = () => backItemStats(state.backItems, monthShifts());

  // 表示対象の項目（検索フィルタ適用）。
  function filteredItems() {
    const q = query.trim().toLowerCase();
    let items = state.backItems;
    if (q) items = items.filter((it) => (it.name || '').toLowerCase().includes(q));
    return items;
  }

  // 分類ごとにグループ化して順序づけ。
  function grouped(items) {
    const map = new Map();
    for (const it of items) {
      const c = itemCategory(it);
      if (!map.has(c)) map.set(c, []);
      map.get(c).push(it);
    }
    const order = allCategories(state.profile, state.backItems).filter((c) => map.has(c));
    for (const c of map.keys()) if (c !== UNCATEGORIZED && !order.includes(c)) order.push(c);
    if (map.has(UNCATEGORIZED)) order.push(UNCATEGORIZED);
    return { map, order };
  }

  function sortItems(arr, st) {
    const a = [...arr];
    if (sortKey === 'name') a.sort((x, y) => (x.name || '').localeCompare(y.name || '', 'ja'));
    else if (sortKey === 'amount') a.sort((x, y) => (st.get(y.id)?.amount || 0) - (st.get(x.id)?.amount || 0));
    // custom は state 読み込み時点の order 順（既定）
    return a;
  }

  // ---- 上部の実績カード ----
  function drawStats() {
    const st = stats();
    let total = 0, count = 0;
    for (const it of state.backItems) {
      const s = st.get(it.id); if (!s) continue;
      total += s.amount; count += s.count;
    }
    const box = el.querySelector('#bkStats');
    box.innerHTML = `
      <div class="bk-stat"><span class="bk-stat-ic">${icon('tag')}</span>
        <span class="bk-stat-v">${state.backItems.length}件</span><span class="bk-stat-l">登録数</span></div>
      <div class="bk-stat"><span class="bk-stat-ic">${icon('yen')}</span>
        <span class="bk-stat-v">${signedYen(total).replace('+', '')}</span><span class="bk-stat-l">今月の歩合合計</span></div>
      <div class="bk-stat"><span class="bk-stat-ic">${icon('calendar')}</span>
        <span class="bk-stat-v">${count}件</span><span class="bk-stat-l">今月の歩数合計</span></div>`;
  }

  // ---- カテゴリチップ ----
  function drawChips() {
    const box = el.querySelector('#bkChips');
    const { map, order } = grouped(state.backItems); // チップは検索に依存させず全件基準
    const chip = (key, label, n, active) =>
      `<button class="bk-chip${active ? ' active' : ''}" data-cat="${key === null ? '' : esc(key)}" data-all="${key === null ? 1 : 0}" type="button">${esc(label)}<span class="bk-chip-n">${n}</span></button>`;
    let html = chip(null, 'すべて', state.backItems.length, activeCat === null);
    for (const c of order) {
      const label = c === UNCATEGORIZED ? '未分類' : c;
      html += chip(c, label, map.get(c).length, activeCat === c);
    }
    box.innerHTML = html;
    box.querySelectorAll('.bk-chip').forEach((b) => {
      b.onclick = () => {
        activeCat = b.dataset.all === '1' ? null : b.dataset.cat;
        drawChips(); drawList();
      };
    });
  }

  // ---- 本体（グループ＋カード/リスト） ----
  function drawList() {
    const box = el.querySelector('#bkGroups');
    const st = stats();
    const items = filteredItems();
    if (!state.backItems.length) {
      box.innerHTML = `<div class="bk-empty">
        <div class="bk-empty-ic">${icon('clipboard')}</div>
        <p>まだ歩合項目がありません。</p>
        <button class="btn bk-empty-add" id="bkEmptyAdd" type="button">${icon('plus')} 最初の項目を登録</button>
      </div>`;
      box.querySelector('#bkEmptyAdd').onclick = () => openEditor(null, '');
      return;
    }
    let { map, order } = grouped(items);
    if (activeCat !== null) order = order.filter((c) => c === activeCat);

    if (!order.length) {
      box.innerHTML = `<p class="muted bk-nores">条件に合う歩合項目がありません。</p>`;
      return;
    }

    box.innerHTML = order.map((c) => {
      const label = c === UNCATEGORIZED ? '未分類' : esc(c);
      const list = sortItems(map.get(c), st);
      const groupTotal = list.reduce((s, it) => s + (st.get(it.id)?.amount || 0), 0);
      const isCollapsed = collapsed.has(c);
      const bodyHtml = isCollapsed ? ''
        : `<div class="bk-group-body">${rowsHtml(list, st, c)}</div>`;
      return `
        <div class="bk-group" data-cat="${c === UNCATEGORIZED ? '' : esc(c)}">
          <button class="bk-group-head" type="button" data-toggle="${esc(c)}">
            <span class="bk-group-ic">${icon('folder')}</span>
            <span class="bk-group-name">${label}</span>
            <span class="bk-group-count">${list.length}項目</span>
            <span class="bk-group-total">${signedYen(groupTotal).replace('+', '')}</span>
            <span class="bk-group-chev ${isCollapsed ? '' : 'open'}">${icon('chevronDown')}</span>
          </button>
          ${bodyHtml}
        </div>`;
    }).join('');

    // 折りたたみトグル
    box.querySelectorAll('.bk-group-head').forEach((h) => {
      h.onclick = () => {
        const c = h.dataset.toggle;
        if (collapsed.has(c)) collapsed.delete(c); else collapsed.add(c);
        drawList();
      };
    });
    // カード/行タップ→編集、＋タイル→追加
    box.querySelectorAll('[data-edit]').forEach((c) => {
      c.onclick = (e) => {
        e.stopPropagation();
        const it = state.backItems.find((x) => x.id === c.dataset.edit);
        if (it) openEditor(it, itemCategory(it) === UNCATEGORIZED ? '' : it.category);
      };
    });
    box.querySelectorAll('[data-addin]').forEach((c) => {
      c.onclick = (e) => { e.stopPropagation(); openEditor(null, c.dataset.addin); };
    });
  }

  function rowsHtml(list, st, cat) {
    const addCat = cat === UNCATEGORIZED ? '' : cat;
    const rows = list.map((it) => {
      const s = st.get(it.id) || { count: 0, amount: 0 };
      const kind = it.kind || 'income';
      const amtCls = isDeductionKind(kind) ? 'neg' : '';
      const amtText = isDeductionKind(kind) ? signedYen(s.amount) : yen(s.amount);
      return `
        <div class="bk-lrow" data-edit="${esc(it.id)}">
          <div class="bk-ava sm kind-${kind}">${esc(itemEmoji(it))}</div>
          <div class="bk-lrow-main">
            <div class="bk-lrow-name">${esc(it.name || '（名称未設定）')}</div>
            <div class="bk-lrow-sub">${esc(rateLabel(it))}・今月 ${s.count}${esc(itemUnit(it))}</div>
          </div>
          <div class="bk-lrow-amt ${amtCls}">${amtText}</div>
          <span class="bk-kebab">${icon('chevron')}</span>
        </div>`;
    }).join('');
    return `<div class="bk-list">${rows}
      <button class="bk-lrow bk-ladd" data-addin="${esc(addCat)}" type="button">
        <span class="bk-add-ic sm">${icon('plus')}</span><span>項目を追加</span></button>
    </div>`;
  }

  // 新規登録時に、絞り込み中の分類があればそれを初期分類に。
  function activeCatForNew() {
    return activeCat && activeCat !== UNCATEGORIZED ? activeCat : '';
  }

  async function refresh() {
    await loadAll();
    drawStats(); drawChips(); drawList();
  }

  // ---- 編集シート ----
  function openEditor(item, presetCat) {
    const isNew = !item;
    const it = item || { id: uid(), name: '', kind: 'income', fixedValue: 0, rateValue: 0,
      category: presetCat || '', unit: '件', icon: '', order: state.backItems.length };
    const curEmoji = it.icon || '';
    const cats = allCategories(state.profile, state.backItems);
    const curCat = (it.category || '').trim();
    const catOpts = `<option value="">未分類</option>` +
      cats.map((c) => `<option value="${esc(c)}" ${c === curCat ? 'selected' : ''}>${esc(c)}</option>`).join('') +
      `<option value="__new__">＋ 新しい分類を作成…</option>`;
    const emojiBtns = EMOJI_PALETTE.map((e) =>
      `<button class="bk-emoji${e === curEmoji ? ' active' : ''}" type="button" data-emoji="${e}">${e}</button>`).join('');
    const unitList = UNIT_PRESETS.map((u) => `<option value="${esc(u)}"></option>`).join('');

    const { sheet, close } = openSheet(`
      <h3 class="bk-sheet-title">${isNew ? '歩合項目を登録' : '歩合項目を編集'}</h3>
      <label class="bk-field"><span class="bk-flabel">アイコン</span>
        <div class="bk-emojis">
          <button class="bk-emoji${curEmoji === '' ? ' active' : ''}" type="button" data-emoji="">${KIND_EMOJI[it.kind || 'income']}<small>自動</small></button>
          ${emojiBtns}
        </div>
      </label>
      <label class="bk-field"><span class="bk-flabel">項目名</span>
        <input id="eName" class="inline-input" value="${esc(it.name)}" placeholder="例: シャンパンバック"></label>
      <label class="bk-field"><span class="bk-flabel">種別</span>
        <select id="eKind" class="inline-input">
          <option value="income" ${!it.kind || it.kind === 'income' ? 'selected' : ''}>収入（歩合）</option>
          <option value="penalty" ${it.kind === 'penalty' ? 'selected' : ''}>ペナルティ（罰金）</option>
          <option value="deduction" ${it.kind === 'deduction' ? 'selected' : ''}>控除（送り代・厚生費など）</option>
        </select></label>
      <div class="bk-field2">
        <label class="bk-field"><span class="bk-flabel">1件あたり（円）</span>
          <input id="eFixed" class="inline-input" type="number" inputmode="numeric" placeholder="0" value="${itemFixed(it) || ''}"></label>
        <label class="bk-field"><span class="bk-flabel">売上に対する％</span>
          <input id="eRate" class="inline-input" type="number" inputmode="numeric" placeholder="0" value="${itemRate(it) || ''}"></label>
      </div>
      <label class="bk-field"><span class="bk-flabel">単位</span>
        <input id="eUnit" class="inline-input" list="unitPresets" value="${esc(itemUnit(it))}" placeholder="件">
        <datalist id="unitPresets">${unitList}</datalist></label>
      <label class="bk-field"><span class="bk-flabel">分類（グループ）</span>
        <select id="eCat" class="inline-input">${catOpts}</select></label>
      <div class="bk-field bk-newcat" id="eNewCatWrap" hidden>
        <input id="eNewCat" class="inline-input" placeholder="新しい分類名（例: シャンパン）"></div>
      <div class="bk-sheet-actions">
        ${isNew ? '' : `<button class="bk-sheet-del" id="eDel" type="button">${icon('trash')} 削除</button>
        <button class="bk-sheet-dup" id="eDup" type="button">${icon('copy')} 複製</button>`}
        <button class="bk-sheet-save" id="eSave" type="button">${isNew ? '登録する' : '保存する'}</button>
      </div>`);

    let emoji = curEmoji;
    sheet.querySelectorAll('.bk-emoji').forEach((b) => {
      b.onclick = () => {
        emoji = b.dataset.emoji;
        sheet.querySelectorAll('.bk-emoji').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
      };
    });
    const catSel = sheet.querySelector('#eCat');
    const newWrap = sheet.querySelector('#eNewCatWrap');
    catSel.onchange = () => {
      const isNewCat = catSel.value === '__new__';
      newWrap.hidden = !isNewCat;
      if (isNewCat) sheet.querySelector('#eNewCat').focus();
    };

    sheet.querySelector('#eSave').onclick = async () => {
      let category = catSel.value;
      if (category === '__new__') {
        category = sheet.querySelector('#eNewCat').value.trim();
        if (category === UNCATEGORIZED) category = '';
        if (category) {
          const list = state.profile.backCategories || [];
          if (!list.includes(category)) await saveProfile({ ...state.profile, backCategories: [...list, category] });
        }
      }
      const next = {
        id: it.id, order: it.order,
        name: sheet.querySelector('#eName').value.trim(),
        kind: sheet.querySelector('#eKind').value,
        fixedValue: Number(sheet.querySelector('#eFixed').value) || 0,
        rateValue: Number(sheet.querySelector('#eRate').value) || 0,
        unit: sheet.querySelector('#eUnit').value.trim() || '件',
        icon: emoji,
        category,
        type: undefined, value: undefined, // 旧モデルを破棄
      };
      await put('backItems', next);
      close();
      await refresh();
      toast(isNew ? '登録しました' : '保存しました');
    };

    if (!isNew) {
      sheet.querySelector('#eDup').onclick = async () => {
        await put('backItems', { ...it, id: uid(), name: `${it.name || '項目'} のコピー`,
          order: state.backItems.length, type: undefined, value: undefined });
        close();
        await refresh();
        toast('複製しました');
      };
      sheet.querySelector('#eDel').onclick = async () => {
        if (!(await confirmModal('この歩合項目を削除しますか？', { okLabel: '削除する', danger: true }))) return;
        await del('backItems', it.id);
        close();
        await refresh();
        toast('削除しました');
      };
    }
  }

  // ---- 分類（グループ）の管理シート ----
  function openCategoryManager() {
    const draw = (sheet) => {
      const cats = state.profile.backCategories || [];
      const listHtml = cats.length ? cats.map((c) => `
        <div class="bk-cat-row" data-cat="${esc(c)}">
          <input class="bk-cat-name inline-input" value="${esc(c)}" maxlength="30">
          <button class="bk-cat-del" type="button" aria-label="削除">${icon('trash')}</button>
        </div>`).join('') : '<p class="muted" style="font-size:13px">まだ分類がありません。下の欄から追加できます。</p>';
      sheet.querySelector('#catMgrList').innerHTML = listHtml;
      sheet.querySelectorAll('.bk-cat-row').forEach((row) => {
        const old = row.dataset.cat;
        row.querySelector('.bk-cat-name').onchange = async (e) => {
          const nx = e.target.value.trim();
          if (!nx || nx === old) { e.target.value = old; return; }
          if (nx === UNCATEGORIZED) { toast('「未分類」は分類名に使えません'); e.target.value = old; return; }
          const arr = (state.profile.backCategories || []).map((c) => (c === old ? nx : c));
          await saveProfile({ ...state.profile, backCategories: arr.filter((c, i) => arr.indexOf(c) === i) });
          for (const it of state.backItems) if (itemCategory(it) === old) { it.category = nx; await put('backItems', it); }
          await loadAll(); draw(sheet); drawChips(); drawList();
          toast('分類を変更しました');
        };
        row.querySelector('.bk-cat-del').onclick = async () => {
          if (!(await confirmModal(`分類「${old}」を削除しますか？この分類の項目は「未分類」になります。`))) return;
          await saveProfile({ ...state.profile, backCategories: (state.profile.backCategories || []).filter((c) => c !== old) });
          for (const it of state.backItems) if (itemCategory(it) === old) { it.category = ''; await put('backItems', it); }
          await loadAll(); draw(sheet); drawChips(); drawList();
          toast('分類を削除しました');
        };
      });
    };

    const { sheet } = openSheet(`
      <h3 class="bk-sheet-title">分類（グループ）を管理</h3>
      <p class="muted" style="font-size:12px;line-height:1.6;margin:0 0 10px">先に分類を登録しておくと、項目の編集画面から選べます。<strong>カンマ「,」や改行で区切ると、まとめて追加できます。</strong>名前の変更・削除は所属する項目にも反映されます。</p>
      <div id="catMgrList"></div>
      <form class="bk-cat-add" id="catMgrAdd">
        <textarea id="catMgrInput" class="inline-input" rows="1" placeholder="新しい分類名…（例: シャンパン）"></textarea>
        <button class="bk-sheet-save" type="submit">追加</button>
      </form>`);
    draw(sheet);
    sheet.querySelector('#catMgrAdd').onsubmit = async (e) => {
      e.preventDefault();
      const input = sheet.querySelector('#catMgrInput');
      const names = input.value.split(/[,、\n]/).map((s) => s.trim()).filter(Boolean);
      if (!names.length) return;
      const nextCats = [...(state.profile.backCategories || [])];
      let added = 0, skipped = 0;
      for (const nm of names) {
        if (nm === UNCATEGORIZED || nextCats.includes(nm)) { skipped++; continue; }
        nextCats.push(nm); added++;
      }
      if (!added) { toast('追加できる新しい分類がありませんでした'); input.value = ''; return; }
      await saveProfile({ ...state.profile, backCategories: nextCats });
      await loadAll();
      input.value = '';
      draw(sheet); drawChips(); drawList();
      toast(`${added}件の分類を追加しました${skipped ? `（${skipped}件はスキップ）` : ''}`);
    };
  }

  // 初期描画
  drawStats();
  drawChips();
  drawList();
}

// ボトムシートを生成して開く。戻り値の close() で閉じる。
function openSheet(innerHtml) {
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  const sheet = document.createElement('div');
  sheet.className = 'sheet bk-sheet';
  sheet.innerHTML = `<div class="sheet-handle"></div>${innerHtml}`;
  document.body.appendChild(backdrop);
  document.body.appendChild(sheet);
  requestAnimationFrame(() => { backdrop.classList.add('show'); sheet.classList.add('show'); });
  const close = () => {
    backdrop.classList.remove('show');
    sheet.classList.remove('show');
    setTimeout(() => { backdrop.remove(); sheet.remove(); }, 300);
  };
  backdrop.onclick = close;
  return { sheet, close };
}
