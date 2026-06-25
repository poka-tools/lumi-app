import { state, loadAll } from '../state.js';
import { put, del, uid, saveProfile } from '../db.js';
import { esc } from '../format.js';
import { navigate } from '../app.js';

export async function renderSettings(el) {
  const p = state.profile;
  el.innerHTML = `
    <h2>設定</h2>
    <div class="card">
      <h3>プロフィール・時給</h3>
      <div class="field"><label>表示名</label><input id="name" value="${esc(p.name)}"></div>
      <div class="field"><label>店名（任意）</label><input id="store" value="${esc(p.storeName)}"></div>
      <div class="field"><label>時給（円）</label><input id="wage" type="number" inputmode="numeric" value="${Number(p.hourlyWage) || 0}"></div>
      <button class="btn" id="saveProfile">保存</button>
    </div>

    <div class="card">
      <h3>バック項目</h3>
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
    await saveProfile({
      name: el.querySelector('#name').value,
      storeName: el.querySelector('#store').value,
      hourlyWage: Number(el.querySelector('#wage').value) || 0,
    });
    await loadAll();
    alert('保存しました');
  };

  const renderItems = () => {
    const box = el.querySelector('#itemList');
    box.innerHTML = state.backItems.map((it) => `
      <div class="row" style="align-items:center;margin-bottom:8px" data-id="${esc(it.id)}">
        <input class="i-name" value="${esc(it.name)}" style="flex:2">
        <select class="i-type" style="flex:1">
          <option value="fixed" ${it.type === 'fixed' ? 'selected' : ''}>円</option>
          <option value="rate" ${it.type === 'rate' ? 'selected' : ''}>％</option>
        </select>
        <input class="i-value" type="number" value="${Number(it.value) || 0}" style="flex:1">
        <button class="i-del" style="border:none;background:none;color:#f55">🗑</button>
      </div>`).join('');
    box.querySelectorAll('[data-id]').forEach((rowEl) => {
      const id = rowEl.dataset.id;
      const save = async () => {
        const it = state.backItems.find((x) => x.id === id);
        it.name = rowEl.querySelector('.i-name').value;
        it.type = rowEl.querySelector('.i-type').value;
        it.value = Number(rowEl.querySelector('.i-value').value) || 0;
        await put('backItems', it);
      };
      rowEl.querySelectorAll('input,select').forEach((f) => (f.onchange = save));
      rowEl.querySelector('.i-del').onclick = async () => {
        if (!confirm('この項目を削除しますか？')) return;
        await del('backItems', id);
        await loadAll();
        renderItems();
      };
    });
  };
  renderItems();

  el.querySelector('#addItem').onclick = async () => {
    const order = state.backItems.length;
    await put('backItems', { id: uid(), name: '新規バック', type: 'fixed', value: 0, order });
    await loadAll();
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
