import { state, loadAll } from '../state.js';
import { put, del, getAll, saveProfile, clearAuditLog, suppressAudit, logNote, resetAllData } from '../db.js';
import { esc } from '../format.js';
import { groupLogsByDay, logTime, logsToPrune } from '../audit-logic.js';
import { navigate, checkForUpdate } from '../app.js';
import { APP_VERSION } from '../version.js';
import { toast } from './toast.js';
import { confirmModal } from './confirm.js';
import { startTour } from './onboarding.js';
import { icon } from './icons.js';
import { openPaywall } from './paywall.js';

// マイページ：アカウント・アプリ管理系（バックアップ／データ削除／操作ログ／ヘルプ／
// Lumi Premium／購入復元／サブスク管理／バージョン）をまとめた下タブ画面。
// 時給・プロフィール等の設定フォームは「設定」（メニュー）に残す。
export async function renderMyPage(el) {
  el.innerHTML = `
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

    <div class="mp-account">
      <button class="card premium-cta" id="openPaywall" type="button">
        <div class="premium-cta-main">
          <span class="premium-cta-title"><span class="pw-spark">✦</span> Lumi Premium</span>
          <span class="premium-cta-sub">顧客管理・イベント・詳細レポートを解放（¥500/月）</span>
        </div>
        <span class="premium-cta-chev">${icon('chevron')}</span>
      </button>
      <button class="btn btn-ghost" id="restorePurchase" type="button">${icon('refresh')} 購入を復元</button>
      <button class="btn btn-ghost" id="manageSub" type="button">${icon('gear')} サブスクを管理／解約する</button>
    </div>

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

  // ===== 操作ログ =====
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

  // ===== データ削除（リセット） =====
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

  // ===== バックアップ（書き出し／復元） =====
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
    navigate('mypage');
  };
}
