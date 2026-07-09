import { state, loadAll } from '../state.js';
import { put, del, uid, saveProfile } from '../db.js';
import { esc } from '../format.js';
import { navigate } from '../app.js';
import { categoryList, itemCategory, allCategories, UNCATEGORIZED } from './backfields.js';
import { toast } from './toast.js';
import { confirmModal } from './confirm.js';

// リマインダーの「何日前から」選択肢（当日〜1週間前）。
const LEAD_OPTS = [[0, '当日'], [1, '1日前'], [2, '2日前'], [3, '3日前'], [7, '1週間前']];
function leadSelect(id, val) {
  const cur = Number(val);
  return `<select id="${id}">${LEAD_OPTS.map(([v, label]) =>
    `<option value="${v}" ${v === cur ? 'selected' : ''}>${label}</option>`).join('')}</select>`;
}

export async function renderSettings(el) {
  // 既存ユーザーが今使っている分類を、初回だけ分類マスターへ取り込む（以後は編集可）。
  if ((state.profile.backCategories || []).length === 0) {
    const seed = categoryList(state.backItems).filter((c) => c !== UNCATEGORIZED);
    if (seed.length) { await saveProfile({ ...state.profile, backCategories: seed }); await loadAll(); }
  }
  const p = state.profile;
  el.innerHTML = `
    <h2>設定</h2>
    <div class="card">
      <h3>プロフィール・時給</h3>
      <div class="field"><label>表示名</label><input id="name" value="${esc(p.name)}"></div>
      <div class="field"><label>店名（任意）</label><input id="store" value="${esc(p.storeName)}"></div>
      <div class="field"><label>基本時給（円）</label><input id="wage" type="number" inputmode="numeric" value="${Number(p.hourlyWage) || 0}"></div>
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
      <h3>歩合項目</h3>
      <p class="muted" style="font-size:12px;margin:2px 0 10px;line-height:1.6">シャンパンバック・ドリンクバック・指名料・同伴・ペナルティなど、時給以外の歩合を項目として登録します。「円/件」（1件あたりの額）や「％」（売上に対する割合）で設定でき、カレンダーの日別入力「入った歩合」にチップとして並んで、タップで件数・売上を記録できます。種別は<b>収入</b>のほか、罰金は<b>ペナルティ</b>、送り代・厚生費などの天引きは<b>控除</b>を選ぶとレポートでマイナスとして別枠集計されます。分類は下の「分類の管理」で先に登録し、各項目のプルダウンから選べます（分類でタブ絞り込みも可）。</p>
      <div class="cat-manager">
        <div class="cat-manager-head">分類の管理</div>
        <p class="muted" style="font-size:12px;margin:2px 0 8px;line-height:1.6">先に分類を登録しておくと、各項目の「分類」欄からプルダウンで選べます（例: ドリンク／シャンパン／指名・同伴）。<strong>カンマ「,」や改行で区切ると、一度に複数まとめて追加できます。</strong>名前の変更・削除はその分類の項目にも反映されます。</p>
        <div id="catList"></div>
        <form class="row" id="catAdd" style="margin-top:6px;align-items:flex-start">
          <textarea id="catInput" class="inline-input" rows="1" placeholder="新しい分類名…（例: シャンパン）" style="flex:1;resize:vertical"></textarea>
          <button class="btn" type="submit" style="flex:0 0 auto;width:auto">追加</button>
        </form>
      </div>
      <div class="cat-tabs" id="itemTabs"></div>
      <div id="itemList"></div>
      <button class="btn btn-ghost" id="addItem">＋ 項目を追加</button>
    </div>

    <div class="card">
      <h3>キャンペーンお知らせ</h3>
      <p class="muted" style="font-size:12px;margin:2px 0 10px;line-height:1.6">期間を決めてホーム画面に表示されるメモです（例：今月のバック増額キャンペーン）。開始日〜終了日の間だけホームに📣で表示されます。空欄なら常時表示します。</p>
      <div id="annList"></div>
      <button class="btn btn-ghost" id="addAnn">＋ お知らせを追加</button>
    </div>

    <div class="card">
      <h3>🔔 リマインダー通知</h3>
      <p class="muted" style="font-size:12px;margin:2px 0 10px;line-height:1.6">アプリを開いたとき、ホーム画面に念押しのお知らせを出します。設定した「何日前から」の範囲に入った予定を、開いた日ごとに表示します。<strong>アプリ内のみの表示で、端末の通知（プッシュ）は出ません。</strong></p>
      <label><input id="shiftRemEnabled" type="checkbox" ${p.shiftReminder.enabled ? 'checked' : ''}> 出勤予定を忘れないよう通知する</label>
      <div class="field" style="margin-top:6px"><label>何日前から通知</label>
        ${leadSelect('shiftRemLead', p.shiftReminder.leadDays)}
      </div>
      <div style="height:10px"></div>
      <label><input id="campRemEnabled" type="checkbox" ${p.campaignReminder.enabled ? 'checked' : ''}> キャンペーンお知らせの終了を通知する</label>
      <div class="field" style="margin-top:6px"><label>終了の何日前から通知</label>
        ${leadSelect('campRemLead', p.campaignReminder.leadDays)}
      </div>
      <button class="btn" id="saveReminders">保存</button>
    </div>

    <div class="card">
      <h3>データのバックアップ</h3>
      <p class="muted" style="font-size:12px;margin:2px 0 12px;line-height:1.7">
        入力したデータは<b>お使いの端末の中だけ</b>に保存されます（サーバーには送っていません）。
        機種変更・アプリの削除・ブラウザのデータ消去などで<b>消えてしまうことがある</b>ため、
        ときどき<b>バックアップ</b>してファイルを保管しておくと安心です。
        新しい端末に移すときは、そのファイルを読み込めば元に戻せます。<br>
        <span style="color:#f08fb0">※バックアップには、設定・歩合項目・勤務記録・お知らせ・やること・顧客・来店予定・イベント予約の<b>すべてのデータ</b>が含まれます。</span>
      </p>
      <button class="btn btn-ghost" id="exportBtn">💾 バックアップを保存する（ファイル書き出し）</button>
      <div style="height:8px"></div>
      <label class="btn btn-ghost" style="display:block;text-align:center;cursor:pointer">
        📂 バックアップから復元する（ファイル読み込み）<input id="importFile" type="file" accept="application/json" hidden>
      </label>
    </div>`;

  el.querySelector('#saveProfile').onclick = async () => {
    const num = (id) => Number(el.querySelector(id).value) || 0;
    await saveProfile({
      ...state.profile,
      name: el.querySelector('#name').value,
      storeName: el.querySelector('#store').value,
      hourlyWage: num('#wage'),
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
    toast('保存しました');
  };

  el.querySelector('#saveReminders').onclick = async () => {
    await saveProfile({
      ...state.profile,
      shiftReminder: {
        enabled: el.querySelector('#shiftRemEnabled').checked,
        leadDays: Number(el.querySelector('#shiftRemLead').value) || 0,
      },
      campaignReminder: {
        enabled: el.querySelector('#campRemEnabled').checked,
        leadDays: Number(el.querySelector('#campRemLead').value) || 0,
      },
    });
    await loadAll();
    toast('リマインダー設定を保存しました');
  };

  // 旧モデル(type/value)・新モデル(fixedValue/rateValue)の両方から値を読む。
  const itemFixed = (it) => it.type === 'fixed' ? Number(it.value) || 0 : Number(it.fixedValue) || 0;
  const itemRate = (it) => it.type === 'rate' ? Number(it.value) || 0 : Number(it.rateValue) || 0;
  // 0 は未入力とみなし空欄表示（プレースホルダーを見せる）。何を入力する欄か分かるように。
  const blankIfZero = (n) => n ? n : '';

  // 分類マスターの管理（追加・リネーム・削除）。リネーム/削除は該当項目にも反映。
  const renderCatManager = () => {
    const cats = state.profile.backCategories || [];
    const listEl = el.querySelector('#catList');
    listEl.innerHTML = cats.length
      ? cats.map((c) => `
        <div class="cat-row" data-cat="${esc(c)}">
          <input class="cat-name inline-input" value="${esc(c)}" maxlength="30" style="flex:1">
          <button class="cat-del" type="button" aria-label="削除" style="border:none;background:none;color:#f55;font-size:16px;padding:4px 8px;flex:0 0 auto">🗑</button>
        </div>`).join('')
      : '<p class="muted" style="font-size:12px;margin:4px 0">まだ分類がありません。下の欄から追加できます。</p>';

    listEl.querySelectorAll('.cat-row').forEach((rowEl) => {
      const old = rowEl.dataset.cat;
      rowEl.querySelector('.cat-name').onchange = async (e) => {
        const next = e.target.value.trim();
        if (!next || next === old) { e.target.value = old; return; }
        if (next === UNCATEGORIZED) { toast('「未分類」は分類名に使えません'); e.target.value = old; return; }
        const cats2 = (state.profile.backCategories || []).map((c) => (c === old ? next : c));
        const uniq = cats2.filter((c, i) => cats2.indexOf(c) === i);
        await saveProfile({ ...state.profile, backCategories: uniq });
        for (const it of state.backItems) {
          if (itemCategory(it) === old) { it.category = next; await put('backItems', it); }
        }
        await loadAll();
        renderCatManager(); renderTabs(); renderItems();
        toast('分類を変更しました');
      };
      rowEl.querySelector('.cat-del').onclick = async () => {
        if (!(await confirmModal(`分類「${old}」を削除しますか？この分類の項目は「未分類」になります。`))) return;
        await saveProfile({ ...state.profile, backCategories: (state.profile.backCategories || []).filter((c) => c !== old) });
        for (const it of state.backItems) {
          if (itemCategory(it) === old) { it.category = ''; await put('backItems', it); }
        }
        await loadAll();
        renderCatManager(); renderTabs(); renderItems();
        toast('分類を削除しました');
      };
    });
  };

  el.querySelector('#catAdd').onsubmit = async (e) => {
    e.preventDefault();
    const input = el.querySelector('#catInput');
    // カンマ（半角/全角）・改行区切りで複数まとめて追加。重複・「未分類」はスキップ。
    const names = input.value.split(/[,、\n]/).map((s) => s.trim()).filter(Boolean);
    if (!names.length) return;
    const next = [...(state.profile.backCategories || [])];
    let added = 0, skipped = 0;
    for (const name of names) {
      if (name === UNCATEGORIZED || next.includes(name)) { skipped++; continue; }
      next.push(name); added++;
    }
    if (added === 0) { toast('追加できる新しい分類がありませんでした'); input.value = ''; return; }
    await saveProfile({ ...state.profile, backCategories: next });
    await loadAll();
    input.value = '';
    renderCatManager(); renderTabs(); renderItems();
    toast(`${added}件の分類を追加しました${skipped ? `（${skipped}件はスキップ）` : ''}`);
  };

  // 各項目の分類プルダウンの選択肢（未分類＝空 ＋ マスター分類）。
  const catOptionsHtml = (cur) => {
    const cats = allCategories(state.profile, state.backItems);
    const list = cur && !cats.includes(cur) ? [cur, ...cats] : cats;
    return `<option value="" ${!cur ? 'selected' : ''}>未分類</option>` +
      list.map((c) => `<option value="${esc(c)}" ${c === cur ? 'selected' : ''}>${esc(c)}</option>`).join('');
  };

  // 分類タブ（全て＋出現カテゴリ）。分類が実質1種類以下ならタブは隠す。
  let activeCat = '全て';
  const renderTabs = () => {
    const cats = categoryList(state.backItems);
    const tabsEl = el.querySelector('#itemTabs');
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
            <option value="income" ${!it.kind || it.kind === 'income' ? 'selected' : ''}>収入</option>
            <option value="penalty" ${it.kind === 'penalty' ? 'selected' : ''}>ペナルティ</option>
            <option value="deduction" ${it.kind === 'deduction' ? 'selected' : ''}>控除</option>
          </select>
          <input class="i-fixed inline-input" type="number" inputmode="numeric" placeholder="円/件" title="円/件" value="${blankIfZero(itemFixed(it))}" style="flex:1">
          <input class="i-rate inline-input" type="number" inputmode="numeric" placeholder="％" title="売上の％" value="${blankIfZero(itemRate(it))}" style="flex:1">
        </div>
        <div class="row" style="margin-top:8px;align-items:center">
          <label class="muted" style="flex:0 0 auto;font-size:12px">分類</label>
          <select class="i-cat inline-input" style="flex:0 1 auto;min-width:120px;max-width:220px">${catOptionsHtml((it.category || '').trim())}</select>
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
        toast('保存しました');
      };
      rowEl.querySelectorAll('.i-name,.i-kind,.i-fixed,.i-rate').forEach((f) => (f.onchange = save));
      // 分類変更はタブ構成・絞り込みに影響するため、保存後にタブ＋一覧を再描画
      rowEl.querySelector('.i-cat').onchange = async () => { await save(); renderTabs(); renderItems(); };
      rowEl.querySelector('.i-del').onclick = async () => {
        if (!(await confirmModal('この項目を削除しますか？'))) return;
        await del('backItems', id);
        await loadAll();
        renderTabs();
        renderItems();
      };
    });
  };
  renderCatManager();
  renderTabs();
  renderItems();

  el.querySelector('#addItem').onclick = async () => {
    const order = state.backItems.length;
    // 特定タブを選択中なら、その分類で新規作成（作業を続けやすく）
    const category = activeCat === '全て' || activeCat === '未分類' ? '' : activeCat;
    await put('backItems', { id: uid(), name: '新規歩合', kind: 'income', fixedValue: 0, rateValue: 0, category, order });
    await loadAll();
    renderTabs();
    renderItems();
  };

  const renderAnns = () => {
    const box = el.querySelector('#annList');
    box.innerHTML = state.announcements.map((a) => `
      <div class="ann-item" style="margin-bottom:12px" data-id="${esc(a.id)}">
        <div class="row" style="align-items:center;gap:8px">
          <input class="a-title" value="${esc(a.title)}" placeholder="タイトル" style="flex:1;min-width:0">
          <button class="a-del" style="border:none;background:none;color:#f55;width:auto;flex:0 0 auto">🗑</button>
        </div>
        <div class="row" style="gap:8px;margin-top:6px">
          <label class="ann-date" style="flex:1;min-width:0">
            <span class="ann-date-lbl">開始日</span>
            <input class="a-start" type="date" value="${esc(a.startDate)}">
          </label>
          <label class="ann-date" style="flex:1;min-width:0">
            <span class="ann-date-lbl">終了日</span>
            <input class="a-end" type="date" value="${esc(a.endDate)}">
          </label>
        </div>
      </div>`).join('');
    box.querySelectorAll('[data-id]').forEach((rowEl) => {
      const id = rowEl.dataset.id;
      const save = async () => {
        const a = state.announcements.find((x) => x.id === id);
        a.title = rowEl.querySelector('.a-title').value;
        a.startDate = rowEl.querySelector('.a-start').value;
        a.endDate = rowEl.querySelector('.a-end').value;
        await put('announcements', a);
        toast('保存しました');
      };
      rowEl.querySelectorAll('input').forEach((f) => (f.onchange = save));
      rowEl.querySelector('.a-del').onclick = async () => {
        if (!(await confirmModal('このお知らせを削除しますか？'))) return;
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
      todos: state.todos, customers: state.customers, visits: state.visits,
      events: state.events, reservations: state.reservations,
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
    if (!(await confirmModal('バックアップファイルの内容を、現在のデータに復元（上書き追加）します。よろしいですか？', { okLabel: '復元する', danger: false }))) return;
    const data = JSON.parse(await file.text());
    if (data.profile) await saveProfile(data.profile);
    for (const it of data.backItems || []) await put('backItems', it);
    for (const s of data.shifts || []) await put('shifts', s);
    for (const an of data.announcements || []) await put('announcements', an);
    for (const t of data.todos || []) await put('todos', t);
    for (const c of data.customers || []) await put('customers', c);
    for (const v of data.visits || []) await put('visits', v);
    for (const ev of data.events || []) await put('events', ev);
    for (const r of data.reservations || []) await put('reservations', r);
    await loadAll();
    toast('復元しました');
    navigate('settings');
  };
}
