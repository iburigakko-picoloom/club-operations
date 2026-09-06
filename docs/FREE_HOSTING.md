# GitHub Pages＋Supabaseの無料公開

画面：GitHub Pages。サーバー処理：Supabase Edge Functions。保存先：部活専用Supabase Postgres。Renderや有料ディスクは不要です。

## 公開するもの

- Pagesは `web/` だけを配信します。DB接続情報、LINEシークレット、サーバーソース、テストファイルはPagesに配信しません。
- `web/hosting.js` は公開APIのURLだけです。アプリのセッショントークンはsessionStorageに保存し、HTTPSのAuthorizationヘッダーで送ります。タブを閉じた後は再ログインが必要です。
- データを更新するときはセッションとCSRFトークンを確認し、許可したPagesのOriginだけを受け付けます。Cookieの外部サイト制限には依存しません。
- グループ所属と編集権限はサーバー側で確認します。古いversionによる更新は409で拒否します。
- DBは非公開の `club` スキーマ。全テーブルでRLSを有効にし、anon/authenticatedへ公開しません。

## 初期設定・更新

1. 部活専用Freeプロジェクトへ `server/postgres_schema.sql` を適用します。既存の別アプリのプロジェクトには適用しません。
2. サーバーの権限切替用に `supabase/runtime-role.sql` を適用します。Edge Functionは標準の `SUPABASE_DB_URL` で接続し、すべてのDB処理をトランザクション内の `SET LOCAL ROLE club_runtime` で制限します。DBパスワードを別サービスへ渡す必要はありません。
3. `supabase/functions/club-api/` を `club-api` としてデプロイします。依存はdeno.jsonとdeno.lockで固定します。独自セッションを検証するため、プラットフォーム側JWT検証は無効、アプリ側認証は必須です。登録など一部の入口だけ未ログインで使えます。
4. APIの実接続テストを通し、GitHub Pagesを `web/` 配信に切り替えます。API変更があるときはサーバーを先にデプロイします。GitHub ActionsはテストとPages公開を行い、Edge Functionsの自動デプロイ用アクセストークンはGitHubへ登録していません。
5. LINEは [DEPLOYMENT.md](DEPLOYMENT.md) に沿って設定します。

## 無料枠と現在の範囲

- Supabase FreeはDB 500MB、アクティブプロジェクト2件まで。1週間の非利用で休止する条件があります。関数呼出回数・転送量にも上限があります。有料への切替は行っていません。
- 自動Push通知は未接続のため無効です。予定や出欠などの共有・保存、LINEログインとは別の機能です。
- メールはアカウント識別子として使用し、メール確認やパスワード再設定メールは送信しません。
- JSON書き出しと管理者のpg_dumpをバックアップに使用します。無料DBの自動バックアップは含まれません。
- ローカルのデモ／旧SQLiteのデータを、共有グループへ自動アップロードすることはありません。

## 検証方法

`node --test tests/domain.test.cjs tests/edge-domain.test.mjs tests/transport.test.cjs` で計算・権限・精算ロック・LINE検証・画面の認証情報管理を確認します。`CLUB_API_URL` を明示して `node tests/edge-api-smoke.mjs` を実行すると、検証用アカウント2件で実APIの保存・招待・権限・ログアウトを確認します。実環境では `.edge-test-run.json` に記録した検証IDだけを終了後に削除します。CIは隔離したPostgresを使用します。

公式（2026-09-06確認）：[Supabase無料枠](https://supabase.com/pricing)、[Edge Functions](https://supabase.com/docs/guides/functions)、[DB接続](https://supabase.com/docs/guides/functions/connect-to-postgres)。
