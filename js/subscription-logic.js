// ===== サブスク失効（解約）検知の純ロジック =====
// 「前回は有料だったのに、今回は権利が無い」＝解約や支払い停止で失効したとみなす。
// 実データ（勤務記録・顧客等）は端末内 IndexedDB のみに存在し、RevenueCat は持っていない。
// よって失効を検知したら、ユーザーに「データを残す／削除する」を1回だけ案内する（強制はしない）。

// 前回観測した権利状態を保存する localStorage キー。
// IndexedDB の「データ削除」では消えない（rc.js の識別子と同じく端末単位で残す）。
export const WAS_PREMIUM_KEY = 'lumi_rc_was_premium';

// 前回有料（prev==='1'）かつ 今回無効（now が falsy）なら失効とみなす。
// 初回起動（prev が null/未設定）や、前回も無料だった場合は失効扱いしない。
export function isLapse(prev, now) {
  return prev === '1' && !now;
}

// 次回のために保存すべき値（現在の権利状態を文字列化）。
export function nextStored(now) {
  return now ? '1' : '0';
}
