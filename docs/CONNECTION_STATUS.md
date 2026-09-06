# 接続状況（2026-09-06）

GitHub Pages＋Supabaseの共有版へ移行しました。Edge Function v2のデプロイと部活専用ロールへの切替設定は完了しています。実環境で登録・保存・招待・権限・ログアウトなど41件のAPI検証が成功しました。検証用アカウント2件とグループ1件は削除済みです。

ローカル検証：Python 61件、Node 38件成功。Denoのエントリーポイント型チェック成功。Nodeの追加テストは権限・配車・精算ロック・LINEの検証済みクレーム・招待トークンとログイン情報の区別を含みます。

GitHub ActionsでもPython／Postgres／Edgeの全ジョブが成功しました。Edgeの実ハンドラーを隔離Postgresへ接続し、登録・共有・CAS・招待・権限・ログアウトのAPI検証に成功しています。[検証結果](https://github.com/iburigakko-picoloom/club-operations/actions/runs/34007561417)。ローカルブラウザーでデモのログイン入口・グループ選択を確認しました。

DBは部活専用の非公開スキーマです。匿名公開はしていません。SupabaseセキュリティAdvisorは指摘なし。

LINEは実チャネル未設定のため無効です。自動Push通知も無効です。LINEの実認証往復・スマートフォン検証は未完了です。

`qa/`、`QA_REPORT.md` は提供ZIPの過去の記録です。既存Python版はSQLite/Postgresで61件のテストが通っており、互換性確認用に残しています。
