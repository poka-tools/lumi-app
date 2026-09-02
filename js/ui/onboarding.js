// 初回起動時の使い方ツアー。実際の画面要素（設定・各タブ）を目印でハイライトしながら案内する。
// いつでもスキップ可能・ホームのヘルプや設定からいつでも再表示できる。
import { state, loadAll } from '../state.js';
import { icon } from './icons.js';
import { saveProfile, put, uid } from '../db.js';
import { navigate } from '../app.js';
import { OCCUPATIONS, occupationBackItems } from '../presets.js';

// target を持つステップは、その要素をスポットライトで照らして吹き出しを近くに出す。
// target 無しのステップ（ようこそ・完了）は中央に表示。
const STEPS = [
  { img: 'assets/icon-192.png', title: 'Lumiへようこそ',
    body: 'お給料・歩合・出勤日をまるっと管理できるアプリです。画面の<b>目印</b>に沿って、使い方をかんたんにご案内します。データはあなたのスマホの中だけに保存され、外部には送信されません。' },
  { occupation: true, title: 'あなたのお仕事は？',
    body: 'お仕事に合わせて、よく使う歩合項目（チェキ・指名・シャンパンなど）をあらかじめ用意します。金額はあとから設定できます。' },
  { target: '#homeSettingsBtn', emoji: icon('gear', { size: '46px' }), title: 'まず時給を設定',
    body: 'ホーム下の <b>設定</b> から、基本時給・深夜手当・歩合項目を登録できます。設定しておくと、記録するだけで金額が自動計算されます。' },
  { target: '#tabbar button[data-tab="calendar"]', emoji: icon('calendar', { size: '46px' }), title: 'カレンダーで出勤を記録',
    body: '<b>カレンダー</b>では、日付をタップして勤務時間・歩合・イベントを入力します。<b>当日欠勤</b>もチェックひとつで記録でき、時給は付かず、ペナルティがある場合のみ計上できます。' },
  { target: '#tabbar button[data-tab="record"]', emoji: icon('plus', { size: '46px' }), title: '＋ ですばやく記録',
    body: '中央の <b>＋</b> から、その日の勤務をすぐに追加できます。急いでいるときに便利です。' },
  { target: '#tabbar button[data-tab="report"]', emoji: icon('chart', { size: '46px' }), title: 'レポートで収支を確認',
    body: '<b>レポート</b>で、月ごとの収入・歩合・出勤日数をまとめて確認。PDFに書き出して保管することもできます。' },
  { target: '#tabbar button[data-tab="customers"]', emoji: icon('person', { size: '46px' }), title: '顧客・イベントを管理',
    body: '<b>顧客</b>では、来店予定やお誕生日を管理。上部の「イベント」でシャンパン予約の名簿も作れます。' },
  { target: '#homeHelpBtn', emoji: icon('help', { size: '46px' }), title: '困ったときはヘルプ',
    body: '使い方に迷ったら、ホーム下の <b>ヘルプ</b> から、この案内やよくある質問をいつでも確認できます。' },
  { emoji: icon('save', { size: '46px' }), title: '準備OK！',
    body: 'データは端末内だけに保存されます。機種変更などに備えて、設定の<b>「バックアップ」</b>でときどき保存しておくと安心です。<br>この案内は、ホーム下の <b>ヘルプ</b> からいつでも見返せます。', final: true },
];

let overlay = null, hole = null, callout = null, idx = 0, onResize = null;

async function finish(goSettings) {
  cleanup();
  try {
    state.profile = { ...state.profile, onboarded: true };
    await saveProfile(state.profile);
  } catch { /* 保存失敗でもツアーは閉じる */ }
  if (goSettings) navigate('settings');
}

function cleanup() {
  if (onResize) { window.removeEventListener('resize', onResize); onResize = null; }
  if (!overlay) return;
  const el = overlay;
  overlay = null; hole = null; callout = null;
  el.classList.remove('show');
  setTimeout(() => el.remove(), 240);
}

// スポットライトの穴と吹き出しを、対象要素の位置に合わせて配置する。
function position() {
  const s = STEPS[idx];
  const target = s.target ? document.querySelector(s.target) : null;
  if (target) target.scrollIntoView({ block: 'center', inline: 'center' }); // 画面外の対象を可視域へ
  const rect = target ? target.getBoundingClientRect() : null;
  const vw = window.innerWidth, vh = window.innerHeight, margin = 14;

  if (rect && rect.width) {
    const pad = 8;
    overlay.style.background = 'transparent'; // 暗さは穴の box-shadow が担う
    hole.style.display = 'block';
    hole.style.top = (rect.top - pad) + 'px';
    hole.style.left = (rect.left - pad) + 'px';
    hole.style.width = (rect.width + pad * 2) + 'px';
    hole.style.height = (rect.height + pad * 2) + 'px';
  } else {
    overlay.style.background = 'rgba(20, 10, 20, .6)'; // 対象なしは全体を暗く
    hole.style.display = 'none';
  }

  callout.style.visibility = 'hidden';
  const cw = callout.offsetWidth, ch = callout.offsetHeight;
  let left, top;
  if (rect && rect.width) {
    left = Math.min(Math.max(margin, rect.left + rect.width / 2 - cw / 2), vw - cw - margin);
    const below = rect.top < vh / 2; // 対象が上半分なら吹き出しは下、下半分なら上
    top = below ? rect.bottom + 16 : rect.top - ch - 16;
    top = Math.min(Math.max(margin, top), vh - ch - margin);
  } else {
    left = (vw - cw) / 2;
    top = (vh - ch) / 2;
  }
  callout.style.left = left + 'px';
  callout.style.top = top + 'px';
  callout.style.visibility = 'visible';
}

// 職種を選んだら、その業種のプリセット歩合項目をまとめて作成して次へ進む。
// すでに歩合項目がある場合は重複作成せず、職種の記録だけ残す。
async function applyOccupation(occ) {
  try {
    if (occ !== 'other' && (state.backItems || []).length === 0) {
      for (const it of occupationBackItems(occ, uid, 0)) await put('backItems', it);
    }
    state.profile = { ...state.profile, occupation: occ };
    await saveProfile(state.profile);
    await loadAll();
  } catch { /* 失敗してもツアーは続行 */ }
  idx++; render();
}

function render() {
  const s = STEPS[idx];
  const last = idx === STEPS.length - 1;
  const dots = STEPS.map((_, i) => `<span class="onb-dot${i === idx ? ' active' : ''}"></span>`).join('');

  // 職種選択ステップ（中央表示・5択ボタン）。
  if (s.occupation) {
    callout.innerHTML = `
      <button class="onb-skip" type="button" id="onbSkip">スキップ</button>
      <div class="onb-emoji">${icon('bag', { size: '46px' })}</div>
      <h2 class="onb-title">${s.title}</h2>
      <p class="onb-body">${s.body}</p>
      <div class="onb-occ">
        ${OCCUPATIONS.map((o) => `<button class="onb-occ-btn" type="button" data-occ="${o.key}">
          <span class="onb-occ-emoji">${o.emoji}</span><span>${o.label}</span></button>`).join('')}
      </div>
      <div class="onb-dots">${dots}</div>
      <button class="onb-later" type="button" id="onbOccSkip">選ばずに進む</button>`;
    callout.querySelector('#onbSkip').onclick = () => finish(false);
    callout.querySelectorAll('.onb-occ-btn').forEach((b) => { b.onclick = () => applyOccupation(b.dataset.occ); });
    callout.querySelector('#onbOccSkip').onclick = () => { idx++; render(); };
    position();
    return;
  }

  callout.innerHTML = `
    <button class="onb-skip" type="button" id="onbSkip">スキップ</button>
    ${s.img
      ? `<img class="onb-logo" src="${s.img}" alt="Lumi">`
      : `<div class="onb-emoji">${s.emoji}</div>`}
    <h2 class="onb-title">${s.title}</h2>
    <p class="onb-body">${s.body}</p>
    <div class="onb-dots">${dots}</div>
    <div class="onb-actions">
      ${idx > 0 ? '<button class="btn btn-ghost" id="onbBack" style="flex:1">戻る</button>' : ''}
      ${last
        ? '<button class="btn" id="onbSettings" style="flex:2">時給を設定する</button>'
        : '<button class="btn" id="onbNext" style="flex:2">次へ</button>'}
    </div>
    ${last ? '<button class="onb-later" type="button" id="onbDone">あとで設定する</button>' : ''}`;

  callout.querySelector('#onbSkip').onclick = () => finish(false);
  const back = callout.querySelector('#onbBack');
  if (back) back.onclick = () => { idx--; render(); };
  const next = callout.querySelector('#onbNext');
  if (next) next.onclick = () => { idx++; render(); };
  const setBtn = callout.querySelector('#onbSettings');
  if (setBtn) setBtn.onclick = () => finish(true);
  const done = callout.querySelector('#onbDone');
  if (done) done.onclick = () => finish(false);
  position();
}

export async function startTour() {
  if (overlay) return;
  await navigate('home'); // 目印の対象（設定・各タブ）が存在するホームで開始
  idx = 0;
  overlay = document.createElement('div');
  overlay.className = 'tour-overlay';
  hole = document.createElement('div');
  hole.className = 'tour-hole';
  callout = document.createElement('div');
  callout.className = 'tour-callout onb-card';
  overlay.appendChild(hole);
  overlay.appendChild(callout);
  document.body.appendChild(overlay);
  onResize = () => { if (overlay) position(); };
  window.addEventListener('resize', onResize);
  render();
  requestAnimationFrame(() => overlay.classList.add('show'));
}

// 初回のみ自動表示（profile.onboarded が未設定なら）。読み込み失敗(null)時は出さない。
export function maybeStartTour() {
  if (!state.profile || state.profile.onboarded) return;
  startTour();
}
