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
export function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
