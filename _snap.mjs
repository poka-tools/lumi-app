import 'fake-indexeddb/auto';
import { JSDOM } from 'jsdom';
import { readFileSync, writeFileSync } from 'node:fs';

const BASE = '/mnt/c/Users/tsuba/workspace/yashoku-salary';
const dom = new JSDOM('<!DOCTYPE html><body><main id="screen"></main><nav id="tabbar"></nav></body>', { url: 'http://localhost/' });
const { window } = dom;
global.window = window;
global.document = window.document;
global.HTMLElement = window.HTMLElement;
global.Blob = window.Blob;
global.URL = window.URL;
global.alert = () => {};
global.confirm = () => true;
window.devicePixelRatio = 2;
window.HTMLCanvasElement.prototype.getContext = function () { return new Proxy({}, { get: () => () => {} }); };

const today = new Date().toISOString().slice(0, 10);
const yd = new Date(); yd.setDate(yd.getDate() - 1); const yest = yd.toISOString().slice(0, 10);

const db = await import(`${BASE}/js/db.js`);
await db.saveProfile({ name: 'みゆ', storeName: 'テスト店', hourlyWage: 2500 });
await db.put('backItems', { id: 'douhan', name: '同伴', type: 'fixed', value: 3000, order: 0 });
await db.put('backItems', { id: 'drink', name: 'ドリンクバック', type: 'rate', value: 10, order: 1 });
await db.put('backItems', { id: 'shimei', name: '本指名', type: 'fixed', value: 2000, order: 2 });
await db.put('shifts', { id: 's1', date: today, start: '20:00', end: '01:00', breakMin: 0, confirmed: true,
  entries: [{ backItemId: 'douhan', count: 2 }, { backItemId: 'drink', sales: 50000 }, { backItemId: 'shimei', count: 1 }] });
await db.put('shifts', { id: 's2', date: yest, start: '19:00', end: '23:30', breakMin: 0, confirmed: true,
  entries: [{ backItemId: 'drink', sales: 30000 }] });
await db.put('announcements', { id: 'a1', title: '今週末まで！ドリンクバックが+10%アップ中🎉', body: '', startDate: '', endDate: '' });

const state = await import(`${BASE}/js/state.js`);
await state.loadAll();
const calc = await import(`${BASE}/js/calc.js`);
const cur = state.shiftsOfMonth();
const bd = calc.incomeBreakdown(2500, state.state.backItems, cur);

const screen = document.getElementById('screen');

// 全画面をレンダリングしてエラーが出ないか確認
const ui = {
  home: (await import(`${BASE}/js/ui/home.js`)).renderHome,
  calendar: (await import(`${BASE}/js/ui/calendar.js`)).renderCalendar,
  record: (await import(`${BASE}/js/ui/record.js`)).renderRecord,
  report: (await import(`${BASE}/js/ui/report.js`)).renderReport,
  settings: (await import(`${BASE}/js/ui/settings.js`)).renderSettings,
};
for (const [name, render] of Object.entries(ui)) {
  screen.innerHTML = '';
  try {
    await render(screen);
    const len = screen.innerHTML.length;
    if (len < 50) throw new Error(`空に近い出力 (${len} chars)`);
    console.log(`OK  ${name.padEnd(9)} ${len} chars`);
  } catch (err) {
    console.log(`FAIL ${name.padEnd(9)} ${err.message}`);
    process.exitCode = 1;
  }
}

// ホームの見た目を HTML スナップショットに書き出す
screen.innerHTML = '';
await ui.home(screen);
const screenHtml = screen.innerHTML;
const css = readFileSync(`${BASE}/css/style.css`, 'utf8');
const tabbar = `<nav id="tabbar">
  <button data-tab="home" class="active">🏠<span>ホーム</span></button>
  <button data-tab="calendar">📅<span>カレンダー</span></button>
  <button data-tab="record" class="fab">＋</button>
  <button data-tab="report">📊<span>レポート</span></button>
  <button data-tab="settings">⚙️<span>設定</span></button>
</nav>`;
const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8">
<style>${css}</style></head><body>
<main id="screen">${screenHtml}</main>
${tabbar}
<script>
const c = document.getElementById('donut');
if (c) {
  const dpr = 2, size = 160; c.width = size*dpr; c.height = size*dpr;
  c.style.width = size+'px'; c.style.height = size+'px';
  const ctx = c.getContext('2d'); ctx.scale(dpr,dpr);
  const segs = [{v:${bd.wage},col:'#ff5c8a'},{v:${bd.back},col:'#a78bfa'}];
  const total = segs.reduce((s,x)=>s+x.v,0)||1; let a=-Math.PI/2;
  ctx.lineWidth=22;
  segs.forEach(s=>{const ang=s.v/total*Math.PI*2;ctx.beginPath();ctx.strokeStyle=s.col;ctx.arc(80,80,64,a,a+ang);ctx.stroke();a+=ang;});
  ctx.fillStyle='#2b2b2b';ctx.font='bold 15px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText('¥${bd.total.toLocaleString()}',80,80);
}
</script>
</body></html>`;
writeFileSync('/mnt/c/Users/tsuba/yashoku-snapshot.html', html);
console.log('snapshot written. month total =', bd.total, 'wage', bd.wage, 'back', bd.back);
// fake-indexeddb がイベントループを開放しないため明示終了する
process.exit(process.exitCode || 0);
