# 接続状況（2026-09-06）

GitHub Pages＋Supabaseへ移行作業中です。新しいEdge Functionのデプロイは成功しました。部活専用ロールへの切替設定が未反映のため、実DBのAPIテストはまだ完了していません。Pagesは実接続検証後に共有版へ切り替えます。

ローカル検証：Python 61件、Node 38件成功。Denoのエントリーポイント型チェック成功。Nodeの追加テストは権限・配車・精算ロック・LINEの検証済みクレーム・招待トークンとログイン情報の区別を含みます。

GitHub ActionsでもPython／Postgres／Edgeの全ジョブが成功しました。Edgeの実ハンドラーを隔離Postgresへ接続し、登録・共有・CAS・招待・権限・ログアウトのAPI検証に成功しています。[検証結果](https://github.com/manatocookietwitter-lang/club-operations/actions/runs/34007561417)。ローカルブラウザーでデモのログイン入口・グループ選択を確認しました。

本番DBの権限切替設定は自動承認審査で明示承認が必要とされ、ユーザー確認待ちです。公開済みのPagesを未検証の共有版には切り替えていません。

LINEは実チャネル未設定のため無効です。自動Push通知も無効です。LINEの実認証往復・スマートフォン検証は未完了です。

`qa/`、`QA_REPORT.md` は提供ZIPの過去の記録です。既存Python版はSQLite/Postgresで61件のテストが通っており、互換性確認用に残しています。
