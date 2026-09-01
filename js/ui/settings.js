import { state, loadAll } from '../state.js';
import { put, del, uid, saveProfile, getAll, clearAuditLog, suppressAudit, logNote, resetAllData } from '../db.js';
import { esc } from '../format.js';
import { groupLogsByDay, logTime, logsToPrune } from '../audit-logic.js';
import { navigate, checkForUpdate } from '../app.js';
import { APP_VERSION } from '../version.js';
import { toast } from './toast.js';
import { confirmModal } from './confirm.js';
import { startTour } from './onboarding.js';
import { icon } from './icons.js';
import { openPaywall } from './paywall.js';
import { ensurePremium } from './premium-gate.js';
import { rcTestMode } from '../entitlement.js';

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
    </details>

    <details class="card set-details" id="backupCard">
      <summary class="set-details-sum">
        <span class="set-details-title">データのバックアップ</span>
        <span class="set-details-hint">タップで表示</span>
        <span class="set-details-chev">${icon('chevronDown')}</span>
      </summary>
      <div class="set-details-body">
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
    </details>

    <details class="card set-details" id="resetCard">
      <summary class="set-details-sum">
        <span class="set-details-title">データを削除（リセット）</span>
        <span class="set-details-hint">タップで表示</span>
        <span class="set-details-chev">${icon('chevronDown')}</span>
      </summary>
      <div class="set-details-body">
        <p class="muted" style="font-size:12px;margin:2px 0 12px;line-height:1.7">
          このアプリの<b>すべてのデータ</b>（設定・歩合項目・勤務記録・お知らせ・やること・顧客・来店予定・イベント予約・操作ログ）を、<b>この端末から完全に削除</b>して最初の状態に戻します。<br>
          <span style="color:#f55">※削除したデータは元に戻せません。</span>ご不安なときは、先に上の「データのバックアップ」から保存しておいてください。
        </p>
        <button class="btn btn-ghost" id="resetAllBtn" style="color:#f55">${icon('trash')} すべてのデータを削除する</button>
        <div class="backup-hint">アカウントのリセット・退会をしたいときに使います</div>
      </div>
    </details>

    <details class="card set-details" id="auditDetails">
      <summary class="set-details-sum">
        <span class="set-details-title">操作ログ</span>
        <span class="set-details-hint">タップで表示</span>
        <span class="set-details-chev">${icon('chevronDown')}</span>
      </summary>
      <div class="set-details-body">
        <p class="muted" style="font-size:12px;margin:2px 0 12px;line-height:1.7">
          データを<b>追加・保存・削除した記録</b>です（この端末の中だけに保存され、外部には送られません）。
          「あれ、消えた？」というときに、いつ何を変更したかを確認できます。
        </p>
        <div id="auditLogBox"></div>
        <div style="height:10px"></div>
        <button class="btn btn-ghost" id="clearLog" style="color:#f55">${icon('trash')} 操作ログを消去</button>
        <div class="backup-hint">記録だけを消します（データ本体は消えません）</div>
      </div>
    </details>

    <details class="card set-details">
      <summary class="set-details-sum">
        <span class="set-details-title">使い方・ヘルプ</span>
        <span class="set-details-hint">タップで表示</span>
        <span class="set-details-chev">${icon('chevronDown')}</span>
      </summary>
      <div class="set-details-body">
        <p class="muted" style="font-size:12px;margin:2px 0 12px;line-height:1.7">
          画面の目印つきで使い方をご案内します。よくある質問（ヘルプ）はメニューからも開けます。
        </p>
        <button class="btn" id="showGuide">${icon('book')} 使い方ガイドを見る</button>
        <div style="height:10px"></div>
        <button class="btn btn-ghost" id="openHelp">${icon('help')} ヘルプ（よくある質問）</button>
      </div>
    </details>

    <button class="card premium-cta" id="openPaywall" type="button">
      <div class="premium-cta-main">
        <span class="premium-cta-title"><span class="pw-spark">✦</span> Lumi Premium</span>
        <span class="premium-cta-sub">顧客管理・イベント・詳細レポートを解放（¥500/月）</span>
      </div>
      <span class="premium-cta-chev">${icon('chevron')}</span>
    </button>
    <button class="btn btn-ghost" id="restorePurchase" type="button" style="margin-top:8px">${icon('refresh')} 購入を復元</button>
    <button class="btn btn-ghost" id="manageSub" type="button" style="margin-top:8px">${icon('gear')} サブスクを管理／解約する</button>
    ${rcTestMode() ? `<button class="btn btn-ghost" id="rcTestReset" type="button" style="margin-top:8px;color:#b0171f">${icon('trash')} テスト: RC利用者IDをリセット</button>` : ''}

    <div class="card app-info">
      <div class="app-info-row">
        <span class="app-info-label">アプリのバージョン</span>
        <span class="app-info-ver">v${APP_VERSION}</span>
      </div>
      <p class="muted" style="font-size:12px;margin:2px 0 12px;line-height:1.7">
        新しい更新があるか確認します。ある場合は内容をご案内し、その場で更新できます。
      </p>
      <button class="btn btn-ghost" id="checkUpdate">${icon('refresh')} アップデートを確認</button>
    </div>`;

  el.querySelector('#showGuide').onclick = () => startTour();
  el.querySelector('#openHelp').onclick = () => navigate('help');
  el.querySelector('#checkUpdate').onclick = () => checkForUpdate();
  el.querySelector('#openPaywall').onclick = () => openPaywall();
  el.querySelector('#restorePurchase').onclick = async (e) => {
    const btn = e.currentTarget;
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = '確認中…';
    try {
      const rc = await import('../rc.js'); // 重いSDKはここで初めて読み込む
      const active = await rc.refreshCustomerInfo();
      toast(active ? 'Premium を復元しました' : 'この端末では有効な購入が見つかりませんでした');
    } catch (err) {
      toast('復元を確認できませんでした：\n' + ((err && err.message) || err));
    } finally {
      btn.disabled = false;
      btn.innerHTML = orig;
    }
  };
  el.querySelector('#manageSub').onclick = async (e) => {
    const btn = e.currentTarget;
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = '確認中…';
    try {
      const rc = await import('../rc.js'); // 重いSDKはここで初めて読み込む
      const url = await rc.getManagementUrl();
      if (url) {
        // 解約はRevenueCat/Stripeのホスト画面で行う（外部ページへ遷移）。
        location.href = url;
      } else {
        toast('有効なサブスクリプションが\n見つかりませんでした');
        btn.disabled = false;
        btn.innerHTML = orig;
      }
    } catch (err) {
      toast('管理ページを開けませんでした：\n' + ((err && err.message) || err));
      btn.disabled = false;
      btn.innerHTML = orig;
    }
  };
  // テスト用（?rctest=1 のときだけ表示）：RC利用者IDを消して未購入状態に戻す。
  // アプリの「データ削除」は IndexedDB のみ消し localStorage は残すため、RC識別子はこれで消す。
  const rcReset = el.querySelector('#rcTestReset');
  if (rcReset) rcReset.onclick = async () => {
    const ok = await confirmModal('テスト用の購入状態（RC利用者ID）を消して\n未購入の状態に戻します。よろしいですか？',
      { okLabel: 'リセットする', cancelLabel: 'やめる', danger: true });
    if (!ok) return;
    // rc.js の APPUSER_KEY / EMAIL_KEY と同一のキー。SDKを読み込まずに直接消す。
    try { localStorage.removeItem('lumi_rc_appuser'); localStorage.removeItem('lumi_rc_email'); } catch { /* 無視 */ }
    toast('RC利用者IDをリセットしました');
    setTimeout(() => location.reload(), 800);
  };
  el.querySelector('#goBackItems').onclick = () => navigate('backitems');

  // 日払い管理は有料。ロック中に「なし」以外を選んだら元に戻してペイウォールを出す。
  const dpSel = el.querySelector('#dayPayType');
  if (dpSel) dpSel.onchange = () => {
    if (dpSel.value !== 'none' && !ensurePremium()) dpSel.value = 'none';
  };

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
  // 操作ログは既定で折りたたみ。開いたとき（初回）に描画する。
  const auditDetails = el.querySelector('#auditDetails');
  let auditRendered = false;
  auditDetails.addEventListener('toggle', () => {
    if (auditDetails.open && !auditRendered) { auditRendered = true; renderLog(); }
  });

  el.querySelector('#clearLog').onclick = async () => {
    if (!(await confirmModal('操作ログをすべて消去します。よろしいですか？（データ本体は消えません）', { okLabel: '消去する', danger: true }))) return;
    await clearAuditLog();
    toast('操作ログを消去しました');
    renderLog();
  };

  el.querySelector('#resetAllBtn').onclick = async () => {
    if (!(await confirmModal(
      'すべてのデータを削除して、最初の状態に戻します。\n勤務記録・顧客・イベント・設定など、この端末に保存したすべてが消え、元に戻せません。\n\n本当に削除しますか？',
      { okLabel: 'すべて削除する', cancelLabel: 'やめる', danger: true }
    ))) return;
    try {
      await resetAllData();
      toast('データを削除しました。\n最初の画面に戻ります…');
      setTimeout(() => window.location.reload(), 1400);
    } catch (err) {
      console.error('データ削除に失敗:', err);
      toast('削除に失敗しました。\nアプリを完全に終了してから、もう一度お試しください。');
    }
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
