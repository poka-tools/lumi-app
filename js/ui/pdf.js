// アプリ内でPDFを直接生成する（ブラウザの印刷機能を使わない＝URL/日付フッターが一切出ない）。
// レポートを html2canvas で画像化（日本語もそのまま描画される）→ jsPDF で A4 PDF にして保存する。
// 重いライブラリ（jsPDF/html2canvas）は、この関数が呼ばれたときに初めて動的 import で読み込む。
import { toast } from './toast.js';

// screenEl: レポートを含む #screen 要素。checkboxSel: 「PDFに含める項目」のチェックボックス群の親。
export async function exportReportPdf(screenEl, fileLabel) {
  toast('PDFを作成しています…');
  const [{ jsPDF }, h2cMod] = await Promise.all([
    import('../vendor/jspdf.mjs'),
    import('../vendor/html2canvas.mjs'),
  ]);
  const html2canvas = h2cMod.default;

  // チェックの外れた項目は画像化前に隠す（.print-hide は .pdf-capturing 中に display:none になる）。
  const opts = screenEl.querySelectorAll('#pdfOptions input[data-sec]');
  opts.forEach((cb) => {
    const sec = screenEl.querySelector('#' + cb.dataset.sec);
    if (sec) sec.classList.toggle('print-hide', !cb.checked);
  });

  document.body.classList.add('pdf-capturing'); // 画像化用の見た目（白背景・no-print非表示・print-only表示）
  try {
    const canvas = await html2canvas(screenEl, {
      scale: 2,                 // 高解像度（文字くっきり）
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      windowWidth: screenEl.scrollWidth,
    });

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 8;                       // PDF内側の余白(mm)
    const imgW = pageW - margin * 2;
    const pxPerMm = canvas.width / imgW;     // キャンバス横幅を用紙横幅(余白除く)に対応させる
    const pageContentHpx = (pageH - margin * 2) * pxPerMm; // 1ページに収まるキャンバス高さ(px)

    let renderedH = 0;
    let page = 0;
    while (renderedH < canvas.height) {
      const sliceHpx = Math.min(pageContentHpx, canvas.height - renderedH);
      // 1ページ分を切り出した中間キャンバスを作る
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = Math.ceil(sliceHpx);
      slice.getContext('2d').drawImage(
        canvas, 0, renderedH, canvas.width, sliceHpx, 0, 0, canvas.width, sliceHpx);
      const sliceHmm = sliceHpx / pxPerMm;
      if (page > 0) pdf.addPage();
      pdf.addImage(slice.toDataURL('image/png'), 'PNG', margin, margin, imgW, sliceHmm);
      renderedH += sliceHpx;
      page += 1;
    }

    const name = (fileLabel ? `収支レポート_${fileLabel}` : '収支レポート') + '.pdf';
    pdf.save(name);
    toast('PDFを保存しました');
  } finally {
    document.body.classList.remove('pdf-capturing');
    screenEl.querySelectorAll('.print-hide').forEach((s) => s.classList.remove('print-hide'));
  }
}
