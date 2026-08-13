// segments: [{ value, color }]、中央テキスト centerText を描く。
// topLabel を渡すと中央テキストの上に小さな見出し（例「合計金額」）を添える。
export function drawDonut(canvas, segments, centerText, topLabel) {
  const dpr = window.devicePixelRatio || 1;
  const size = 160;
  canvas.width = size * dpr; canvas.height = size * dpr;
  canvas.style.width = size + 'px'; canvas.style.height = size + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const cx = size / 2, cy = size / 2, r = 64, lw = 22;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let start = -Math.PI / 2;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  segments.forEach((seg) => {
    const ang = (seg.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.strokeStyle = seg.color;
    ctx.arc(cx, cy, r, start, start + ang);
    ctx.stroke();
    start += ang;
  });
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const amtY = topLabel ? cy + 8 : cy;
  if (topLabel) {
    ctx.fillStyle = '#8a8a8a';
    ctx.font = '11px sans-serif';
    ctx.fillText(topLabel, cx, cy - 12);
  }
  if (centerText) {
    ctx.fillStyle = '#2b2b2b';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText(centerText, cx, amtY);
  }
}
