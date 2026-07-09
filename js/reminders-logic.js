// アプリ内リマインダーの純粋関数（DOM/IndexedDB に依存しない・テスト対象）
// 方式＝日数ウィンドウ：「○日前から当日まで」該当する予定を返す。
// アプリを開いた日ごとにホームへ1回表示する念押し用（バックグラウンド通知はしない）。

// ISO日付("YYYY-MM-DD")どうしの日数差（to - from）。ローカル基準・UTCずれ回避。
export function daysBetweenIso(from, to) {
  const [ay, am, ad] = from.split('-').map(Number);
  const [by, bm, bd] = to.split('-').map(Number);
  const a = new Date(ay, am - 1, ad);
  const b = new Date(by, bm - 1, bd);
  return Math.round((b - a) / 86400000);
}

// 出勤予定リマインダー：today〜leadDays 先までの未来シフトを日付昇順で返す。
// leadDays=0 は当日のみ。過去日は対象外。daysUntil（0=当日,1=明日…）を付与。
export function shiftReminders(shifts, today, leadDays) {
  const lead = Math.max(0, Number(leadDays) || 0);
  return (shifts || [])
    .filter((s) => s.date && s.date >= today)
    .map((s) => ({ ...s, daysUntil: daysBetweenIso(today, s.date) }))
    .filter((s) => s.daysUntil <= lead)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// キャンペーン終了リマインダー：終了日が today〜leadDays 先のお知らせを終了日昇順で返す。
// endDate 未設定（常時表示）は終了通知の対象外。既に終了した過去分も対象外。
export function campaignReminders(announcements, today, leadDays) {
  const lead = Math.max(0, Number(leadDays) || 0);
  return (announcements || [])
    .filter((a) => a.endDate && a.endDate >= today)
    .map((a) => ({ ...a, daysUntil: daysBetweenIso(today, a.endDate) }))
    .filter((a) => a.daysUntil <= lead)
    .sort((a, b) => a.endDate.localeCompare(b.endDate));
}
