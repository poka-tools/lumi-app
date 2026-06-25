// segments: [{ value, color }]、中央テキスト centerText を描く
export function drawDonut(canvas, segments, centerText) {
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
  segments.forEach((seg) => {
    const ang = (seg.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.strokeStyle = seg.color;
    ctx.arc(cx, cy, r, start, start + ang);
    ctx.stroke();
    start += ang;
  });
  if (centerText) {
    ctx.fillStyle = '#2b2b2b';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(centerText, cx, cy);
  }
}
