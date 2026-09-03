export function yen(n) {
  return '¥' + Math.round(n || 0).toLocaleString('ja-JP');
}
export function signedYen(n) {
  const v = Math.round(n || 0);
  return (v >= 0 ? '+' : '-') + '¥' + Math.abs(v).toLocaleString('ja-JP');
}
export function weekdayJa(isoDate) {
  const w = ['日', '月', '火', '水', '木', '金', '土'];
  return w[new Date(isoDate + 'T00:00:00').getDay()];
}
export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function shortDateJa(iso) {
  if (!iso) return '';
  return `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}(${weekdayJa(iso)})`;
}
// タイムスタンプ(ms)→ローカルの「M/D HH:MM」。記録した日時の表示に使う。
export function dateTimeJa(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
