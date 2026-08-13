import { state, loadAll } from '../state.js';
import { put, del, uid, saveProfile, getAll, clearAuditLog, suppressAudit, logNote } from '../db.js';
import { esc } from '../format.js';
import { groupLogsByDay, logTime, logsToPrune } from '../audit-logic.js';
import { navigate } from '../app.js';
import { categoryList, itemCategory, allCategories, UNCATEGORIZED } from './backfields.js';
import { toast } from './toast.js';
import { confirmModal } from './confirm.js';
import { startTour } from './onboarding.js';
import { icon } from './icons.js';

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
    <div class="set-group">
      <div class="set-group-title"><span>プロフィール・時給設定</span></div>
      <div class="set-rows">
        <div class="set-row"><span class="set-ico">${icon('person')}</span><span class="set-label">表示名</span>
          <input class="set-val" id="name" value="${esc(p.name)}" placeholder="Lumi"></div>
        <div class="set-row"><span class="set-ico">${icon('home')}</span><span class="set-label">店舗名（任意）</span>
          <input class="set-val" id="store" value="${esc(p.storeName)}" placeholder="—"></div>
        <div class="set-row"><span class="set-ico">${icon('yen')}</span><span class="set-label">基本時給（円）</span>
          <input class="set-val" id="wage" type="number" inputmode="numeric" placeholder="0" value="${Number(p.hourlyWage) || ''}"></div>
      </div>
    </div>

    <div class="set-group">
      <div class="set-group-title"><span>深夜手当（時間帯割増）</span>
        <label class="switch"><input id="npEnabled" type="checkbox" ${p.nightPremium && p.nightPremium.enabled ? 'checked' : ''}><span class="switch-slider"></span></label>
      </div>
      <div class="set-rows" id="npRows">
        <div class="set-row"><span class="set-ico">${icon('moon')}</span><span class="set-label">開始時間</span>
          <input class="set-val" id="npStart" type="time" value="${esc((p.nightPremium && p.nightPremium.start) || '22:00')}"></div>
        <div class="set-row"><span class="set-ico">${icon('moon')}</span><span class="set-label">終了時間</span>
          <input class="set-val" id="npEnd" type="time" value="${esc((p.nightPremium && p.nightPremium.end) || '05:00')}"></div>
        <div class="set-row"><span class="set-ico">％</span><span class="set-label">割増率（円/時）</span>
          <input class="set-val" id="npAdd" type="number" inputmode="numeric" placeholder="0" value="${(p.nightPremium && Number(p.nightPremium.addPerHour)) || ''}"></div>
      </div>
    </div>

    <div class="set-group">
      <div class="set-group-title"><span>新規シフトの初期値</span></div>
      <div class="set-rows">
        <div class="set-row"><span class="set-ico">${icon('clock')}</span><span class="set-label">開始時間</span>
          <input class="set-val" id="defStart" type="time" value="${esc(p.defaultStart || '20:00')}"></div>
        <div class="set-row"><span class="set-ico">${icon('clock')}</span><span class="set-label">終了時間</span>
          <input class="set-val" id="defEnd" type="time" value="${esc(p.defaultEnd || '01:00')}"></div>
        <div class="set-row"><span class="set-ico">${icon('clock')}</span><span class="set-label">休憩（分）</span>
          <input class="set-val" id="defBreak" type="number" inputmode="numeric" placeholder="0" value="${Number(p.defaultBreakMin) || ''}"></div>
      </div>
    </div>

    <div class="set-group">
      <div class="set-group-title"><span>日払い設定</span></div>
      <p class="set-desc">出勤したその日にお店で受け取る分の設定です。ここで選ぶと、すべての出勤日にこの受け取り方が適用されます（受け取っていない差額は「未受取（後日支給）」として集計されます）。</p>
      <div class="set-rows">
        <div class="set-row"><span class="set-ico">${icon('yen')}</span><span class="set-label">受け取り方</span>
          <span class="set-val-wrap"><select id="dayPayType">
            <option value="none" ${(p.dayPayType || 'none') === 'none' ? 'selected' : ''}>なし</option>
            <option value="full" ${p.dayPayType === 'full' ? 'selected' : ''}>全額 当日日払い</option>
            <option value="base" ${p.dayPayType === 'base' ? 'selected' : ''}>基本時給のみ 日払い</option>
            <option value="trial" ${p.dayPayType === 'trial' ? 'selected' : ''}>体験入店・全額 日払い</option>
          </select></span></div>
        <div class="set-row"><span class="set-ico">${icon('yen')}</span><span class="set-label">日払いの上限（円）</span>
          <input class="set-val" id="dayPayCap" type="number" inputmode="numeric" placeholder="0" value="${Number(p.dayPayCap) || ''}"></div>
      </div>
      <div class="set-hint">※上限は0または空欄で上限なし</div>
    </div>

    <div class="set-group">
      <div class="set-group-title"><span>${icon('bell')} リマインダー通知</span></div>
      <p class="set-desc">アプリを開いたとき、ホーム画面に念押しのお知らせを出します（端末のプッシュ通知は出ません）。</p>
      <div class="set-rows">
        <div class="set-row"><span class="set-label">出勤予定を通知する</span>
          <label class="switch"><input id="shiftRemEnabled" type="checkbox" ${p.shiftReminder.enabled ? 'checked' : ''}><span class="switch-slider"></span></label></div>
        <div class="set-row"><span class="set-label">何日前から通知</span>
          <span class="set-val-wrap">${leadSelect('shiftRemLead', p.shiftReminder.leadDays)}</span></div>
        <div class="set-row"><span class="set-label">キャンペーン終了を通知する</span>
          <label class="switch"><input id="campRemEnabled" type="checkbox" ${p.campaignReminder.enabled ? 'checked' : ''}><span class="switch-slider"></span></label></div>
        <div class="set-row"><span class="set-label">終了の何日前から通知</span>
          <span class="set-val-wrap">${leadSelect('campRemLead', p.campaignReminder.leadDays)}</span></div>
      </div>
    </div>

    <div class="set-group">
      <div class="set-group-title"><span>表示・その他の設定</span></div>
      <div class="set-rows">
        <div class="set-row"><span class="set-ico">${icon('checkbox')}</span><span class="set-label">レポートに日払いの差額を表示する</span>
          <label class="switch"><input id="showDayPayDiff" type="checkbox" ${p.showDayPayDiff ? 'checked' : ''}><span class="switch-slider"></span></label></div>
      </div>
    </div>

    <button class="btn btn-save" id="saveProfile">保存する</button>

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
      <button class="btn btn-ghost" id="addItem">${icon('plus')} 項目を追加</button>
    </div>

    <div class="card">
      <h3>キャンペーンお知らせ</h3>
      <p class="muted" style="font-size:12px;margin:2px 0 10px;line-height:1.6">期間を決めてホーム画面に表示されるメモです（例：今月のバック増額キャンペーン）。開始日〜終了日の間だけホームにお知らせとして表示されます。空欄なら常時表示します。</p>
      <div id="annList"></div>
      <button class="btn btn-ghost" id="addAnn">${icon('plus')} お知らせを追加</button>
    </div>

    <div class="card" id="backupCard">
      <h3>データのバックアップ</h3>
      <p class="muted" style="font-size:12px;margin:2px 0 12px;line-height:1.7">
        入力したデータは<b>お使いの端末の中だけ</b>に保存されます（サーバーには送っていません）。
        機種変更・アプリの削除・ブラウザのデータ消去などで<b>消えてしまうことがある</b>ため、
        ときどき<b>バックアップ</b>してファイルを保管しておくと安心です。
        新しい端末に移すときは、そのファイルを読み込めば元に戻せます。<br>
        <span style="color:#f08fb0">※バックアップには、設定・歩合項目・勤務記録・お知らせ・やること・顧客・来店予定・イベント予約の<b>すべてのデータ</b>が含まれます。</span>
      </p>
      <button class="btn btn-ghost" id="exportBtn">${icon('save')} バックアップを保存</button>
      <div class="backup-hint">ファイルに書き出して保管します</div>
      <div style="height:10px"></div>
      <label class="btn btn-ghost" style="display:block;text-align:center;cursor:pointer">
        ${icon('upload')} バックアップから復元<input id="importFile" type="file" accept="application/json" hidden>
      </label>
      <div class="backup-hint">保存したファイルを読み込みます</div>
    </div>

    <div class="card">
      <h3>操作ログ</h3>
      <p class="muted" style="font-size:12px;margin:2px 0 12px;line-height:1.7">
        データを<b>追加・保存・削除した記録</b>です（この端末の中だけに保存され、外部には送られません）。
        「あれ、消えた？」というときに、いつ何を変更したかを確認できます。
      </p>
      <div id="auditLogBox"></div>
      <div style="height:10px"></div>
      <button class="btn btn-ghost" id="clearLog" style="color:#f55">${icon('trash')} 操作ログを消去</button>
      <div class="backup-hint">記録だけを消します（データ本体は消えません）</div>
    </div>

    <div class="card">
      <h3>使い方・ヘルプ</h3>
      <p class="muted" style="font-size:12px;margin:2px 0 12px;line-height:1.7">
        画面の目印つきで使い方をご案内します。よくある質問（ヘルプ）はメニューからも開けます。
      </p>
      <button class="btn" id="showGuide">${icon('book')} 使い方ガイドを見る</button>
      <div style="height:10px"></div>
      <button class="btn btn-ghost" id="openHelp">${icon('help')} ヘルプ（よくある質問）</button>
    </div>`;

  el.querySelector('#showGuide').onclick = () => startTour();
  el.querySelector('#openHelp').onclick = () => navigate('help');

  const AUDIT_MAX = 500; // これを超えた古いログは表示時に自動で間引く
  const opBadge = { put: '保存', del: '削除', info: '' };
  const opClass = { put: 'log-put', del: 'log-del', info: 'log-info' };
  async function renderLog() {
    const box = el.querySelector('#auditLogBox');
    if (!box) return;
    let logs = await getAll('auditLog');
    const stale = logsToPrune(logs, AUDIT_MAX);
    if (stale.length) {
      for (const id of stale) await del('auditLog', id);
      logs = logs.filter((l) => !stale.includes(l.id));
    }
    if (!logs.length) {
      box.innerHTML = '<p class="muted" style="font-size:13px">まだ記録はありません。</p>';
      return;
    }
    const groups = groupLogsByDay(logs).slice(0, 60); // 直近60日ぶんまで表示
    box.innerHTML = groups.map((g) => `
      <div class="log-day">${esc(g.day)}</div>
      ${g.items.map((l) => `
        <div class="log-row">
          <span class="log-time">${esc(logTime(l.ts))}</span>
          ${opBadge[l.op] ? `<span class="log-badge ${opClass[l.op] || ''}">${esc(opBadge[l.op])}</span>` : ''}
          <span class="log-label">${esc(l.label)}</span>
        </div>`).join('')}
    `).join('');
  }
  renderLog();

  el.querySelector('#clearLog').onclick = async () => {
    if (!(await confirmModal('操作ログをすべて消去します。よろしいですか？（データ本体は消えません）', { okLabel: '消去する', danger: true }))) return;
    await clearAuditLog();
    toast('操作ログを消去しました');
    renderLog();
  };

  // 深夜手当トグルOFFのときは配下の入力欄を淡色・操作不可に。
  const npRows = el.querySelector('#npRows');
  const npToggle = el.querySelector('#npEnabled');
  const syncNp = () => npRows.classList.toggle('is-off', !npToggle.checked);
  npToggle.onchange = syncNp;
  syncNp();

  // 「保存する」はプロフィール・時給・深夜手当・初期値・日払い・リマインダー・表示設定を一括保存。
  // 歩合項目／お知らせ／操作ログは変更時に即保存されるためこのボタンの対象外。
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
      dayPayCap: num('#dayPayCap'),
      dayPayType: el.querySelector('#dayPayType').value,
      showDayPayDiff: el.querySelector('#showDayPayDiff').checked,
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
    toast('保存しました');
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
          <button class="cat-del" type="button" aria-label="削除" style="border:none;background:none;color:#f55;font-size:16px;padding:4px 8px;flex:0 0 auto">${icon('trash')}</button>
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
          <button class="i-del" style="border:none;background:none;color:#f55;font-size:18px;padding:4px 8px;flex:0 0 auto">${icon('trash')}</button>
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
    await put('backItems', { id: uid(), name: '', kind: 'income', fixedValue: 0, rateValue: 0, category, order });
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
          <button class="a-del" style="border:none;background:none;color:#f55;width:auto;flex:0 0 auto">${icon('trash')}</button>
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
    e.target.value = ''; // 同じファイルを再選択できるようにリセット
    if (!(await confirmModal('バックアップファイルの内容を、現在のデータに復元（上書き追加）します。よろしいですか？', { okLabel: '復元する', danger: false }))) return;

    // 復元データの検証：壊れた/別物のファイルでアプリを壊さない
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      toast('ファイルを読み込めませんでした（JSON形式ではありません）');
      return;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      toast('バックアップファイルの形式が正しくありません');
      return;
    }
    // 各ストアは「id を持つオブジェクトの配列」のみ受け入れる（不正な要素はスキップ）
    const validRecords = (arr) => (Array.isArray(arr) ? arr : [])
      .filter((r) => r && typeof r === 'object' && !Array.isArray(r)
        && (typeof r.id === 'string' || typeof r.id === 'number'));

    let restored = 0;
    suppressAudit(true); // 一括復元は1件ずつログせず、最後にまとめて1件だけ残す
    try {
      if (data.profile && typeof data.profile === 'object' && !Array.isArray(data.profile)) {
        await saveProfile(data.profile);
      }
      const stores = ['backItems', 'shifts', 'announcements', 'todos', 'customers', 'visits', 'events', 'reservations'];
      for (const store of stores) {
        for (const rec of validRecords(data[store])) { await put(store, rec); restored++; }
      }
    } finally {
      suppressAudit(false);
    }
    await logNote(`バックアップから復元（${restored}件）`, 'put');
    await loadAll();
    toast(`復元しました（${restored}件）`);
    navigate('settings');
  };
}
