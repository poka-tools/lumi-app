// 端末で選んだ画像を、保存前に縮小・圧縮して dataURL(JPEG) に変換する。
// サーバー送信はせず IndexedDB に置くだけなので、長辺を抑えて容量を節約する。
export function compressImage(file, maxDim = 1200, quality = 0.72) {
  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error('no file')); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('read error'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('image decode error'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const r = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * r);
          height = Math.round(height * r);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        try {
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch (e) {
          reject(e);
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
