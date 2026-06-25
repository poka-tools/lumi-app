# 夜職 給料管理（PWA）

出勤シフトと各種バックから当月の給料を概算・管理するオフライン Web アプリ。

## 使い方（ローカル）
1. `python3 -m http.server 8080`
2. ブラウザ/スマホで `http://<PCのIP>:8080` を開く
3. スマホでは「ホーム画面に追加」でアプリとして起動

## テスト
`npm test`（calc.js / format.js の単体テスト）

## 構成
- `js/calc.js` … 計算ロジック（純粋関数・テスト済み・Flutter 移植の中核）
- `js/format.js` … ¥表記・日付・HTMLエスケープ
- `js/db.js` … IndexedDB ラッパ
- `js/state.js` … 読み込み済みデータの共有
- `js/ui/*` … 画面（home/calendar/record/report/settings/donut）
- `js/app.js` … タブ遷移・初期化
- 設計書: `docs/specs/`、実装計画: `docs/plans/`

## データ
収入データは端末内（IndexedDB）のみに保存。外部送信なし。設定画面から JSON でエクスポート/インポート可能（機種変・移植時の引き継ぎ用）。

## 次フェーズ（ストア配布）
`calc.js` の計算仕様を Flutter へ移植し、App Store / Google Play へ申請（要 Mac / 各デベロッパー登録）。
