# 無料の共有版

構成：GitHubでソース管理、Render FreeでFastAPIと画面を公開、Supabase FreeのPostgresに共有データを保存します。GitHub Pagesの操作デモは別に残します。

## 初期設定

1. 専用のSupabase Freeプロジェクトを作成します。別アプリのプロジェクトを共用しません。
2. DB管理者として `server/postgres_schema.sql` を適用します。テーブルは非公開の `club` スキーマ、サーバー専用 `club_runtime` ロールだけに読み書き権限を付けます。全テーブルでRLSを有効にし、anon/authenticatedには権限を付けません。
3. `club_runtime` に十分長いランダムパスワードを設定し、Connect画面のSession pooler（5432番）を使って接続します。アプリは起動時にテーブルを作成せず、設定済みのスキーマを確認します。
4. Renderで同梱Blueprintを開き、DATABASE_URLに接続文字列を登録します。これは秘密値です。コード・GitHub・フロントエンドへ含めません。
5. Freeプラン・有料ディスクなしを確認して公開します。
6. 公開URLをPUBLIC_ORIGINに設定します。LINE用チャネルを用意後、別途LINEを有効にします。

接続形式（パスワードはURLエンコード）：

```text
postgresql://club_runtime.PROJECT_REF:PASSWORD@SESSION_POOLER_HOST:5432/postgres?sslmode=require
```

更新はDB内のトランザクションと排他ロックで直列化し、従来のversion照合で古い編集を拒否します。サーバーのDBロールにはスキーマ変更や他スキーマの管理権限を与えません。

## 無料枠の制約

- Render Freeは15分アクセスがないと休止します。再アクセス時には起動待ちがあります。月750時間枠はワークスペース内で共有されます。
- Supabase Freeは500MBのDB、アクティブプロジェクト2件まで。1週間の非利用で休止する場合があります。無料枠の上限を超える運用では設定を見直します。有料へ自動変更する設定はしません。
- サーバー停止中に定刻の通知を送れないため、`PUSH_WORKER_ENABLED=0` でPush送信を無効にします。LINEログインとは別の制限です。
- 無料DBに自動バックアップは含まれません。業務データのJSON書き出しと、管理者による `pg_dump` バックアップを使います。SQLite用backupコマンドはPostgresでは使いません。
- PostgreSQLへの変更は新規の共有版向けです。既存SQLiteの自動移行は行いません。

公式資料（2026-09-06確認）：[Render Free](https://render.com/docs/free)、[Supabase料金と無料枠](https://supabase.com/pricing)、[DB接続](https://supabase.com/docs/guides/database/connecting-to-postgres)。
