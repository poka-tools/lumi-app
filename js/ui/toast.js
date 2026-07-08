// 画面下部に一時表示する軽量トースト（保存完了などの非ブロッキング通知）。
let _timer = null;
export function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast no-print';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  // いったんクラスを外して再付与し、連続表示でもアニメを確実に再生する
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  if (_timer) clearTimeout(_timer);
  _timer = setTimeout(() => el.classList.remove('show'), 1800);
}
