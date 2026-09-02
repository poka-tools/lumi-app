import { state, loadAll } from '../state.js';
import { put, del, uid, saveProfile } from '../db.js';
import { esc } from '../format.js';
import { navigate } from '../app.js';
import { toast } from './toast.js';
import { confirmModal } from './confirm.js';
import { icon } from './icons.js';
import { ensurePremium } from './premium-gate.js';

// リマインダーの「何日前から」選択肢（当日〜1週間前）。
const LEAD_OPTS = [[0, '当日'], [1, '1日前'], [2, '2日前'], [3, '3日前'], [7, '1週間前']];
function leadSelect(id, val) {
  const cur = Number(val);
  return `<select id="${id}">${LEAD_OPTS.map(([v, label]) =>
    `<option value="${v}" ${v === cur ? 'selected' : ''}>${label}</option>`).join('')}</select>`;
}

export async function renderSettings(el) {
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
      <div class="set-group-title"><span>${icon('warning')} 年収の壁アラート</span>
        <label class="switch"><input id="wallEnabled" type="checkbox" ${p.incomeWall.enabled ? 'checked' : ''}><span class="switch-slider"></span></label>
      </div>
      <p class="set-desc">今年の収入（額面）が設定した金額に近づく・超えると、ホームでお知らせします。扶養や税金の目安にどうぞ（あくまで概算です）。</p>
      <div class="set-rows" id="wallRows">
        <div class="set-row"><span class="set-ico">${icon('yen')}</span><span class="set-label">壁の金額（円）</span>
          <input class="set-val" id="wallThreshold" type="number" inputmode="numeric" list="wallPresets" placeholder="1030000" value="${Number(p.incomeWall.threshold) || ''}">
          <datalist id="wallPresets"><option value="1000000"></option><option value="1030000"></option><option value="1060000"></option><option value="1300000"></option><option value="1500000"></option></datalist></div>
      </div>
      <div class="set-hint">例：103万の壁＝1030000／130万の壁＝1300000</div>
    </div>

    <div class="set-group">
      <div class="set-group-title"><span>${icon('note')} 源泉徴収</span>
        <label class="switch"><input id="whEnabled" type="checkbox" ${p.withholding.enabled ? 'checked' : ''}><span class="switch-slider"></span></label>
      </div>
      <p class="set-desc">報酬から源泉徴収される分（既定10.21%）を、レポートの手取りから自動で差し引いて表示します。確定申告で還付される場合の目安にもなります。</p>
      <div class="set-rows" id="whRows">
        <div class="set-row"><span class="set-ico">％</span><span class="set-label">源泉徴収率（％）</span>
          <input class="set-val" id="whRate" type="number" inputmode="decimal" step="0.01" placeholder="10.21" value="${Number(p.withholding.rate) || ''}"></div>
      </div>
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

    <div class="set-group">
      <div class="set-group-title"><span>歩合の管理</span></div>
      <div class="set-rows">
        <button class="set-row set-link" id="goBackItems" type="button">
          <span class="set-ico">${icon('percent')}</span>
          <span class="set-label">歩合項目の設定<span class="set-sub">シャンパンバック・指名料・ペナルティなどを登録・管理</span></span>
          <span class="set-chev">${icon('chevron')}</span>
        </button>
      </div>
    </div>

    <details class="card set-details">
      <summary class="set-details-sum">
        <span class="set-details-title">キャンペーンお知らせ</span>
        <span class="set-details-hint">タップで表示</span>
        <span class="set-details-chev">${icon('chevronDown')}</span>
      </summary>
      <div class="set-details-body">
        <p class="muted" style="font-size:12px;margin:2px 0 10px;line-height:1.6">期間を決めてホーム画面に表示されるメモです（例：今月のバック増額キャンペーン）。開始日〜終了日の間だけホームにお知らせとして表示されます。空欄なら常時表示します。</p>
        <div id="annList"></div>
        <button class="btn btn-ghost" id="addAnn">${icon('plus')} お知らせを追加</button>
      </div>
    </details>`;

  el.querySelector('#goBackItems').onclick = () => navigate('backitems');

  // 「保存する」ボタンは廃止。各項目を変更した瞬間に自動保存する。
  // 歩合項目／お知らせは元々変更時に即保存されるため対象外。
  const num = (id) => Number(el.querySelector(id).value) || 0;
  async function saveAll() {
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
      incomeWall: {
        enabled: el.querySelector('#wallEnabled').checked,
        threshold: num('#wallThreshold'),
      },
      withholding: {
        enabled: el.querySelector('#whEnabled').checked,
        rate: Number(el.querySelector('#whRate').value) || 10.21,
      },
    });
    await loadAll();
    toast('保存しました');
  }

  // 変更で自動保存する項目（テキスト・数値・時刻・トグル・選択）。
  ['name', 'store', 'wage', 'npStart', 'npEnd', 'npAdd', 'defStart', 'defEnd', 'defBreak',
    'dayPayCap', 'showDayPayDiff', 'shiftRemEnabled', 'shiftRemLead', 'campRemEnabled', 'campRemLead',
    'wallEnabled', 'wallThreshold', 'whEnabled', 'whRate']
    .forEach((id) => { const f = el.querySelector('#' + id); if (f) f.onchange = saveAll; });

  // 年収の壁／源泉徴収：トグルOFF時は配下の入力欄を淡色に。
  const syncDim = (rowsId, toggleId) => {
    const rows = el.querySelector('#' + rowsId), tg = el.querySelector('#' + toggleId);
    if (rows && tg) rows.classList.toggle('is-off', !tg.checked);
  };
  const wallTg = el.querySelector('#wallEnabled');
  wallTg.onchange = () => { syncDim('wallRows', 'wallEnabled'); saveAll(); };
  const whTg = el.querySelector('#whEnabled');
  whTg.onchange = () => { syncDim('whRows', 'whEnabled'); saveAll(); };
  syncDim('wallRows', 'wallEnabled');
  syncDim('whRows', 'whEnabled');

  // 深夜手当トグル：配下の入力欄の淡色表示を切り替えつつ自動保存。
  const npRows = el.querySelector('#npRows');
  const npToggle = el.querySelector('#npEnabled');
  const syncNp = () => npRows.classList.toggle('is-off', !npToggle.checked);
  npToggle.onchange = () => { syncNp(); saveAll(); };
  syncNp();

  // 日払いの受け取り方は有料。ロック中に「なし」以外を選んだら戻してペイウォール。通れば保存。
  const dpSel = el.querySelector('#dayPayType');
  if (dpSel) dpSel.onchange = () => {
    if (dpSel.value !== 'none' && !ensurePremium()) { dpSel.value = 'none'; return; }
    saveAll();
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
}
