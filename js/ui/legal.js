// 法的ページへのリンク。ページ本体は /legal/ 配下の独立した静的HTML
// （Service Worker のキャッシュ対象外・アプリ本体とは別配信）。
// パスは index.html からの相対で、サブパス配信（/lumi-app/・/lumi-official/）でも動く。
export const LEGAL_PAGES = [
  { href: 'legal/tokushoho.html', label: '特定商取引法に基づく表記' },
  { href: 'legal/terms.html', label: '利用規約' },
  { href: 'legal/privacy.html', label: 'プライバシーポリシー' },
  { href: 'legal/refund.html', label: '返金・キャンセルポリシー' },
];

// 法的ページへのリンク群を生成する。外部（別文書）なので新規タブで開く。
// cls は各 <a> に付けるクラス名（呼び出し側でスタイルを分ける）。
export function legalLinksHtml(cls) {
  return LEGAL_PAGES.map((p) =>
    `<a class="${cls}" href="${p.href}" target="_blank" rel="noopener">${p.label}</a>`).join('');
}
