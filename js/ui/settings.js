import { state, loadAll } from '../state.js';
import { put, del, uid, saveProfile } from '../db.js';
import { esc } from '../format.js';
import { navigate } from '../app.js';
import { categoryList, itemCategory } from './backfields.js';

export async function renderSettings(el) {
  const p = state.profile;
  el.innerHTML = `
    <h2>設定</h2>
    <div class="card">
      <h3>プロフィール・時給</h3>
      <div class="field"><label>表示名</label><input id="name" value="${esc(p.name)}"></div>
      <div class="field"><label>店名（任意）</label><input id="store" value="${esc(p.storeName)}"></div>
      <div class="field"><label>基本時給（円）</label><input id="wage" type="number" inputmode="numeric" value="${Number(p.hourlyWage) || 0}"></div>
      <div class="row">
        <div class="field" style="flex:1"><label>指名時の時給（任意）</label>
          <input id="nomWage" type="number" inputmode="numeric" placeholder="基本給と同じ" value="${p.nominationWage ? Number(p.nominationWage) : ''}"></div>
        <div class="field" style="flex:1"><label>同伴時の時給（任意）</label>
          <input id="douWage" type="number" inputmode="numeric" placeholder="基本給と同じ" value="${p.douhanWage ? Number(p.douhanWage) : ''}"></div>
      </div>
      <label><input id="npEnabled" type="checkbox" ${p.nightPremium && p.nightPremium.enabled ? 'checked' : ''}> 深夜手当（時間帯割増）を使う</label>
      <div class="row" style="margin-top:8px">
        <div class="field" style="flex:1"><label>開始</label><input id="npStart" type="time" value="${esc((p.nightPremium && p.nightPremium.start) || '22:00')}"></div>
        <div class="field" style="flex:1"><label>終了</label><input id="npEnd" type="time" value="${esc((p.nightPremium && p.nightPremium.end) || '05:00')}"></div>
        <div class="field" style="flex:1"><label>割増(円/時)</label><input id="npAdd" type="number" inputmode="numeric" value="${(p.nightPremium && Number(p.nightPremium.addPerHour)) || 0}"></div>
      </div>
      <div class="muted" style="margin:4px 0 6px">新規シフトの初期値</div>
      <div class="row">
        <div class="field" style="flex:1"><label>開始</label><input id="defStart" type="time" value="${esc(p.defaultStart || '20:00')}"></div>
        <div class="field" style="flex:1"><label>終了</label><input id="defEnd" type="time" value="${esc(p.defaultEnd || '01:00')}"></div>
        <div class="field" style="flex:1"><label>休憩(分)</label><input id="defBreak" type="number" inputmode="numeric" value="${Number(p.defaultBreakMin) || 0}"></div>
      </div>
      <button class="btn" id="saveProfile">保存</button>
    </div>

    <div class="card">
      <h3>インセンティブ項目</h3>
      <div class="cat-tabs" id="itemTabs"></div>
      <datalist id="catOptions"></datalist>
      <div id="itemList"></div>
      <button class="btn btn-ghost" id="addItem">＋ 項目を追加</button>
    </div>

    <div class="card">
      <h3>キャンペーンお知らせ</h3>
      <div id="annList"></div>
      <button class="btn btn-ghost" id="addAnn">＋ お知らせを追加</button>
    </div>

    <div class="card">
      <h3>データ</h3>
      <button class="btn btn-ghost" id="exportBtn">エクスポート（JSON）</button>
      <div style="height:8px"></div>
      <label class="btn btn-ghost" style="display:block;text-align:center">
        インポート<input id="importFile" type="file" accept="application/json" hidden>
      </label>
    </div>`;

  el.querySelector('#saveProfile').onclick = async () => {
    const num = (id) => Number(el.querySelector(id).value) || 0;
    await saveProfile({
      name: el.querySelector('#name').value,
      storeName: el.querySelector('#store').value,
      hourlyWage: num('#wage'),
      nominationWage: num('#nomWage'),
      douhanWage: num('#douWage'),
      defaultStart: el.querySelector('#defStart').value || '20:00',
      defaultEnd: el.querySelector('#defEnd').value || '01:00',
      defaultBreakMin: num('#defBreak'),
      nightPremium: {
        enabled: el.querySelector('#npEnabled').checked,
        start: el.querySelector('#npStart').value || '22:00',
        end: el.querySelector('#npEnd').value || '05:00',
        addPerHour: num('#npAdd'),
      },
    });
    await loadAll();
    alert('保存しました');
  };

  // 旧モデル(type/value)・新モデル(fixedValue/rateValue)の両方から値を読む。
  const itemFixed = (it) => it.type === 'fixed' ? Number(it.value) || 0 : Number(it.fixedValue) || 0;
  const itemRate = (it) => it.type === 'rate' ? Number(it.value) || 0 : Number(it.rateValue) || 0;
  // 0 は未入力とみなし空欄表示（プレースホルダーを見せる）。何を入力する欄か分かるように。
  const blankIfZero = (n) => n ? n : '';

  // 分類タブ（全て＋出現カテゴリ）。分類が実質1種類以下ならタブは隠す。
  let activeCat = '全て';
  const renderTabs = () => {
    const cats = categoryList(state.backItems);
    const tabsEl = el.querySelector('#itemTabs');
    // datalist を最新のカテゴリで更新（自由入力の候補）
    el.querySelector('#catOptions').innerHTML =
      cats.filter((c) => c !== '未分類').map((c) => `<option value="${esc(c)}">`).join('');
    if (cats.length <= 1) { tabsEl.innerHTML = ''; activeCat = '全て'; return; }
    const all = ['全て', ...cats];
    if (!all.includes(activeCat)) activeCat = '全て';
    tabsEl.innerHTML = all.map((c) =>
      `<button class="cat-tab${c === activeCat ? ' active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
    tabsEl.querySelectorAll('.cat-tab').forEach((b) => {
      b.onclick = () => { activeCat = b.dataset.cat; renderTabs(); renderItems(); };
    });
  };

  const renderItems = () => {
    const box = el.querySelector('#itemList');
    const shown = activeCat === '全て'
      ? state.backItems
      : state.backItems.filter((it) => itemCategory(it) === activeCat);
    box.innerHTML = shown.map((it) => `
      <div style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #f3f3f3" data-id="${esc(it.id)}">
        <div class="row" style="align-items:center">
          <input class="i-name inline-input" value="${esc(it.name)}" placeholder="項目名" style="flex:1">
          <button class="i-del" style="border:none;background:none;color:#f55;font-size:18px;padding:4px 8px;flex:0 0 auto">🗑</button>
        </div>
        <div class="row" style="margin-top:8px">
          <select class="i-kind inline-input" style="flex:1.3">
            <option value="income" ${it.kind === 'penalty' ? '' : 'selected'}>収入</option>
            <option value="penalty" ${it.kind === 'penalty' ? 'selected' : ''}>ペナルティ</option>
          </select>
          <input class="i-fixed inline-input" type="number" inputmode="numeric" placeholder="円/件" title="円/件" value="${blankIfZero(itemFixed(it))}" style="flex:1">
          <input class="i-rate inline-input" type="number" inputmode="numeric" placeholder="％" title="売上の％" value="${blankIfZero(itemRate(it))}" style="flex:1">
        </div>
        <div class="row" style="margin-top:8px">
          <input class="i-cat inline-input" list="catOptions" value="${esc(it.category || '')}" placeholder="分類（例: ドリンク・指名/同伴）" style="flex:1">
        </div>
      </div>`).join('') || '<p class="muted">この分類の項目はありません。</p>';
    box.querySelectorAll('[data-id]').forEach((rowEl) => {
      const id = rowEl.dataset.id;
      const save = async () => {
        const it = state.backItems.find((x) => x.id === id);
        const next = {
          id: it.id, order: it.order,
          name: rowEl.querySelector('.i-name').value,
          kind: rowEl.querySelector('.i-kind').value,
          fixedValue: Number(rowEl.querySelector('.i-fixed').value) || 0,
          rateValue: Number(rowEl.querySelector('.i-rate').value) || 0,
          category: rowEl.querySelector('.i-cat').value.trim(),
        };
        // 旧 type/value を破棄して新モデルへ移行
        Object.assign(it, next, { type: undefined, value: undefined });
        await put('backItems', it);
      };
      rowEl.querySelectorAll('.i-name,.i-kind,.i-fixed,.i-rate').forEach((f) => (f.onchange = save));
      // 分類変更はタブ構成・絞り込みに影響するため、保存後にタブ＋一覧を再描画
      rowEl.querySelector('.i-cat').onchange = async () => { await save(); renderTabs(); renderItems(); };
      rowEl.querySelector('.i-del').onclick = async () => {
        if (!confirm('この項目を削除しますか？')) return;
        await del('backItems', id);
        await loadAll();
        renderTabs();
        renderItems();
      };
    });
  };
  renderTabs();
  renderItems();

  el.querySelector('#addItem').onclick = async () => {
    const order = state.backItems.length;
    // 特定タブを選択中なら、その分類で新規作成（作業を続けやすく）
    const category = activeCat === '全て' || activeCat === '未分類' ? '' : activeCat;
    await put('backItems', { id: uid(), name: '新規インセンティブ', kind: 'income', fixedValue: 0, rateValue: 0, category, order });
    await loadAll();
    renderTabs();
    renderItems();
  };

  const renderAnns = () => {
    const box = el.querySelector('#annList');
    box.innerHTML = state.announcements.map((a) => `
      <div class="row" style="align-items:center;margin-bottom:8px" data-id="${esc(a.id)}">
        <input class="a-title" value="${esc(a.title)}" placeholder="タイトル" style="flex:2">
        <input class="a-start" type="date" value="${esc(a.startDate)}" style="flex:1">
        <input class="a-end" type="date" value="${esc(a.endDate)}" style="flex:1">
        <button class="a-del" style="border:none;background:none;color:#f55">🗑</button>
      </div>`).join('');
    box.querySelectorAll('[data-id]').forEach((rowEl) => {
      const id = rowEl.dataset.id;
      const save = async () => {
        const a = state.announcements.find((x) => x.id === id);
        a.title = rowEl.querySelector('.a-title').value;
        a.startDate = rowEl.querySelector('.a-start').value;
        a.endDate = rowEl.querySelector('.a-end').value;
        await put('announcements', a);
      };
      rowEl.querySelectorAll('input').forEach((f) => (f.onchange = save));
      rowEl.querySelector('.a-del').onclick = async () => {
        if (!confirm('このお知らせを削除しますか？')) return;
        await del('announcements', id);
        await loadAll();
        renderAnns();
      };
    });
  };
  renderAnns();

  el.querySelector('#addAnn').onclick = async () => {
    await put('announcements', { id: uid(), title: '新しいお知らせ', body: '', startDate: '', endDate: '' });
    await loadAll();
    renderAnns();
  };

  el.querySelector('#exportBtn').onclick = async () => {
    const data = {
      profile: state.profile, backItems: state.backItems,
      shifts: state.shifts, announcements: state.announcements,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `yashoku-salary-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  el.querySelector('#importFile').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm('現在のデータに上書き追加します。よろしいですか？')) return;
    const data = JSON.parse(await file.text());
    if (data.profile) await saveProfile(data.profile);
    for (const it of data.backItems || []) await put('backItems', it);
    for (const s of data.shifts || []) await put('shifts', s);
    for (const an of data.announcements || []) await put('announcements', an);
    await loadAll();
    alert('インポートしました');
    navigate('settings');
  };
}
